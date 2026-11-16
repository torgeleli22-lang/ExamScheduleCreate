/* ---------- 설정 탭: 지금 보고 있는 시험 하나의 설정 ----------
   (새 학기·새 시험은 '학기별 기록' 탭의 '새 시험 만들기'로. 여기는 이미 만든 시험을 고칠 때) */
function renderSetup() {
  const p = ui.pending;
  const maxWeek = S.calendar.weeks.length;
  const src = S.sources || {};
  $('#setupGrid').innerHTML = `
  <article class="card"><h2>기본 정보</h2>
    <label class="field" for="sTitle"><span>시험 이름 (공지·엑셀 제목에 쓰여요)</span><input type="text" class="editable" id="sTitle" value="${esc(S.title)}"></label>
    <label class="field" for="sDept"><span>학과</span><input type="text" class="editable" id="sDept" value="${esc(S.dept)}"></label>
    <div class="row"><label class="field" for="sWeek"><span>시험 주차</span><select class="editable" id="sWeek">${opts(range(1, maxWeek), S.examWeek, v => `${v}주차`)}</select></label>
      <button type="button" class="btn small editable" id="btnWeek" style="align-self:flex-end">주차 적용</button></div>
    ${p.week ? `<div class="result">시험 주차를 ${p.week}주차로 바꾸면 모든 과목의 방식·날짜·메모가 새로 시작돼요. <button type="button" class="btn small danger" id="btnWeekYes">바꾸기</button> <button type="button" class="btn small" data-cancel="week">취소</button></div>` : ''}
    <p class="hint">중간고사는 보통 ${KINDS.mid.week}주차, 기말고사는 ${KINDS.final.week}주차예요. 주차를 바꾸면 각 과목의 그 주차 수업 시간이 기본 시험 시간이 돼요.</p>
  </article>
  <article class="card"><h2>요일별 수업일 현황 고치기</h2>
    <p class="hint">이 시험에만 적용돼요. 수업일 현황 PDF를 다시 올리거나, '주 / 월~토' 표를 붙여 넣으세요.${src.calendar ? ` 지금 자료: ${esc(src.calendar)}` : ''}</p>
    <div class="row"><label class="btn small editable" for="sCalPdf">PDF 다시 올리기</label><input type="file" id="sCalPdf" class="editable" accept=".pdf,application/pdf" hidden></div>
    <label class="field" for="sYear"><span>학년도</span><input type="number" class="editable" id="sYear" value="${esc(S.year)}" min="2020" max="2100" style="width:110px"></label>
    <label class="field" for="sCal"><span>수업일 표</span><textarea class="editable" id="sCal" rows="9">${esc(p.calText ?? calendarText(S.calendar))}</textarea></label>
    <div class="row"><button type="button" class="btn small editable" id="btnCal">수업일 적용</button></div>
    ${p.cal ? `<div class="result ${p.cal.error ? 'bad' : ''}">${esc(p.cal.msg)} ${p.cal.data ? `<button type="button" class="btn small danger" id="btnCalYes">적용하기</button> <button type="button" class="btn small" data-cancel="cal">취소</button>` : ''}</div>` : ''}
  </article>
  <article class="card"><h2>강의시간표 바꾸기</h2>
    <p class="hint">이 시험에만 적용돼요. 시간표가 학기 중에 바뀌었을 때 새 엑셀(.xlsx)을 올리세요. '요일·학년·반·1~10교시' 머리글이 있는 시트를 찾아 읽어요.${src.timetable ? ` 지금 자료: ${esc(src.timetable)}` : ''}</p>
    <input type="file" id="sXlsx" class="editable" accept=".xlsx">
    ${p.xlsx ? `<div class="result ${p.xlsx.error ? 'bad' : ''}">${esc(p.xlsx.msg)} ${p.xlsx.data ? `<button type="button" class="btn small danger" id="btnXlsxYes">이 시간표로 바꾸기</button> <button type="button" class="btn small" data-cancel="xlsx">취소</button>` : ''}</div>` : ''}
  </article>
  <article class="card"><h2>이 시험 처음부터 다시</h2>
    <p class="hint">입력한 방식·날짜·메모를 모두 지우고 ${S.examWeek}주차 수업 시간 그대로 다시 배치해요. 시간표와 수업일 현황은 그대로예요.</p>
    <div class="row"><button type="button" class="btn small danger editable" id="btnReset">처음 상태로 되돌리기</button></div>
    ${p.reset ? `<div class="result">정말 되돌릴까요? <button type="button" class="btn small danger" id="btnResetYes">되돌리기</button> <button type="button" class="btn small" data-cancel="reset">취소</button></div>` : ''}
  </article>
  <article class="card"><h2>겹침 검사 기준</h2>
    <ul class="plain">
      <li>그날 실제로 열리는 수업으로 검사해요. 예: 2026년 2학기 12/15(화)는 금요일 14주차 수업일이라 금요일 시간표로 봐요.</li>
      <li>시험 주차 수업은 시험으로 바뀌므로 자리를 옮길 수 있어요. 다른 주차 수업은 고정이에요.</li>
      <li>'과제 대체'나 '시험 없음'으로 정한 과목은 시험 주차에도 원래 시간에 수업하는 것으로 봐요.</li>
      <li>같은 반, 같은 교수님, 같은 강의실이 같은 시간에 겹치면 겹침으로 표시해요. 다른 학과의 강의실 사용은 알 수 없어서 검사하지 않아요.</li>
    </ul>
  </article>`;
}

function bindSetup() {
  const sg = $('#setupGrid');
  sg.addEventListener('change', async e => {
    const el = e.target;
    if (isLocked()) return;
    if (el.id === 'sTitle') { S.title = el.value.trim() || S.title; changed(); }
    else if (el.id === 'sDept') { S.dept = el.value.trim() || S.dept; changed(); }
    else if (el.id === 'sCalPdf' && el.files[0]) {
      const f = el.files[0];
      ui.pending.cal = { msg: 'PDF 읽는 중…' }; renderSetup();
      try { const res = await parseCalendarPdf(await f.arrayBuffer()); ui.pending.calText = res.text; ui.pending.calName = f.name; ui.pending.cal = res; ui.pending.calYear = S.year; }
      catch (err) { ui.pending.cal = { error: true, msg: err.message || 'PDF를 읽지 못했어요.' }; }
      renderSetup();
    } else if (el.id === 'sXlsx' && el.files[0]) {
      const f = el.files[0];
      ui.pending.xlsx = { msg: '읽는 중…' }; renderSetup();
      try { const res = await parseTimetableXlsx(await f.arrayBuffer());
        const g = new Set(res.classes.map(groupOf)).size, pr = new Set(res.classes.map(c => c.prof)).size;
        ui.pending.xlsx = { data: res.classes, name: f.name, msg: `'${res.sheet}' 시트에서 수업 ${res.classes.length}개(${g}개 반, 교수님 ${pr}분)를 읽었어요. 바꾸면 이 시험에 입력한 정보는 지워져요.` };
      } catch (err) { ui.pending.xlsx = { error: true, msg: err.message || '파일을 읽지 못했어요.' }; }
      renderSetup();
    }
  });
  sg.addEventListener('click', e => {
    const id = e.target.id;
    const cancel = e.target.dataset && e.target.dataset.cancel;
    if (cancel) { delete ui.pending[cancel]; if (cancel === 'cal') delete ui.pending.calText; renderSetup(); return; }
    if (isLocked()) return;
    if (id === 'btnWeek') { const w = +$('#sWeek').value; if (w !== S.examWeek) { ui.pending.week = w; renderSetup(); } return; }
    if (id === 'btnWeekYes') { S.examWeek = ui.pending.week; S.exams = {}; S.extraDates = []; delete ui.pending.week; derive(); changed(); toast(`${S.examWeek}주차 기준으로 다시 배치했어요.`); return; }
    if (id === 'btnCal') { ui.pending.calText = $('#sCal').value; ui.pending.cal = parseCalendarText(ui.pending.calText); ui.pending.calYear = +$('#sYear').value || S.year; renderSetup(); return; }
    if (id === 'btnCalYes') {
      S.calendar = ui.pending.cal.data; S.year = ui.pending.calYear || S.year;
      if (ui.pending.calName) S.sources = { ...(S.sources || {}), calendar: ui.pending.calName };
      delete ui.pending.cal; delete ui.pending.calText; delete ui.pending.calName;
      derive();
      for (const c of S.classes) { const ex = S.exams[c.id]; if (!D.dateMap[ex.date]) ex.date = defaultDate(c); }
      changed(); toast('수업일 현황을 바꿨어요.'); return;
    }
    if (id === 'btnXlsxYes') {
      S.classes = ui.pending.xlsx.data; S.sources = { ...(S.sources || {}), timetable: ui.pending.xlsx.name };
      S.exams = {}; S.extraDates = []; delete ui.pending.xlsx; derive(); refreshRoomList(); changed(); toast('새 강의시간표로 바꿨어요.'); return;
    }
    if (id === 'btnReset') { ui.pending.reset = true; renderSetup(); return; }
    if (id === 'btnResetYes') { delete ui.pending.reset; S.exams = {}; S.extraDates = []; derive(); changed(); toast('처음 상태로 되돌렸어요.'); return; }
  });
}
