// 테스트 공용: 브라우저 없이 핵심 로직 불러오기, 테스트용 xlsx·PDF 만들기, 브라우저 띄우기
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import http from 'node:http';
import { ROOT } from '../scripts/build.mjs';

const require = createRequire(import.meta.url);
export { ROOT };
export const SEED = JSON.parse(readFileSync(join(ROOT, 'data/seed.json'), 'utf8'));

/** DOM 없이 동작하는 파일들(util → model → calendar → rules → importers)을 한 vm 컨텍스트에 올린다. */
export function loadCore() {
  const ctx = vm.createContext({ console });
  for (const f of ['util.js', 'model.js', 'calendar.js', 'rules.js', 'importers.js'])
    vm.runInContext(readFileSync(join(ROOT, 'src/js', f), 'utf8'), ctx, { filename: f });
  // let/const 전역(S, D, Store …)은 컨텍스트 객체 속성이 아니라서 식으로 꺼낸다
  ctx.get = expr => vm.runInContext(expr, ctx);
  // const 로 만든 함수(defaultDate, sortedPlans …)도 core.이름 으로 쓸 수 있게
  return new Proxy(ctx, { get: (t, k) => (typeof k !== 'string' || k in t) ? t[k] : vm.runInContext(k, ctx) });
}

/** 학과 강의시간표('최종 버전')와 같은 모양의 xlsx: 요일|학년|반|1..10, 연속 교시는 가로 병합 */
export async function makeTimetableXlsx(classes, { extra = [] } = {}) {
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet('안내').getCell('A1').value = '표지 시트 (건너뛰어야 함)';
  const ws = wb.addWorksheet('최종 버전');
  ws.getCell('B2').value = '2027학년도 1학기 컴퓨터소프트웨어과 강의시간표';
  const H = 5; // 머리글 줄
  ws.getCell(H, 2).value = '요일'; ws.getCell(H, 3).value = '학년'; ws.getCell(H, 4).value = '반';
  for (let p = 1; p <= 10; p++) ws.getCell(H, 4 + p).value = p;
  const all = [...classes, ...extra];
  const rows = [];
  for (const day of ['월', '화', '수', '목', '금'])
    for (const g of [...new Set(all.map(c => `${c.year}${c.ban}`))].sort())
      rows.push({ day, year: +g.slice(0, -1), ban: g.slice(-1) });
  let r = H + 1, prevDay = null, prevYear = null;
  for (const row of rows) {
    if (row.day !== prevDay) ws.getCell(r, 2).value = row.day;
    if (row.day !== prevDay || row.year !== prevYear) ws.getCell(r, 3).value = row.year;
    ws.getCell(r, 4).value = row.ban;
    prevDay = row.day; prevYear = row.year;
    for (const c of all.filter(c => c.day === row.day && c.year === row.year && c.ban === row.ban)) {
      ws.getCell(r, 4 + c.start).value = `${c.course}(${c.prof})-${c.room}호`;
      if (c.end > c.start) ws.mergeCells(r, 4 + c.start, r, 4 + c.end);
    }
    r++;
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** '요일별 수업일 현황' PDF: 주 | 월~토 표를 브라우저로 인쇄해 만든다 */
export async function makeCalendarPdf(browser, calendar, title = '요일별 수업일 현황') {
  const page = await browser.newPage();
  const rows = calendar.weeks.map((w, i) => `<tr><td>${i + 1}</td>${w.map(t => `<td>${t}</td>`).join('')}</tr>`).join('');
  await page.setContent(`<html><body style="font-family:sans-serif"><h2>${title}</h2>
    <table border="1" cellpadding="6" style="border-collapse:collapse;text-align:center"><tr><th>주</th>${calendar.cols.map(c => `<th>${c}</th>`).join('')}</tr>${rows}</table></body></html>`);
  const pdf = await page.pdf({ format: 'A4' });
  await page.close();
  return pdf;
}

/**
 * 가짜 GitHub API (저장소 하나). 브라우저 여러 개가 같은 객체를 공유하면 '여러 컴퓨터'가 된다.
 * 지원: GET 저장소, GET/POST git ref, GET/PUT contents. 쓰기는 토큰 필요, sha가 다르면 409.
 */
export function fakeGitHub({ repo = 'dept/exams', token = 'tok', isPrivate = false } = {}) {
  const refs = { main: 'c0' };
  const files = {};   // `${branch}:${path}` → { text, sha }
  let n = 0;
  const commits = [];
  async function handle(route) {
    const req = route.request();
    const url = new URL(req.url());
    const auth = req.headers()['authorization'];
    const ok = auth === `Bearer ${token}`;
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    const base = `/repos/${repo}`;
    if (!url.pathname.startsWith(base)) return json(404, { message: 'Not Found' });
    if (isPrivate && !ok) return json(404, { message: 'Not Found' });
    if (auth && !ok) return json(401, { message: 'Bad credentials' });
    const p = decodeURIComponent(url.pathname.slice(base.length));
    if (p === '' && req.method() === 'GET') return json(200, { private: isPrivate, default_branch: 'main', permissions: { push: ok }, html_url: `https://github.com/${repo}` });
    let m;
    if ((m = p.match(/^\/git\/ref\/heads\/(.+)$/))) return refs[m[1]] ? json(200, { object: { sha: refs[m[1]] } }) : json(404, { message: 'Not Found' });
    if (p === '/git/refs' && req.method() === 'POST') {
      if (!ok) return json(403, { message: 'Resource not accessible' });
      const b = JSON.parse(req.postData()); const name = b.ref.replace('refs/heads/', '');
      if (refs[name]) return json(422, { message: 'Reference already exists' });
      refs[name] = b.sha; return json(201, {});
    }
    if ((m = p.match(/^\/contents\/(.+)$/))) {
      const path = m[1];
      if (req.method() === 'GET') {
        const br = url.searchParams.get('ref') || 'main';
        const f = refs[br] && files[`${br}:${path}`];
        if (!f) return json(404, { message: 'Not Found' });
        return json(200, { sha: f.sha, encoding: 'base64', content: Buffer.from(f.text, 'utf8').toString('base64').replace(/(.{60})/g, '$1\n') });
      }
      if (req.method() === 'PUT') {
        if (!ok) return json(403, { message: 'Resource not accessible by personal access token' });
        const b = JSON.parse(req.postData());
        if (!refs[b.branch]) return json(404, { message: 'Branch not found' });
        const key = `${b.branch}:${path}`, cur = files[key];
        if (cur && b.sha !== cur.sha) return json(cur && !b.sha ? 422 : 409, { message: 'sha mismatch' });
        const sha = 's' + (++n);
        files[key] = { text: Buffer.from(b.content, 'base64').toString('utf8'), sha };
        commits.push(b.message);
        return json(cur ? 200 : 201, { content: { sha } });
      }
    }
    return json(404, { message: 'Not Found' });
  }
  return {
    repo, token, refs, files, commits, handle,
    data: (branch = 'data') => { const f = files[`${branch}:data/plans.json`]; return f && JSON.parse(f.text); },
  };
}

/** 다운로드 하나를 받아 { name: 앱이 붙인 파일명, buf } 로 */
export async function download(page, trigger) {
  const ev = page.waitForEvent('download');
  await trigger();
  const d = await ev;
  const chunks = []; for await (const ch of await d.createReadStream()) chunks.push(ch);
  const names = await page.evaluate(() => window.__downloads);
  return { name: names[names.length - 1], buf: Buffer.concat(chunks) };
}
export async function readXlsx(buf) {
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf); return wb;
}

export async function launch() {
  const { chromium } = require('playwright');
  return chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
}
/** GitHub Pages처럼 http로 index.html을 연다 (file://에서는 blob 다운로드 파일명이 무시되는 브라우저가 있음) */
let server = null;
export function serve() {
  if (!server) server = new Promise(res => {
    const srv = http.createServer((req, resp) => {
      if (!req.url.startsWith('/index.html')) { resp.writeHead(404).end(); return; }
      resp.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(readFileSync(join(ROOT, 'index.html')));
    });
    srv.listen(0, '127.0.0.1', () => { srv.unref(); res(`http://127.0.0.1:${srv.address().port}`); });
  });
  return server;
}
/** index.html 열기: CDN 라이브러리(ExcelJS, pdf.js)는 node_modules에서 대신 응답 */
export async function openApp(browser, { viewport = { width: 1440, height: 2400 }, init, github } = {}) {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true, locale: 'ko-KR' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  const lib = p => readFileSync(join(ROOT, 'node_modules', p), 'utf8');
  await page.route('https://cdn.jsdelivr.net/**', r => {
    const u = r.request().url();
    const body = u.includes('exceljs') ? lib('exceljs/dist/exceljs.min.js')
      : u.includes('pdf.worker') ? lib('pdfjs-dist/build/pdf.worker.min.js')
      : u.includes('pdfjs-dist') ? lib('pdfjs-dist/build/pdf.min.js') : null;
    return body ? r.fulfill({ body, contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' } }) : r.abort();
  });
  await page.route('https://fonts.**', r => r.abort());
  await page.route('https://api.github.com/**', r => github ? github.handle(r) : r.abort());
  // 앱이 요청한 다운로드 파일명 기록 (headless Chromium은 한글 파일명을 'download'로 바꿔 보고함)
  await page.addInitScript(() => {
    window.__downloads = [];
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { if (this.download) window.__downloads.push(this.download); return click.call(this); };
  });
  if (init) await page.addInitScript(init);
  await page.goto(await serve() + '/index.html');
  return { ctx, page, errors };
}
