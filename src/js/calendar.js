/* ---------- 수업일 현황 → 날짜 계산 ----------
   함정: 수업일 현황의 날짜는 실제 요일과 시간표 요일이 다를 수 있다.
   예) 2026-2: 12/15(화)는 "금요일 14주차" 수업일, 12/22(화)는 "토요일 15주차".
   그래서 날짜마다 (시간표 요일 열, 주차)를 D.dateMap 으로 들고 겹침을 검사한다. */

function tokToIso(tok, year = S.year, firstMonth = D.firstMonth) {
  const m = String(tok || '').match(/(\d{1,2})\s*\/\s*(\d{1,2})/);
  if (!m) return null;
  const mo = +m[1], da = +m[2];
  let y = +year;
  if (firstMonth >= 7 && mo <= 2) y += 1;   // 2학기 달력의 1~2월은 다음 해
  return `${y}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}`;
}
/** 수업일 표 하나에서 날짜 지도를 만든다. S 없이도 쓸 수 있다(새 시험 만들기 미리보기). */
function buildDateMap(calendar, year) {
  const first = calendar.weeks.find(Boolean)?.find(Boolean);
  const firstMonth = first ? +String(first).split('/')[0] : 9;
  const dateMap = {}, colDates = {};
  calendar.weeks.forEach((row, wi) => {
    (row || []).forEach((tok, ci) => {
      const col = calendar.cols[ci];
      const iso = tokToIso(tok, year, firstMonth);
      if (!col || !iso) return;
      dateMap[iso] = { col, week: wi + 1 };
      (colDates[col] = colDates[col] || [])[wi] = iso;
    });
  });
  return { firstMonth, dateMap, colDates };
}
function derive() {
  const m = buildDateMap(S.calendar, S.year);
  D.firstMonth = m.firstMonth; D.dateMap = m.dateMap; D.colDates = m.colDates;
  D.allDates = Object.keys(D.dateMap).sort();
  D.lastDate = D.allDates[D.allDates.length - 1];
  D.byId = Object.fromEntries(S.classes.map(c => [c.id, c]));
  D.groups = [...new Set(S.classes.map(groupOf))].sort();
  D.profs = [...new Set(S.classes.map(c => c.prof).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'));
  D.candDates = D.allDates.filter(d => D.dateMap[d].week >= S.examWeek - 2 && dowOf(d) !== 0);
  deriveMakeups();
  for (const c of S.classes) if (!S.exams[c.id]) S.exams[c.id] = defaultExam(c);
  for (const id of Object.keys(S.exams)) if (!D.byId[id]) delete S.exams[id];
}
/** 지금 볼 계획을 정하고 파생값을 다시 계산 */
function usePlan(p) { S = p; derive(); return S; }

/* 보강: 결강일의 원래 수업은 없어지고, 보강일·교시에 그 수업이 생긴다.
   보강 때문에 시험(그 과목의 마지막 수업)이 옮겨지는 두 경우 → 그 보강 시간이 기본 시험 시간:
   - 'replace': 시험 주차 수업 자체가 결강되고 보강됨 (예: 12/8 결강 → 12/22 보강)
   - 'push'   : 시험 주차 날짜보다 뒤, 시험 주차 마지막 날까지 사이에 보강이 잡힘 → 15주가 밀림
                (예: 화요일 15주차 12/8인데 9/22 결강분 보강이 12/15) — 이때 원래 12/8은 평소 수업
   여러 개면 가장 늦은 보강. 시험 주차 마지막 날 뒤의 보강은 밀지 않는다(중간고사가 10주차 보강에 밀리지 않게). */
function deriveMakeups() {
  D.makeups = (S.makeups || []).filter(m => D.byId[m.classId] && m.to);
  D.cancelled = new Set(D.makeups.filter(m => m.from).map(m => `${m.classId}|${m.from}`));
  D.examMakeup = {}; D.examPushed = new Set();
  const ewDates = Object.values(D.colDates).map(ds => ds[S.examWeek - 1]).filter(Boolean).sort();
  const lastEw = ewDates[ewDates.length - 1];
  for (const m of D.makeups) {
    const c = D.byId[m.classId], ew = D.colDates[c.day]?.[S.examWeek - 1];
    if (!ew) continue;
    const replace = m.from && m.from === ew, push = !replace && m.to > ew && m.to <= lastEw;
    if (!replace && !push) continue;
    const cur = D.examMakeup[c.id];
    if (!cur || m.to > cur.to) { D.examMakeup[c.id] = m; if (push) D.examPushed.add(c.id); else D.examPushed.delete(c.id); }
  }
}
/** 이 수업의 시험 주차 수업 날짜 (보강됐으면 보강일) */
const defaultDate = c => D.examMakeup?.[c.id]?.to || D.colDates[c.day]?.[S.examWeek - 1] || '';
const defaultStart = c => D.examMakeup?.[c.id]?.start ?? c.start;
const defaultLen = c => { const m = D.examMakeup?.[c.id]; return m ? m.end - m.start + 1 : lenOf(c); };
const defaultRoom = c => D.examMakeup?.[c.id]?.room || c.room;
const prevDate = c => D.colDates[c.day]?.[S.examWeek - 2] || '';
function defaultExam(c) {
  return { method: '미정', date: defaultDate(c), start: defaultStart(c), len: defaultLen(c), room: defaultRoom(c), note: '', done: false };
}
/** 수업일·보강이 바뀐 뒤: 옮기지 않았던 시험은 새 기본 시간으로 따라가게 한다 */
function rebaseUnmoved(change) {
  const unmoved = new Set(S.classes.filter(c => S.exams[c.id] && !isMoved(c)).map(c => c.id));
  change();
  derive();
  for (const c of S.classes) if (unmoved.has(c.id)) Object.assign(S.exams[c.id], { date: defaultDate(c), start: defaultStart(c), len: defaultLen(c), room: defaultRoom(c) });
}
function dayInfoLabel(iso) {
  const info = D.dateMap[iso];
  if (!info) return { text: '수업일 현황에 없는 날', cls: 'alt' };
  const real = DOW[dowOf(iso)];
  const hasClasses = S.classes.some(c => c.day === info.col);
  let text = `${info.col}요일 시간표 · ${info.week}주차`;
  let cls = info.week === S.examWeek ? '' : 'alt';
  if (info.col !== real) text += ` (${real}요일에 ${info.col}요일 수업)`;
  if (!hasClasses) { text += ' · 우리 과 수업 없음'; cls = 'free'; }
  return { text, cls };
}
/** 수업일 표에서 실제 요일과 시간표 요일이 다른 날 (대체 수업일) */
function shiftedDays(calendar, year) {
  const { dateMap } = buildDateMap(calendar, year);
  return Object.entries(dateMap).filter(([iso, x]) => DOW[dowOf(iso)] !== x.col).map(([iso, x]) => ({ iso, ...x })).sort((a, b) => a.iso.localeCompare(b.iso));
}
