// GitHub 저장 종단 테스트: 가짜 GitHub API 하나를 브라우저 여러 개(= 여러 컴퓨터)가 함께 쓴다.
// 실행: npm run test:e2e
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openApp, fakeGitHub } from './helpers.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });

async function waitFor(fn, what, ms = 15000) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error('시간 초과: ' + what);
    await new Promise(r => setTimeout(r, 150));
  }
}
async function connect(page, repo, token = '') {
  await page.click('[data-tab="history"]');
  await page.fill('#ghRepo', repo);
  if (token) await page.fill('#ghToken', token);
  await page.click('#ghConnect');
}
const pill = page => page.textContent('#saveState');
const firstId = page => page.evaluate(() => window.__planner.state.classes[0].id);

test('여러 컴퓨터에서 GitHub에 저장하고 불러오기 (자동 저장, 보기 전용, 동시 저장 합치기, 삭제)', async () => {
  const hub = fakeGitHub();

  // 컴퓨터 A: 토큰 연결 → data 브랜치가 생기고 지금 데이터가 올라간다
  const A = await openApp(browser, { github: hub });
  await connect(A.page, hub.repo, hub.token);
  await waitFor(async () => (await pill(A.page)) === 'GitHub에 저장됨', 'A 첫 저장');
  assert.ok(hub.refs.data, 'data 브랜치 생성');
  assert.deepEqual(Object.keys(hub.data().plans), ['2026-2-final']);
  assert.match(await A.page.textContent('#ghCard'), /공개\(public\)/);

  // A에서 고치면 몇 초 뒤 자동으로 커밋
  const id = await firstId(A.page);
  await A.page.click('[data-tab="courses"]');
  await A.page.selectOption(`#listTable tr[data-id="${id}"] select[data-f="method"]`, '필기');
  assert.equal(await pill(A.page), 'GitHub에 저장 대기');
  await waitFor(() => hub.data().plans['2026-2-final'].exams[id].method === '필기', 'A 자동 저장');
  assert.match(hub.commits.at(-1), /2026학년도 2학기 기말고사/);

  // 컴퓨터 B: 토큰 없이 저장소만 → 불러와서 보기만
  const B = await openApp(browser, { github: hub });
  await connect(B.page, hub.repo);
  await waitFor(async () => (await pill(B.page)) === 'GitHub에서 불러옴 · 보기 전용', 'B 불러오기');
  assert.equal(await B.page.evaluate(id => window.__planner.state.exams[id].method, id), '필기');

  // 컴퓨터 C: 토큰 연결 후 같은 학기 중간고사를 만든다
  const C = await openApp(browser, { github: hub });
  await connect(C.page, hub.repo, hub.token);
  await waitFor(async () => (await pill(C.page)) === 'GitHub에 저장됨', 'C 연결');
  await C.page.selectOption('#selKind', 'mid');                 // 2026-2 중간고사: 아직 없음 → 자료 넣기
  assert.equal(await C.page.inputValue('#wBase'), '2026-2-final');  // 같은 학기 기말 자료를 기본으로 가져옴
  await C.page.click('#wCreate');
  await C.page.click('[data-tab="history"]');
  await C.page.click('#ghSave');
  await waitFor(() => hub.data().plans['2026-2-mid'], 'C 중간고사 저장');

  // A는 C의 저장을 모른 채 메모를 고친다 → 충돌(409) → 다시 불러와 합친 뒤 저장
  await A.page.fill(`#listTable tr[data-id="${id}"] input[data-f="note"]`, '노트북 지참');
  await A.page.press(`#listTable tr[data-id="${id}"] input[data-f="note"]`, 'Tab');
  await waitFor(() => hub.data().plans['2026-2-final'].exams[id].note === '노트북 지참', 'A 충돌 후 저장');
  assert.ok(hub.data().plans['2026-2-mid'], 'C가 만든 중간고사가 남아 있어야 함');
  assert.ok(await A.page.evaluate(() => !!window.__planner.store.plans['2026-2-mid']), 'A 화면에도 합쳐짐');

  // B(보기 전용)는 '연결하고 불러오기'를 다시 누르면 최신 내용을 본다
  await B.page.click('#ghConnect');
  await waitFor(() => B.page.evaluate(id => window.__planner.store.plans['2026-2-final'].exams[id].note === '노트북 지참', id), 'B 새로 불러오기');

  // C가 중간고사를 지우면, A를 새로 열었을 때도 지워져 있다
  await C.page.click('.plancard[data-plan="2026-2-mid"] [data-act="del"]');
  await C.page.click('.plancard[data-plan="2026-2-mid"] [data-act="delYes"]');
  await waitFor(() => !hub.data().plans['2026-2-mid'] && hub.data().deleted['2026-2-mid'], 'C 삭제 저장');
  await A.page.reload();
  await waitFor(async () => (await pill(A.page)) === 'GitHub에 저장됨', 'A 다시 불러오기');
  assert.deepEqual(await A.page.evaluate(() => Object.keys(window.__planner.store.plans)), ['2026-2-final']);
  assert.equal(await A.page.evaluate(id => window.__planner.state.exams[id].note, id), '노트북 지참');

  for (const x of [A, B, C]) { assert.deepEqual(x.errors, []); await x.ctx.close(); }
});

test('토큰이 틀리면 알려 주고, 고친 내용은 이 브라우저에 남는다', async () => {
  const hub = fakeGitHub();
  const D = await openApp(browser, { github: hub });
  await connect(D.page, hub.repo, 'wrong-token');
  await waitFor(async () => (await pill(D.page)) === 'GitHub 저장 실패 · 이 브라우저에 보관', '오류 표시');
  assert.match(await D.page.textContent('#ghCard'), /토큰이 틀렸거나 만료/);
  assert.equal(hub.data(), undefined);
  assert.deepEqual(D.errors, []);
  await D.ctx.close();
});

test('비공개 저장소는 토큰 없이 읽을 수 없다는 안내', async () => {
  const hub = fakeGitHub({ isPrivate: true });
  const E = await openApp(browser, { github: hub });
  await connect(E.page, hub.repo);
  await waitFor(async () => (await pill(E.page)) === 'GitHub 저장 실패 · 이 브라우저에 보관', '오류 표시');
  assert.match(await E.page.textContent('#ghCard'), /비공개 저장소라면 토큰이 필요/);
  await connect(E.page, hub.repo, hub.token);
  await waitFor(async () => (await pill(E.page)) === 'GitHub에 저장됨', '토큰 넣은 뒤 저장');
  assert.doesNotMatch(await E.page.textContent('#ghCard'), /공개\(public\)/);
  await E.ctx.close();
});
