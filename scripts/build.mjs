// src/index.html + src/styles.css + src/js/*.js + data/seed.json → index.html (한 파일, GitHub Pages가 서빙)
// 사용: npm run build
// JS 파일은 아래 순서대로 이어 붙인다(번들러 없음, 전역 함수 공유). 새 파일을 만들면 여기에 추가하세요.
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const JS_ORDER = [
  'util.js',        // 상수·도우미 (DOM 없이 동작)
  'model.js',       // 계획(Plan)·저장소(Store) 모양, v1→v2 변환
  'calendar.js',    // 수업일 현황 → 날짜 지도, derive()
  'rules.js',       // 겹침·경고 규칙
  'importers.js',   // PDF·xlsx·붙여넣기 읽기
  'hwp.js',         // 한글(.hwp) 문서 읽기
  'makeups.js',     // 보강 짝짓기 · 자료 종류 알아보기
  'store.js',       // localStorage · claude.ai db 저장
  'github.js',      // GitHub 저장소(data 브랜치)에 저장·불러오기
  'excel.js',       // 엑셀 내보내기 · 파일 저장
  'views.js',       // 요약·배치·목록·교수님 화면
  'view-range.js',  // 날짜별 배치 기간 고르기 달력
  'view-setup.js',  // 설정 탭
  'view-history.js',// 학기별 기록 탭
  'wizard.js',      // 새 시험 만들기
  'drawer.js',      // 편집 서랍 · 등록 폼
  'drag.js',        // 드래그 앤 드롭
  'app.js',         // 이벤트 연결 · 시작 (마지막)
];
const read = p => readFileSync(join(ROOT, p), 'utf8');

export function build() {
  const seed = read('data/seed.json');
  if (seed.includes('</script')) throw new Error('seed.json must not contain </script');
  JSON.parse(seed);
  const js = JS_ORDER.map(f => `/* ===== src/js/${f} ===== */\n${read('src/js/' + f).trim()}\n`).join('\n');
  if (js.includes('</script')) throw new Error('JS must not contain </script');
  let html = read('src/index.html');
  for (const [mark, body] of [['/*STYLES*/', read('src/styles.css').trim()], ['/*APP*/', js], ['/*SEED*/', seed.trim()]]) {
    if (!html.includes(mark)) throw new Error(`placeholder ${mark} missing in src/index.html`);
    html = html.replace(mark, () => body);
  }
  writeFileSync(join(ROOT, 'index.html'), html);
  return statSync(join(ROOT, 'index.html')).size;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log('built index.html', build(), 'bytes');
