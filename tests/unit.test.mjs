// 핵심 규칙 단위 테스트 (브라우저 없음). 실행: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore, SEED, makeHwp, MAKEUP_HEAD } from './helpers.mjs';

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

test('GitHub 합치기: 시험마다 더 최근에 고친 쪽, 지운 시험은 되살리지 않음', () => {
  const core = loadCore();
  const mk = (id, updatedAt) => ({ id, updatedAt, v: 2 });
  const local = { plans: { a: mk('a', 10), b: mk('b', 5), c: mk('c', 7) }, deleted: { x: 50 } };
  const remote = { plans: { a: mk('a', 8), b: mk('b', 9), d: mk('d', 3), x: mk('x', 40) }, deleted: { c: 20 } };
  const m = core.mergeStores(local, remote);
  assert.deepEqual(Object.keys(m.plans).sort(), ['a', 'b', 'd']);
  assert.equal(m.plans.a, local.plans.a);    // 이 브라우저가 더 최신
  assert.equal(m.plans.b, remote.plans.b);   // GitHub가 더 최신
  assert.deepEqual({ ...m.deleted }, { c: 20, x: 50 });
  assert.ok(m.localChanged && m.remoteChanged);
  // 지운 뒤에 다시 고친 시험은 남는다
  const m2 = core.mergeStores({ plans: { c: mk('c', 30) }, deleted: {} }, { plans: {}, deleted: { c: 20 } });
  assert.ok(m2.plans.c);
  // 같으면 아무 쪽도 바뀌지 않음
  const same = { plans: { a: mk('a', 1) }, deleted: {} };
  const m3 = core.mergeStores(same, { plans: { a: same.plans.a }, deleted: {} });
  assert.ok(!m3.localChanged && !m3.remoteChanged);
});

test('GitHub에 올리는 내용에서 브라우저별 값(보던 시험, writer)은 뺀다', () => {
  const core = loadCore();
  const st = core.toStore({ v: 1, ...SEED, exams: {}, extraDates: [] });
  st.plans['2026-2-final'].writer = 'tab123';
  const out = core.storePayload(st);
  assert.equal(out.currentId, undefined);
  assert.equal(out.plans['2026-2-final'].writer, undefined);
  assert.deepEqual(core.toStore(JSON.parse(JSON.stringify(out))).plans['2026-2-final'].classes.length, 50);
});

// ----- 보강 · 한글 문서 -----
const MK_ROWS = [
  ['35382-101', 'JAVA프로그래밍응용', '2', '2026/09/22', '화', '6~8', '2026/12/15', '화', '6~8', '양숙희', '(인)', 'N'],
  ['35579-103', '커리어디자인(취창업성공전략)', '2', '2026/11/26', '목', '3~4', '2026/12/10', '목', '1~2', '이성욱', '(인)', 'N'],
  ['35382-102', 'JAVA프로그래밍응용', '2', '2026/12/08', '화', '2~4', '2026/12/22', '화', '2~4', '양숙희', '(인)', 'N'],
];

test('한글(.hwp) 표를 한 행씩 읽는다 (압축 안 함 / 압축)', async () => {
  const core = loadCore();
  for (const compressed of [false, true]) {
    const buf = makeHwp([MAKEUP_HEAD, ...MK_ROWS], { before: ['보 강 결 과 보 고 서', '2026학년도 2학기 실시한 보강'], compressed });
    const text = await core.hwpToText(new Uint8Array(buf));
    const lines = text.split('\n');
    assert.equal(lines[0], '보 강 결 과 보 고 서');
    assert.equal(lines[3], MK_ROWS[0].join('\t'));
    assert.equal(core.classifyText(text), 'makeups');
  }
  await assert.rejects(() => core.hwpToText(new Uint8Array(100)), /한글/);
});

test('보강 짝짓기: 과목코드 끝자리 → 반, 결강 요일·교시로 시간표 수업 찾기', () => {
  const core = loadCore();
  const text = MK_ROWS.map(r => r.join('\t')).join('\n') + '\n제출일 2026-11-17';
  const r = core.parseMakeups(text, SEED.classes, SEED.calendar, 2026);
  assert.deepEqual(Array.from(r.unmatched), []);
  const got = r.makeups.map(m => [m.classId, m.from, m.to, m.start, m.end]);
  assert.deepEqual(JSON.parse(JSON.stringify(got)), [
    ['화-2A-6', '2026-09-22', '2026-12-15', 6, 8],
    ['목-2C-3', '2026-11-26', '2026-12-10', 1, 2],      // 시간표 이름 '커리어디자인'과 양식 이름이 달라도
    ['화-2B-2', '2026-12-08', '2026-12-22', 2, 4],
  ]);
  const un = core.parseMakeups('35999-101\t없는과목\t2\t2026/09/22\t화\t6~8\t2026/12/15\t화\t6~8', SEED.classes, SEED.calendar, 2026);
  assert.equal(un.makeups.length, 0); assert.equal(un.unmatched.length, 1);
});

test('보강 반영: 보강일엔 수업이 생기고 결강일엔 없어짐, 시험 주차 보강은 기본 시험 시간이 된다', () => {
  const core = loadCore();
  const p = seedPlan(core);
  p.makeups = core.parseMakeups(MK_ROWS.map(r => r.join('\t')).join('\n'), SEED.classes, SEED.calendar, 2026).makeups;
  core.usePlan(p);
  const on = d => Array.from(core.itemsOn(d, null)).map(it => `${it.kind}:${it.c.id}`);
  // 결강일(9/22)엔 원래 수업이 없어짐, 다른 반은 그대로
  assert.ok(!on('2026-09-22').includes('fixed:화-2A-6'));
  assert.ok(on('2026-09-22').includes('fixed:화-1A-2'));
  // 2A JAVA: 9/22 결강분 보강이 12/15 = 15주차(12/8)보다 뒤 → 15주가 밀림: 시험은 12/15, 12/8은 평소 수업
  const a2 = SEED.classes.find(x => x.id === '화-2A-6');
  assert.equal(core.defaultDate(a2), '2026-12-15');
  assert.ok(on('2026-12-15').includes('exam:화-2A-6'));
  assert.ok(!on('2026-12-15').includes('makeup:화-2A-6'));
  assert.ok(on('2026-12-08').includes('fixed:화-2A-6'));
  assert.ok(core.get('D.examPushed').has('화-2A-6'));
  // 2C 커리어디자인: 11/26 결강 → 12/10 보강(14주차, 15주차 12/17보다 앞) → 밀지 않음, 그날 보강 수업으로
  const c2 = SEED.classes.find(x => x.id === '목-2C-3');
  assert.equal(core.defaultDate(c2), '2026-12-17');
  assert.ok(on('2026-12-10').includes('makeup:목-2C-3'));
  // 2B JAVA의 15주차(12/8) 수업이 12/22로 보강됨 → 기본 시험일 12/22, 옮긴 것으로 보지 않음
  const c = SEED.classes.find(x => x.id === '화-2B-2');
  assert.equal(core.defaultDate(c), '2026-12-22');
  assert.equal(p.exams[c.id].date, '2026-12-22');
  assert.equal(core.statusOf(c).moved, false);
  assert.ok(!on('2026-12-22').includes('makeup:화-2B-2'));   // 시험 자리라서 고정 보강으로 겹치지 않음
  assert.ok(on('2026-12-22').includes('exam:화-2B-2'));
});

test("'기존 시간표 수업 진행' 확정은 옮기면 풀린다", () => {
  const core = loadCore();
  core.usePlan(seedPlan(core));
  const c = SEED.classes[0], ex = core.get('S').exams[c.id];
  ex.keep = true; ex.done = true;
  assert.equal(core.statusOf(c).keep, true);
  assert.equal(core.counts().keep, 1);
  assert.match(core.methodLabel(c), /^기존 시간표 수업 진행/);
  ex.start = ex.start + 1;
  assert.equal(core.statusOf(c).keep, false);
  assert.equal(core.methodLabel(c), '미정');
});

test('보강이 시험 주차 마지막 날 뒤면 시험을 밀지 않고, 시험 뒤 보강은 경고', () => {
  const core = loadCore();
  const p = seedPlan(core, 'mid');                                 // 중간고사 8주차
  // 화-2A-6: 8주차 화요일 10/20. 9/22 결강분 보강을 11/24(11주차)에 → 8주차 마지막 날(11/7) 뒤라서 밀지 않음
  p.makeups = [{ id: 'x', classId: '화-2A-6', from: '2026-09-22', to: '2026-11-24', start: 6, end: 8, room: '413', note: '' }];
  core.usePlan(p);
  const c = SEED.classes.find(x => x.id === '화-2A-6');
  assert.equal(core.defaultDate(c), '2026-10-20');
  assert.ok(!core.get('D.examPushed').has(c.id));
  assert.match(core.statusOf(c).warn.join(' '), /보강\(11\/24\(화\) 6~8교시\)이 시험보다 뒤에 있어요/);
  // 8주차 안(10/30)이면 밀림
  p.makeups[0].to = '2026-10-30';
  core.usePlan(p);
  assert.equal(core.defaultDate(c), '2026-10-30');
  assert.equal(core.shiftedByMakeup().length, 1);
});

test('보강 신청 목록(.xls 모양): 분반 칸 101·102·103 → 반', () => {
  const core = loadCore();
  const text = ['FALSE\t학과명\t과목코드\t과목명\t분반\t학년\t결강일\t보강일\t담당교수\t사유구분',
    '\t컴퓨터소프트웨어과\t35382\tJAVA프로그래밍응용\t101\t2\t2026/09/22(화) 6~8\t2026/12/15(화) 6~8\t양숙희\t기타',
    '\t컴퓨터소프트웨어과\t35382\tJAVA프로그래밍응용\t103\t2\t2026/10/23(금) 2~4\t2026/10/26(월) 2~4\t한성훈\t출장',
    '\t컴퓨터소프트웨어과\t35579\t커리어디자인(취창업성공전략)\t102\t2\t2026/12/10(목) 3~4\t2026/12/10(목) 1~2\t박신성\tHIGH-5 합반 및 특강'].join('\n');
  assert.equal(core.classifyText(text), 'makeups');
  const r = core.parseMakeups(text, SEED.classes, SEED.calendar, 2026);
  assert.deepEqual(Array.from(r.unmatched), []);
  assert.deepEqual(JSON.parse(JSON.stringify(r.makeups.map(m => [m.classId, m.from, m.to, m.start, m.end]))), [
    ['화-2A-6', '2026-09-22', '2026-12-15', 6, 8],
    ['금-2C-2', '2026-10-23', '2026-10-26', 2, 4],
    ['목-2B-3', '2026-12-10', '2026-12-10', 1, 2],
  ]);
});

test('합반 시험: 같은 과목·같은 교수님의 다른 반이 같은 날 같은 시각에 시작하면 교수·강의실 겹침 아님 (교수님이 다르면 합반 아님)', () => {
  const core = loadCore();
  core.usePlan(seedPlan(core));
  const S = core.get('S');
  // 웹자바프로그래밍입문: 2A 목 6~8(이성욱, 212) / 2B 수 2~4(이성욱, 212). 2A 시험은 12/17 6교시
  const b2 = SEED.classes.find(x => x.id === '수-2B-2');
  const same = { date: '2026-12-17', start: 6, len: 3, room: '212' };
  assert.deepEqual(Array.from(core.conflictsOf(b2, same)), []);
  assert.deepEqual(Array.from(core.combinedAt(b2, same), x => x.c.id), ['목-2A-6']);
  assert.deepEqual(Array.from(core.warningsOf(b2, same)), []);
  // 시작 교시가 다르게 걸치면 합반 아님 → 교수·강의실 겹침
  const kinds = Array.from(core.conflictsOf(b2, { ...same, start: 7 }), x => x.kinds.join('·'));
  assert.deepEqual(Array.from(kinds), ['교수·강의실']);
  assert.equal(core.combinedAt(b2, { ...same, start: 7 }).length, 0);
  // 다른 과목(이성욱 커리어디자인 2C, 12/17 3~4교시)과 같은 시간이면 교수 겹침
  const kc = core.conflictsOf(b2, { date: '2026-12-17', start: 3, len: 2, room: '999' });
  assert.ok(kc.some(x => x.it.c.id === '목-2C-3' && x.kinds.includes('교수')));
  // 같은 교수님인데 강의실을 다르게 잡으면 겹침은 아니지만 확인 필요
  assert.match(core.warningsOf(b2, { ...same, room: '413' }).join(' '), /합반\(2A\)인데 강의실이 달라요\(413호·212호\)/);
  // 과목이 같아도 교수님이 다르면 합반 아님(사용자): 커리어디자인 2A 조동일 · 2B 박신성을 같은 12/17 1교시·같은 산학관101에 → 강의실 겹침
  const k2a = SEED.classes.find(x => x.id === '목-2A-1');
  S.exams['목-2B-3'] = { ...S.exams['목-2B-3'], start: 1, len: 2 };      // 2B를 2A와 같은 12/17 1교시로
  assert.equal(core.combinedAt(k2a, { date: '2026-12-17', start: 1, len: 2, room: '산학관101' }).length, 0);
  assert.equal(core.statusOf(k2a).combined.length, 0);
  assert.deepEqual(Array.from(core.statusOf(k2a).bad, x => `${x.it.c.id}:${x.kinds.join('·')}`), ['목-2B-3:강의실']);
  // 기본 일정의 커리어디자인 2B(박신성)·2C(이성욱)도 12/17 3~4교시에 같이 있지만 합반 아님, 강의실이 달라 겹침도 없음
  S.exams['목-2B-3'] = { ...S.exams['목-2B-3'], start: 3, len: 2 };
  const k2c = SEED.classes.find(x => x.id === '목-2C-3');
  assert.equal(core.statusOf(k2c).combined.length, 0);
  assert.deepEqual(Array.from(core.statusOf(k2c).bad), []);
  // 같은 반이 겹치는 건 합반이어도 여전히 겹침 (같은 반이 두 시험)
  assert.equal(core.combinedAt(b2, { date: '2026-12-16', start: 2, len: 3, room: '212' }).length, 0);
});

test('시험 시간 직접 정하기: 시간 → 걸치는 교시, 교시 경계면 시간 지움, 끌면 같이 옮김', () => {
  const core = loadCore();
  core.usePlan(seedPlan(core));
  const P = (a, b) => JSON.parse(JSON.stringify(core.timeToPeriods(a, b)));
  assert.deepEqual(P('10:00', '11:30'), { start: 2, len: 2 });   // 2교시(09:55~10:45)·3교시(10:50~11:40)에 걸침
  assert.deepEqual(P('09:00', '12:35'), { start: 1, len: 4 });
  assert.deepEqual(P('13:00', '14:00'), { start: 5, len: 2 });   // 점심(5교시)에 걸침
  const c = SEED.classes.find(x => x.id === '화-2A-6'), ex = core.get('S').exams[c.id];
  assert.equal(core.statusOf(c).moved, false);
  assert.ok(core.setExamTime(ex, '13:40', '15:10'));
  assert.deepEqual({ start: ex.start, len: ex.len, time: { ...ex.time } }, { start: 6, len: 2, time: { from: '13:40', to: '15:10' } });
  assert.equal(core.examTime(ex), '13:40~15:10');
  assert.equal(core.statusOf(c).moved, true);                      // 시간을 바꾸면 '기존 시간표'가 아님
  assert.equal(core.setExamTime(ex, '15:10', '13:40'), false);      // 거꾸로면 거부
  // 끌어서 2교시로 → 같은 길이·같은 어긋남으로 이동 (13:35→09:55 = -220분)
  core.moveExamStart(ex, 2);
  assert.deepEqual({ ...ex.time }, { from: '10:00', to: '11:30' });
  assert.equal(ex.start, 2); assert.equal(ex.len, 2);
  // 교시 경계와 같게 정하면 직접 정한 시간이 없어지고 교시 시간
  assert.ok(core.setExamTime(ex, '13:35', '16:15'));
  assert.equal(ex.time, undefined); assert.equal(ex.start, 6); assert.equal(ex.len, 3);
  assert.equal(core.statusOf(c).moved, false);
  // 수업 시간 밖이면 경고
  core.setExamTime(ex, '17:30', '18:30');
  assert.match(core.statusOf(c).warn.join(' '), /수업 시간\(09:00~18:05\) 밖이에요/);
});

test('엑셀 시간 글자: 13:35~16:15 → 13시 35분 ~ 16시 15분, 정시는 분 생략', () => {
  const core = loadCore();
  assert.equal(core.koRange('13:35', '16:15'), '13시 35분 ~ 16시 15분');
  assert.equal(core.koRange('09:00', '12:35'), '09시 ~ 12시 35분');
  assert.equal(core.koRange('17:00', '18:00'), '17시 ~ 18시');
});

test('다른 주차 수업 옮기기: 직접 옮긴 기록이 생기고, 원래 자리로 되돌리면 지워지며, 시험은 끌고 가지 않음', () => {
  const core = loadCore();
  core.usePlan(seedPlan(core));
  const S = () => core.get('S'), dm = core.get('D.dateMap');
  const c = SEED.classes.find(x => x.id === '화-2A-6');
  const d14 = Object.keys(dm).find(k => dm[k].col === '화' && dm[k].week === 14);
  const d8 = Object.keys(dm).find(k => dm[k].col === '화' && dm[k].week === 8);
  const fixedOf = iso => core.itemsOn(iso).find(it => it.c.id === c.id && it.kind !== 'exam');
  const it14 = fixedOf(d14);
  assert.equal(it14.kind, 'fixed'); assert.equal(it14.week, 14);
  assert.equal(core.sessionFree(it14), false);                  // 14주차: 꾹 눌러야 함
  assert.equal(core.sessionFree(fixedOf(d8)), true);            // 8주차: 바로 옮길 수 있음
  // 14주차 화요일 6~8교시 → 같은 주 목요일(수업일 현황상 목요일) 1교시로
  const thu = Object.keys(dm).find(k => dm[k].col === '목' && dm[k].week === 14);
  const ref = core.applySession(core.sessionRef(it14), { date: thu, start: 1 });
  assert.equal(ref.mkId, `${c.id}|${d14}|m`);
  const m = S().makeups.find(x => x.id === ref.mkId);
  assert.deepEqual({ from: m.from, to: m.to, start: m.start, end: m.end, manual: m.manual }, { from: d14, to: thu, start: 1, end: 3, manual: true });
  assert.equal(fixedOf(d14), undefined);                         // 원래 날짜에서 빠지고
  const moved = fixedOf(thu);
  assert.equal(moved.kind, 'makeup'); assert.equal(moved.week, 14); assert.equal(core.sessionFree(moved), false);   // 옮겨도 14주차 수업 → 꾹 눌러야 함
  assert.match(core.describeConflict({ it: moved, kinds: ['반'] }), /14주차 수업\(.+에서 옮김\)/);
  // 자기 자신(옮긴 자리·원래 자리)은 겹침이 아님. 그 자리에 같은 반 다른 수업이 있으면 겹침
  const placeOf = r => { const s = core.sessionOf(r); return { date: s.date, start: s.start, len: s.len, room: s.room, self: r }; };
  const cf = core.conflictsOf(c, placeOf(ref));
  assert.ok(cf.length > 0 && cf.every(x => x.it.c.id !== c.id), cf.map(core.describeConflict).join(' / '));   // 목 1교시엔 2A 커리어디자인
  assert.equal(core.conflictsOf(c, { date: d14, start: c.start, len: 3, room: c.room, self: ref }).length, 0);
  // 시간 직접 정하기
  const ref2 = core.applySession(ref, { start: 2, len: 2, time: { from: '10:00', to: '11:30' } });
  assert.equal(ref2.mkId, ref.mkId);
  assert.equal(core.sessionTime(core.sessionOf(ref2)), '10:00~11:30');
  // 원래 자리로 → 기록 지움
  const back = core.applySession(ref2, { date: d14, start: c.start, len: c.end - c.start + 1, time: null, room: c.room });
  assert.equal(back.mkId, null);
  assert.equal(S().makeups.length, 0);
  assert.equal(fixedOf(d14).kind, 'fixed');
  // 시험 주차 날짜보다 뒤(같은 시험 주차 안)로 직접 옮겨도 시험은 그대로, 경고만
  const ex0 = { ...S().exams[c.id] };
  const ew = core.defaultDate(c);
  const fri15 = Object.keys(dm).find(k => dm[k].col === '금' && dm[k].week === 15);
  assert.ok(fri15 > ew);
  core.applySession(core.sessionRef(fixedOf(d14)), { date: fri15, start: 9 });
  assert.equal(S().exams[c.id].date, ex0.date);
  assert.equal(core.get('D.examPushed').has(c.id), false);
  assert.match(core.statusOf(c).warn.join(' '), /옮긴 수업\(.+\)이 시험보다 뒤에 있어요/);
});

test('직접 정한 시간은 분 단위로 겹침 검사·점심 경고·합반·판 위치', () => {
  const core = loadCore();
  core.usePlan(seedPlan(core));
  const S = core.get('S');
  const [a, b] = SEED.classes.filter(c => c.year === 2 && c.ban === 'A');
  const day = '2026-12-22';                                   // 토요일 15주차: 우리 과 수업 없음
  const put = (c, from, to) => { const ex = S.exams[c.id]; ex.date = day; assert.ok(core.setExamTime(ex, from, to)); return ex; };
  const bad = c => core.statusOf(c).bad;
  // 같은 6교시 안이지만 13:35~14:00 / 14:00~14:25 → 안 겹침 (교시로만 보면 겹침)
  put(a, '13:35', '14:00'); put(b, '14:00', '14:25');
  assert.equal(S.exams[a.id].start, S.exams[b.id].start);
  assert.equal(bad(a).length, 0); assert.equal(bad(b).length, 0);
  // 13:50~14:25 → 10분 겹침, 겹침 글자에 그 시간
  put(b, '13:50', '14:25');
  assert.deepEqual(Array.from(bad(a)[0].kinds), ['반']);
  assert.match(core.describeConflict(bad(a)[0]), /13:50~14:25/);
  // 점심: 12:05~12:35는 경고 없음, 12:20~12:50은 경고
  put(b, '12:05', '12:35');
  assert.doesNotMatch(core.statusOf(b).warn.join(' '), /점심/);
  put(b, '12:20', '12:50');
  assert.match(core.statusOf(b).warn.join(' '), /점심/);
  // 판 위치(%): 점심 칸은 0.55배 폭, 쉬는 시간은 칸 경계
  const pct = t => core.timePct(core.toMin(t));
  assert.equal(pct('09:00'), 0); assert.equal(pct('18:05'), 100);
  assert.ok(Math.abs(pct('12:35') - 4 / 9.55 * 100) < 1e-9);
  assert.equal(pct('12:37'), pct('12:35'));
  assert.ok(Math.abs(pct('12:20') - 3.7 / 9.55 * 100) < 1e-9);
  // 합반은 시작 시각이 같아야: 2A·2B 같은 과목이 13:40 / 13:40 → 합반, 13:40 / 13:35 → 합반 아님
  const twin = SEED.classes.find(x => x.year === 2 && x.ban === 'B' && x.course === a.course);
  if (twin) {
    S.exams[b.id].date = '2026-12-07';
    put(a, '13:40', '15:10'); put(twin, '13:40', '15:10');
    assert.equal(core.statusOf(a).combined.length, 1);
    put(twin, '13:35', '15:10');
    assert.equal(core.statusOf(a).combined.length, 0);
  }
});

test('엑셀에서 펼칠 날(dayTouched): 보강·옮긴 수업이 들고 나는 날, 시험을 옮긴 원래 날, 메모 있는 시험', () => {
  const core = loadCore();
  core.usePlan(seedPlan(core));
  const S = core.get('S'), dm = core.get('D.dateMap');
  const untouched = Object.keys(dm).filter(k => !core.dayTouched(k));
  assert.ok(untouched.includes('2026-12-09') && untouched.includes('2026-12-10'));   // 처음엔 손댄 날 없음
  // 14주차 수업을 12/9 → 12/10으로 옮기면 두 날 모두
  const c = SEED.classes.find(x => x.id === '수-1A-6');
  const it = core.itemsOn('2026-12-09').find(x => x.c.id === c.id);
  core.applySession(core.sessionRef(it), { date: '2026-12-10', start: 1 });
  assert.equal(core.dayTouched('2026-12-09'), true); assert.equal(core.dayTouched('2026-12-10'), true);
  assert.equal(core.dayTouched('2026-12-11'), false);
  // 시험을 원래 날(12/8)에서 다른 날로 옮기면 12/8도
  const j = SEED.classes.find(x => x.id === '화-2A-6'), ex = S.exams[j.id];
  ex.date = '2026-12-22';
  assert.equal(core.dayTouched('2026-12-08'), true);
  // 메모: 시험 없음(블록 없음)인 과목이면 원래 수업일에
  const w = SEED.classes.find(x => x.day === '금');
  const wd = core.defaultDate(w);
  assert.equal(core.dayTouched(wd), false);
  S.exams[w.id].note = '교수님 출장';
  assert.equal(core.dayTouched(wd), true);
});

test('시험으로 등록: 14주차 수업 자리에서 시험, 15주차 수업은 평소 수업으로 · 시간 줄인 수업도 · 되돌리기', () => {
  const core = loadCore();
  core.usePlan(seedPlan(core));
  const S = core.get('S'), dm = core.get('D.dateMap');
  const c = SEED.classes.find(x => x.id === '화-2A-6'), ex = S.exams[c.id];
  const ew = core.defaultDate(c);                                         // 12/8(화) 15주차
  const d14 = Object.keys(dm).find(k => dm[k].col === '화' && dm[k].week === 14);
  const mine = (iso, kind) => core.itemsOn(iso).filter(it => it.c.id === c.id && it.kind === kind);
  assert.equal(mine(ew, 'fixed').length, 0);                                // 처음엔 15주차 수업 = 시험 자리
  assert.equal(mine(d14, 'fixed').length, 1);
  // 14주차 수업을 시험으로 등록
  assert.ok(core.registerAsExam(core.sessionRef(mine(d14, 'fixed')[0])));
  assert.deepEqual({ ...ex.src }, { from: d14, mkId: null });
  assert.deepEqual([ex.date, ex.start, ex.len], [d14, c.start, c.end - c.start + 1]);
  assert.equal(core.examWeekOf(c), 14);
  assert.equal(core.isMoved(c), false);                                    // 등록한 수업 자리 그대로 = 옮긴 게 아님
  assert.equal(mine(d14, 'fixed').length, 0);                               // 14주차 수업 → 시험
  assert.equal(mine(d14, 'exam').length, 1);
  assert.equal(mine(ew, 'fixed').length, 1);                                // 15주차 수업 → 평소 수업
  assert.equal(mine(ew, 'fixed')[0].week, 15);
  assert.equal(core.statusOf(c).bad.length, 0);                             // 자기 수업과 겹침 아님
  assert.doesNotMatch(core.statusOf(c).warn.join(' '), /주차 수업\(.+\)보다 이르거나/);
  assert.equal(core.dayTouched(ew), true);
  // 15주차 수업을 다시 시험으로 등록 → 기본으로 (등록 지움)
  core.registerAsExam(core.sessionRef(mine(ew, 'fixed')[0]));
  assert.equal(ex.src, undefined);
  assert.equal(ex.date, ew); assert.equal(mine(ew, 'fixed').length, 0); assert.equal(mine(d14, 'fixed').length, 1);
  // 14주차 수업을 꾹 눌러 시간을 줄이고(13:35~15:00) 그 수업을 시험으로 등록 → 시험도 그 시간
  const ref = core.applySession(core.sessionRef(mine(d14, 'fixed')[0]), { start: 6, len: 2, time: { from: '13:35', to: '15:00' } });
  assert.equal(mine(d14, 'makeup').length, 1);
  core.registerAsExam(ref);
  assert.deepEqual({ ...ex.src }, { from: d14, mkId: ref.mkId });
  assert.deepEqual({ ...ex.time }, { from: '13:35', to: '15:00' });
  assert.equal(core.isMoved(c), false);
  assert.equal(mine(d14, 'makeup').length, 0); assert.equal(mine(d14, 'exam').length, 1);
  // 되돌리기: 15주차 수업에서 시험, 줄인 14주차 수업은 다시 평소(줄인 시간 그대로)
  core.clearExamSrc(c);
  assert.equal(ex.src, undefined); assert.equal(ex.date, ew); assert.equal(ex.time, undefined);
  assert.equal(mine(d14, 'makeup').length, 1);
  // '시험 없음' 과목도 수업을 시험으로 등록하면 방식이 '미정'으로
  ex.method = '시험 없음';
  core.registerAsExam(core.sessionRef(mine(d14, 'makeup')[0]));
  assert.equal(ex.method, '미정');
});

test('보유 강의실: 이름 맞추기(남관412 = 412, 101 = 산학관101), 표시, 같은 강의실이면 겹침', () => {
  const core = loadCore();
  assert.deepEqual(Array.from(core.get('OWNED_ROOMS')), ['111', '212', '401', '404', '412', '413', '산학관101']);
  const C = r => core.canonRoom(r);
  assert.equal(C('남관412'), '412'); assert.equal(C('남관 412호'), '412'); assert.equal(C('412호'), '412');
  assert.equal(C('산학관 101호'), '산학관101'); assert.equal(C('산학관101'), '산학관101'); assert.equal(C('101'), '산학관101');
  assert.equal(C('515'), '515'); assert.equal(C(''), '');
  assert.equal(core.roomLabel('남관412'), '412호'); assert.equal(core.roomLabel('산학관101'), '산학관 101호');
  assert.equal(core.roomFull('412'), '남관 412호'); assert.equal(core.roomFull('101'), '산학관 101호');
  assert.equal(core.normRoom('남관412'), core.normRoom('412'));
  // 시간표에 '남관412'로 적힌 수업(목 2C 커리어디자인 3~4교시)과 '412'에 놓은 시험은 같은 강의실 → 겹침
  core.usePlan(seedPlan(core));
  const S = core.get('S'), dm = core.get('D.dateMap');
  const thu = Object.keys(dm).find(k => dm[k].col === '목' && dm[k].week === 14);
  const other = SEED.classes.find(c => c.year === 1 && c.ban === 'A');
  const ex = S.exams[other.id];
  Object.assign(ex, { date: thu, start: 3, len: 2, room: '412' }); delete ex.time;
  const bad = core.statusOf(other).bad;
  assert.ok(bad.some(x => x.it.c.id === '목-2C-3' && Array.from(x.kinds).includes('강의실')), bad.map(core.describeConflict).join(' / '));
});
