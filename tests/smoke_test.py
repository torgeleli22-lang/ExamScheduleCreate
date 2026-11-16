"""헤드리스 Chrome으로 index.html 기본 동작을 확인한다.
준비: npm install (exceljs), pip install playwright, Chrome 경로는 CHROME 환경변수(기본 /usr/bin/google-chrome)
사용: python3 tests/smoke_test.py"""
import asyncio, os
from pathlib import Path
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parent.parent
EXC = (ROOT / 'node_modules/exceljs/dist/exceljs.min.js').read_text()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get('CHROME', '/usr/bin/google-chrome'), args=['--no-sandbox'])
        pg = await b.new_page(viewport={'width': 1440, 'height': 3300}, accept_downloads=True)
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.route('https://cdn.jsdelivr.net/**', lambda r: r.fulfill(body=EXC, content_type='application/javascript'))
        await pg.route('https://fonts.**', lambda r: r.abort())
        await pg.goto((ROOT / 'index.html').as_uri())
        k = await pg.evaluate('() => window.__planner.counts()')
        assert k['all'] > 0 and k['bad'] == 0, k
        # 등록 창: 화 2C 앱프로그래밍기초 → 12/15 미리보기는 겹침, 빈 시간 클릭 후 등록
        await pg.click('#btnRegister')
        await pg.select_option('#rCourse', label='2C 앱프로그래밍기초 (정세일) · 화 6교시')
        await pg.select_option('#rDate', '2026-12-15'); await pg.select_option('#rStart', '2')
        assert '겹침' in await pg.inner_text('#rChecks')
        await pg.click('[data-rslot^="2026-12-22|"]'); await pg.click('#rSave')
        ex = await pg.evaluate("()=>{const S=window.__planner.state;const c=S.classes.find(c=>c.day==='화'&&c.course==='앱프로그래밍기초');return S.exams[c.id]}")
        assert ex['date'] == '2026-12-22', ex
        await pg.click('#dClose')
        # 드래그: 12/16 2B 웹자바 → 12/17 2B 6교시 (이성욱 교수 2A 시험과 겹침)
        blk = pg.locator('.day[data-day="2026-12-16"] .blk.exam', has_text='웹자바프로그래밍입문')
        cell = pg.locator('.day[data-day="2026-12-17"] .cell[data-group="2B"][data-p="6"]')
        bb = await blk.bounding_box(); cb = await cell.bounding_box()
        await pg.mouse.move(bb['x'] + 5, bb['y'] + bb['height'] / 2); await pg.mouse.down()
        await pg.mouse.move(cb['x'] + cb['width'] / 2, cb['y'] + cb['height'] / 2, steps=12); await pg.mouse.up()
        k = await pg.evaluate('() => window.__planner.counts()')
        assert k['bad'] == 2, k
        async with pg.expect_download() as d:
            await pg.click('#btnExport')
        assert (await d.value).suggested_filename.endswith('.xlsx')
        assert not errs, errs
        print('OK', k)
        await b.close()
asyncio.run(main())
