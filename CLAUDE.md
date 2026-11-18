# CLAUDE.md: 시험 시간표 편성 도구 인수인계

## 배경 (사용자 요구사항)

- 사용자: 컴퓨터소프트웨어과 학과 사무실 조교. 학기마다 중간고사(8주차)·기말고사(15주차) 시간표를 편성하고, 내년 이후에도 계속 쓴다.
- 첫 자료: 2026학년도 2학기 강의시간표 엑셀(시트 '최종 버전', 수업 50개, 1~3학년 8개 반), '요일별 수업일 현황' PDF(15주 × 월~토). → `data/seed.json` (처음 여는 브라우저의 기본 시험 `2026-2-final`).
- 규칙(사용자 지시):
  1. 기존 월~금 수업과 겹치면 안 된다.
  2. **시험 주차 수업만** 날짜를 옮겨서 시험을 볼 수 있다. 다른 주차 수업은 고정.
  3. 기본은 각 과목의 시험 주차 날짜·수업시간 그대로 시험. 교수님 요청이 있을 때만 옮긴다.
  4. 과목마다 시험 방식·시간이 교수님 요청에 따라 다르다 → 과목별로 방식/길이 입력.
  5. 대상: 전공·교양·프로젝트 과목. 전공심화(4학년 야간) 제외 → 새 시험 만들 때 반 체크를 풀어서 뺀다.
  6. 결과물: 웹 도구 + 엑셀. 드래그 앤 드롭과 **"시험 일정 등록"** 폼 두 가지로 옮길 수 있어야 함.
  7. 학기별 시간표·수업일 현황 파일을 올려 중간/기말 시험을 만들고, **과거 기록을 남겨 두고 볼 수 있어야** 한다.
  8. 위에서 **학년도·학기·중간/기말을 직접 고른다.** 날짜 범위를 정하면 **요일이 가로 줄, 1·2·3주차가 세로 칸**인 판에서 옮긴다.
  9. 옮기지 않는 과목은 **"기존 시간표 수업 진행"** 으로 확정한다.
  10. 시간표·요일별 수업일표·**보강** 양식을 넣으면 **알아서 인식**해서 적용한다. 카드마다 **몇 주차 수업인지** 보이게.
  11. 데이터는 GitHub(data 브랜치)에 저장. 사이트는 GitHub Pages(main, /(root), `.nojekyll`).

## 수업일 현황의 함정 (반드시 유지할 로직)

- 수업일 현황의 날짜는 실제 요일과 시간표 요일이 다를 수 있다(대체 수업일). 2026-2 예:
  - 15주차: 월 12/21, **화 12/8**, 수 12/16, 목 12/17, 금 12/18, 토 12/22(화).
  - **12/15(화)는 금요일 14주차 수업일** → 그날은 금요일 시간표로 겹침을 검사한다.
  - **12/22(화)는 토요일 15주차** → 이 학과는 토요일 수업이 없어 하루 종일 비어 있다.
- 날짜 → (시간표 요일 열, 주차) 매핑은 `buildDateMap()` → `D.dateMap` (`src/js/calendar.js`).
- 2학기 달력의 1~2월 날짜는 다음 해로 본다(`tokToIso`). 계획의 `year`는 학년도.
- 단위 테스트 `tests/unit.test.mjs`가 이 함정들을 고정해 둔다. 깨지면 로직이 틀린 것.

## 구조

```
src/index.html        화면 뼈대. /*STYLES*/ /*APP*/ /*SEED*/ 자리에 빌드가 내용을 넣음
src/styles.css        스타일 (라이트/다크 토큰)
src/js/*.js           앱 코드. 번들러 없이 scripts/build.mjs 의 JS_ORDER 순서로 이어 붙임(전역 함수 공유)
  util.js             상수(PERIODS, METHODS, KINDS…)·도우미           ┐
  model.js            Plan/Store 모양, v1→v2 변환, 정렬                │ DOM 없이 동작해야 함
  calendar.js         수업일 현황 → 날짜 지도, derive(), usePlan()     │ (단위 테스트가 vm으로 직접 불러씀)
  rules.js            겹침·경고·빈 시간·요약 수치                      │
  importers.js        수업일 표 붙여넣기/PDF(pdf.js), 시간표 xlsx, recognizeFile(종류 알아보기)
  hwp.js              한글(.hwp 5.0) → 글자. CFB 직접 해석, 표는 한 행 = 한 줄(칸은 탭)       │
  makeups.js          보강 양식 → plan.makeups (parseMakeups), classifyText                 ┘
  store.js            localStorage · claude.ai db 저장
  github.js           GitHub 저장소(data 브랜치) 저장·불러오기·합치기, 기록 탭의 GitHub 카드
  excel.js            엑셀 내보내기 · 파일 저장
  views.js            render(), 위쪽 선택칸, 요약, 날짜별 배치(주차×요일 판 + 반×교시 자세히), 과목 목록, 잠금
  view-range.js       날짜별 배치 기간 고르기 달력(#rangePop): 기간(끌기·두 번 누르기·주차 칸) / 날짜 골라 담기(S.range.days)
  view-setup.js       설정 탭(지금 시험 하나): 자료 다시 넣기(자동 인식), 보강 목록·직접 추가
  view-history.js     학기별 기록 탭, 백업/복원, switchPlan()
  wizard.js           자료 넣기 화면(고른 시험이 없을 때 #createPanel): 파일 여러 개 → 자동 인식 → 만들기
  drawer.js           편집 서랍 · 시험 일정 등록 폼
  drag.js             드래그 앤 드롭
  app.js              ui 상태, changed(), 이벤트 연결, boot (마지막)
data/seed.json        첫 실행용 기본 자료(2026-2 기말)
index.html            빌드 결과물 (GitHub Pages가 서빙). 직접 고치지 말고 src 수정 후 빌드, 결과물도 커밋
scripts/build.mjs     src + seed → index.html
tests/unit.test.mjs   핵심 규칙 단위 테스트 (node:test, 브라우저 없음)
tests/github.test.mjs GitHub 저장 종단 테스트 (가짜 API, 여러 컴퓨터·충돌·삭제·토큰 오류·비공개)
tests/e2e.test.mjs    playwright 종단 테스트 (등록 폼, 드래그, 엑셀 내용, 새 학기 xlsx+PDF 업로드, 잠금, 새로고침, 백업/복원, v1 이전)
tests/helpers.mjs     vm 로더, 테스트용 xlsx/PDF/한글(makeHwp) 생성, 가짜 GitHub, http 서버, 다운로드 확인
```

## 데이터 모델

- `Store` (저장 단위): `{v:2, plans:{[planId]: Plan}, currentId}`. localStorage 키 `exam-planner:v2`.
- `Plan` (시험 하나): `{v:2, id:"2027-1-mid", termYear, term(1|2), kind('mid'|'final'), title, dept, year, examWeek, calendar:{cols, weeks}, classes:[...], exams:{[classId]: {method, date(YYYY-MM-DD), start, len, room, note, done}}, extraDates, locked, sources:{timetable, calendar, makeups}, makeups:[...], range:{from,to}, createdAt, updatedAt, rev}`
  - exam에 `keep: true` = **기존 시간표 수업 진행** 확정(done도 true). 옮기면 풀린다(`isKept(c)` = keep && !isMoved). 방식(필기·시험 없음 등)은 따로 고를 수 있어 "원래 시간에 시험"과 "시험 없이 수업" 둘 다 표현. 엑셀은 `methodLabel(c)`.
  - makeup: `{id, classId, from(결강일|''), to(보강일), start, end, room, note}`.
  - range: 날짜별 배치 판의 기간 `{from, to}` 또는 특정일 `{from, to, days:[…]}`(판에서 그 날짜만 진하게). 없으면 `defaultRange()` = 시험 주차 날짜들이 들어가는 주(월~토). 읽을 때는 `boardRange()`.
  - 계획마다 시간표·수업일을 **복사본으로** 들고 있다 → 새 학기 업로드가 지난 기록을 바꾸지 않는다.
  - `S` = 지금 보는 계획(= `Store.plans[Store.currentId]`), `D` = `derive()`가 계산한 값. 계획 바꾸기는 `switchPlan(id)` / 테스트에선 `usePlan(p)`.
  - `KINDS = {mid:{label:'중간고사', week:8}, final:{label:'기말고사', week:15}}`. 주차는 설정 탭에서 계획별로 바꿀 수 있다.
- 예전 v1(한 개짜리 상태, 키 `exam-planner:v1`, 백업 .json)은 `toStore()`/`upgradePlan()`이 제목·주차로 학기·종류를 읽어 계획으로 바꾼다. v1 키는 지우지 않는다.
- class: `{id:"요일-학년반-시작교시", day, year, ban, start, end, course, prof, room}` (room은 '호' 없이 저장, 표시할 때 붙임)
- 교시: 10교시, 5교시(12:40~13:30)는 점심 → 시험이 걸치면 경고.
- `METHODS`: 미정/필기/실기/필기+실기/발표/과제 대체/시험 없음. '과제 대체'·'시험 없음'(`NO_SLOT`)은 시험 블록이 없고, 그 과목의 시험주차 수업은 원래 시간에 정상 진행하는 것으로 본다(보수적 가정).

## 겹침 규칙 (`itemsOn`, `conflictsOf`, `warningsOf` in rules.js)

- 어떤 날짜에 점유되는 것 = (a) 그날 열리는 고정 수업: 그 날짜의 주차가 시험주차가 아니거나, 시험주차여도 NO_SLOT 과목. 단 결강일(makeup.from)의 그 수업은 빠짐 / (b) 그날로 잡힌 보강(kind 'makeup', 원래 주차 표시) / (c) 그 날짜에 배치된 모든 시험.
- 시험 주차 수업이 결강되고 보강됐으면(`D.examMakeup`) 그 보강 시간이 기본 시험 시간(`defaultDate/Start/Len/Room`). 수업일·보강이 바뀌면 `rebaseUnmoved()`로 옮기지 않은 시험이 따라감.
- 겹침 = 교시 범위가 겹치면서 같은 반 OR 같은 교수 OR 같은 강의실(`normRoom`으로 공백·'호' 제거 후 비교).
- 경고 = 주말, 수업일 현황에 없는 날, 학기 마지막 수업일 이후, (시험주차-1) 주차 수업일 이전·당일, 점심 포함, 10교시 초과.
- `freeSlots`: 시험주차-2 이후 후보 날짜 중 (시험주차-1) 수업일 이후, 토요일 제외, 점심을 걸치지 않고 겹침 0인 시작 교시 목록.
- 다른 학과의 강의실 사용, 4학년 야간 수업은 검사하지 않는다(데이터 없음).

## 파일 읽기 (importers.js, hwp.js, makeups.js)

- `recognizeFile(file)`: xlsx는 먼저 시간표로 읽어 보고, 아니면 글자로 바꿔(`xlsxToText`, `pdfToText`, `hwpToText`) `classifyText`로 수업일 현황(주차 줄 6개 이상)인지 보강(날짜 2개+교시 줄, '보강' 또는 과목코드)인지 판단.
- 보강결과보고서(학교 양식, .hwp): 행 = `과목코드 | 과목명 | 학년 | 결강 일자·요일·시간 | 보강 일자·요일·시간 | 담당교수 | (인) | N`. **반 칸이 없다** → 과목코드 끝자리(101=A, 102=B, 103=C) + 학년 + 결강 요일(수업일 현황의 시간표 요일) + 결강 시작 교시 + 교수 이름으로 점수를 매겨 시간표 수업을 고른다. 과목명은 서로 포함 관계면 같다고 본다('커리어디자인' ↔ '커리어디자인(취창업성공전략)'). 시간 "2~4"는 교시.
- 한글: CFB(섹터·FAT·미니 스트림) → FileHeader(압축·암호 비트) → BodyText/SectionN(압축이면 DecompressionStream('deflate-raw')) → 레코드. 표 칸 LIST_HEADER(tag 72)의 행 번호는 오프셋 10. 실제 양식은 행마다 1×12 표.
- 알려진 실제 자료 문제(2026-2): 12/15(화)는 수업일 현황상 금요일 14주차인데 보강결과보고서는 화요일 수업 5건을 12/15에 넣어 1A·1B와 겹친다. 도구는 그대로 겹침으로 보여 준다.

- 시간표 xlsx: '요일' 머리글 칸을 찾고 오른쪽으로 학년·반·1..N 교시. 칸 "과목명(교수)-강의실", 가로 병합 = 연속 교시. 첫 번째로 수업이 읽히는 시트를 쓴다.
- 수업일 현황 PDF: pdf.js 3.11.174(UMD, jsDelivr)로 글자 조각을 읽어 `pdfItemsToLines()`(같은 높이끼리 묶기) → `parseCalendarText()`. 읽은 결과는 마법사의 텍스트 칸에 보여 주고 사용자가 고칠 수 있다(스캔 PDF 대비).
- `parseCalendarText`: "주차번호 날짜×6" 줄. 주차 번호가 없으면 위에서부터 1주차. "12/15 (화)"처럼 띄어 써도 읽는다.

## 저장·내보내기

- **GitHub 저장 (기본 사용 방식, github.js)**: 정적 페이지가 GitHub REST API(contents)로 저장소의 `data` 브랜치 `data/plans.json`을 직접 읽고 쓴다(`storePayload()`: currentId·writer 제외, 들여쓰기 1).
  - 저장소는 Pages 주소(`<owner>.github.io/<repo>/`)에서 짐작하고 기록 탭에서 바꿀 수 있다. 설정·토큰은 localStorage `exam-planner:github`.
  - 토큰(fine-grained, Contents read/write) 있으면 `persistLocal()` → `ghQueue()` → 4초 모아서 커밋. 없으면 읽기 전용. 브랜치가 없으면 기본 브랜치에서 만든다.
  - 동시 저장: PUT이 409/422면 다시 읽어 `mergeStores()`(시험별 updatedAt 최신 승, `Store.deleted` 기록으로 삭제 전파) 후 재시도. 창으로 돌아오면 30초에 한 번 새로 읽는다.
  - main이 아니라 data 브랜치인 이유: 저장마다 Pages 재빌드·코드 기록 오염 방지.
  - 테스트는 `tests/helpers.mjs`의 `fakeGitHub()`(가짜 API)로 여러 브라우저가 한 저장소를 쓰는 상황을 재현한다.
- 이 브라우저: localStorage(`exam-planner:v2`)에도 항상 저장. JSON 백업(전체 또는 시험 하나, 형식은 Store). 복원은 합치기: 없는 시험 추가, 같은 id는 백업이 더 최신일 때만 덮어씀.
- claude.ai 아티팩트로 열면 `window.claude.use('db')`의 `plans/{planId}` 문서(계획당 1문서, 256KiB 한도 안)와 `use('downloads')`를 쓴다. 삭제는 `{deleted:true}` 표시. 예전 `planner/state` 문서가 있으면 처음 한 번 가져온다. claude.ai 밖에서는 자동으로 건너뛴다.
- 엑셀은 ExcelJS 4.4.0을 jsDelivr에서 필요할 때 로드. 시트: 시험시간표(공지) / 과목별 목록 / 교수님별.

## UI 진입점

- 상단 `#selYear #selTerm #selKind` → `selectExam()`: 있으면 `switchPlan`, 없으면 `ui.missing` + `#createPanel`(탭·본문은 숨김, `body.missing`).
- 탭: `#board`(날짜별 배치) `#courses`(과목 목록) `#history`(학기별 기록) `#setup`(설정, 지금 시험만)
- 날짜별 배치: `#weekGrid`(`.wcell[data-date]` 안에 `.wcard`; 시험 카드만 `.exam`, 드래그하면 같은 교시로 날짜만 이동) + 날짜를 누르면 `ui.days`에 추가되어 `#board`에 반×교시 `.day[data-day]` 펼침(블록을 교시까지 드래그). `#btnKeepAll` = 옮기지 않고 겹침 없는 과목 모두 keep.
- 블록 클릭 → `openDrawer(id)` 편집 서랍(즉시 반영). 상단 "시험 일정 등록" → `openRegister()` 폼(미리보기 후 `saveRegister()`로 반영).
- 보관(잠금)된 계획: `isLocked()`. 모든 수정 진입점이 막혀 있고 `lockControls()`가 입력 칸을 끈다. `changed()`도 잠금이면 저장하지 않는다.
- 다시 그리면서(innerHTML) 포커스된 칸이 지워지면 change 이벤트가 또 렌더를 부를 수 있다 → 마법사는 `renderWizard()` 재진입 가드 사용.
- 테스트 훅: `window.__planner`

## 작업 규칙

- 사용자에게는 한국어로 답한다. 사용자는 웹개발 전공 4학년(Java·Spring, Node·TypeScript 선호).
- 수정은 `src/`에서 하고 `npm run build`로 `index.html`을 다시 만든 뒤 `npm test`로 확인한다. `index.html`도 함께 커밋(Pages 배포물).
- 새 JS 파일을 만들면 `scripts/build.mjs`의 `JS_ORDER`에 넣는다. DOM 없는 로직은 util/model/calendar/rules/importers에 두고 단위 테스트를 붙인다.
- 테스트 환경: Node 20+, `npm install`. Chromium은 playwright 기본 경로 또는 `CHROME` 환경변수.
- 이 저장소는 public이다. 교수님 이름·강의실이 들어 있으니 학생 개인정보 등은 넣지 않는다. 테스트 자료는 seed에서 만들어 쓰고 실제 원본 파일은 커밋하지 않는다(.gitignore가 xlsx/pdf 제외).

## 다음에 해볼 만한 것 (아직 안 함)

- 저장소 공개 범위 결정(지금 public → 저장한 일정·메모도 공개). private 전환 시 Pages는 GitHub Pro 필요
- 반별 하루 시험 개수 경고, 교수님 회신 상태 관리
- 교수님별 안내 문구 탭은 사용자 요청으로 삭제함(문구는 학과에서 직접 보냄). 엑셀 '교수님별' 시트는 유지
- TypeScript로 옮기기: 지금 파일 경계(util/model/calendar/rules = 순수 로직)를 그대로 ES 모듈 + esbuild로 바꾸면 된다
- 중간·기말 외 시험 종류(보강 주 등)가 필요하면 `KINDS`에 추가
