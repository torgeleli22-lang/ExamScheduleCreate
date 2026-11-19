/* ---------- 오른쪽 서랍: 과목 편집 · 시험 일정 등록 폼 ---------- */
function openDrawer(id) {
  const c = D.byId[id]; if (!c) return;
  ui.drawerId = id; ui.reg = null;
  const ex = S.exams[id];
  const dis = hasSlot(ex) ? '' : ' disabled';
  const tm = ex.time || periodTime(ex.start, ex.len);
  const dr = $('#drawer');
  dr.innerHTML = `
    <div class="dhead"><div><h2>${esc(c.course)}</h2><p>${esc(groupOf(c))} · ${esc(c.prof)} · 원래 ${esc(c.day)} ${pRange(c.start, lenOf(c))} ${tRange(c.start, lenOf(c))}, ${esc(roomLabel(c.room))}</p>
      <p><span class="wk wk-exam">${S.examWeek}주차 수업</span> ${fmt(defaultDate(c))} ${pRange(defaultStart(c), defaultLen(c))}${D.examMakeup[c.id] ? (D.examPushed.has(c.id) ? ` (보강으로 밀림, 원래 ${fmt(D.colDates[c.day]?.[S.examWeek - 1])})` : ` (보강, 원래 ${fmt(D.examMakeup[c.id].from)})`) : ''} · ${S.examWeek - 1}주차 수업 ${fmt(prevDate(c))}</p>
      ${isMoved(c) ? `<p class="mvnote">↪ ${S.examWeek}주차 수업을 ${fmt(ex.date)} ${examTime(ex)}(으)로 옮겼어요</p>` : ''}</div>
      <button type="button" class="btn small" id="dClose" aria-label="닫기">닫기</button></div>
    <div class="dbody">
      <div class="fgrid">
        <label class="field full" for="dMethod"><span>시험 방식</span><select id="dMethod" data-f="method">${opts(METHODS, ex.method)}</select></label>
        <label class="field full" for="dDate"><span>날짜</span><select id="dDate" data-f="date"${dis}>${dateOptions(ex.date)}</select></label>
        <label class="field" for="dFrom"><span>시작 시간</span><input type="time" id="dFrom" data-f="tfrom" step="300" value="${esc(tm.from)}"${dis}></label>
        <label class="field" for="dTo"><span>종료 시간</span><input type="time" id="dTo" data-f="tto" step="300" value="${esc(tm.to)}"${dis}></label>
        <div class="field full"><span>교시로 맞추기</span><span class="row prow"><select id="dPStart" data-f="pstart" aria-label="시작 교시"${dis}>${opts(range(1, NP), ex.start, v => `${v}교시 (${PERIODS[v - 1][0]}~)`)}</select> ~
          <select id="dPEnd" data-f="pend" aria-label="끝 교시"${dis}>${opts(range(ex.start, NP), Math.min(NP, ex.start + ex.len - 1), v => `${v}교시 (~${PERIODS[v - 1][1]})`)}</select></span>
          <small class="hint">${hasSlot(ex) ? `${toMin(tm.to) - toMin(tm.from)}분 · ${ex.time ? `직접 정한 시간 · 겹침은 ${pRange(ex.start, ex.len)} 기준으로 검사해요` : '교시 시간 그대로'}` : ''}</small></div>
        <label class="field" for="dRoom"><span>강의실</span><input type="text" id="dRoom" data-f="room" value="${esc(ex.room)}" list="roomList"${dis}></label>
        <label class="field" for="dDone" style="justify-content:flex-end"><span>교수님 확인</span><span class="chk"><input type="checkbox" id="dDone" data-f="done"${ex.done ? ' checked' : ''}>확정</span></label>
        <label class="field full" for="dNote"><span>요청사항 · 메모</span><textarea id="dNote" data-f="note" rows="3" placeholder="예: 실기 2시간, 노트북 지참, 412호 희망">${esc(ex.note)}</textarea></label>
      </div>
      <div class="dsec"><h3>검사 결과</h3><div class="checks" id="dChecks"></div></div>
      <div class="dsec"><h3>겹치지 않는 시간 <span id="dSlotLen"></span></h3><div class="slots" id="dSlots"></div></div>
      ${hasSlot(ex) ? `<div class="row">${isKept(c)
        ? `<span class="keepnote">✓ 기존 시간표 수업 진행으로 확정됨</span> <button type="button" class="btn small" id="dKeep">확정 취소</button>`
        : isMoved(c) ? `<span class="hint">옮긴 과목은 '기존 시간표 수업 진행'으로 확정할 수 없어요. 원래 시간으로 되돌리면 할 수 있어요.</span>`
        : `<button type="button" class="btn small primary" id="dKeep">기존 시간표 수업 진행으로 확정</button>`}</div>` : ''}
      <div class="row"><button type="button" class="btn small" id="dToReg">시험 일정 등록 창으로</button> <button type="button" class="btn small" id="dReset">${S.examWeek}주차 원래 시간으로 되돌리기</button></div>
    </div>`;
  dr.hidden = false;
  refreshDrawerChecks();
  if (isLocked()) lockControls();
}
function closeDrawer() { ui.drawerId = null; ui.reg = null; $('#drawer').hidden = true; $('#drawer').innerHTML = ''; }
/** 합반 안내 줄: 같은 시간에 한 시험을 보는 다른 반들 */
function combinedLines(list) {
  if (!list.length) return [];
  return [`<div class="it ok">합반 시험: ${list.map(x => `${esc(groupOf(x.c))}(${esc(x.c.prof)}, ${esc(roomLabel(x.room))})`).join(', ')}와 같은 시간 · 교수·강의실 겹침으로 보지 않아요</div>`];
}
function refreshDrawerChecks() {
  const id = ui.drawerId, c = D.byId[id]; if (!c || $('#drawer').hidden) return;
  const ex = S.exams[id], st = statusOf(c);
  const box = $('#dChecks'); if (!box) return;
  if (st.noslot) box.innerHTML = `<div class="it ok">${esc(ex.method)}: 시험 시간을 잡지 않아요. 이 과목의 ${S.examWeek}주차 수업은 원래 시간에 하는 것으로 봐요.</div>`;
  else box.innerHTML = [
    `<div class="it ${st.bad.length ? 'bad' : 'ok'}">${fmt(ex.date)} ${examTime(ex)} (${pRange(ex.start, ex.len)}) · ${esc(roomLabel(ex.room))}${st.bad.length ? '' : ' · 겹치는 일정 없음'}</div>`,
    ...combinedLines(st.combined),
    ...st.bad.map(x => `<div class="it bad">${esc(describeConflict(x))}</div>`),
    ...st.warn.map(w => `<div class="it warn">${esc(w)}</div>`)].join('');
  const slotsEl = $('#dSlots');
  $('#dSlotLen').textContent = st.noslot ? '' : `(${ex.len}교시 기준)`;
  if (st.noslot) { slotsEl.innerHTML = ''; return; }
  const def = defaultDate(c);
  const fs = freeSlots(c, ex.len, ex.room);
  slotsEl.innerHTML = fs.length ? fs.map(x => `<div class="slotday"><div class="lbl"><b>${fmt(x.d)}</b>${x.d === def ? ' 기본' : ''}<br>${esc(D.dateMap[x.d] ? `${D.dateMap[x.d].col}${D.dateMap[x.d].week}주차` : '')}</div>
      <div class="opts">${x.starts.map(s => `<button type="button" class="slotbtn${x.d === ex.date && s === ex.start ? ' cur' : ''}" data-slot="${x.d}|${s}" title="${tRange(s, ex.len)}">${pRange(s, ex.len)}</button>`).join('')}</div></div>`).join('')
    : '<p class="hint">이 길이로는 겹치지 않는 시간이 없어요. 시험 길이를 줄이거나 강의실을 바꿔 보세요.</p>';
}
function setExamField(id, f, raw) {
  const ex = S.exams[id]; if (!ex) return;
  if (f === 'date' || f === 'start') ex.keep = false;
  if (f === 'start' || f === 'len') { ex[f] = Math.max(1, Math.min(NP, parseInt(raw, 10) || 1)); delete ex.time; }
  else if (f === 'done') ex.done = !!raw;
  else if (f === 'room') ex.room = String(raw).replace(/호/g, '').trim();
  else ex[f] = String(raw);
}

/* ---------- register form ---------- */
function openRegister(preId) {
  const id = preId || ui.reg?.id || '';
  ui.drawerId = null;
  ui.reg = { id };
  if (id) { const ex = S.exams[id]; Object.assign(ui.reg, { method: ex.method, date: ex.date, start: ex.start, len: ex.len, room: ex.room, note: ex.note }); }
  const r = ui.reg;
  const courseOpts = D.groups.map(g => `<optgroup label="${esc(g)}">${S.classes.filter(c => groupOf(c) === g).sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day) || a.start - b.start)
    .map(c => `<option value="${esc(c.id)}"${c.id === id ? ' selected' : ''}>${esc(g)} ${esc(c.course)} (${esc(c.prof)}) · ${esc(c.day)} ${c.start}교시</option>`).join('')}</optgroup>`).join('');
  const dis = id && hasSlot(r) ? '' : ' disabled';
  $('#drawer').innerHTML = `
    <div class="dhead"><div><h2>시험 일정 등록</h2><p>과목을 고르고 날짜·시간을 정한 뒤 등록을 누르세요. 등록 전에 겹침을 미리 보여 드려요.</p></div>
      <button type="button" class="btn small" id="dClose">닫기</button></div>
    <div class="dbody">
      <div class="fgrid">
        <label class="field full" for="rCourse"><span>과목</span><select id="rCourse" data-r="id"><option value="">과목 선택</option>${courseOpts}</select></label>
        ${id ? `<p class="hint full">현재: ${hasSlot(S.exams[id]) ? `${fmt(S.exams[id].date)} ${pRange(S.exams[id].start, S.exams[id].len)} ${examTime(S.exams[id])} · ${esc(roomLabel(S.exams[id].room))}` : esc(S.exams[id].method)} · ${S.examWeek}주차 기본 ${fmt(defaultDate(D.byId[id]))} ${pRange(defaultStart(D.byId[id]), defaultLen(D.byId[id]))}</p>` : ''}
        <label class="field full" for="rMethod"><span>시험 방식</span><select id="rMethod" data-r="method"${id ? '' : ' disabled'}>${opts(METHODS, r.method || '미정')}</select></label>
        <label class="field full" for="rDate"><span>날짜</span><select id="rDate" data-r="date"${dis}>${dateOptions(r.date)}</select></label>
        <label class="field" for="rStart"><span>시작 교시</span><select id="rStart" data-r="start"${dis}>${opts(range(1, NP), r.start || 1, v => `${v}교시 (${PERIODS[v - 1][0]})`)}</select></label>
        <label class="field" for="rLen"><span>시험 길이</span><select id="rLen" data-r="len"${dis}>${opts(range(1, 6), r.len || 2, v => `${v}교시 (${v * 50}분)`)}</select></label>
        <label class="field full" for="rRoom"><span>강의실</span><input type="text" id="rRoom" data-r="room" value="${esc(r.room || '')}" list="roomList"${dis}></label>
        <label class="field full" for="rNote"><span>요청사항 · 메모</span><textarea id="rNote" data-r="note" rows="2"${id ? '' : ' disabled'}>${esc(r.note || '')}</textarea></label>
      </div>
      <div class="dsec"><h3>등록하면 이렇게 돼요</h3><div class="checks" id="rChecks"></div></div>
      <div class="row"><button type="button" class="btn primary" id="rSave"${id ? '' : ' disabled'}>등록</button>
        ${id ? `<button type="button" class="btn small" id="rDefault">${S.examWeek}주차 원래 시간 넣기</button>` : ''}</div>
      <div class="dsec"><h3>겹치지 않는 시간 <span class="hint">(누르면 위 칸에 채워져요)</span></h3><div class="slots" id="rSlots"></div></div>
    </div>`;
  $('#drawer').hidden = false;
  refreshRegister();
}
function openRegisterValues() {
  const keep = { ...ui.reg };
  openRegister(keep.id);
  Object.assign(ui.reg, keep);
  const set = (sel, v) => { const el = $(sel); if (el && v !== undefined) el.value = String(v); };
  set('#rMethod', keep.method); set('#rDate', keep.date); set('#rStart', keep.start); set('#rLen', keep.len); set('#rRoom', keep.room); set('#rNote', keep.note);
  const dis = NO_SLOT.has(keep.method);
  ['#rDate', '#rStart', '#rLen', '#rRoom'].forEach(s => { const el = $(s); if (el) el.disabled = dis; });
  refreshRegister();
}
function refreshRegister() {
  const r = ui.reg; if (!r) return;
  const box = $('#rChecks'), sl = $('#rSlots'); if (!box) return;
  if (!r.id) { box.innerHTML = '<div class="it warn">과목을 먼저 골라 주세요.</div>'; sl.innerHTML = ''; return; }
  const c = D.byId[r.id];
  if (NO_SLOT.has(r.method)) { box.innerHTML = `<div class="it ok">${esc(r.method)}: 시험 시간을 잡지 않아요.</div>`; sl.innerHTML = ''; return; }
  const p = { date: r.date, start: +r.start, len: +r.len, room: String(r.room || '').replace(/호/g, '').trim() };
  const cf = conflictsOf(c, p), wn = warningsOf(c, p);
  box.innerHTML = [`<div class="it ${cf.length ? 'bad' : 'ok'}">${fmt(p.date)} ${pRange(p.start, p.len)} ${tRange(p.start, p.len)} · ${esc(roomLabel(p.room))}${cf.length ? '' : ' · 겹치는 일정 없음'}</div>`,
    ...combinedLines(combinedAt(c, p)), ...cf.map(x => `<div class="it bad">${esc(describeConflict(x))}</div>`), ...wn.map(w => `<div class="it warn">${esc(w)}</div>`)].join('');
  const fs = freeSlots(c, p.len, p.room), def = defaultDate(c);
  sl.innerHTML = fs.length ? fs.map(x => `<div class="slotday"><div class="lbl"><b>${fmt(x.d)}</b>${x.d === def ? ' 기본' : ''}<br>${esc(D.dateMap[x.d] ? `${D.dateMap[x.d].col}${D.dateMap[x.d].week}주차` : '')}</div>
    <div class="opts">${x.starts.map(s => `<button type="button" class="slotbtn${x.d === p.date && s === p.start ? ' cur' : ''}" data-rslot="${x.d}|${s}">${pRange(s, p.len)}</button>`).join('')}</div></div>`).join('')
    : '<p class="hint">이 길이로는 겹치지 않는 시간이 없어요.</p>';
}
function saveRegister() {
  const r = ui.reg; if (!r || !r.id) return;
  const c = D.byId[r.id], ex = S.exams[r.id];
  ex.method = r.method; ex.note = r.note || '';
  if (!NO_SLOT.has(r.method)) { ex.date = r.date; ex.start = +r.start; ex.len = +r.len; ex.room = cleanRoom(r.room); delete ex.time; }
  if (isMoved(c)) ex.keep = false;
  changed();
  const n = hasSlot(ex) ? conflictsOf(c, { date: ex.date, start: ex.start, len: ex.len, room: ex.room }).length : 0;
  toast(`${c.course}(${groupOf(c)}) 등록: ${hasSlot(ex) ? `${fmt(ex.date)} ${pRange(ex.start, ex.len)}` : ex.method}${n ? ` · 겹침 ${n}건` : ''}`);
  openRegister(r.id);
}

function bindDrawer() {
  const dr = $('#drawer');
  dr.addEventListener('change', e => {
    if (isLocked()) return;
    if (ui.reg && e.target.dataset.r) {
      const k = e.target.dataset.r, v = e.target.value;
      if (k === 'id') { openRegister(v); return; }
      ui.reg[k] = v;
      if (k === 'method') { const keep = { ...ui.reg }; openRegister(keep.id); Object.assign(ui.reg, keep); openRegisterValues(); return; }
      refreshRegister(); return;
    }
    const el = e.target, f = el.dataset.f; if (!f || !ui.drawerId) return;
    if (f === 'note') return;
    const ex = S.exams[ui.drawerId];
    if (f === 'tfrom' || f === 'tto') {          // 시작·종료 시간 직접
      const from = $('#dFrom').value, to = $('#dTo').value;
      if (!from || !to) return;
      if (!setExamTime(ex, from, to)) { toast('종료 시간이 시작 시간보다 늦어야 해요.'); openDrawer(ui.drawerId); return; }
      changed(); openDrawer(ui.drawerId); return;
    }
    if (f === 'pstart' || f === 'pend') {         // 교시로 맞추기
      const s = +$('#dPStart').value, e2 = Math.max(s, +$('#dPEnd').value);
      ex.start = s; ex.len = e2 - s + 1; delete ex.time;
      changed(); openDrawer(ui.drawerId); return;
    }
    setExamField(ui.drawerId, f, el.type === 'checkbox' ? el.checked : el.value);
    changed();
    if (f === 'method') openDrawer(ui.drawerId);
  });
  let noteT = null;
  dr.addEventListener('input', e => {
    if (isLocked()) return;
    if (ui.reg && e.target.dataset.r === 'note') { ui.reg.note = e.target.value; return; }
    if (ui.reg && e.target.dataset.r === 'room') { ui.reg.room = e.target.value; refreshRegister(); return; }
    if (e.target.dataset.f !== 'note' || !ui.drawerId) return;
    S.exams[ui.drawerId].note = e.target.value;
    clearTimeout(noteT); noteT = setTimeout(() => changed({ noRender: true }), 500);
  });
  dr.addEventListener('focusout', e => { if (!isLocked() && e.target.dataset && e.target.dataset.f === 'note') { clearTimeout(noteT); changed(); } });
  dr.addEventListener('click', e => {
    if (e.target.closest('#dClose')) { closeDrawer(); return; }
    if (isLocked()) return;
    if (e.target.closest('#dToReg')) { openRegister(ui.drawerId); return; }
    if (e.target.closest('#rSave')) { saveRegister(); return; }
    if (e.target.closest('#rDefault')) { const c = D.byId[ui.reg.id]; Object.assign(ui.reg, { date: defaultDate(c), start: defaultStart(c), len: defaultLen(c), room: defaultRoom(c) }); openRegisterValues(); return; }
    const rs = e.target.closest('[data-rslot]');
    if (rs) { const [d, st] = rs.dataset.rslot.split('|'); ui.reg.date = d; ui.reg.start = +st; openRegisterValues(); return; }
    if (e.target.closest('#dReset')) { const c = D.byId[ui.drawerId], ex = S.exams[ui.drawerId]; ex.date = defaultDate(c); ex.start = defaultStart(c); ex.len = defaultLen(c); ex.room = defaultRoom(c); delete ex.time; changed(); openDrawer(ui.drawerId); return; }
    if (e.target.closest('#dKeep')) {
      const c = D.byId[ui.drawerId], ex = S.exams[ui.drawerId];
      if (isKept(c)) { ex.keep = false; ex.done = false; } else if (!isMoved(c)) { ex.keep = true; ex.done = true; }
      changed(); openDrawer(ui.drawerId);
      toast(ex.keep ? `${c.course}(${groupOf(c)}): 기존 시간표 수업 진행으로 확정했어요.` : `${c.course}(${groupOf(c)}) 확정을 취소했어요.`); return;
    }
    const sb = e.target.closest('[data-slot]');
    if (sb) { const [d, s] = sb.dataset.slot.split('|'); const ex = S.exams[ui.drawerId]; ex.date = d; moveExamStart(ex, +s); ex.keep = false; changed(); openDrawer(ui.drawerId); }
  });
}
