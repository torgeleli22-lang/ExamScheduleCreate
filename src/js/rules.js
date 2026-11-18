/* ---------- 겹침 · 경고 규칙 ---------- */
const hasSlot = ex => !NO_SLOT.has(ex.method);
const isMoved = c => { const ex = S.exams[c.id]; return hasSlot(ex) && (ex.date !== defaultDate(c) || ex.start !== defaultStart(c)); };
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
      out.push({ kind: 'fixed', c, s: c.start, e: c.end, room: c.room, week: info.week });
    }
  }
  for (const m of D.makeups || []) {
    if (m.to !== iso) continue;
    const c = D.byId[m.classId];
    if (D.examMakeup[c.id] === m && hasSlot(S.exams[c.id])) continue;   // 시험 주차 보강 = 시험 자리
    out.push({ kind: 'makeup', c, s: m.start, e: m.end, room: m.room || c.room, week: m.from ? D.dateMap[m.from]?.week : null, from: m.from, m });
  }
  for (const c of S.classes) {
    if (c.id === excludeId) continue;
    const ex = S.exams[c.id];
    if (!hasSlot(ex) || ex.date !== iso) continue;
    out.push({ kind: 'exam', c, s: ex.start, e: ex.start + ex.len - 1, room: ex.room });
  }
  return out;
}
/** p = {date, start, len, room}. 교시가 겹치면서 같은 반 / 같은 교수 / 같은 강의실이면 겹침 */
function conflictsOf(c, p) {
  if (!p.date) return [];
  const s = p.start, e = p.start + p.len - 1, g = groupOf(c), rn = normRoom(p.room);
  const res = [];
  for (const it of itemsOn(p.date, c.id)) {
    if (it.s > e || it.e < s) continue;
    const kinds = [];
    if (groupOf(it.c) === g) kinds.push('반');
    if (it.c.prof && it.c.prof === c.prof) kinds.push('교수');
    if (rn && normRoom(it.room) === rn) kinds.push('강의실');
    if (kinds.length) res.push({ kinds, it });
  }
  return res;
}
function warningsOf(c, p) {
  const w = [];
  if (!p.date) { w.push('날짜를 정해 주세요'); return w; }
  const dw = dowOf(p.date);
  if (dw === 0 || dw === 6) w.push(`${DOW[dw]}요일이에요`);
  if (!D.dateMap[p.date]) w.push('수업일 현황에 없는 날짜예요');
  if (D.lastDate && p.date > D.lastDate) w.push(`학기 마지막 수업일(${fmt(D.lastDate)}) 이후예요`);
  const pv = prevDate(c);
  if (pv && p.date <= pv) w.push(`${S.examWeek - 1}주차 수업(${fmt(pv)})보다 이르거나 같은 날이에요`);
  if (p.start <= LUNCH && p.start + p.len - 1 >= LUNCH) w.push('점심시간(5교시)이 끼어 있어요');
  if (p.start + p.len - 1 > NP) w.push('10교시를 넘어가요');
  for (const m of D.makeups || []) {
    if (m.classId !== c.id || D.examMakeup?.[c.id] === m) continue;
    if (m.to > p.date) w.push(`보강(${fmt(m.to)} ${pRange(m.start, m.end - m.start + 1)})이 시험보다 뒤에 있어요`);
  }
  return w;
}
function describeConflict(x) {
  const it = x.it, o = it.c;
  const what = it.kind === 'exam' ? '시험' : it.kind === 'makeup' ? `보강(${it.from ? `${fmt(it.from)} 결강분` : '추가'})` : `${it.week}주차 수업`;
  const room = x.kinds.includes('강의실') ? ` · ${roomLabel(it.room)}` : '';
  return `${x.kinds.join('·')} 겹침: ${o.course}(${o.prof}, ${groupOf(o)}) ${what} ${pRange(it.s, it.e - it.s + 1)}${room}`;
}
function statusOf(c) {
  const ex = S.exams[c.id];
  if (!hasSlot(ex)) return { bad: [], warn: [], moved: false, undecided: false, done: !!ex.done, noslot: true, keep: false };
  const p = { date: ex.date, start: ex.start, len: ex.len, room: ex.room };
  return { bad: conflictsOf(c, p), warn: warningsOf(c, p), moved: isMoved(c), undecided: ex.method === '미정', done: !!ex.done, noslot: false, keep: isKept(c) };
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
