/* ---------- 데이터 모델: 시험 계획(plan)과 저장소(Store) ----------
   Store = { v:2, plans: { [planId]: Plan }, deleted: { [planId]: 지운 시각 }, currentId }
   - deleted: 지운 시험 기록. 다른 컴퓨터(GitHub 저장)와 합칠 때 지운 시험이 되살아나지 않게 한다.
   Plan  = { v:2, id, termYear, term(1|2), kind('mid'|'final'), title, dept, year, examWeek,
             calendar:{cols, weeks}, classes:[...], exams:{[classId]: Exam}, extraDates:[],
             locked, createdAt, updatedAt, rev, sources:{timetable, calendar} }
   - year: 수업일 현황의 "월/일"을 날짜로 바꿀 때 쓰는 연도(학년도). 2학기 1~2월 날짜는 다음 해로 본다.
   - 계획마다 시간표·수업일을 따로 들고 있다(스냅숏). 지난 학기 기록이 새 학기 업로드에 영향받지 않게. */

let Store = null;   // 모든 계획
let S = null;       // 지금 보고 있는 계획 (Store.plans[Store.currentId] 와 같은 객체)
const D = {};       // S에서 계산한 값 (derive()가 채움)

function planTitle(p) {
  const k = KINDS[p.kind];
  return `${p.termYear}학년도 ${p.term}학기 ${k ? k.label : '시험'}`;
}
function planIdFor(termYear, term, kind, taken = {}) {
  const base = `${termYear}-${term}-${kind}`;
  let id = base, n = 2;
  while (taken[id]) id = `${base}-${n++}`;
  return id;
}
/** 새 계획. classes/calendar는 복사해서 넣는다. */
function makePlan({ termYear, term, kind, dept, calendar, classes, examWeek, sources, taken }) {
  const p = {
    v: 2, id: planIdFor(termYear, term, kind, taken), termYear: +termYear, term: +term, kind,
    title: '', dept: dept || '', year: +termYear, examWeek: +(examWeek || KINDS[kind]?.week || 15),
    calendar: clone(calendar), classes: clone(classes), exams: {}, extraDates: [],
    locked: false, createdAt: Date.now(), updatedAt: Date.now(), rev: 0, sources: sources || {},
  };
  p.title = planTitle(p);
  return p;
}
function validPlan(s) {
  return !!(s && (s.v === 1 || s.v === 2) && Array.isArray(s.classes) && s.calendar && Array.isArray(s.calendar.weeks)
    && Array.isArray(s.calendar.cols) && s.exams && typeof s.exams === 'object');
}
/** v1(한 개짜리 상태) → v2 계획. 제목에서 학기·시험 종류를 읽고, 없으면 시험 주차로 짐작한다. */
function upgradePlan(s, taken = {}) {
  if (s.v === 2 && s.id && s.kind) return s;
  const title = String(s.title || '');
  const term = +((title.match(/([12])\s*학기/) || [])[1] || (s.calendar?.weeks?.[0]?.[0]?.startsWith?.('3/') ? 1 : 2));
  const kind = /중간/.test(title) ? 'mid' : /기말/.test(title) ? 'final' : (+s.examWeek <= 10 ? 'mid' : 'final');
  const termYear = +((title.match(/(20\d\d)\s*학년도/) || [])[1] || s.year);
  const p = { ...s, v: 2, termYear, term, kind, locked: !!s.locked, createdAt: s.createdAt || s.updatedAt || Date.now(), sources: s.sources || {} };
  p.id = planIdFor(termYear, term, kind, taken);
  if (!p.title) p.title = planTitle(p);
  return p;
}
function newStore() { return { v: 2, plans: {}, deleted: {}, currentId: null }; }
/** 저장된 무언가(v2 저장소, v2 계획, v1 상태)를 저장소로. 모르는 형식이면 null. */
function toStore(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.v === 2 && raw.plans && typeof raw.plans === 'object') {
    const st = newStore();
    for (const p of Object.values(raw.plans)) if (validPlan(p)) { const q = upgradePlan(p, st.plans); st.plans[q.id] = q; }
    if (raw.deleted && typeof raw.deleted === 'object') for (const [id, t] of Object.entries(raw.deleted)) if (+t > 0) st.deleted[id] = +t;
    st.currentId = st.plans[raw.currentId] ? raw.currentId : latestPlanId(st);
    return st;
  }
  if (validPlan(raw)) { const st = newStore(); const p = upgradePlan(raw); st.plans[p.id] = p; st.currentId = p.id; return st; }
  return null;
}
/** 학기 순서: 최신 학기가 앞, 한 학기 안에서는 중간 → 기말. */
function planOrder(a, b) {
  const kr = k => (k === 'mid' ? 0 : k === 'final' ? 1 : 2);
  return b.termYear - a.termYear || b.term - a.term || kr(a.kind) - kr(b.kind) || (b.createdAt || 0) - (a.createdAt || 0);
}
const sortedPlans = (st = Store) => Object.values(st.plans).sort(planOrder);
const latestPlanId = st => sortedPlans(st)[0]?.id || null;

/**
 * 두 저장소 합치기 (이 브라우저 ↔ GitHub). 시험(계획)마다 updatedAt이 더 최신인 쪽이 이긴다.
 * 지운 기록(deleted)이 그 계획의 마지막 수정보다 늦으면 지운 것으로 본다.
 * → { plans, deleted, localChanged: 이 브라우저 쪽이 바뀌는지, remoteChanged: GitHub 쪽에 올려야 하는지 }
 */
function mergeStores(local, remote) {
  const lp = local.plans || {}, rp = remote.plans || {}, ld = local.deleted || {}, rd = remote.deleted || {};
  const deleted = { ...rd };
  for (const [id, t] of Object.entries(ld)) deleted[id] = Math.max(deleted[id] || 0, t);
  const plans = {};
  let localChanged = false, remoteChanged = false;
  for (const id of new Set([...Object.keys(lp), ...Object.keys(rp)])) {
    const a = lp[id], b = rp[id];
    let win = !a ? b : !b ? a : ((b.updatedAt || 0) > (a.updatedAt || 0) ? b : a);
    if (deleted[id] && deleted[id] >= (win.updatedAt || 0)) win = undefined;
    if (win) plans[id] = win;
    if (win !== a) localChanged = true;
    if (win !== b) remoteChanged = true;
  }
  for (const id of Object.keys(deleted)) {
    if (deleted[id] !== ld[id]) localChanged = true;
    if (deleted[id] !== rd[id]) remoteChanged = true;
  }
  return { plans, deleted, localChanged, remoteChanged };
}
/** GitHub에 올리는 모양: 보던 시험(currentId)·탭 표시(writer)처럼 브라우저마다 다른 값은 뺀다 */
function storePayload(st) {
  const plans = {};
  for (const id of Object.keys(st.plans).sort()) { const { writer, ...rest } = st.plans[id]; plans[id] = rest; }
  return { v: 2, plans, deleted: st.deleted || {} };
}
