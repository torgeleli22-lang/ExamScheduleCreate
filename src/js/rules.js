/* ---------- 겹침 · 경고 규칙 ---------- */
const hasSlot = ex => !NO_SLOT.has(ex.method);

/* ---------- 시험 시간 직접 정하기 ----------
   exam.time = {from:'10:00', to:'11:30'} 이 있으면 그 시간이 진짜 시험 시간. 없으면 교시 시간(start·len).
   겹침·판 위치는 교시 기준: 정한 시간이 걸치는 교시를 모두 쓰는 것으로 본다 (start·len을 시간에서 다시 계산). */
const toMin = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
const fromMin = n => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
const DAY_FROM = PERIODS[0][0], DAY_TO = PERIODS[NP - 1][1];
/** 시:분 범위 → 걸치는 교시 {start, len} */
function timeToPeriods(from, to) {
  const a = toMin(from), b = toMin(to);
  let s = PERIODS.findIndex(p => toMin(p[1]) > a) + 1;
  if (s <= 0) s = NP;
  let e = s;
  PERIODS.forEach((p, i) => { if (toMin(p[0]) < b && i + 1 > e) e = i + 1; });
  return { start: s, len: e - s + 1 };
}
const periodTime = (s, len) => ({ from: PERIODS[s - 1][0], to: PERIODS[Math.min(NP, s + len - 1) - 1][1] });
/** 실제 시간 범위(분) [시작, 끝): 직접 정한 시간이 있으면 그것, 없으면 교시 시간. 겹침은 이것으로 검사한다 */
function spanOf(start, len, time) {
  if (time) return [toMin(time.from), toMin(time.to)];
  const t = periodTime(start, len);
  return [toMin(t.from), toMin(t.to)];
}
const placeSpan = p => spanOf(p.start, p.len, p.time);
/** 판(교시 칸 10개, 점심 칸은 좁음)에서 시각 t의 가로 위치(%). 쉬는 시간은 칸 경계로 본다 */
const COL_W = PERIODS.map((_, i) => (i + 1 === LUNCH ? 0.55 : 1));   // styles.css .track 의 grid-template-columns 와 같게
function timePct(t) {
  const total = COL_W.reduce((a, b) => a + b, 0);
  let acc = 0;
  for (let i = 0; i < NP; i++) {
    const f = toMin(PERIODS[i][0]), e = toMin(PERIODS[i][1]);
    if (t < f) return acc / total * 100;
    if (t <= e) return (acc + COL_W[i] * (t - f) / (e - f)) / total * 100;
    acc += COL_W[i];
  }
  return 100;
}
/** 시험 시간 글자: 직접 정한 시간이 있으면 그것, 없으면 교시 시간 */
const examTime = ex => (ex.time ? `${ex.time.from}~${ex.time.to}` : tRange(ex.start, ex.len));
/** 시작·종료 시간을 정한다. 교시 경계와 같으면 교시 시간으로(시간 지움). 잘못된 시간이면 false */
function setExamTime(ex, from, to) {
  if (!/^\d{1,2}:\d{2}$/.test(from) || !/^\d{1,2}:\d{2}$/.test(to) || toMin(to) <= toMin(from)) return false;
  from = fromMin(toMin(from)); to = fromMin(toMin(to));
  const pr = timeToPeriods(from, to);
  ex.start = pr.start; ex.len = pr.len;
  const def = periodTime(pr.start, pr.len);
  if (def.from === from && def.to === to) delete ex.time; else ex.time = { from, to };
  return true;
}
/** 시작 교시를 옮긴다(끌기·빈 시간 누르기). 직접 정한 시간이 있으면 같은 만큼 같이 옮긴다 */
function moveExamStart(ex, start) {
  if (ex.time && start !== ex.start) {
    const d = toMin(PERIODS[start - 1][0]) - toMin(PERIODS[ex.start - 1][0]);
    if (!setExamTime(ex, fromMin(toMin(ex.time.from) + d), fromMin(toMin(ex.time.to) + d))) { delete ex.time; ex.start = start; }
  } else ex.start = start;
}
const isMoved = c => { const ex = S.exams[c.id]; return hasSlot(ex) && (ex.date !== defaultDate(c) || ex.start !== defaultStart(c) || !!ex.time); };
/** 공지·엑셀에 쓰는 방식 글자: '기존 시간표 수업 진행'으로 확정했으면 그것을 앞에 */
const methodLabel = c => { const ex = S.exams[c.id]; return isKept(c) ? `기존 시간표 수업 진행${ex.method !== '미정' ? ` (${ex.method})` : ''}` : ex.method; };
/** '기존 시간표 수업 진행'으로 확정했고 그 뒤로 옮기지 않았는지 */
const isKept = c => !!(S.exams[c.id]?.keep && !isMoved(c));

/* 어떤 날짜에 시간을 차지하는 것 전부.
   - fixed: 그날 열리는 정규 수업 (시험 주차가 아닌 주, 또는 시험 주차여도 시험 시간이 없는 과목은 정상 수업으로 본다)
   - makeup: 그 날짜로 잡힌 보강 (결강일의 원래 수업은 fixed에서 빠진다)
   - exam:  그 날짜에 배치된 모든 시험 */
function itemsOn(iso, excludeId) {
  const out = [];
  const info = D.dateMap[iso];
  if (info) {
    const examWeekDay = info.week === S.examWeek;
    for (const c of S.classes) {
      if (c.day !== info.col) continue;
      if (examWeekDay && hasSlot(S.exams[c.id]) && !D.examPushed?.has(c.id)) continue;   // 시험이 보강으로 밀렸으면 원래 시험 주차 수업은 평소 수업
      if (D.cancelled?.has(`${c.id}|${iso}`)) continue;
      const [t0, t1] = spanOf(c.start, lenOf(c));
      out.push({ kind: 'fixed', c, s: c.start, e: c.end, t0, t1, tm: null, room: c.room, week: info.week, date: iso });
    }
  }
  for (const m of D.makeups || []) {
    if (m.to !== iso) continue;
    const c = D.byId[m.classId];
    if (D.examMakeup[c.id] === m && hasSlot(S.exams[c.id])) continue;   // 시험 주차 보강 = 시험 자리
    const [t0, t1] = spanOf(m.start, m.end - m.start + 1, m.time);
    out.push({ kind: 'makeup', c, s: m.start, e: m.end, t0, t1, tm: m.time || null, room: m.room || c.room, week: m.from ? D.dateMap[m.from]?.week : null, from: m.from, m, date: iso });
  }
  for (const c of S.classes) {
    if (c.id === excludeId) continue;
    const ex = S.exams[c.id];
    if (!hasSlot(ex) || ex.date !== iso) continue;
    const [t0, t1] = spanOf(ex.start, ex.len, ex.time);
    out.push({ kind: 'exam', c, s: ex.start, e: ex.start + ex.len - 1, t0, t1, tm: ex.time || null, room: ex.room });
  }
  return out;
}
/** p = {date, start, len, room}. 교시가 겹치면서 같은 반 / 같은 교수 / 같은 강의실이면 겹침 */
/* 합반 시험: 같은 과목의 다른 반 시험이 같은 날 같은 교시에 시작하면 한 시험(합반)으로 본다.
   → 교수·강의실 겹침으로 세지 않는다 (사용자: "15주차 수업을 동시에 진행하면 합반 시험").
   시작 교시가 다르게 걸치거나, 다른 과목이면 지금처럼 겹침. */
const courseKey = c => String(c.course || '').replace(/\s+/g, '').toUpperCase();
const isCombined = (c, it, t0) => it.kind === 'exam' && it.c.id !== c.id && groupOf(it.c) !== groupOf(c) && courseKey(it.c) === courseKey(c) && it.t0 === t0;
/** p에 놓으면 함께 합반 시험을 보게 되는 다른 반 수업들 */
function combinedAt(c, p) {
  if (!p.date) return [];
  const t0 = placeSpan(p)[0];
  return itemsOn(p.date, c.id).filter(it => isCombined(c, it, t0)).map(it => ({ c: it.c, room: it.room }));
}
/** 겹침 = 실제 시간(분)이 겹치면서 같은 반 / 같은 교수 / 같은 강의실 (합반이면 교수·강의실은 빼고) */
/** p.self = 옮기는 수업의 참조 {cid, from, mkId}: 그 수업 자신(원래 자리·옮긴 자리)은 겹침에서 빼고, 같은 과목 시험은 넣는다 */
const isSelfSession = (p, it) => !!p.self && it.kind !== 'exam' && it.c.id === p.self.cid
  && ((it.kind === 'fixed' && it.date === p.self.from) || (it.kind === 'makeup' && it.m.id === p.self.mkId));
function conflictsOf(c, p) {
  if (!p.date) return [];
  const [a, b] = placeSpan(p), g = groupOf(c), rn = normRoom(p.room);
  const res = [];
  for (const it of itemsOn(p.date, p.self ? null : c.id)) {
    if (it.t1 <= a || it.t0 >= b || isSelfSession(p, it)) continue;   // 분 단위로 겹치는지 (끝 = 다음 시작이면 안 겹침)
    const combined = isCombined(c, it, a);
    const kinds = [];
    if (groupOf(it.c) === g) kinds.push('반');
    if (!combined && it.c.prof && it.c.prof === c.prof) kinds.push('교수');
    if (!combined && rn && normRoom(it.room) === rn) kinds.push('강의실');
    if (kinds.length) res.push({ kinds, it });
  }
  return res;
}
const combinedLabel = list => list.map(x => groupOf(x.c)).join('·');
function warningsOf(c, p) {
  const w = [];
  if (!p.date) { w.push('날짜를 정해 주세요'); return w; }
  const dw = dowOf(p.date);
  if (dw === 0 || dw === 6) w.push(`${DOW[dw]}요일이에요`);
  if (!D.dateMap[p.date]) w.push('수업일 현황에 없는 날짜예요');
  if (D.lastDate && p.date > D.lastDate) w.push(`학기 마지막 수업일(${fmt(D.lastDate)}) 이후예요`);
  const pv = prevDate(c);
  if (pv && p.date <= pv) w.push(`${S.examWeek - 1}주차 수업(${fmt(pv)})보다 이르거나 같은 날이에요`);
  const [pa, pb] = placeSpan(p), lunch = spanOf(LUNCH, 1);
  if (pa < lunch[1] && pb > lunch[0]) w.push('점심시간(5교시)이 끼어 있어요');
  if (p.start + p.len - 1 > NP) w.push('10교시를 넘어가요');
  if (p.time && (toMin(p.time.from) < toMin(DAY_FROM) || toMin(p.time.to) > toMin(DAY_TO))) w.push(`수업 시간(${DAY_FROM}~${DAY_TO}) 밖이에요`);
  // 합반인데 같은 교수님이 서로 다른 강의실 → 한 강의실로 맞춰야 함
  const apart = combinedAt(c, p).filter(x => x.c.prof && x.c.prof === c.prof && normRoom(x.room) !== normRoom(p.room));
  if (apart.length) w.push(`합반(${combinedLabel(apart)})인데 강의실이 달라요(${roomLabel(p.room)}·${[...new Set(apart.map(x => roomLabel(x.room)))].join('·')}). 같은 교수님이라 한 강의실로 맞춰 주세요`);
  for (const m of D.makeups || []) {
    if (m.classId !== c.id || D.examMakeup?.[c.id] === m) continue;
    if (m.to > p.date) w.push(`${m.manual ? '옮긴 수업' : '보강'}(${fmt(m.to)} ${pRange(m.start, m.end - m.start + 1)})이 시험보다 뒤에 있어요`);
  }
  return w;
}
function describeConflict(x) {
  const it = x.it, o = it.c;
  const what = it.kind === 'exam' ? '시험' : it.kind === 'makeup' ? (it.m?.manual ? `${it.week}주차 수업(${fmt(it.from)}에서 옮김)` : `보강(${it.from ? `${fmt(it.from)} 결강분` : '추가'})`) : `${it.week}주차 수업`;
  const room = x.kinds.includes('강의실') ? ` · ${roomLabel(it.room)}` : '';
  const when = it.tm ? `${it.tm.from}~${it.tm.to}` : pRange(it.s, it.e - it.s + 1);
  return `${x.kinds.join('·')} 겹침: ${o.course}(${o.prof}, ${groupOf(o)}) ${what} ${when}${room}`;
}
function statusOf(c) {
  const ex = S.exams[c.id];
  if (!hasSlot(ex)) return { bad: [], warn: [], moved: false, undecided: false, done: !!ex.done, noslot: true, keep: false, combined: [] };
  const p = { date: ex.date, start: ex.start, len: ex.len, room: ex.room, time: ex.time };
  return { bad: conflictsOf(c, p), warn: warningsOf(c, p), moved: isMoved(c), undecided: ex.method === '미정', done: !!ex.done, noslot: false, keep: isKept(c), combined: combinedAt(c, p) };
}
/** 시험주차-2 이후 후보 날짜 중 (시험주차-1) 수업일 이후, 토요일 제외, 점심을 걸치지 않고 겹침 0인 시작 교시 */
function freeSlots(c, len, room) {
  const pv = prevDate(c);
  const dates = D.candDates.filter(d => (!pv || d > pv) && dowOf(d) !== 6);
  const out = [];
  for (const d of dates) {
    const starts = range(1, NP - len + 1).filter(s => !(s <= LUNCH && s + len - 1 >= LUNCH) && conflictsOf(c, { date: d, start: s, len, room }).length === 0);
    if (starts.length) out.push({ d, starts });
  }
  return out;
}
/** 보강 때문에 시험 주차 수업(기본 시험 시간)이 다른 날로 옮겨진 과목들 */
function shiftedByMakeup() {
  return S.classes.filter(c => D.examMakeup?.[c.id]).map(c => {
    const m = D.examMakeup[c.id];
    return { c, m, ew: D.colDates[c.day]?.[S.examWeek - 1], to: m.to, pushed: D.examPushed.has(c.id) };
  }).sort((a, b) => a.to.localeCompare(b.to) || groupOf(a.c).localeCompare(groupOf(b.c)));
}
/* ---------- 다른 주차 수업 옮기기 ----------
   8·15주차(와 이 시험의 시험 주차) 수업은 바로 옮길 수 있고, 다른 주차 수업은 판에서 꾹 눌러 푼 뒤 옮긴다(사용자 요구).
   옮긴 수업은 보강처럼 기록한다 → 겹침 검사·보강 목록·엑셀이 그대로 따라온다:
     makeup {id: `${classId}|${원래 날짜}|m`, classId, from: 원래 날짜, to, start, end, room, time?, note: '직접 옮김', manual: true}
   원래 날짜·시간·강의실로 되돌리면 기록을 지운다. 가져온 보강(manual 아님)은 그 보강을 고친다. */
const freeWeeks = () => new Set([KINDS.mid.week, KINDS.final.week, S.examWeek]);
/** 판의 수업 항목(itemsOn의 fixed·makeup) → 옮기기 참조 {cid, from, mkId} */
const sessionRef = it => (it.kind === 'makeup' ? { cid: it.c.id, from: it.m.from || '', mkId: it.m.id } : { cid: it.c.id, from: it.date, mkId: null });
const sessionKey = ref => (ref.mkId ? `mk:${ref.mkId}` : `${ref.cid}|${ref.from}`);
/** 꾹 누르지 않아도 옮길 수 있는 수업인지 (8·15주차). 직접 옮긴 수업도 원래 주차를 따른다 */
const sessionFree = it => freeWeeks().has(it.week);
/** 참조 → 지금 그 수업의 자리 {c, m, from, date, start, len, room, time, week} */
function sessionOf(ref) {
  const c = D.byId[ref.cid]; if (!c) return null;
  const m = ref.mkId ? (S.makeups || []).find(x => x.id === ref.mkId) : null;
  if (m) return { c, m, from: m.from, date: m.to, start: m.start, len: m.end - m.start + 1, room: m.room || c.room, time: m.time || null, week: m.from ? D.dateMap[m.from]?.week : null };
  return { c, m: null, from: ref.from, date: ref.from, start: c.start, len: lenOf(c), room: c.room, time: null, week: D.dateMap[ref.from]?.week };
}
/** 수업 하나의 날짜·시작·길이·강의실·시간을 고친다 → 새 참조. 옮긴 기록을 만들거나 고치고, 원래 자리면 지운다 */
function applySession(ref, patch) {
  const cur = sessionOf(ref); if (!cur) return ref;
  const c = cur.c;
  const next = { date: cur.date, start: cur.start, len: cur.len, room: cur.room, time: cur.time, ...patch };
  let out = ref;
  rebaseUnmoved(() => {
    S.makeups = S.makeups || [];
    let m = cur.m;
    if (!m) {
      m = { id: `${c.id}|${cur.from}|m`, classId: c.id, from: cur.from, to: cur.from, start: c.start, end: c.end, room: c.room, note: '직접 옮김', manual: true };
      S.makeups = S.makeups.filter(x => x.id !== m.id).concat([m]);
    }
    m.to = next.date; m.start = next.start; m.end = next.start + next.len - 1; m.room = cleanRoom(next.room) || c.room;
    if (next.time) m.time = { ...next.time }; else delete m.time;
    const back = m.manual && m.to === m.from && m.start === c.start && m.end === c.end && !m.time && normRoom(m.room) === normRoom(c.room);
    if (back) { S.makeups = S.makeups.filter(x => x !== m); out = { cid: c.id, from: m.from, mkId: null }; }
    else out = { cid: c.id, from: m.from, mkId: m.id };
  });
  return out;
}
/** 수업 시간 글자 (직접 정한 시간이 있으면 그것) */
const sessionTime = cur => (cur.time ? `${cur.time.from}~${cur.time.to}` : tRange(cur.start, cur.len));
function counts() {
  let total = 0, bad = 0, warn = 0, moved = 0, und = 0, done = 0, noslot = 0, keep = 0;
  for (const c of S.classes) {
    const st = statusOf(c);
    if (st.noslot) { noslot++; if (st.done) done++; continue; }
    total++;
    if (st.bad.length) bad++;
    if (st.warn.length) warn++;
    if (st.moved) moved++;
    if (st.undecided) und++;
    if (st.done) done++;
    if (st.keep) keep++;
  }
  return { total, bad, warn, moved, und, done, noslot, keep, all: S.classes.length };
}
/** 다른 계획의 요약 (기록 탭). 잠깐 S를 바꿔 계산하고 되돌린다. */
function countsOfPlan(p) {
  if (p === S) return counts();
  const keepS = S, keepD = { ...D };
  try { usePlan(p); return counts(); }
  finally { S = keepS; Object.keys(D).forEach(k => delete D[k]); Object.assign(D, keepD); }
}
