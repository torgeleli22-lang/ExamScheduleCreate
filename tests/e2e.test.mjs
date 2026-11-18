// 브라우저 종단 테스트 (headless Chromium). 실행: npm run test:e2e   (먼저 npm run build)
// Chromium 경로를 지정하려면 CHROME=/path/to/chrome
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { SEED, launch, openApp, makeTimetableXlsx, makeCalendarPdf, makeHwp, MAKEUP_HEAD, download, readXlsx } from './helpers.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });

const P = page => ({
  counts: () => page.evaluate(() => window.__planner.counts()),
  state: fn => page.evaluate(fn),
});
async function dragTo(page, from, to) {
  const bb = await from.boundingBox(), cb = await to.boundingBox();
  await page.mouse.move(bb.x + 8, bb.y + bb.height / 2); await page.mouse.down();
  await page.mouse.move(cb.x + cb.width / 2, cb.y + Math.min(cb.height / 2, 40), { steps: 14 }); await page.mouse.up();
}
/** 반×교시 자세히(날짜를 눌러 펼침)에서 블록을 다른 날짜·교시로 */
async function dragBlock(page, fromDay, course, toDay, group, period) {
  for (const d of [fromDay, toDay]) if (!(await page.locator(`.day[data-day="${d}"]`).count())) await page.click(`[data-daydetail="${d}"]`);
  await dragTo(page, page.locator(`.day[data-day="${fromDay}"] .blk.exam`, { hasText: course }), page.locator(`.day[data-day="${toDay}"] .cell[data-group="${group}"][data-p="${period}"]`));
}
const examOf = (page, id) => page.evaluate(id => window.__planner.state.exams[id], id);

/** 2027학년도 1학기 달력: 3/1(월) 시작 15주. 15주차 월요일 수업은 6/15(화)에 한다(대체 수업일 함정). */
function springCalendar() {
  const weeks = [];
  for (let w = 0; w < 15; w++) weeks.push([0, 1, 2, 3, 4, 5].map(d => { const t = new Date(Date.UTC(2027, 2, 1 + w * 7 + d)); return `${t.getUTCMonth() + 1}/${t.getUTCDate()}`; }));
  weeks[14][0] = '6/15(화)';
  return { cols: ['월', '화', '수', '목', '금', '토'], weeks };
}

test('주차×요일 판 · 등록 폼 · 드래그 · 기존 시간표 확정 · 엑셀 (2026-2 기말)', async () => {
  const { ctx, page, errors } = await openApp(browser);
  const p = P(page);
  let k = await p.counts();
  assert.equal(k.all, 50); assert.equal(k.bad, 0);
  assert.deepEqual([await page.inputValue('#selYear'), await page.inputValue('#selTerm'), await page.inputValue('#selKind')], ['2026', '2', 'final']);

  // 판: 기간 12/7~12/26 (15주차 날짜가 세 주에 흩어져 있음), 12/15(화)는 금요일 14주차 수업일
  assert.equal(await page.textContent('#rangeBtn'), '12/7(월) ~ 12/26(토) · 3주');
  assert.equal(await page.locator('.wh').count(), 3);
  assert.match(await page.innerText('.wcell[data-date="2026-12-15"] .wdate'), /금요일 14주차 수업일/);
  assert.match(await page.innerText('.wcell[data-date="2026-12-08"]'), /15주차/);
  assert.equal(await page.locator('.wcell[data-date="2026-12-15"] .wcard.exam').count(), 0);

  // 등록 창: 화 2C 앱프로그래밍기초 → 12/15는 겹침, 빈 시간(12/22) 눌러 등록
  await page.click('#btnRegister');
  await page.selectOption('#rCourse', { label: '2C 앱프로그래밍기초 (정세일) · 화 6교시' });
  await page.selectOption('#rDate', '2026-12-15'); await page.selectOption('#rStart', '2');
  assert.match(await page.innerText('#rChecks'), /겹침/);
  await page.click('[data-rslot^="2026-12-22|"]'); await page.click('#rSave');
  const app2c = await p.state(() => window.__planner.state.classes.find(c => c.day === '화' && c.course === '앱프로그래밍기초').id);
  assert.equal((await examOf(page, app2c)).date, '2026-12-22');
  await page.click('#dClose');
  // 옮긴 카드에는 몇 주차 수업을 어디서 옮겼는지 표시
  assert.match(await page.innerText(`.wcell[data-date="2026-12-22"] .wcard.exam[data-id="${app2c}"]`), /15주차.*12\/8\(화\).*에서 옮김/s);

  // 판에서 드래그: 12/16(수) 3A 애플리케이션프레임워크 카드를 12/22 칸으로 → 같은 교시로 날짜만 이동
  const app3a = '수-3A-6';
  const before = await examOf(page, app3a);
  await dragTo(page, page.locator(`.wcell[data-date="2026-12-16"] .wcard.exam[data-id="${app3a}"]`), page.locator('.wcell[data-date="2026-12-22"]'));
  const after1 = await examOf(page, app3a);
  assert.equal(after1.date, '2026-12-22'); assert.equal(after1.start, before.start);

  // 반×교시 자세히에서 드래그: 12/16 2B 웹자바 → 12/17 2B 6교시 (이성욱 교수 2A 시험과 겹침)
  await dragBlock(page, '2026-12-16', '웹자바프로그래밍입문', '2026-12-17', '2B', 6);
  k = await p.counts();
  assert.equal(k.bad, 2);

  // 옮기지 않은 과목 모두 '기존 시간표 수업 진행' 확정 (옮긴 3과목·겹침 과목은 빠짐)
  await page.click('#btnKeepAll');
  k = await p.counts();
  assert.equal(k.keep, 50 - 3 - 1);
  assert.match(await page.innerText('.wcell[data-date="2026-12-21"]'), /기존 시간표 수업 진행/);
  // 카드를 눌러 서랍에서 확정 취소
  await page.click('.wcell[data-date="2026-12-21"] .wcard.exam >> nth=0');
  await page.click('#dKeep');
  assert.equal((await p.counts()).keep, 50 - 3 - 1 - 1);
  await page.click('#dClose');

  const x = await download(page, () => page.click('#btnExport'));
  assert.equal(x.name, '2026학년도_2학기_기말고사_시간표.xlsx');
  const wb = await readXlsx(x.buf);
  assert.deepEqual(wb.worksheets.map(w => w.name), ['시험시간표(공지)', '과목별 목록', '교수님별']);
  const list = wb.getWorksheet('과목별 목록');
  assert.equal(list.rowCount, 51);
  const methods = []; list.eachRow((r, i) => { if (i > 1) methods.push(String(r.getCell(10).value)); });
  assert.equal(methods.filter(m => m.startsWith('기존 시간표 수업 진행')).length, 45);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('새 학기: 학년도·학기·시험 고르기 → 파일 한꺼번에 넣기(자동 인식, 한글 보강) → 중간·기말 생성, 보관, 새로고침', async () => {
  const cal = springCalendar();
  const night = { day: '월', year: 4, ban: 'A', start: 9, end: 10, course: '캡스톤심화', prof: '야간교수', room: '501' };
  const xlsx = await makeTimetableXlsx(SEED.classes, { extra: [night] });
  const pdf = await makeCalendarPdf(browser, cal);
  const hwp = makeHwp([MAKEUP_HEAD,
    ['32305-101', '데이터베이스기초', '1', '2027/03/23', '화', '2~4', '2027/04/21', '수', '9~10', '정재헌', '(인)', 'N'],    // 4주차분 → 8주차 수요일 보강
    ['32305-102', '데이터베이스기초', '1', '2027/04/20', '화', '6~8', '2027/04/24', '토', '6~8', '정재헌', '(인)', 'N'],    // 8주차(시험 주차) 수업 → 토요일 보강
  ], { before: ['보 강 결 과 보 고 서'], compressed: true });
  const { ctx, page, errors } = await openApp(browser);
  const p = P(page);

  await page.selectOption('#selYear', '2027');
  await page.selectOption('#selTerm', '1');
  await page.selectOption('#selKind', 'mid');
  assert.ok(await page.isVisible('#createPanel'));
  assert.ok(!(await page.isVisible('.tabs')));
  assert.match(await page.innerText('#createPanel'), /2027학년도 1학기 중간고사 · 자료 넣기/);

  await page.setInputFiles('#wFiles', [
    { name: '2027-1_강의시간표.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: xlsx },
    { name: '수업일현황.pdf', mimeType: 'application/pdf', buffer: pdf },
    { name: '보강결과보고서.hwp', mimeType: 'application/octet-stream', buffer: hwp },
  ]);
  await page.waitForSelector('#createPanel >> text=보강 2건');
  const panel = await page.innerText('#createPanel');
  assert.match(panel, /강의시간표\s*2027-1_강의시간표\.xlsx/);
  assert.match(panel, /요일별 수업일 현황\s*수업일현황\.pdf/);
  assert.match(panel, /보강\s*보강결과보고서\.hwp/);
  assert.match(panel, /6\/15\(화\) → 월요일 15주차 수업일/);
  await page.uncheck('input[data-group="4A"]');                       // 전공심화(야간) 반 빼기
  assert.match(await page.innerText('#createPanel'), /수업 50개 · 8개 반/);
  assert.ok(await page.isChecked('#wAlso'));                           // 같은 자료로 기말도
  await page.click('#wCreate');

  const st = await p.state(() => ({ ids: Object.keys(window.__planner.store.plans).sort(), cur: window.__planner.state.id, week: window.__planner.state.examWeek, n: window.__planner.state.classes.length, mk: window.__planner.state.makeups.length }));
  assert.deepEqual(st.ids, ['2026-2-final', '2027-1-final', '2027-1-mid']);
  assert.equal(st.cur, '2027-1-mid'); assert.equal(st.week, 8); assert.equal(st.n, 50); assert.equal(st.mk, 2);
  assert.equal((await p.counts()).bad, 0);
  // 8주차 수요일 4/21 칸: 1A 데이터베이스기초 보강(4주차분), 8주차 시험(보강) 은 4/24 토요일
  assert.match(await page.innerText('.wcell[data-date="2027-04-21"]'), /보강 · 4주차분\s*1A\s*9~10교시\s*데이터베이스기초/);
  assert.equal((await examOf(page, '화-1B-6')).date, '2027-04-24');
  assert.match(await page.innerText('.wcell[data-date="2027-04-24"] .wcard.exam[data-id="화-1B-6"]'), /8주차\(보강\)/);

  // 기말로 바꾸면 월요일 과목의 기본 시험일은 6/15(화)
  await page.selectOption('#selKind', 'final');
  const d = await p.state(() => { const S = window.__planner.state; const c = S.classes.find(c => c.day === '월'); return S.exams[c.id].date; });
  assert.equal(d, '2027-06-15');
  assert.match(await page.innerText('.wcell[data-date="2027-06-15"] .wdate'), /월요일 15주차 수업일/);

  // 지난 학기(2026-2 기말) 보관 → 열어도 드래그·수정 안 됨
  await page.click('[data-tab="history"]');
  await page.click('.plancard[data-plan="2026-2-final"] [data-act="lock"]');
  await page.click('.plancard[data-plan="2026-2-final"] [data-act="open"]');
  assert.deepEqual([await page.inputValue('#selYear'), await page.inputValue('#selKind')], ['2026', 'final']);
  assert.ok(await page.isVisible('#lockBanner'));
  assert.ok(await page.isDisabled('#btnRegister'));
  assert.ok(await page.isDisabled('#btnKeepAll'));
  await dragTo(page, page.locator('.wcell[data-date="2026-12-16"] .wcard.exam[data-id="수-3A-6"]'), page.locator('.wcell[data-date="2026-12-22"]'));
  assert.equal((await examOf(page, '수-3A-6')).date, '2026-12-16');
  await page.click('[data-tab="courses"]');
  assert.ok(await page.locator('#listTable select[data-f="method"]').first().isDisabled());

  // 새로고침해도 세 시험·보관 상태·보던 시험이 그대로
  await page.reload();
  const after = await p.state(() => ({ ids: Object.keys(window.__planner.store.plans).sort(), cur: window.__planner.state.id, locked: window.__planner.state.locked }));
  assert.deepEqual(after, { ids: ['2026-2-final', '2027-1-final', '2027-1-mid'], cur: '2026-2-final', locked: true });

  // 전체 백업 → 빈 브라우저에서 복원
  await page.click('[data-tab="history"]');
  const bk = await download(page, () => page.click('[data-act="backupAll"]'));
  assert.match(bk.name, /^시험시간표_전체백업_.*\.json$/);
  const fresh = await openApp(browser);
  await fresh.page.click('[data-tab="history"]');
  await fresh.page.setInputFiles('#hRestore', { name: 'backup.json', mimeType: 'application/json', buffer: bk.buf });
  await fresh.page.click('[data-act="restoreYes"]');
  assert.deepEqual(await fresh.page.evaluate(() => Object.keys(window.__planner.store.plans).sort()), ['2026-2-final', '2027-1-final', '2027-1-mid']);
  assert.deepEqual(fresh.errors, []);
  await fresh.ctx.close();
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('설정 탭에서 보강 파일 넣기 → 시험 주차 수업이 보강된 과목은 기본 시험일이 따라감', async () => {
  const { ctx, page, errors } = await openApp(browser);
  const hwp = makeHwp([MAKEUP_HEAD, ['35382-102', 'JAVA프로그래밍응용', '2', '2026/12/08', '화', '2~4', '2026/12/22', '화', '2~4', '양숙희', '(인)', 'N']]);
  await page.click('[data-tab="setup"]');
  await page.setInputFiles('#sFiles', { name: '보강.hwp', mimeType: 'application/octet-stream', buffer: hwp });
  await page.waitForSelector('[data-apply="0"]');
  await page.click('[data-apply="0"]');
  assert.match(await page.innerText('#setupGrid'), /보강 1건/);
  assert.equal((await examOf(page, '화-2B-2')).date, '2026-12-22');
  // 보강 지우면 원래 15주차 날짜로 돌아감
  await page.click('[data-delmk]');
  assert.equal((await examOf(page, '화-2B-2')).date, '2026-12-08');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('기간 고르기 달력: 끌기 · 두 번 누르기 · 주차 칸 · 날짜 골라 담기 · 빠른 버튼', async () => {
  const { ctx, page, errors } = await openApp(browser);
  const range = () => page.evaluate(() => window.__planner.state.range || null);
  const day = d => page.locator(`#rangePop .rday[data-d="${d}"]`);
  await page.click('#rangeBtn');
  assert.ok(await page.isVisible('#rangePop'));
  assert.match(await page.innerText('#rangePop'), /2026년 12월[\s\S]*2027년 1월/);
  // 날짜 칸 표시: 12/15는 금요일 14주차 수업일(대체), 12/8은 시험 주차
  assert.match(await day('2026-12-15').getAttribute('class'), /\bsh\b/);
  assert.equal(await day('2026-12-15').innerText(), '15\n금14');
  assert.match(await day('2026-12-08').getAttribute('class'), /\bex\b/);

  // 1) 끌어서 기간: 12/14 → 12/19
  await dragTo(page, day('2026-12-14'), day('2026-12-19'));
  assert.deepEqual(await range(), { from: '2026-12-14', to: '2026-12-19' });
  assert.equal(await page.locator('.wh').count(), 1);
  assert.equal(await page.textContent('#rangeBtn'), '12/14(월) ~ 12/19(토) · 1주');

  // 2) 두 번 누르기: 12/7 누르고 12/22 누르기
  await day('2026-12-07').click();
  assert.match(await page.innerText('#rangePop'), /12\/7\(월\)부터 — 끝 날짜를 누르세요/);
  await day('2026-12-22').click();
  assert.deepEqual(await range(), { from: '2026-12-07', to: '2026-12-22' });
  assert.equal(await page.locator('.wh').count(), 3);

  // 3) 주차 칸: 12/21이 있는 줄 → 그 주 월~토
  await page.click('#rangePop .rwk[data-wk="2026-12-21"]');
  assert.deepEqual(await range(), { from: '2026-12-21', to: '2026-12-26' });

  // 4) 날짜 골라 담기: 15주차 날짜 3개만
  await page.click('#rangePop [data-mode="days"]');
  for (const d of ['2026-12-08', '2026-12-16', '2026-12-21']) await day(d).click();
  const r = await range();
  assert.deepEqual(r.days, ['2026-12-08', '2026-12-16', '2026-12-21']);
  assert.match(await page.textContent('#rangeBtn'), /^특정일 3일/);
  assert.equal(await page.locator('.wh').count(), 3);
  assert.match(await page.locator('.wcell[data-date="2026-12-15"]').getAttribute('class'), /\bout\b/);
  assert.doesNotMatch(await page.locator('.wcell[data-date="2026-12-16"]').getAttribute('class'), /\bout\b/);
  // 다시 누르면 빠짐, 끌면 여러 날 한꺼번에 담기
  await day('2026-12-16').click();
  assert.deepEqual((await range()).days, ['2026-12-08', '2026-12-21']);
  await dragTo(page, day('2026-12-14'), day('2026-12-17'));
  assert.deepEqual((await range()).days, ['2026-12-08', '2026-12-14', '2026-12-15', '2026-12-16', '2026-12-17', '2026-12-21']);

  // 5) 빠른 버튼: 시험 주차에 맞추기 → 앞뒤 1주 넓히기
  await page.click('#rangePop [data-preset="exam"]');
  assert.equal(await range(), null);
  assert.equal(await page.textContent('#rangeBtn'), '12/7(월) ~ 12/26(토) · 3주');
  await page.click('#rangePop [data-preset="widen"]');
  assert.deepEqual(await range(), { from: '2026-11-30', to: '2027-01-02' });
  assert.equal(await page.locator('.wh').count(), 5);
  // 다음 달로 넘기기, 닫기(Esc)
  await page.click('#rangePop [data-nav="1"]');
  assert.match(await page.innerText('#rangePop'), /2027년 1월[\s\S]*2027년 2월/);
  await page.keyboard.press('Escape');
  assert.ok(!(await page.isVisible('#rangePop')));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('예전 버전(v1) 브라우저 저장 내용을 그대로 이어받는다', async () => {
  const c = SEED.classes[0];
  const v1 = { v: 1, ...SEED, exams: { [c.id]: { method: '실기', date: '2026-12-18', start: 6, len: 2, room: '412', note: '노트북 지참', done: true } }, extraDates: [], rev: 5, updatedAt: 1 };
  const { ctx, page, errors } = await openApp(browser, { init: `localStorage.setItem('exam-planner:v1', ${JSON.stringify(JSON.stringify(v1))})` });
  const ex = await page.evaluate(id => ({ id: window.__planner.state.id, ex: window.__planner.state.exams[id] }), c.id);
  assert.equal(ex.id, '2026-2-final');
  assert.equal(ex.ex.note, '노트북 지참'); assert.equal(ex.ex.method, '실기');
  assert.deepEqual(errors, []);
  await ctx.close();
});
