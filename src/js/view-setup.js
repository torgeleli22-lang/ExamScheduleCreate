/* ---------- 설정 탭: 지금 보고 있는 시험 하나의 설정 ----------
   - 자료 다시 넣기: 학기 중에 시간표·수업일 현황이 바뀌거나 보강이 생기면 파일을 넣는다(종류는 알아서 알아봄).
   - 보강 목록: 파일로 들어온 보강을 확인·삭제하고, 직접 추가할 수도 있다.
   옮기지 않은 시험은 바뀐 자료의 새 기본 시간을 따라간다(rebaseUnmoved). */
function renderSetup() {
  const p = ui.pending;
  const maxWeek = S.calendar.weeks.length;
  const src = S.sources || {};
  const mks = (S.makeups || []).slice().sort((a, b) => a.to.localeCompare(b.to) || a.start - b.start);
  const classOpts = D.groups.map(g => `<optgroup label="${esc(g)}">${S.classes.filter(c => groupOf(c) === g)
    .map(c => `<option value="${esc(c.id)}">${esc(g)} ${esc(c.course)} (${esc(c.prof)}) · ${esc(c.day)} ${pRange(c.start, lenOf(c))}</option>`).join('')}</optgroup>`).join('');
  const found = p.files || [];
  $('#setupGrid').innerHTML = `
  <article class="card"><h2>기본 정보</h2>
    <label class="field" for="sTitle"><span>시험 이름 (공지·엑셀 제목에 쓰여요)</span><input type="text" class="editable" id="sTitle" value="${esc(S.title)}"></label>
    <label class="field" for="sDept"><span>학과</span><input type="text" class="editable" id="sDept" value="${esc(S.dept)}"></label>
    <div class="row"><label class="field" for="sWeek"><span>시험 주차</span><select class="editable" id="sWeek">${opts(range(1, maxWeek), S.examWeek, v => `${v}주차`)}</select></label>
      <button type="button" class="btn small editable" id="btnWeek" style="align-self:flex-end">주차 적용</button></div>
    ${p.week ? `<div class="result">시험 주차를 ${p.week}주차로 바꾸면 모든 과목의 방식·날짜·메모가 새로 시작돼요. <button type="button" class="btn small danger" id="btnWeekYes">바꾸기</button> <button type="button" class="btn small" data-cancel="week">취소</button></div>` : ''}
    <p class="hint">중간고사는 보통 ${KINDS.mid.week}주차, 기말고사는 ${KINDS.final.week}주차예요.</p>
  </article>
  <article class="card"><h2>자료 다시 넣기</h2>
    <p class="hint">시간표가 바뀌었거나 보강이 생겼을 때 파일을 넣으세요. 강의시간표(.xlsx), 요일별 수업일 현황(.pdf·.hwp·.xlsx), 보강결과보고서(.hwp·.xlsx·.pdf)를 알아서 알아봐요. 옮기지 않은 시험은 새 자료의 기본 시간을 따라가요.</p>
    <p class="hint">지금 자료: 시간표 ${esc(src.timetable || '-')} · 수업일 ${esc(src.calendar || '-')}${src.makeups ? ` · 보강 ${esc(src.makeups)}` : ''}</p>
    <div class="dropzone" id="sDrop" data-drop="setup">
      <b>여기에 파일을 끌어다 놓거나</b>
      <label class="btn small primary editable" for="sFiles">파일 고르기 (여러 개 가능)</label><input type="file" id="sFiles" class="editable" multiple accept=".xlsx,.xlsm,.xls,.pdf,.hwp,.txt,.csv" hidden>
      <span class="hint">강의시간표 .xlsx/.xls · 수업일 현황 .pdf/.hwp/.xlsx · 보강 .hwp/.xls/.xlsx</span>
    </div>
    ${p.busy ? `<p class="hint">${esc(p.busy)}</p>` : ''}
    ${found.length ? `<div class="filelist">${found.map((f, i) => `<div class="it ${f.type === 'unknown' ? 'bad' : 'ok'}"><span class="ty">${esc(TYPE_LABEL[f.type])}</span><span>${esc(f.name)}</span><span class="hint">${esc(f.msg)}</span>
      ${f.type === 'unknown' ? '' : f.applied ? '<span class="keepnote">✓ 적용함</span>' : `<button type="button" class="btn small danger editable" data-apply="${i}">${f.type === 'makeups' ? '보강 추가' : '이 자료로 바꾸기'}</button>`}</div>`).join('')}</div>` : ''}
    ${p.applyMsg ? `<div class="result">${esc(p.applyMsg)}</div>` : ''}
    <details><summary class="hint">요일별 수업일 현황 직접 고치기</summary>
      <label class="field" for="sYear"><span>학년도</span><input type="number" class="editable" id="sYear" value="${esc(S.year)}" min="2020" max="2100" style="width:110px"></label>
      <label class="field" for="sCal"><span>수업일 표</span><textarea class="editable" id="sCal" rows="9">${esc(p.calText ?? calendarText(S.calendar))}</textarea></label>
      <div class="row"><button type="button" class="btn small editable" id="btnCal">수업일 적용</button></div>
      ${p.cal ? `<div class="result ${p.cal.error ? 'bad' : ''}">${esc(p.cal.msg)} ${p.cal.data ? `<button type="button" class="btn small danger" id="btnCalYes">적용하기</button> <button type="button" class="btn small" data-cancel="cal">취소</button>` : ''}</div>` : ''}
    </details>
  </article>
  <article class="card" style="grid-column:1/-1"><h2>보강 ${mks.length}건</h2>
    <p class="hint">보강일·교시에는 그 수업이 있는 것으로, 결강일에는 원래 수업이 없는 것으로 겹침을 검사해요. 날짜별 배치에서는 '보강' 표시로 보여요.</p>
    ${mks.length ? `<div class="tablebox"><table class="mklist"><thead><tr><th>반</th><th>과목 · 교수</th><th>결강(원래 수업)</th><th>보강</th><th>강의실</th><th></th></tr></thead><tbody>${mks.map(m => {
      const c = D.byId[m.classId];
      const fw = m.from && D.dateMap[m.from] ? `${D.dateMap[m.from].week}주차` : '';
      return `<tr><td class="gtag">${esc(c ? groupOf(c) : '?')}</td><td>${esc(c ? c.course : m.classId)}<span class="sub">${esc(c ? c.prof : '')}</span></td>
        <td>${m.from ? `${esc(fmt(m.from))} <span class="wk">${fw}</span>` : '-'}</td><td>${esc(fmt(m.to))} ${pRange(m.start, m.end - m.start + 1)}</td><td>${esc(roomLabel(m.room))}</td>
        <td><button type="button" class="btn small danger editable" data-delmk="${esc(m.id)}">삭제</button></td></tr>`; }).join('')}</tbody></table></div>` : '<p class="hint">아직 보강이 없어요.</p>'}
    <details><summary class="hint">보강 직접 추가</summary>
      <div class="row" style="margin-top:8px">
        <label class="field"><span>수업</span><select id="mkClass" class="editable">${classOpts}</select></label>
        <label class="field"><span>결강일 (없으면 비움)</span><input type="date" id="mkFrom" class="editable"></label>
        <label class="field"><span>보강일</span><input type="date" id="mkTo" class="editable"></label>
        <label class="field"><span>교시</span><span class="row"><select id="mkStart" class="editable">${opts(range(1, 14), 1)}</select>~<select id="mkEnd" class="editable">${opts(range(1, 14), 2)}</select></span></label>
        <label class="field"><span>강의실 (비우면 원래 강의실)</span><input type="text" id="mkRoom" class="editable" size="8" list="roomList"></label>
        <button type="button" class="btn small primary editable" id="mkAdd" style="align-self:flex-end">추가</button>
      </div>
    </details>
  </article>
  <article class="card"><h2>이 시험 처음부터 다시</h2>
    <p class="hint">입력한 방식·날짜·메모·확정을 모두 지우고 ${S.examWeek}주차 수업 시간 그대로 다시 배치해요. 시간표·수업일·보강은 그대로예요.</p>
    <div class="row"><button type="button" class="btn small danger editable" id="btnReset">처음 상태로 되돌리기</button></div>
    ${p.reset ? `<div class="result">정말 되돌릴까요? <button type="button" class="btn small danger" id="btnResetYes">되돌리기</button> <button type="button" class="btn small" data-cancel="reset">취소</button></div>` : ''}
  </article>
  <article class="card"><h2>겹침 검사 기준</h2>
    <ul class="plain">
      <li>그날 실제로 열리는 수업으로 검사해요. 예: 2026년 2학기 12/15(화)는 금요일 14주차 수업일이라 금요일 시간표로 봐요.</li>
      <li>보강일에는 보강 수업이 있고, 결강일에는 원래 수업이 없는 것으로 봐요.</li>
      <li>시험 주차 수업은 시험으로 바뀌므로 자리를 옮길 수 있어요. 다른 주차 수업·보강은 고정이에요.</li>
      <li>'과제 대체'나 '시험 없음'으로 정한 과목은 시험 주차에도 원래 시간에 수업하는 것으로 봐요.</li>
      <li>같은 반, 같은 교수님, 같은 강의실이 같은 시간에 겹치면 겹침으로 표시해요. 다른 학과의 강의실 사용은 알 수 없어서 검사하지 않아요.</li>
    </ul>
  </article>`;
}

/** 설정 탭에서 넣은 자료 하나를 지금 시험에 적용 → 결과 문구 */
function applyFound(f) {
  if (f.type === 'timetable') {
    const old = S.exams;
    const unmoved = new Set(S.classes.filter(c => !isMoved(c)).map(c => c.id));
    S.classes = f.classes; S.sources = { ...(S.sources || {}), timetable: f.name }; S.exams = {};
    derive();
    // 같은 수업(id)이면 입력해 둔 방식·메모·확정을 이어받고, 옮기지 않았던 시험은 새 기본 시간으로
    let kept = 0;
    for (const c of S.classes) if (old[c.id]) {
      S.exams[c.id] = old[c.id]; kept++;
      if (unmoved.has(c.id)) Object.assign(S.exams[c.id], { date: defaultDate(c), start: defaultStart(c), len: defaultLen(c), room: defaultRoom(c) });
    }
    refreshRoomList();
    return `시간표를 바꿨어요. 수업 ${S.classes.length}개 중 ${kept}개는 입력해 둔 내용을 이어받았어요.`;
  }
  if (f.type === 'calendar') {
    rebaseUnmoved(() => { S.calendar = f.calendar; S.sources = { ...(S.sources || {}), calendar: f.name }; });
    return `수업일 현황을 바꿨어요 (${f.msg}).`;
  }
  if (f.type === 'makeups') {
    const r = parseMakeups(f.text, S.classes, S.calendar, S.year);
    let added = 0;
    rebaseUnmoved(() => {
      S.makeups = S.makeups || [];
      for (const m of r.makeups) if (!S.makeups.some(x => x.id === m.id)) { S.makeups.push(m); added++; }
      const names = new Set(String(S.sources?.makeups || '').split(', ').filter(Boolean)); names.add(f.name);
      S.sources = { ...(S.sources || {}), makeups: [...names].join(', ') };
    });
    return `보강 ${added}건을 추가했어요${r.makeups.length - added ? ` (이미 있던 ${r.makeups.length - added}건 제외)` : ''}.${r.unmatched.length ? ` 짝을 못 찾은 줄 ${r.unmatched.length}개: ${r.unmatched.map(u => u.line.replace(/\t+/g, ' ')).join(' / ')}` : ''}`;
  }
  return '';
}

/** 설정 탭 '자료 다시 넣기'에 파일들을 넣는다 (파일 고르기·끌어다 놓기 공통) → 종류를 알아보고 적용 버튼을 보여 줌 */
async function setupAddFiles(files) {
  if (!files.length) return;
  if (isLocked()) { toast('보관된 기록이라 자료를 넣을 수 없어요. 먼저 보관을 해제하세요.'); return; }
  if (ui.tab !== 'setup') setTab('setup');
  ui.pending.busy = `파일 ${files.length}개 읽는 중…`; ui.pending.applyMsg = ''; renderSetup();
  const out = [];
  for (const f of files) { const r = await recognizeFile(f); out.push({ ...r }); }
  ui.pending.files = out; ui.pending.busy = '';
  renderSetup();
  $('#sDrop')?.scrollIntoView({ block: 'nearest' });
}
function bindSetup() {
  const sg = $('#setupGrid');
  sg.addEventListener('change', async e => {
    const el = e.target;
    if (isLocked()) return;
    if (el.id === 'sTitle') { S.title = el.value.trim() || S.title; changed(); }
    else if (el.id === 'sDept') { S.dept = el.value.trim() || S.dept; changed(); }
    else if (el.id === 'sFiles' && el.files.length) { const files = [...el.files]; el.value = ''; setupAddFiles(files); }
  });
  sg.addEventListener('click', e => {
    const id = e.target.id;
    const cancel = e.target.dataset && e.target.dataset.cancel;
    if (cancel) { delete ui.pending[cancel]; if (cancel === 'cal') delete ui.pending.calText; renderSetup(); return; }
    if (isLocked()) return;
    const ap = e.target.closest('[data-apply]');
    if (ap) {
      const f = ui.pending.files[+ap.dataset.apply];
      ui.pending.applyMsg = applyFound(f); f.applied = true;
      changed(); toast(ui.pending.applyMsg.split('.')[0] + '.'); return;
    }
    const dm = e.target.closest('[data-delmk]');
    if (dm) { rebaseUnmoved(() => { S.makeups = (S.makeups || []).filter(m => m.id !== dm.dataset.delmk); }); changed(); toast('보강을 지웠어요.'); return; }
    if (id === 'mkAdd') {
      const c = D.byId[$('#mkClass').value], from = $('#mkFrom').value, to = $('#mkTo').value;
      const s = +$('#mkStart').value, en = +$('#mkEnd').value;
      if (!c || !to) { toast('수업과 보강일을 골라 주세요.'); return; }
      if (en < s) { toast('교시 범위를 확인해 주세요.'); return; }
      const m = { id: `${c.id}|${from}|${to}|${s}`, classId: c.id, from, to, start: s, end: en, room: cleanRoom($('#mkRoom').value) || c.room, note: '직접 입력' };
      rebaseUnmoved(() => { S.makeups = (S.makeups || []).filter(x => x.id !== m.id).concat([m]); });
      changed(); toast(`${c.course}(${groupOf(c)}) 보강을 추가했어요.`); return;
    }
    if (id === 'btnWeek') { const w = +$('#sWeek').value; if (w !== S.examWeek) { ui.pending.week = w; renderSetup(); } return; }
    if (id === 'btnWeekYes') { S.examWeek = ui.pending.week; S.exams = {}; S.extraDates = []; delete S.range; delete ui.pending.week; derive(); changed(); toast(`${S.examWeek}주차 기준으로 다시 배치했어요.`); return; }
    if (id === 'btnCal') { ui.pending.calText = $('#sCal').value; ui.pending.cal = parseCalendarText(ui.pending.calText); ui.pending.calYear = +$('#sYear').value || S.year; renderSetup(); return; }
    if (id === 'btnCalYes') {
      const cal = ui.pending.cal.data, yr = ui.pending.calYear || S.year;
      delete ui.pending.cal; delete ui.pending.calText;
      rebaseUnmoved(() => { S.calendar = cal; S.year = yr; });
      for (const c of S.classes) { const ex = S.exams[c.id]; if (!D.dateMap[ex.date] && !(D.makeups || []).some(m => m.to === ex.date)) ex.date = defaultDate(c); }
      changed(); toast('수업일 현황을 바꿨어요.'); return;
    }
    if (id === 'btnReset') { ui.pending.reset = true; renderSetup(); return; }
    if (id === 'btnResetYes') { delete ui.pending.reset; S.exams = {}; S.extraDates = []; delete S.range; derive(); changed(); toast('처음 상태로 되돌렸어요.'); return; }
  });
}
