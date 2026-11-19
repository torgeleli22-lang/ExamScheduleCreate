// 브라우저 종단 테스트 (headless Chromium). 실행: npm run test:e2e   (먼저 npm run build)
// Chromium 경로를 지정하려면 CHROME=/path/to/chrome
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { SEED, launch, openApp, makeTimetableXlsx, makeCalendarPdf, makeHwp, MAKEUP_HEAD, makeMakeupXls, dropFiles, download, readXlsx } from './helpers.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });

const P = page => ({
  counts: () => page.evaluate(() => window.__planner.counts()),
  state: fn => page.evaluate(fn),
});
async function dragTo(page, from, to) {
  await from.scrollIntoViewIfNeeded();
  const bb = await from.boundingBox(), cb = await to.boundingBox();
  await page.mouse.move(bb.x + 8, bb.y + bb.height / 2); await page.mouse.down();
  await page.mouse.move(cb.x + cb.width / 2, cb.y + Math.min(cb.height / 2, 40), { steps: 14 }); await page.mouse.up();
}
/** 날짜별 시간표(주마다 한 줄)에서 블록을 다른 날짜·교시로. 두 날짜가 화면에 보이도록 줄을 넘겨 둔다 */
async function dragBlock(page, fromDay, course, toDay, group, period) {
  await page.evaluate(([a, b]) => {
    for (const d of [a, b]) { const el = document.querySelector(`#board .day[data-day="${d}"]`); const row = el.closest('.weekdays'); row.scrollLeft = Math.max(0, el.offsetLeft - row.offsetLeft - 20); }
  }, [fromDay, toDay]);
  await dragTo(page, page.locator(`#board .day[data-day="${fromDay}"] .blk.exam`, { hasText: course }), page.locator(`#board .day[data-day="${toDay}"] .cell[data-group="${group}"][data-p="${period}"]`));
}
const dayHead = (page, d) => page.innerText(`#board .day[data-day="${d}"] .dayhead`);
const examOf = (page, id) => page.evaluate(id => window.__planner.state.exams[id], id);

/** 2027학년도 1학기 달력: 3/1(월) 시작 15주. 15주차 월요일 수업은 6/15(화)에 한다(대체 수업일 함정). */
function springCalendar() {
  const weeks = [];
  for (let w = 0; w < 15; w++) weeks.push([0, 1, 2, 3, 4, 5].map(d => { const t = new Date(Date.UTC(2027, 2, 1 + w * 7 + d)); return `${t.getUTCMonth() + 1}/${t.getUTCDate()}`; }));
  weeks[14][0] = '6/15(화)';
  return { cols: ['월', '화', '수', '목', '금', '토'], weeks };
}

test('날짜별 시간표(주마다 한 줄) · 등록 폼 · 드래그 · 기존 시간표 확정 · 엑셀 (2026-2 기말)', async () => {
  const { ctx, page, errors } = await openApp(browser);
  const p = P(page);
  let k = await p.counts();
  assert.equal(k.all, 50); assert.equal(k.bad, 0);
  assert.deepEqual([await page.inputValue('#selYear'), await page.inputValue('#selTerm'), await page.inputValue('#selKind')], ['2026', '2', 'final']);

  // 처음엔 15주차 날짜가 들어가는 세 주(12/7~12/26)의 월~토: 주마다 한 줄(6일씩), 12/15(화)는 금요일 14주차 수업일
  assert.match(await page.textContent('#rangeBtn'), /날짜 선택/);
  assert.equal(await page.textContent('#rangeText'), '12/7(월)~12/12(토), 12/14(월)~12/19(토), 12/21(월)~12/26(토) · 18일');
  assert.equal(await page.locator('#board .weekrow').count(), 3);
  assert.equal(await page.locator('#board .weekrow >> nth=0 >> .day').count(), 6);
  assert.match(await dayHead(page, '2026-12-15'), /금요일 시간표 · 14주차/);
  assert.match(await dayHead(page, '2026-12-08'), /15주차/);
  assert.equal(await page.locator('#board .day[data-day="2026-12-15"] .blk.exam').count(), 0);

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
  assert.match(await page.innerText(`#board .day[data-day="2026-12-22"] .blk.exam[data-id="${app2c}"]`), /15주차 · 12\/8\(화\)에서 옮김/);

  // 다른 줄(주)의 날짜로 드래그: 12/16(수) 3A 애플리케이션프레임워크 → 12/22(화) 3A 6교시
  const app3a = '수-3A-6';
  await dragBlock(page, '2026-12-16', '애플리케이션프레임워크', '2026-12-22', '3A', 6);
  const after1 = await examOf(page, app3a);
  assert.equal(after1.date, '2026-12-22'); assert.equal(after1.start, 6);

  // 같은 줄 옆 날짜로: 12/16 2B 웹자바 → 12/17 2B 7교시 = 이성욱 교수 2A 웹자바 시험(6~8교시)과 걸치기만 함 → 겹침
  await dragBlock(page, '2026-12-16', '웹자바프로그래밍입문', '2026-12-17', '2B', 7);
  k = await p.counts();
  assert.equal(k.bad, 2);
  // 같은 6교시로 맞추면 같은 과목 합반 시험 → 겹침 아님, 두 블록에 '합반'
  await dragTo(page, page.locator('#board .day[data-day="2026-12-17"] .blk.exam[data-id="수-2B-2"]'), page.locator('#board .day[data-day="2026-12-17"] .cell[data-group="2B"][data-p="6"]'));
  assert.equal((await examOf(page, '수-2B-2')).start, 6);
  k = await p.counts();
  assert.equal(k.bad, 0);
  for (const id of ['수-2B-2', '목-2A-6']) assert.equal(await page.innerText(`#board .day[data-day="2026-12-17"] .blk.exam[data-id="${id}"] .badge`), '합반');
  await page.click('#board .day[data-day="2026-12-17"] .blk.exam[data-id="수-2B-2"]');
  assert.match(await page.innerText('#dChecks'), /합반 시험: 2A\(이성욱, 212호\)와 같은 시간 · 교수·강의실 겹침으로 보지 않아요/);
  await page.click('#dClose');

  // 줄의 오른쪽 가장자리로 끌면 옆으로 넘어가서 화면 밖 날짜에 놓을 수 있음 (12/8 → 같은 주 뒤쪽 날짜)
  const row = page.locator('#board .weekrow[data-week="2026-12-07"] .weekdays');
  await page.evaluate(() => { document.querySelector('#board .weekrow[data-week="2026-12-07"] .weekdays').scrollLeft = 0; });
  const pbl = page.locator('#board .day[data-day="2026-12-08"] .blk.exam[data-id="화-2A-1"]');
  await pbl.scrollIntoViewIfNeeded();
  const pb = await pbl.boundingBox(), sb = await row.boundingBox();
  await page.mouse.move(pb.x + 6, pb.y + pb.height / 2); await page.mouse.down();
  await page.mouse.move(sb.x + sb.width - 15, pb.y + pb.height / 2, { steps: 10 });
  await page.waitForTimeout(1500);
  await page.mouse.move(sb.x + sb.width - 160, pb.y + pb.height / 2, { steps: 4 }); await page.mouse.up();
  assert.ok(await page.evaluate(() => document.querySelector('#board .weekrow[data-week="2026-12-07"] .weekdays').scrollLeft) > 100);
  assert.ok((await examOf(page, '화-2A-1')).date > '2026-12-10');
  await page.evaluate(() => window.__planner.openDrawer('화-2A-1')); await page.click('#dReset'); await page.click('#dClose');   // 원래대로

  // 옮기지 않은 과목 모두 '기존 시간표 수업 진행' 확정 (옮긴 3과목·겹침 과목은 빠짐)
  await page.click('#btnKeepAll');
  k = await p.counts();
  assert.equal(k.keep, 50 - 3);                // 옮긴 3과목만 빠짐 (합반은 겹침이 아니라 확정 대상)
  assert.ok(await page.locator('#board .day[data-day="2026-12-21"] .blk.exam .badge.b-ok', { hasText: '기존' }).count() > 0);
  // 블록을 눌러 서랍에서 확정 취소
  await page.locator('#board .day[data-day="2026-12-21"] .blk.exam >> nth=0').scrollIntoViewIfNeeded();
  await page.click('#board .day[data-day="2026-12-21"] .blk.exam >> nth=0');
  await page.click('#dKeep');
  assert.equal((await p.counts()).keep, 50 - 3 - 1);
  await page.click('#dClose');

  const x = await download(page, () => page.click('#btnExport'));
  assert.equal(x.name, '2026학년도_2학기_기말고사_시간표.xlsx');
  const wb = await readXlsx(x.buf);
  // 학과 중간고사 시간표 양식: 주마다 시트(①②③) + 과목별 목록 + 교수님별
  assert.deepEqual(wb.worksheets.map(w => w.name), ['1주차 (1207(월)-1211(금))', '2주차 (1214(월)-1218(금))', '3주차 (1221(월)-1225(금))', '과목별 목록', '교수님별']);
  const w1 = wb.worksheets[0];
  assert.equal(w1.getCell('B1').value, '기말고사 시험 진행 관련 3주치 시간표  12/7(월) ~ 12/25(금)');
  assert.equal(w1.getCell('B4').value, '① 12/7(월) ~ 12/11(금)');
  assert.equal(w1.getCell('A5').value, '학년·반');
  // 시험 있는 화 12/8은 1~10교시로 펼침, 시험 없는 월 12/7은 한 칸 '기존 수업 진행'
  assert.equal(w1.getCell('B5').value, '월 12/7'); assert.equal(w1.getCell('B8').value, '기존 수업\n진행');
  assert.equal(w1.getCell('C5').value, '화 12/8'); assert.equal(w1.getCell('C6').value, '1교시'); assert.equal(w1.getCell('L6').value, '10교시');
  assert.equal(w1.getCell('A8').value, '1학년 A반');
  // 위에서 '기존 시간표 수업 진행'으로 확정한 시험은 회색 + '기존 수업시간 진행' (중간고사 시간표처럼)
  assert.equal(w1.getCell('D8').value, '데이터베이스기초\n(정재헌) 212호\n기존 수업시간 진행');
  assert.equal(w1.getCell('D8').fill.fgColor.argb, 'FFA6A6A6');
  // 옮긴 시험(2C 앱프로그래밍기초 → 12/22)은 학년 색(2학년 연두) + 시간
  const w3cells = []; wb.worksheets[2].eachRow(r => r.eachCell(c => w3cells.push(c)));
  const moved = w3cells.find(c => String(c.value).startsWith('앱프로그래밍기초\n(정세일)'));
  assert.ok(moved && /\d\d시/.test(String(moved.value)), String(moved && moved.value));
  assert.equal(moved.fill.fgColor.argb, 'FFC3D69B');
  // 2주차: 12/15(화)는 금요일 수업일이라 머리글에 표시, 시험 없는 날의 정상 수업은 회색으로
  const w2 = wb.worksheets[1];
  const heads = []; w2.getRow(5).eachCell(c => heads.push(String(c.value)));
  assert.ok(heads.includes('화 12/15 (금요일 수업)'), heads.join(','));
  const list = wb.getWorksheet('과목별 목록');
  assert.equal(list.rowCount, 51);
  const methods = []; list.eachRow((r, i) => { if (i > 1) methods.push(String(r.getCell(10).value)); });
  assert.equal(methods.filter(m => m.startsWith('기존 시간표 수업 진행')).length, 46);
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
  // 1A 데이터베이스기초: 8주차(4/20 화)보다 뒤인 4/21(수)에 보강 → 8주가 밀려 시험도 4/21 9~10교시
  assert.equal((await examOf(page, '화-1A-2')).date, '2027-04-21');
  assert.match(await page.innerText('#mkNotice'), /1A\s*데이터베이스기초.*8주차 4\/20\(화\) 2~4교시 → 4\/21\(수\) 9~10교시.*밀림/);
  assert.ok(await page.locator('#board .day[data-day="2027-04-20"] .blk.fixed', { hasText: '데이터베이스기초' }).count() >= 1);   // 원래 4/20은 평소 수업
  assert.equal((await examOf(page, '화-1B-6')).date, '2027-04-24');
  assert.match(await page.innerText('#board .day[data-day="2027-04-24"] .blk.exam[data-id="화-1B-6"]'), /8주차\(보강\)/);

  // 기말로 바꾸면 월요일 과목의 기본 시험일은 6/15(화)
  await page.selectOption('#selKind', 'final');
  const d = await p.state(() => { const S = window.__planner.state; const c = S.classes.find(c => c.day === '월'); return S.exams[c.id].date; });
  assert.equal(d, '2027-06-15');
  assert.match(await dayHead(page, '2027-06-15'), /월요일 시간표 · 15주차/);

  // 지난 학기(2026-2 기말) 보관 → 열어도 드래그·수정 안 됨
  await page.click('[data-tab="history"]');
  await page.click('.plancard[data-plan="2026-2-final"] [data-act="lock"]');
  await page.click('.plancard[data-plan="2026-2-final"] [data-act="open"]');
  assert.deepEqual([await page.inputValue('#selYear'), await page.inputValue('#selKind')], ['2026', 'final']);
  assert.ok(await page.isVisible('#lockBanner'));
  assert.ok(await page.isDisabled('#btnRegister'));
  assert.ok(await page.isDisabled('#btnKeepAll'));
  await dragBlock(page, '2026-12-16', '애플리케이션프레임워크', '2026-12-22', '3A', 6);
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

test('날짜 선택 달력: 8·15주차 표시 · 연속(끌기)·하나씩·Shift · 주마다 한 줄 · 취소 · 시험 주차 날짜 모두', async () => {
  const { ctx, page, errors } = await openApp(browser, { viewport: { width: 1600, height: 2400 } });
  const days = async () => (await page.evaluate(() => window.__planner.state.range?.days || null));
  const day = d => page.locator(`#rangePop .cday[data-d="${d}"]`);
  await page.click('#rangeBtn');
  assert.ok(await page.isVisible('#rangePop'));
  assert.equal(await page.locator('#rangePop .cday.pick').count(), 0);          // 처음엔 아무것도 안 고름
  assert.ok(await page.isDisabled('#rangePop [data-apply]'));
  // 8·15주차: 다른 색 + 몇 주차인지
  assert.equal(await page.inputValue('#calMonth'), '12');
  assert.equal(await day('2026-12-08').locator('.wkl').innerText(), '15주차');
  assert.match(await day('2026-12-08').getAttribute('class'), /\bw15\b/);
  assert.equal(await day('2026-12-15').locator('.wkl').count(), 0);           // 12/15는 금요일 14주차
  await page.selectOption('#calMonth', '11');
  assert.equal(await day('2026-11-02').locator('.wkl').innerText(), '8주차');
  assert.match(await day('2026-11-02').getAttribute('class'), /\bw8\b/);
  await page.click('#rangePop [data-nav="-1"]');
  assert.equal(await day('2026-10-20').locator('.wkl').innerText(), '8주차');  // 화요일 8주차는 10/20
  await page.click('#rangePop [data-nav="1"]');

  // 연속(끌기) 11/18 → 11/23 (11/22 일요일은 빠짐) + 하나씩 11/2
  await dragTo(page, day('2026-11-18'), day('2026-11-23'));
  await day('2026-11-02').click();
  assert.match(await page.innerText('#rangePop .calsel'), /11\/2\(월\), 11\/18\(수\)~11\/21\(토\), 11\/23\(월\) · 6일/);
  assert.equal(await days(), null);                                         // '선택'을 눌러야 저장
  await page.click('#rangePop [data-apply]');
  assert.ok(!(await page.isVisible('#rangePop')));
  assert.deepEqual(await days(), ['2026-11-02', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-23']);
  // 주마다 한 줄: [11/2] / [11/18 11/19 11/20 11/21] / [11/23]
  const rows = await page.$$eval('#board .weekrow', rs => rs.map(r => [...r.querySelectorAll('.day')].map(d => d.dataset.day)));
  assert.deepEqual(rows, [['2026-11-02'], ['2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21'], ['2026-11-23']]);
  // 한 줄 안의 날짜는 가로로 나란히 (같은 높이)
  const tops = await page.$$eval('#board .weekrow:nth-child(2) .day', ds => ds.map(d => Math.round(d.getBoundingClientRect().top)));
  assert.equal(new Set(tops).size, 1);

  // 다시 열면 고른 날짜가 그대로: 하나 빼기, Shift로 이어서 넣기, 끌어서 빼기
  await page.click('#rangeBtn');
  assert.equal(await page.locator('#rangePop .cday.pick').count(), 6);
  await day('2026-11-19').click();                                          // 빼기
  await day('2026-11-24').click();
  await day('2026-11-27').click({ modifiers: ['Shift'] });                  // 11/24~11/27 이어서
  await dragTo(page, day('2026-11-25'), day('2026-11-26'));                 // 골라진 날에서 시작 → 빼기
  await page.click('#rangePop [data-apply]');
  assert.deepEqual(await days(), ['2026-11-02', '2026-11-18', '2026-11-20', '2026-11-21', '2026-11-23', '2026-11-24', '2026-11-27']);

  // 취소·바깥 누르기는 그대로
  await page.click('#rangeBtn'); await page.click('#rangePop [data-clear]');
  assert.ok(await page.isDisabled('#rangePop [data-apply]'));
  await page.click('#rangePop [data-cancel]');
  assert.equal((await days()).length, 7);

  // 시험 주차 날짜 모두 → 15주차 6일, 주마다 한 줄 (12/8 | 12/16~18 | 12/21~22)
  await page.click('#rangeBtn'); await page.click('#rangePop [data-clear]'); await page.click('#rangePop [data-examdays]');
  await page.click('#rangePop [data-apply]');
  assert.deepEqual(await days(), ['2026-12-08', '2026-12-16', '2026-12-17', '2026-12-18', '2026-12-21', '2026-12-22']);
  assert.deepEqual(await page.$$eval('#board .weekrow', rs => rs.map(r => r.querySelectorAll('.day').length)), [1, 3, 2]);
  await page.click('#rangeBtn'); await page.mouse.click(5, 5);
  assert.ok(!(await page.isVisible('#rangePop')));
  // 시험 주차에 맞추기 → 처음 상태(세 주 18일)
  await page.click('#rangeReset');
  assert.equal(await page.locator('#board .day').count(), 18);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('보강 신청 목록(.xls) 넣기 → 분반으로 반 찾기, 15주차보다 뒤 보강이면 시험이 밀림', async () => {
  const { ctx, page, errors } = await openApp(browser);
  const xls = makeMakeupXls([
    ['컴퓨터소프트웨어과', '35382', 'JAVA프로그래밍응용', '101', '2', '2026/09/22(화) 6~8', '2026/12/15(화) 6~8', '양숙희', '기타'],
    ['컴퓨터소프트웨어과', '35579', '커리어디자인(취창업성공전략)', '103', '2', '2026/11/26(목) 3~4', '2026/12/10(목) 1~2', '이성욱', 'HIGH-5 합반 및 특강'],
  ]);
  await page.click('[data-tab="setup"]');
  await page.setInputFiles('#sFiles', { name: '보강신청목록.xls', mimeType: 'application/vnd.ms-excel', buffer: xls });
  await page.waitForSelector('[data-apply="0"]');
  assert.match(await page.innerText('#setupGrid .filelist'), /보강\s*보강신청목록\.xls/);
  await page.click('[data-apply="0"]');
  assert.match(await page.innerText('#setupGrid'), /보강 2건/);
  // 2A JAVA: 15주차 12/8(화) → 12/15(화) 보강이 뒤에 있으므로 시험이 12/15로 밀림
  assert.equal((await examOf(page, '화-2A-6')).date, '2026-12-15');
  await page.click('[data-tab="board"]');
  assert.match(await page.innerText('#mkNotice'), /2A\s*JAVA프로그래밍응용.*15주차 12\/8\(화\) 6~8교시 → 12\/15\(화\) 6~8교시.*밀림/);
  // 2C 커리어디자인: 12/10 보강(14주차) → 시험은 그대로 12/17, 12/10 시간표에 보강 블록
  assert.equal((await examOf(page, '목-2C-3')).date, '2026-12-17');
  await page.click('#rangeBtn'); await page.click('#rangePop [data-clear]');
  await page.click('#rangePop .cday[data-d="2026-12-10"]'); await page.click('#rangePop [data-apply]');
  assert.ok(await page.locator('#board .day[data-day="2026-12-10"] .blk.fixed', { hasText: '보강(12주차분)' }).count() === 1);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('파일 끌어다 놓기: 화면 어디서나 → 보강은 설정 탭, 백업은 기록 탭, 없는 시험이면 자료 넣기 화면', async () => {
  const { ctx, page, errors } = await openApp(browser);
  const xls = makeMakeupXls([['컴퓨터소프트웨어과', '35382', 'JAVA프로그래밍응용', '102', '2', '2026/12/08(화) 2~4', '2026/12/22(화) 2~4', '양숙희', '기타']]);
  // 날짜별 배치 화면에서 보강 .xls를 놓으면 → 설정 탭 '자료 다시 넣기'로, 안내 화면이 떴다가 사라짐
  const shown = await dropFiles(page, [{ name: '보강신청목록.xls', mimeType: 'application/vnd.ms-excel', buffer: xls }]);
  assert.ok(shown, '끄는 동안 안내 화면');
  await page.waitForSelector('[data-apply="0"]');
  assert.ok(!(await page.isVisible('#dropOverlay')));
  assert.equal(await page.getAttribute('[data-tab="setup"]', 'aria-selected'), 'true');
  assert.match(await page.innerText('#setupGrid .filelist'), /보강\s*보강신청목록\.xls/);
  await page.click('[data-apply="0"]');
  assert.equal((await examOf(page, '화-2B-2')).date, '2026-12-22');

  // 설정 탭의 상자에 직접 놓아도 됨 (여러 개 한꺼번에: 수업일 현황 글자 파일 + 모르는 파일)
  const cal = (await page.evaluate(() => window.__planner.state.calendar));
  const calTxt = '주\t월\t화\t수\t목\t금\t토\n' + cal.weeks.map((w, i) => `${i + 1}\t${w.join('\t')}`).join('\n');
  await dropFiles(page, [{ name: '수업일현황.txt', mimeType: 'text/plain', buffer: Buffer.from(calTxt) }, { name: '메모.txt', mimeType: 'text/plain', buffer: Buffer.from('아무 내용') }], '#sDrop');
  await page.waitForSelector('#setupGrid .filelist >> text=메모.txt');
  const list = await page.innerText('#setupGrid .filelist');
  assert.match(list, /요일별 수업일 현황\s*수업일현황\.txt/); assert.match(list, /알 수 없음\s*메모\.txt/);

  // 백업(.json)을 놓으면 → 학기별 기록의 백업 불러오기
  const backup = await page.evaluate(() => JSON.stringify({ v: 2, plans: window.__planner.store.plans, currentId: window.__planner.state.id }));
  await dropFiles(page, [{ name: '백업.json', mimeType: 'application/json', buffer: Buffer.from(backup) }]);
  await page.waitForSelector('[data-act="restoreNo"]');
  assert.equal(await page.getAttribute('[data-tab="history"]', 'aria-selected'), 'true');
  await page.click('[data-act="restoreNo"]');

  // 아직 없는 시험(2026-2 중간)을 고른 상태에서 놓으면 → 자료 넣기 화면의 파일 목록으로
  await page.selectOption('#selKind', 'mid');
  assert.ok(await page.isVisible('#createPanel'));
  const hwp = makeHwp([MAKEUP_HEAD, ['32305-101', '데이터베이스기초', '1', '2026/09/22', '화', '2~4', '2026/10/21', '수', '9~10', '정재헌', '(인)', 'N']], { before: ['보 강 결 과 보 고 서'] });
  await dropFiles(page, [{ name: '보강결과보고서.hwp', mimeType: 'application/octet-stream', buffer: hwp }]);
  await page.waitForSelector('#createPanel .filelist >> text=보강결과보고서.hwp');
  assert.match(await page.innerText('#createPanel'), /보강 1건/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('시험 상세에서 시작·종료 시간 직접 정하기 → 판·목록·엑셀에 그 시간, 교시로 맞추기', async () => {
  const { ctx, page, errors } = await openApp(browser);
  // 2A JAVA프로그래밍응용: 15주차 12/8(화) 6~8교시(13:35~16:15)
  const blk = page.locator('#board .day[data-day="2026-12-08"] .blk.exam[data-id="화-2A-6"]');
  await blk.scrollIntoViewIfNeeded(); await blk.click();
  assert.equal(await page.inputValue('#dFrom'), '13:35');
  assert.equal(await page.inputValue('#dTo'), '16:15');
  await page.fill('#dFrom', '13:40');
  await page.fill('#dTo', '15:10');
  const ex = await examOf(page, '화-2A-6');
  assert.deepEqual({ start: ex.start, len: ex.len, time: ex.time }, { start: 6, len: 2, time: { from: '13:40', to: '15:10' } });
  assert.match(await page.innerText('#drawer'), /90분 · 직접 정한 시간 · 겹침은 6~7교시 기준으로 검사해요/);
  assert.match(await page.innerText('#dChecks'), /12\/8\(화\) 13:40~15:10 \(6~7교시\)/);
  assert.match(await page.innerText('#board .day[data-day="2026-12-08"] .blk.exam[data-id="화-2A-6"]'), /13:40~15:10 · 15주차 · 시간 변경/);
  // 거꾸로 넣으면 거부
  await page.fill('#dTo', '13:00');
  assert.deepEqual((await examOf(page, '화-2A-6')).time, { from: '13:40', to: '15:10' });
  // 엑셀 과목별 목록·공지에 그 시간
  await page.click('#dClose');
  const x = await download(page, () => page.click('#btnExport'));
  const wb = await readXlsx(x.buf);
  const rows = []; wb.getWorksheet('과목별 목록').eachRow((r, i) => { if (i > 1) rows.push([String(r.getCell(7).value), String(r.getCell(5).value) + r.getCell(6).value, String(r.getCell(4).value)]); });
  assert.deepEqual(rows.find(r => r[0] === 'JAVA프로그래밍응용' && r[1] === '2A'), ['JAVA프로그래밍응용', '2A', '13:40~15:10']);
  const notice = []; wb.worksheets[0].eachRow(r => r.eachCell(cell => notice.push(String(cell.value))));
  assert.ok(notice.includes('JAVA프로그래밍응용\n(양숙희) 413호\n13시 40분 ~ 15시 10분'), notice.filter(t => t.startsWith('JAVA')).join(' | '));
  // 교시로 맞추기: 6교시 ~ 8교시 → 직접 정한 시간 없어지고 원래대로
  await blk.click();
  await page.selectOption('#dPEnd', '8');
  const ex2 = await examOf(page, '화-2A-6');
  assert.equal(ex2.time, undefined); assert.equal(ex2.len, 3);
  assert.equal(await page.inputValue('#dTo'), '16:15');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('강의실 고르기: 가진 강의실 전부, 그 시간에 비어 있음/사용 중, 직접 입력, 목록·등록 폼', async () => {
  const { ctx, page, errors } = await openApp(browser);
  const rooms = [...new Set(SEED.classes.map(c => c.room))];
  const opts = sel => page.$$eval(`${sel} option`, os => os.map(o => o.value).filter(v => v && v !== '__custom'));
  // 2A JAVA (12/8 화 6~8교시, 413호) 서랍
  await page.evaluate(() => window.__planner.openDrawer('화-2A-6'));
  assert.deepEqual((await opts('#dRoom')).sort(), rooms.slice().sort());            // 강의실 전부
  assert.equal(await page.inputValue('#dRoom'), '413');
  const groups = await page.$$eval('#dRoom optgroup', gs => gs.map(g => g.label));
  assert.match(groups[0], /^이 시간에 비어 있는 강의실/); assert.match(groups[1], /^이 시간에 사용 중/);
  // 12/8 6~8교시에 412호는 2C 앱프로그래밍기초 시험이 씀
  assert.match(await page.$eval('#dRoom option[value="412"]', o => o.textContent), /412호 — 사용 중: 2C 앱프로그래밍기초/);
  assert.equal(await page.$eval('#dRoom option[value="412"]', o => o.parentElement.label.startsWith('이 시간에 사용 중')), true);
  // 고르기
  await page.selectOption('#dRoom', '401');
  assert.equal((await examOf(page, '화-2A-6')).room, '401');
  // 직접 입력 → 다음부터 목록에 나옴
  await page.selectOption('#dRoom', '__custom');
  assert.ok(await page.isVisible('#dRoomCustom'));
  await page.fill('#dRoomCustom', '515호'); await page.press('#dRoomCustom', 'Enter');
  assert.equal((await examOf(page, '화-2A-6')).room, '515');
  assert.equal(await page.inputValue('#dRoom'), '515');
  await page.click('#dClose');
  // 과목 목록의 강의실 상자에도 전부 + 새로 넣은 515
  await page.click('[data-tab="courses"]');
  const listOpts = await opts('#listTable tr[data-id="월-2A-2"] select[data-f="room"]');
  assert.deepEqual(listOpts.sort(), [...rooms, '515'].sort());
  await page.selectOption('#listTable tr[data-id="월-2A-2"] select[data-f="room"]', '111');
  assert.equal((await examOf(page, '월-2A-2')).room, '111');
  // 시험 일정 등록 폼: 날짜·교시를 바꾸면 '사용 중'도 그 시간 기준으로
  await page.click('#btnRegister');
  await page.selectOption('#rCourse', { label: '2C 앱프로그래밍기초 (정세일) · 화 6교시' });
  await page.selectOption('#rDate', '2026-12-08'); await page.selectOption('#rStart', '6');
  assert.match(await page.$eval('#rRoom option[value="401"]', o => o.textContent), /사용 중: 2B 프로젝트분석설계/);
  // 6교시엔 413호가 비어 있음(2A JAVA를 515호로 옮김) → 1교시로 바꾸면 2B JAVA(2~4교시, 413호)가 씀
  assert.doesNotMatch(await page.$eval('#rRoom option[value="413"]', o => o.textContent), /사용 중/);
  await page.selectOption('#rStart', '1');
  assert.match(await page.$eval('#rRoom option[value="413"]', o => o.textContent), /사용 중: 2B JAVA프로그래밍응용/);
  const free = await page.$eval('#rRoom optgroup', g => g.querySelector('option').value);   // 비어 있는 강의실 중 첫째
  await page.selectOption('#rRoom', free);
  await page.click('#rSave');
  assert.equal((await examOf(page, '화-2C-6')).room, free);
  assert.doesNotMatch(await page.innerText('#rChecks'), /강의실 겹침/);                // 비어 있는 강의실을 골랐으니 강의실 겹침은 없음
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
