# CLAUDE.md: 시험 시간표 편성 도구 인수인계

## 배경 (사용자 요구사항)

- 사용자: 컴퓨터소프트웨어과 학과 사무실 조교. 2026학년도 2학기 기말고사 시간표를 편성한다.
- 원자료: 학과 강의시간표 엑셀(시트 '최종 버전', 수업 50개, 1~3학년 8개 반), 강의시간표 PDF, '요일별 수업일 현황' PDF(15주 × 월~토).
- 규칙(사용자 지시):
  1. 기존 월~금 수업과 겹치면 안 된다.
  2. **15주차 수업만** 날짜를 옮겨서 시험을 볼 수 있다. 14주차 이전 수업은 고정.
  3. 기본은 각 과목 15주차 날짜·수업시간 그대로 시험 (화요일 과목도 12/8 그대로). 교수님 요청이 있을 때만 옮긴다.
  4. 과목마다 시험 방식·시간이 교수님 요청에 따라 다르다 → 과목별로 방식/길이 입력.
  5. 대상: 전공·교양·프로젝트 과목. 전공심화(4학년 야간) 제외.
  6. 결과물: 웹 도구 + 엑셀. 드래그 앤 드롭과 **"시험 일정 등록"** 폼 두 가지로 옮길 수 있어야 함.

## 수업일 현황의 함정 (반드시 유지할 로직)

- 15주차 날짜: 월 12/21, **화 12/8**, 수 12/16, 목 12/17, 금 12/18, 토 12/22(화).
- **12/15(화)는 금요일 14주차 수업일** → 그날은 금요일 시간표로 겹침을 검사한다.
- **12/22(화)는 토요일 15주차** → 이 학과는 토요일 수업이 없어 하루 종일 비어 있다.
- 날짜 → (요일 열, 주차) 매핑은 `derive()`의 `D.dateMap`. 실제 요일과 시간표 요일이 다를 수 있다.

## 구조

```
src/template.html     UI·로직 전부 (HTML/CSS/JS 한 파일). /*SEED*/ 자리에 데이터가 들어감
data/seed.json        제목·학과·연도·시험주차·수업일 현황(calendar)·수업 목록(classes)
index.html            빌드 결과물 (GitHub Pages가 서빙). 직접 고치지 말고 template 수정 후 빌드
scripts/build.py      template + seed → index.html
scripts/parse_timetable.py, make_seed.py   원본 xlsx/pdf → seed.json 만들 때 쓴 스크립트 (원본 파일은 저장소에 없음)
tests/smoke_test.py   playwright 스모크 테스트 (기본 겹침 0, 등록 폼, 드래그, 엑셀 다운로드)
```

## 데이터 모델 (template.html)

- `S` (저장되는 상태): `{v:1, title, dept, year, examWeek, calendar:{cols, weeks}, classes:[...], exams:{[classId]: {method, date(YYYY-MM-DD), start, len, room, note, done}}, extraDates, rev, updatedAt}`
- class: `{id:"요일-학년반-시작교시", day, year, ban, start, end, course, prof, room}` (room은 '호' 없이 저장, 표시할 때 붙임)
- 교시: 10교시, 5교시(12:40~13:30)는 점심 → 시험이 걸치면 경고.
- `METHODS`: 미정/필기/실기/필기+실기/발표/과제 대체/시험 없음. '과제 대체'·'시험 없음'(`NO_SLOT`)은 시험 블록이 없고, 그 과목의 시험주차 수업은 원래 시간에 정상 진행하는 것으로 본다(보수적 가정).

## 겹침 규칙 (`itemsOn`, `conflictsOf`, `warningsOf`)

- 어떤 날짜에 점유되는 것 = (a) 그날 열리는 고정 수업: 그 날짜의 주차가 시험주차가 아니거나, 시험주차여도 NO_SLOT 과목 / (b) 그 날짜에 배치된 모든 시험.
- 겹침 = 교시 범위가 겹치면서 같은 반 OR 같은 교수 OR 같은 강의실(`normRoom`으로 공백·'호' 제거 후 비교).
- 경고 = 주말, 수업일 현황에 없는 날, 학기 마지막 수업일 이후, (시험주차-1) 주차 수업일 이전·당일, 점심 포함, 10교시 초과.
- `freeSlots`: 시험주차-2 이후 후보 날짜 중 (시험주차-1) 수업일 이후, 토요일 제외, 점심을 걸치지 않고 겹침 0인 시작 교시 목록.
- 다른 학과의 강의실 사용, 4학년 야간 수업은 검사하지 않는다(데이터 없음).

## 저장·내보내기

- 단독 파일/GitHub Pages: localStorage(`exam-planner:v1`) + JSON 백업. 엑셀·백업 저장은 `<a download>`.
- claude.ai 아티팩트로 열면 `window.claude.use('db')`(문서 `planner/state`)와 `use('downloads')`를 쓴다. 이 코드는 claude.ai 밖에서는 자동으로 건너뛴다.
- 엑셀은 ExcelJS 4.4.0을 jsDelivr에서 필요할 때 로드. 시트: 시험시간표(공지) / 과목별 목록 / 교수님별. 공지 시트는 학과 강의시간표처럼 학년 색(1 노랑, 2 파랑, 3 초록) 사용.

## UI 진입점

- 탭: `#board`(날짜별 배치) `#courses`(과목 목록) `#professors`(교수님 확인) `#setup`(설정)
- 블록 클릭 → `openDrawer(id)` 편집 서랍(즉시 반영). 상단 "시험 일정 등록" → `openRegister()` 폼(미리보기 후 `saveRegister()`로 반영).
- 드래그: pointer 이벤트, 같은 반 줄 안에서만, 화면 가장자리 자동 스크롤.
- 테스트 훅: `window.__planner`

## 작업 규칙

- 사용자에게는 한국어로 답한다. 사용자는 웹개발 전공 4학년(Java·Spring, Node·TypeScript 선호).
- 수정은 `src/template.html`에서 하고 `python3 scripts/build.py`로 `index.html`을 다시 만든 뒤 `python3 tests/smoke_test.py`로 확인한다.
- 이 저장소는 public이다. 교수님 이름·강의실이 들어 있으니 학생 개인정보 등은 넣지 않는다.

## 다음에 해볼 만한 것 (아직 안 함)

- 여러 사람이 함께 쓰는 서버 저장(현재는 브라우저별 저장)
- 반별 하루 시험 개수 경고, 교수님 회신 상태 관리
- 템플릿을 모듈(JS/CSS) 파일로 분리하고 TypeScript로 옮기기
