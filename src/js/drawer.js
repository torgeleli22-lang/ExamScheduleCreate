/* ---------- 오른쪽 서랍: 과목 편집 · 시험 일정 등록 폼 ---------- */
function openDrawer(id) {
  const c = D.byId[id]; if (!c) return;
  ui.drawerId = id; ui.reg = null; ui.sess = null;
  const ex = S.exams[id];
  const dis = hasSlot(ex) ? '' : ' disabled';
  const tm = ex.time || periodTime(ex.start, ex.len);
  const dr = $('#drawer');
  dr.innerHTML = `
    <div class="dhead"><div><h2>${esc(c.course)}</h2><p>${esc(groupOf(c))} · ${esc(c.prof)} · 원래 ${esc(c.day)} ${pRange(c.start, lenOf(c))} ${tRange(c.start, lenOf(c))}, ${esc(roomLabel(c.room))}</p>
      <p><span class="wk wk-exam">${examWeekOf(c)}주차 수업</span> ${fmt(defaultDate(c))} ${pRange(defaultStart(c), defaultLen(c))}${srcSession(c) ? ' <b>시험으로 등록함</b>' : D.examMakeup[c.id] ? (D.examPushed.has(c.id) ? ` (보강으로 밀림, 원래 ${fmt(D.colDates[c.day]?.[S.examWeek - 1])})` : ` (보강, 원래 ${fmt(D.examMakeup[c.id].from)})`) : ''} · ${examWeekOf(c) - 1}주차 수업 ${fmt(prevDate(c))}</p>
      ${srcSession(c) ? `<p class="hint">원래 시험 주차(${S.examWeek}주차) 수업 ${fmt(D.examMakeup[c.id]?.to || D.colDates[c.day]?.[S.examWeek - 1])}은 평소 수업으로 진행해요.</p>` : ''}
      ${isMoved(c) ? `<p class="mvnote">↪ ${examWeekOf(c)}주차 수업을 ${fmt(ex.date)} ${examTime(ex)}(으)로 옮겼어요</p>` : ''}</div>
      <button type="button" class="btn small" id="dClose" aria-label="닫기">닫기</button></div>
    <div class="dbody">
      <div class="fgrid">
        <label class="field full" for="dMethod"><span>시험 방식</span><select id="dMethod" data-f="method">${opts(METHODS, ex.method)}</select></label>
        <label class="field full" for="dDate"><span>날짜</span><select id="dDate" data-f="date"${dis}>${dateOptions(ex.date)}</select></label>
        <label class="field" for="dFrom"><span>시작 시간</span><input type="time" id="dFrom" data-f="tfrom" step="300" value="${esc(tm.from)}"${dis}></label>
        <label class="field" for="dTo"><span>종료 시간</span><input type="time" id="dTo" data-f="tto" step="300" value="${esc(tm.to)}"${dis}></label>
        <div class="field full"><span>교시로 맞추기</span><span class="row prow"><select id="dPStart" data-f="pstart" aria-label="시작 교시"${dis}>${opts(range(1, NP), ex.start, v => `${v}교시 (${PERIODS[v - 1][0]}~)`)}</select> ~
          <select id="dPEnd" data-f="pend" aria-label="끝 교시"${dis}>${opts(range(ex.start, NP), Math.min(NP, ex.start + ex.len - 1), v => `${v}교시 (~${PERIODS[v - 1][1]})`)}</select></span>
          <small class="hint">${hasSlot(ex) ? `${toMin(tm.to) - toMin(tm.from)}분 · ${ex.time ? `직접 정한 시간(${pRange(ex.start, ex.len)}에 걸침) · 겹침은 분 단위로 검사해요` : '교시 시간 그대로'}` : ''}</small></div>
        <label class="field full" for="dRoom"><span>강의실</span><select id="dRoom" data-f="roomsel"${dis}>${roomOptions(ex.room, c, ex)}</select>
          <input type="text" id="dRoomCustom" data-f="room" placeholder="강의실 직접 입력 (예: 남관 515, 산학관 203)" hidden></label>
        <label class="field" for="dDone" style="justify-content:flex-end"><span>교수님 확인</span><span class="chk"><input type="checkbox" id="dDone" data-f="done"${ex.done ? ' checked' : ''}>확정</span></label>
        <label class="field full" for="dNote"><span>요청사항 · 메모</span><textarea id="dNote" data-f="note" rows="3" placeholder="예: 실기 2시간, 노트북 지참, 412호 희망">${esc(ex.note)}</textarea></label>
      </div>
      <div class="dsec"><h3>검사 결과</h3><div class="checks" id="dChecks"></div></div>
      <div class="dsec"><h3>겹치지 않는 시간 <span id="dSlotLen"></span></h3><div class="slots" id="dSlots"></div></div>
      ${hasSlot(ex) ? `<div class="row">${isKept(c)
        ? `<span class="keepnote">✓ 기존 시간표 수업 진행으로 확정됨</span> <button type="button" class="btn small" id="dKeep">확정 취소</button>`
        : isMoved(c) ? `<span class="hint">옮긴 과목은 '기존 시간표 수업 진행'으로 확정할 수 없어요. 원래 시간으로 되돌리면 할 수 있어요.</span>`
        : `<button type="button" class="btn small primary" id="dKeep">기존 시간표 수업 진행으로 확정</button>`}</div>` : ''}
      <div class="row"><button type="button" class="btn small" id="dToReg">시험 일정 등록 창으로</button> <button type="button" class="btn small" id="dReset">${examWeekOf(c)}주차 원래 시간으로 되돌리기</button>${srcSession(c) ? ` <button type="button" class="btn small" id="dSrcReset">${S.examWeek}주차 수업에서 시험 보기</button>` : ''}</div>
    </div>`;
  dr.hidden = false;
  refreshDrawerChecks();
  if (isLocked()) lockControls();
}
function closeDrawer() { ui.drawerId = null; ui.reg = null; ui.sess = null; $('#drawer').hidden = true; $('#drawer').innerHTML = ''; }

/* ---------- 수업 서랍 (시험이 아닌 수업·보강을 옮기거나 시간 고치기) ---------- */
function openSessionDrawer(ref) {
  const cur = sessionOf(ref); if (!cur) return;
  ui.drawerId = null; ui.reg = null; ui.sess = ref;
  const c = cur.c, tm = cur.time || periodTime(cur.start, cur.len), m = cur.m;
  const kind = m && !m.manual ? '보강' : '수업';
  $('#drawer').innerHTML = `
    <div class="dhead"><div><h2>${esc(c.course)}</h2><p>${esc(groupOf(c))} · ${esc(c.prof)} · <span class="wk">${cur.week ? `${cur.week}주차 ` : ''}${kind}</span></p>
      <p>원래 ${fmt(cur.from)} ${pRange(c.start, lenOf(c))} ${tRange(c.start, lenOf(c))}, ${esc(roomLabel(c.room))}</p>
      ${m ? `<p class="mvnote">↪ ${fmt(cur.date)} ${sessionTime(cur)}${m.manual ? '(으)로 옮겼어요' : '에 보강'}</p>` : ''}</div>
      <button type="button" class="btn small" id="dClose" aria-label="닫기">닫기</button></div>
    <div class="dbody">
      <div class="fgrid">
        <label class="field full" for="sxDate"><span>날짜</span><input type="date" id="sxDate" data-s="date" value="${esc(cur.date)}"></label>
        <label class="field" for="sxFrom"><span>시작 시간</span><input type="time" id="sxFrom" data-s="tfrom" step="300" value="${esc(tm.from)}"></label>
        <label class="field" for="sxTo"><span>종료 시간</span><input type="time" id="sxTo" data-s="tto" step="300" value="${esc(tm.to)}"></label>
        <div class="field full"><span>교시로 맞추기</span><span class="row prow"><select id="sxPStart" data-s="pstart" aria-label="시작 교시">${opts(range(1, NP), cur.start, v => `${v}교시 (${PERIODS[v - 1][0]}~)`)}</select> ~
          <select id="sxPEnd" data-s="pend" aria-label="끝 교시">${opts(range(cur.start, NP), Math.min(NP, cur.start + cur.len - 1), v => `${v}교시 (~${PERIODS[v - 1][1]})`)}</select></span></div>
        <label class="field full" for="sxRoom"><span>강의실</span><select id="sxRoom" data-s="room">${roomOptions(cur.room, c, { date: cur.date, start: cur.start, len: cur.len, time: cur.time, self: ref }, { custom: false })}</select></label>
      </div>
      <div class="dsec"><h3>검사 결과</h3><div class="checks" id="sxChecks"></div></div>
      <div class="dsec"><h3>시험으로 등록</h3>
        <p class="hint">${examWeekOf(c) !== S.examWeek || srcSession(c) ? `지금은 ${examWeekOf(c)}주차 수업(${fmt(defaultDate(c))})에서 시험을 봐요. ` : ''}이 ${kind} 시간(${fmt(cur.date)} ${sessionTime(cur)})에 시험을 보려면 누르세요. ${cur.week === S.examWeek && !m ? '시험 주차 수업에서 시험을 보는 기본으로 돌아가요.' : `원래 시험 주차(${S.examWeek}주차) 수업은 평소 수업으로 바뀌어요.`}</p>
        <div class="row"><button type="button" class="btn small primary" id="sxExam">시험으로 등록</button></div></div>
      <div class="row">${m && m.manual ? '<button type="button" class="btn small" id="sxReset">원래 자리로 되돌리기</button>' : ''}${freeWeeks().has(cur.week) ? '' : '<button type="button" class="btn small" id="sxLock">다시 고정하기</button>'}</div>
      <p class="hint">시험이 아닌 ${cur.week ? `${cur.week}주차 ` : ''}${kind}이에요. 옮기거나 시간을 줄인 수업은 보강처럼 기록되고(설정 → 보강), 겹침 검사·엑셀에 그대로 반영돼요.</p>
    </div>`;
  $('#drawer').hidden = false;
  refreshSessionChecks();
  if (isLocked()) lockControls();
}
function refreshSessionChecks() {
  const box = $('#sxChecks'); if (!ui.sess || !box) return;
  const cur = sessionOf(ui.sess); if (!cur) return;
  const cf = conflictsOf(cur.c, { date: cur.date, start: cur.start, len: cur.len, room: cur.room, time: cur.time, self: ui.sess });
  box.innerHTML = [`<div class="it ${cf.length ? 'bad' : 'ok'}">${fmt(cur.date)} ${sessionTime(cur)} (${pRange(cur.start, cur.len)}) · ${esc(roomLabel(cur.room))}${cf.length ? '' : ' · 겹치는 일정 없음'}</div>`,
    ...cf.map(x => `<div class="it bad">${esc(describeConflict(x))}</div>`)].join('');
}
/** 합반 안내 줄: 같은 시간에 한 시험을 보는 다른 반들 */
function combinedLines(list, base) {
  if (!list.length) return [];
  return [`<div class="it ok">합반 시험: ${list.map(x => `${esc(groupOf(x.c))}${base && courseKey(x.c) !== courseKey(base) ? ` ${esc(x.c.course)}` : ''}(${esc(x.c.prof)}, ${esc(roomLabel(x.room))})`).join(', ')}와 같은 시간 · 교수·강의실 겹침으로 보지 않아요</div>`];
}
function refreshDrawerChecks() {
  const id = ui.drawerId, c = D.byId[id]; if (!c || $('#drawer').hidden) return;
  const ex = S.exams[id], st = statusOf(c);
  const box = $('#dChecks'); if (!box) return;
  if (st.noslot) box.innerHTML = `<div class="it ok">${esc(ex.method)}: 시험 시간을 잡지 않아요. 이 과목의 ${S.examWeek}주차 수업은 원래 시간에 하는 것으로 봐요.</div>`;
  else box.innerHTML = [
    `<div class="it ${st.bad.length ? 'bad' : 'ok'}">${fmt(ex.date)} ${examTime(ex)} (${pRange(ex.start, ex.len)}) · ${esc(roomLabel(ex.room))}${st.bad.length ? '' : ' · 겹치는 일정 없음'}</div>`,
    ...combinedLines(st.combined, c),
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
  ui.drawerId = null; ui.sess = null;
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
        ${id ? `<p class="hint full">현재: ${hasSlot(S.exams[id]) ? `${fmt(S.exams[id].date)} ${pRange(S.exams[id].start, S.exams[id].len)} ${examTime(S.exams[id])} · ${esc(roomLabel(S.exams[id].room))}` : esc(S.exams[id].method)} · ${examWeekOf(D.byId[id])}주차 기본 ${fmt(defaultDate(D.byId[id]))} ${pRange(defaultStart(D.byId[id]), defaultLen(D.byId[id]))}</p>` : ''}
        <label class="field full" for="rMethod"><span>시험 방식</span><select id="rMethod" data-r="method"${id ? '' : ' disabled'}>${opts(METHODS, r.method || '미정')}</select></label>
        <label class="field full" for="rDate"><span>날짜</span><select id="rDate" data-r="date"${dis}>${dateOptions(r.date)}</select></label>
        <label class="field" for="rStart"><span>시작 교시</span><select id="rStart" data-r="start"${dis}>${opts(range(1, NP), r.start || 1, v => `${v}교시 (${PERIODS[v - 1][0]})`)}</select></label>
        <label class="field" for="rLen"><span>시험 길이</span><select id="rLen" data-r="len"${dis}>${opts(range(1, 6), r.len || 2, v => `${v}교시 (${v * 50}분)`)}</select></label>
        <label class="field full" for="rRoom"><span>강의실</span><select id="rRoom" data-r="room"${dis}>${roomOptions(r.room || '', id ? D.byId[id] : null, r.date ? { date: r.date, start: r.start || 1, len: r.len || 2 } : null)}</select>
          <input type="text" id="rRoomCustom" data-r="roomtext" placeholder="강의실 직접 입력 (예: 남관 515, 산학관 203)" hidden></label>
        <label class="field full" for="rNote"><span>요청사항 · 메모</span><textarea id="rNote" data-r="note" rows="2"${id ? '' : ' disabled'}>${esc(r.note || '')}</textarea></label>
      </div>
      <div class="dsec"><h3>등록하면 이렇게 돼요</h3><div class="checks" id="rChecks"></div></div>
      <div class="row"><button type="button" class="btn primary" id="rSave"${id ? '' : ' disabled'}>등록</button>
        ${id ? `<button type="button" class="btn small" id="rDefault">${examWeekOf(D.byId[id])}주차 원래 시간 넣기</button>` : ''}</div>
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
  const rs = $('#rRoom'); if (rs && rs.value !== '__custom') rs.innerHTML = roomOptions(p.room, c, p);
  const cf = conflictsOf(c, p), wn = warningsOf(c, p);
  box.innerHTML = [`<div class="it ${cf.length ? 'bad' : 'ok'}">${fmt(p.date)} ${pRange(p.start, p.len)} ${tRange(p.start, p.len)} · ${esc(roomLabel(p.room))}${cf.length ? '' : ' · 겹치는 일정 없음'}</div>`,
    ...combinedLines(combinedAt(c, p), c), ...cf.map(x => `<div class="it bad">${esc(describeConflict(x))}</div>`), ...wn.map(w => `<div class="it warn">${esc(w)}</div>`)].join('');
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
    if (ui.sess && e.target.dataset.s) {          // 수업 서랍
      const k = e.target.dataset.s, cur = sessionOf(ui.sess); if (!cur) return;
      let patch = null;
      if (k === 'date') { if (!e.target.value) return; patch = { date: e.target.value }; }
      else if (k === 'tfrom' || k === 'tto') {
        const t = { start: cur.start, len: cur.len };
        if (!setExamTime(t, $('#sxFrom').value, $('#sxTo').value)) { toast('종료 시간이 시작 시간보다 늦어야 해요.'); openSessionDrawer(ui.sess); return; }
        patch = { start: t.start, len: t.len, time: t.time || null };
      } else if (k === 'pstart' || k === 'pend') { const s = +$('#sxPStart').value, en = Math.max(s, +$('#sxPEnd').value); patch = { start: s, len: en - s + 1, time: null }; }
      else if (k === 'room') patch = { room: e.target.value };
      if (!patch) return;
      ui.sess = applySession(ui.sess, patch);
      (ui.unlocked = ui.unlocked || new Set()).add(sessionKey(ui.sess));
      changed(); openSessionDrawer(ui.sess); return;
    }
    if (ui.reg && e.target.dataset.r) {
      const k = e.target.dataset.r, v = e.target.value;
      if (k === 'id') { openRegister(v); return; }
      if (k === 'room' && v === '__custom') { const t = $('#rRoomCustom'); t.hidden = false; t.focus(); return; }
      if (k === 'roomtext') { ui.reg.room = cleanRoom(v); refreshRegister(); return; }
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
    if (f === 'roomsel') {                        // 강의실 고르기 (직접 입력…은 칸을 보여 줌)
      if (el.value === '__custom') { const t = $('#dRoomCustom'); t.hidden = false; t.focus(); return; }
      setExamField(ui.drawerId, 'room', el.value); changed(); openDrawer(ui.drawerId); return;
    }
    if (f === 'room') { if (!cleanRoom(el.value)) return; setExamField(ui.drawerId, 'room', el.value); changed(); openDrawer(ui.drawerId); return; }
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
    if (ui.reg && e.target.dataset.r === 'roomtext') { ui.reg.room = cleanRoom(e.target.value); return; }
    if (e.target.dataset.f !== 'note' || !ui.drawerId) return;
    S.exams[ui.drawerId].note = e.target.value;
    clearTimeout(noteT); noteT = setTimeout(() => changed({ noRender: true }), 500);
  });
  dr.addEventListener('focusout', e => { if (!isLocked() && e.target.dataset && e.target.dataset.f === 'note') { clearTimeout(noteT); changed(); } });
  dr.addEventListener('click', e => {
    if (e.target.closest('#dClose')) { closeDrawer(); return; }
    if (e.target.closest('#sxLock') && ui.sess) { relockSession(ui.sess); return; }
    if (e.target.closest('#sxExam') && ui.sess && !isLocked()) {
      const cur = sessionOf(ui.sess); if (!cur) return;
      const c = cur.c;
      registerAsExam(ui.sess); changed(); openDrawer(c.id);
      toast(srcSession(c) ? `${c.course}(${groupOf(c)}) ${examWeekOf(c)}주차 수업을 시험으로 등록했어요. ${S.examWeek}주차 수업은 평소 수업으로 바뀌어요.` : `${c.course}(${groupOf(c)}) 시험을 ${S.examWeek}주차 수업에서 봐요.`);
      return;
    }
    if (e.target.closest('#sxReset') && ui.sess && !isLocked()) {
      const cur = sessionOf(ui.sess);
      ui.sess = applySession(ui.sess, { date: cur.from, start: cur.c.start, len: lenOf(cur.c), time: null, room: cur.c.room });
      (ui.unlocked = ui.unlocked || new Set()).add(sessionKey(ui.sess));
      changed(); openSessionDrawer(ui.sess); toast('원래 자리로 되돌렸어요.'); return;
    }
    if (isLocked()) return;
    if (e.target.closest('#dToReg')) { openRegister(ui.drawerId); return; }
    if (e.target.closest('#rSave')) { saveRegister(); return; }
    if (e.target.closest('#rDefault')) { const c = D.byId[ui.reg.id]; Object.assign(ui.reg, { date: defaultDate(c), start: defaultStart(c), len: defaultLen(c), room: defaultRoom(c) }); openRegisterValues(); return; }
    const rs = e.target.closest('[data-rslot]');
    if (rs) { const [d, st] = rs.dataset.rslot.split('|'); ui.reg.date = d; ui.reg.start = +st; openRegisterValues(); return; }
    if (e.target.closest('#dReset')) { const c = D.byId[ui.drawerId], ex = S.exams[ui.drawerId], t = defaultTime(c); ex.date = defaultDate(c); ex.start = defaultStart(c); ex.len = defaultLen(c); ex.room = defaultRoom(c); if (t) ex.time = { ...t }; else delete ex.time; changed(); openDrawer(ui.drawerId); return; }
    if (e.target.closest('#dSrcReset')) {
      const c = D.byId[ui.drawerId], w = examWeekOf(c);
      clearExamSrc(c); changed(); openDrawer(c.id);
      toast(`${c.course}(${groupOf(c)}) 시험을 ${S.examWeek}주차 수업에서 봐요. ${w}주차 수업은 평소 수업으로 돌아갔어요.`); return;
    }
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
