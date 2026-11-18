/* ---------- 보강 · 자료 종류 알아보기 (DOM 없음, 단위 테스트에서 그대로 불러씀) ----------
   보강결과보고서(학교 양식) 한 줄 예:
     35382-101  JAVA프로그래밍응용  2  2026/09/22 화 6~8  2026/12/15 화 6~8  양숙희
     과목코드     과목명            학년  결강 일자·요일·교시   보강 일자·요일·교시    담당교수
   - 반 칸이 없다 → 과목코드 끝 3자리(101=A, 102=B, 103=C)와 결강 요일·교시로 시간표 수업을 찾는다.
   보강 신청 목록(.xls) 한 줄 예:
     컴퓨터소프트웨어과  35382  JAVA프로그래밍응용  101  2  2026/09/22(화) 6~8  2026/12/15(화) 6~8  양숙희  기타
     학과명           과목코드  과목명          분반  학년  결강일(+교시)       보강일(+교시)        교수    사유
   - 분반 칸 101=A, 102=B …
   - 날짜가 둘이면 첫째가 결강(원래 수업일), 둘째가 보강일. 하나면 보강일만.
   - 교시는 "2~4", "2~4교시", "13:35~15:20" 모두 읽는다.
   plan.makeups = [{ id, classId, from(결강일|''), to(보강일), start, end, room, note }] */

// 2026/12/15, 2026.12.15, 2026-12-15, 12/15, 12.15, 12월 15일, 12/15(화)
const DATE_RE = /(?<![\d.])(?:(\d{4})\s*[.\/-]\s*(\d{1,2})\s*[.\/-]\s*(\d{1,2})|(\d{1,2})\s*[.\/월]\s*(\d{1,2}))(?:\s*일)?(?!\d)(?:\s*\(\s*[월화수목금토일]\s*\))?/g;
const normName = s => String(s || '').replace(/\s+/g, '').replace(/[()（）\[\]·.,-]/g, '').toUpperCase();

/** 한 줄에서 날짜들을 ISO로 (연도 없으면 학년도·달력 첫 달로 짐작) */
function lineDates(line, year, firstMonth) {
  const out = [];
  for (const m of String(line).matchAll(DATE_RE)) {
    const mo = +(m[2] || m[4]), da = +(m[3] || m[5]);
    if (mo < 1 || mo > 12 || da < 1 || da > 31) continue;
    let y = m[1] ? +m[1] : +year + (firstMonth >= 7 && mo <= 2 ? 1 : 0);
    out.push(`${y}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}`);
  }
  return out;
}
/** 날짜를 지운 줄에서 교시 범위들: "2~4", "6-8교시", "3교시", "13:35~15:20" */
function linePeriods(line) {
  const s = String(line).replace(DATE_RE, ' ').replace(/\d{5}-\d{3}/g, ' ');
  const out = [];
  const re = /(\d{1,2}):(\d{2})\s*[~\-–]\s*(\d{1,2}):(\d{2})|(?<![\d:])(\d{1,2})\s*[~\-–]\s*(\d{1,2})(?![\d:])(?:\s*교시)?|(?<![\d:~\-])(\d{1,2})\s*교시/g;
  for (const m of s.matchAll(re)) {
    if (m[1]) {
      const t1 = `${m[1].padStart(2, '0')}:${m[2]}`, t2 = `${m[3].padStart(2, '0')}:${m[4]}`;
      let a = PERIODS.findIndex(p => p[1] > t1) + 1, b = PERIODS.findIndex(p => p[1] >= t2) + 1;
      if (a > 0) out.push([a, b > 0 ? b : NP]);
    } else if (m[5]) { const a = +m[5], b = +m[6]; if (a >= 1 && b >= a && b <= 15) out.push([a, b]); }
    else out.push([+m[7], +m[7]]);
  }
  return out;
}

/**
 * 보강 양식 글자 → { makeups, unmatched }
 * classes: 그 학기 수업 목록, calendar/year: 날짜를 시간표 요일·주차로 바꿀 때
 */
function parseMakeups(text, classes, calendar, year) {
  const { dateMap, firstMonth } = buildDateMap(calendar, year);
  const byName = classes.map(c => ({ c, n: normName(c.course) })).filter(x => x.n);
  const makeups = [], unmatched = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    const dates = lineDates(line, year, firstMonth);
    if (!dates.length) continue;
    const periods = linePeriods(line);
    const code = line.match(/\d{5}-(\d{3})/);
    if (!code && !periods.length) continue;      // 제출일 같은 날짜만 있는 줄
    if (/^\s*(학과명|과목코드|과목명)(\s|$)/.test(line)) continue;   // 머리글 줄
    const nl = normName(line);
    let cands = byName.filter(x => nl.includes(x.n));
    if (!cands.length) { unmatched.push({ line, why: '시간표에서 이 과목을 찾지 못했어요' }); continue; }
    const longest = Math.max(...cands.map(x => x.n.length));
    cands = cands.filter(x => x.n.length === longest).map(x => x.c);
    const banFromCode = code ? String.fromCharCode(64 + (+code[1] % 100)) : null;
    const g = line.match(/(?<![\d])([1-4])\s*학년\s*([A-Za-z])\s*반?|(?<![\d\-])([1-4])\s*([A-Za-z])\s*반/);
    const grp = g ? `${g[1] || g[3]}${(g[2] || g[4]).toUpperCase()}` : null;
    const cells = line.split('\t').map(t => t.trim());
    const yearTok = cells.find(t => /^[1-4](학년)?$/.test(t));
    // 분반 칸(보강 신청 목록 .xls): 101=A, 102=B … / 과목코드에 붙은 경우(35382-101)는 위 banFromCode
    const secTok = cells.find(t => /^1\d\d$/.test(t));
    const banFromSec = secTok ? String.fromCharCode(64 + (+secTok % 100)) : null;
    const from = dates.length >= 2 ? dates[0] : '';
    const to = dates[dates.length - 1];
    const fromCol = from && dateMap[from] ? dateMap[from].col : (from ? DOW[dowOf(from)] : null);
    const fromP = dates.length >= 2 ? periods[0] : null;
    const score = c => (grp && groupOf(c) === grp ? 8 : 0) + ((banFromCode || banFromSec) && c.ban === (banFromCode || banFromSec) ? 4 : 0)
      + (yearTok && c.year === +yearTok[0] ? 2 : 0) + (fromCol && c.day === fromCol ? 3 : 0)
      + (fromP && c.start === fromP[0] ? 2 : 0) + (c.prof && line.includes(c.prof) ? 2 : 0);
    cands.sort((a, b) => score(b) - score(a));
    const c = cands[0];
    if (cands.length > 1 && score(cands[1]) === score(c) && cands[1].ban !== c.ban) { unmatched.push({ line, why: `어느 반인지 알 수 없어요 (${cands.map(groupOf).join('/')})` }); continue; }
    const p = periods[periods.length - 1] || [c.start, c.end];
    const room = (line.match(/(?<!\d)(\d{3,4})\s*호/) || [])[1] || c.room;
    makeups.push({ id: `${c.id}|${from}|${to}|${p[0]}`, classId: c.id, from, to, start: p[0], end: p[1], room, note: line.replace(/\t+/g, ' ') });
  }
  return { makeups, unmatched };
}

/** 글자만 보고 어떤 자료인지: 'calendar'(요일별 수업일 현황) | 'makeups'(보강) | 'unknown' */
function classifyText(text) {
  const t = String(text || '');
  const cal = parseCalendarText(t);
  const weeks = cal.data ? cal.data.weeks.filter(Boolean).length : 0;
  if (weeks >= 6 && !/보\s*강\s*(결\s*과|계\s*획)/.test(t)) return 'calendar';
  const rows = t.split(/\r?\n/).filter(l => (l.match(DATE_RE) || []).length >= 2 && linePeriods(l).length);
  // '보강'이라는 말이 있거나, 과목코드(35382-101)가 있는 결강·보강 줄이 있으면 보강 자료
  if (rows.length && (/보\s*강/.test(t) || rows.some(l => /\d{5}-\d{3}/.test(l)))) return 'makeups';
  if (weeks >= 6) return 'calendar';
  return 'unknown';
}
