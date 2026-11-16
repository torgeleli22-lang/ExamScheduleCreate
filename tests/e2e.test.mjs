// 브라우저 종단 테스트 (headless Chromium). 실행: npm run test:e2e   (먼저 npm run build)
// Chromium 경로를 지정하려면 CHROME=/path/to/chrome
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { SEED, launch, openApp, makeTimetableXlsx, makeCalendarPdf, download, readXlsx } from './helpers.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });

const P = page => ({
  counts: () => page.evaluate(() => window.__planner.counts()),
  state: fn => page.evaluate(fn),
});

async function dragBlock(page, fromDay, course, toDay, group, period) {
  const blk = page.locator(`.day[data-day="${fromDay}"] .blk.exam`, { hasText: course });
  const cell = page.locator(`.day[data-day="${toDay}"] .cell[data-group="${group}"][data-p="${period}"]`);
  const bb = await blk.boundingBox(), cb = await cell.boundingBox();
  await page.mouse.move(bb.x + 5, bb.y + bb.height / 2); await page.mouse.down();
  await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2, { steps: 12 }); await page.mouse.up();
}

/** 2027학년도 1학기 달력: 3/1(월) 시작 15주. 15주차 월요일 수업은 6/15(화)에 한다(대체 수업일 함정). */
function springCalendar() {
  const weeks = [];
  for (let w = 0; w < 15; w++) weeks.push([0, 1, 2, 3, 4, 5].map(d => { const t = new Date(Date.UTC(2027, 2, 1 + w * 7 + d)); return `${t.getUTCMonth() + 1}/${t.getUTCDate()}`; }));
  weeks[14][0] = '6/15(화)';
  return { cols: ['월', '화', '수', '목', '금', '토'], weeks };
}

test('기본 화면 · 등록 폼 · 드래그 · 엑셀 (2026-2 기말)', async () => {
  const { ctx, page, errors } = await openApp(browser);
  const p = P(page);
  let k = await p.counts();
  assert.equal(k.all, 50); assert.equal(k.bad, 0);
  assert.equal(await page.inputValue('#planSel'), '2026-2-final');

  // 등록 창: 화 2C 앱프로그래밍기초 → 12/15(금요일 14주차 수업일)는 겹침, 빈 시간(12/22) 눌러 등록
  await page.click('#btnRegister');
  await page.selectOption('#rCourse', { label: '2C 앱프로그래밍기초 (정세일) · 화 6교시' });
  await page.selectOption('#rDate', '2026-12-15'); await page.selectOption('#rStart', '2');
  assert.match(await page.innerText('#rChecks'), /겹침/);
  await page.click('[data-rslot^="2026-12-22|"]'); await page.click('#rSave');
  const ex = await p.state(() => { const S = window.__planner.state; const c = S.classes.find(c => c.day === '화' && c.course === '앱프로그래밍기초'); return S.exams[c.id]; });
  assert.equal(ex.date, '2026-12-22');
  await page.click('#dClose');

  // 드래그: 12/16 2B 웹자바 → 12/17 2B 6교시 (이성욱 교수 2A 시험과 겹침)
  await dragBlock(page, '2026-12-16', '웹자바프로그래밍입문', '2026-12-17', '2B', 6);
  k = await p.counts();
  assert.equal(k.bad, 2);

  const x = await download(page, () => page.click('#btnExport'));
  assert.equal(x.name, '2026학년도_2학기_기말고사_시간표.xlsx');
  const wb = await readXlsx(x.buf);
  assert.deepEqual(wb.worksheets.map(w => w.name), ['시험시간표(공지)', '과목별 목록', '교수님별']);
  assert.equal(wb.getWorksheet('과목별 목록').rowCount, 51);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('새 학기 파일 올리기 → 중간·기말 생성, 기록 보관(잠금), 새로고침 후 유지', async () => {
  const cal = springCalendar();
  const night = { day: '월', year: 4, ban: 'A', start: 9, end: 10, course: '캡스톤심화', prof: '야간교수', room: '501' };
  const xlsx = await makeTimetableXlsx(SEED.classes, { extra: [night] });
  const pdf = await makeCalendarPdf(browser, cal);
  const { ctx, page, errors } = await openApp(browser);
  const p = P(page);

  await page.click('#btnNewPlan');
  await page.fill('#wYear', '2027'); await page.locator('#wYear').dispatchEvent('change');
  await page.check('input[name="wTerm"][value="1"]');
  await page.check('input[data-kind="mid"]'); await page.check('input[data-kind="final"]');
  await page.check('input[name="wSrc"][value="upload"]');
  await page.setInputFiles('#wTt', { name: '2027-1_강의시간표.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: xlsx });
  await page.waitForSelector('#modal >> text=수업 51개');
  await page.uncheck('input[data-group="4A"]');                       // 전공심화(야간) 반 빼기
  await page.setInputFiles('#wCalPdf', { name: '수업일현황.pdf', mimeType: 'application/pdf', buffer: pdf });
  await page.waitForSelector('#modal >> text=15주 × 6요일');
  const modal = await page.innerText('#modal');
  assert.match(modal, /6\/15\(화\) → 월요일 15주차 수업일/);
  assert.match(modal, /수업 50개 · 8개 반/);
  await page.click('#wCreate');

  const st = await p.state(() => ({ ids: Object.keys(window.__planner.store.plans).sort(), cur: window.__planner.state.id, week: window.__planner.state.examWeek, title: window.__planner.state.title, n: window.__planner.state.classes.length }));
  assert.deepEqual(st.ids, ['2026-2-final', '2027-1-final', '2027-1-mid']);
  assert.equal(st.cur, '2027-1-mid'); assert.equal(st.week, 8); assert.equal(st.title, '2027학년도 1학기 중간고사'); assert.equal(st.n, 50);
  assert.equal((await p.counts()).bad, 0);
  assert.ok(await page.isVisible('.day[data-day="2027-04-19"]'));     // 8주차 월요일

  // 기말로 바꾸면 월요일 과목의 기본 시험일은 6/15(화)
  await page.selectOption('#planSel', '2027-1-final');
  const d = await p.state(() => { const S = window.__planner.state; const c = S.classes.find(c => c.day === '월'); return S.exams[c.id].date; });
  assert.equal(d, '2027-06-15');
  assert.match(await page.innerText('.day[data-day="2027-06-15"] .dayhead'), /화요일에 월요일 수업/);

  // 지난 학기(2026-2 기말) 보관 → 열어도 드래그·수정 안 됨
  await page.click('[data-tab="history"]');
  await page.click('.plancard[data-plan="2026-2-final"] [data-act="lock"]');
  await page.click('.plancard[data-plan="2026-2-final"] [data-act="open"]');
  assert.equal(await page.inputValue('#planSel'), '2026-2-final');
  assert.ok(await page.isVisible('#lockBanner'));
  assert.ok(await page.isDisabled('#btnRegister'));
  await dragBlock(page, '2026-12-16', '웹자바프로그래밍입문', '2026-12-17', '2B', 6);
  const wj = await p.state(() => { const S = window.__planner.state; const c = S.classes.find(c => c.course === '웹자바프로그래밍입문' && c.ban === 'B' && c.year === 2); return S.exams[c.id].date; });
  assert.equal(wj, '2026-12-16');
  await page.click('[data-tab="courses"]');
  assert.ok(await page.locator('#listTable select[data-f="method"]').first().isDisabled());

  // 새로고침해도 세 시험·보관 상태·보던 시험이 그대로
  await page.reload();
  const after = await p.state(() => ({ ids: Object.keys(window.__planner.store.plans).sort(), cur: window.__planner.state.id, locked: window.__planner.state.locked }));
  assert.deepEqual(after, { ids: ['2026-2-final', '2027-1-final', '2027-1-mid'], cur: '2026-2-final', locked: true });

  // 전체 백업 다운로드
  await page.click('[data-tab="history"]');
  const bk = await download(page, () => page.click('[data-act="backupAll"]'));
  assert.match(bk.name, /^시험시간표_전체백업_.*\.json$/);
  const backup = JSON.parse(bk.buf.toString('utf8'));
  assert.deepEqual(Object.keys(backup.plans).sort(), ['2026-2-final', '2027-1-final', '2027-1-mid']);

  // 백업을 새 브라우저(빈 저장소)에 불러오면 세 시험이 모두 돌아온다
  const fresh = await openApp(browser);
  await fresh.page.click('[data-tab="history"]');
  await fresh.page.setInputFiles('#hRestore', { name: 'backup.json', mimeType: 'application/json', buffer: bk.buf });
  await fresh.page.click('[data-act="restoreYes"]');
  const ids = await fresh.page.evaluate(() => Object.keys(window.__planner.store.plans).sort());
  assert.deepEqual(ids, ['2026-2-final', '2027-1-final', '2027-1-mid']);
  assert.deepEqual(fresh.errors, []);
  await fresh.ctx.close();
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
