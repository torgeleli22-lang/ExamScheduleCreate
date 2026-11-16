// 핵심 규칙 단위 테스트 (브라우저 없음). 실행: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore, SEED } from './helpers.mjs';

function seedPlan(core, kind = 'final') {
  return core.makePlan({ termYear: SEED.year, term: 2, kind, dept: SEED.dept, calendar: SEED.calendar, classes: SEED.classes, taken: {} });
}

test('수업일 현황의 함정: 날짜 → (시간표 요일, 주차)', () => {
  const core = loadCore();
  core.usePlan(seedPlan(core));
  const dm = core.get('D.dateMap');
  assert.deepEqual({ ...dm['2026-12-15'] }, { col: '금', week: 14 });   // 화요일이지만 금요일 14주차 수업일
  assert.deepEqual({ ...dm['2026-12-22'] }, { col: '토', week: 15 });   // 화요일이지만 토요일 15주차 (우리 과 수업 없음)
  assert.deepEqual({ ...dm['2026-12-08'] }, { col: '화', week: 15 });   // 화요일 15주차
  const tue = SEED.classes.find(c => c.day === '화');
  assert.equal(core.defaultDate(tue), '2026-12-08');
});

test('기본 배치(기말 15주차)는 겹침 0', () => {
  const core = loadCore();
  core.usePlan(seedPlan(core));
  const k = core.counts();
  assert.equal(k.all, 50); assert.equal(k.bad, 0); assert.equal(k.warn, 0);
});

test('같은 자료로 중간고사(8주차)도 기본 배치 겹침 0, 기본 날짜는 8주차', () => {
  const core = loadCore();
  const p = seedPlan(core, 'mid');
  assert.equal(p.examWeek, 8); assert.equal(p.id, '2026-2-mid'); assert.equal(p.title, '2026학년도 2학기 중간고사');
  core.usePlan(p);
  assert.equal(core.counts().bad, 0);
  const mon = SEED.classes.find(c => c.day === '월');
  assert.equal(core.defaultDate(mon), '2026-11-02');
});

test('12/15(화)로 옮기면 금요일 14주차 수업과 겹침을 잡는다', () => {
  const core = loadCore();
  core.usePlan(seedPlan(core));
  const c = SEED.classes.find(c => c.day === '화' && c.course === '앱프로그래밍기초');
  const cf = core.conflictsOf(c, { date: '2026-12-15', start: 2, len: 2, room: c.room });
  assert.ok(cf.length > 0);
  assert.ok(cf.every(x => x.it.kind === 'fixed' && x.it.c.day === '금' && x.it.week === 14));
  // 12/22(토요일 15주차)는 비어 있다
  assert.equal(core.conflictsOf(c, { date: '2026-12-22', start: 2, len: 2, room: c.room }).length, 0);
});

test('시험 없음 과목은 시험주차에 원래 수업으로 남는다', () => {
  const core = loadCore();
  core.usePlan(seedPlan(core));
  const c = SEED.classes[0];
  core.get('S').exams[c.id].method = '시험 없음';
  const items = core.itemsOn(core.defaultDate(c), null);
  assert.ok(items.some(it => it.kind === 'fixed' && it.c.id === c.id));
});

test('수업일 표 붙여넣기: 주차 번호 있음/없음, (화) 표기', () => {
  const core = loadCore();
  const text = core.calendarText(SEED.calendar);
  const r = core.parseCalendarText(text);
  assert.ok(!r.error);
  assert.deepEqual(JSON.parse(JSON.stringify(r.data)), SEED.calendar);
  const r2 = core.parseCalendarText('월 화 수 목 금 토 주\n3/2 3/3 3/4 3/5 3/6 3/7\n3/9 3/10 3/11 3/12 3/13 3/14');
  assert.equal(r2.data.weeks.length, 2);
  assert.equal(r2.data.weeks[1][0], '3/9');
  const r3 = core.parseCalendarText('14 12/14 12/1 12/9 12/10 12/15 (화) 12/19');
  assert.equal(r3.data.weeks[13][4], '12/15(화)');
  assert.ok(core.parseCalendarText('아무 내용 없음').error);
});

test('PDF 글자 조각을 줄로 묶는다 (높이 오차 허용, 왼쪽부터)', () => {
  const core = loadCore();
  const it = (s, x, y) => ({ str: s, transform: [1, 0, 0, 1, x, y] });
  const lines = core.pdfItemsToLines([it('9/1', 200, 700.5), it('1', 50, 700), it('9/7', 120, 699), it('주', 50, 740), it('월', 120, 740), it(' ', 300, 700)]);
  assert.deepEqual(Array.from(lines), ['주 월', '1 9/7 9/1']);
});

test('1학기 달력은 같은 해, 2학기 달력의 1~2월은 다음 해', () => {
  const core = loadCore();
  const spring = core.buildDateMap({ cols: ['월'], weeks: [['3/2'], ['6/15']] }, 2027);
  assert.ok(spring.dateMap['2027-03-02'] && spring.dateMap['2027-06-15']);
  const fall = core.buildDateMap({ cols: ['월'], weeks: [['9/7'], ['1/4']] }, 2026);
  assert.ok(fall.dateMap['2027-01-04']);
});

test('예전(v1) 저장 데이터 → 계획 하나짜리 저장소로', () => {
  const core = loadCore();
  const v1 = { v: 1, ...SEED, exams: {}, extraDates: [], rev: 3, updatedAt: 123 };
  const st = core.toStore(v1);
  assert.deepEqual(Object.keys(st.plans), ['2026-2-final']);
  const p = st.plans['2026-2-final'];
  assert.equal(p.kind, 'final'); assert.equal(p.term, 2); assert.equal(p.termYear, 2026); assert.equal(p.rev, 3);
  assert.equal(st.currentId, '2026-2-final');
  // v2 → v2 그대로, 최신 학기가 기본
  const mid27 = core.makePlan({ termYear: 2027, term: 1, kind: 'mid', calendar: SEED.calendar, classes: [], taken: {} });
  const st2 = core.toStore({ v: 2, plans: { ...st.plans, [mid27.id]: mid27 }, currentId: 'nope' });
  assert.equal(st2.currentId, '2027-1-mid');
  assert.equal(core.toStore({ hello: 1 }), null);
});

test('계획 id는 겹치지 않게, 정렬은 최신 학기 먼저 · 학기 안에서는 중간 → 기말', () => {
  const core = loadCore();
  const a = core.makePlan({ termYear: 2026, term: 2, kind: 'final', calendar: SEED.calendar, classes: [], taken: {} });
  const b = core.makePlan({ termYear: 2026, term: 2, kind: 'final', calendar: SEED.calendar, classes: [], taken: { [a.id]: a } });
  assert.equal(b.id, '2026-2-final-2');
  const m = core.makePlan({ termYear: 2026, term: 2, kind: 'mid', calendar: SEED.calendar, classes: [], taken: {} });
  const n = core.makePlan({ termYear: 2027, term: 1, kind: 'mid', calendar: SEED.calendar, classes: [], taken: {} });
  const order = core.sortedPlans({ plans: { [a.id]: a, [m.id]: m, [n.id]: n } }).map(p => p.id);
  assert.deepEqual(Array.from(order), ['2027-1-mid', '2026-2-mid', '2026-2-final']);
});
