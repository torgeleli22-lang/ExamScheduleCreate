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

test('합반 시험: 같은 과목 다른 반이 같은 날 같은 교시에 시작하면 교수·강의실 겹침 아님', () => {
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
  // 교수님이 다른 합반(커리어디자인 2A 조동일 · 2B 박신성)은 강의실이 달라도 괜찮음
  const k2a = SEED.classes.find(x => x.id === '목-2A-1');
  S.exams['목-2B-3'] = { ...S.exams['목-2B-3'], start: 1, len: 2 };      // 2B를 2A와 같은 12/17 1교시로
  assert.deepEqual(Array.from(core.combinedAt(k2a, { date: '2026-12-17', start: 1, len: 2, room: '산학관101' }), x => x.c.id), ['목-2B-3']);
  assert.deepEqual(Array.from(core.statusOf(k2a).bad), []);
  assert.equal(core.statusOf(k2a).combined.length, 1);
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
