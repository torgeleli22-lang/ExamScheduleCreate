/* ---------- 날짜별 시간표 드래그 (pointer 이벤트, 같은 반 줄 안에서만, 위아래·좌우 가장자리 자동 스크롤) ---------- */
let drag = null;
function clearHighlight() { $$('.cell.ok,.cell.bad').forEach(el => el.classList.remove('ok', 'bad')); }
function dragTarget(x, y) {
  const el = document.elementFromPoint(x, y);
  const cell = el && el.closest ? el.closest('.cell') : null;
  if (cell) return { date: cell.dataset.date, group: cell.dataset.group, p: +cell.dataset.p, track: cell.parentElement };
  return null;
}
function onDragMove(e) {
  if (!drag) return;
  if (!drag.started) {
    if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return;
    drag.started = true;
    document.body.classList.add('dragging');
    drag.el.classList.add('src');
    const r = drag.el.getBoundingClientRect();
    const g = drag.el.cloneNode(true);
    g.classList.add('ghost'); g.classList.remove('src');
    g.style.width = r.width + 'px'; g.style.height = r.height + 'px'; g.style.gridColumn = ''; g.style.gridRow = '';
    document.body.appendChild(g);
    drag.ghost = g; drag.dx = drag.x0 - r.left; drag.dy = drag.y0 - r.top;
  }
  drag.lastX = e.clientX; drag.lastY = e.clientY;
  drag.ghost.style.left = (e.clientX - drag.dx) + 'px';
  drag.ghost.style.top = (e.clientY - drag.dy) + 'px';
  if (!drag.raf) drag.raf = requestAnimationFrame(autoScroll);
  updateTarget(e.clientX, e.clientY);
}
function autoScroll() {
  if (!drag || !drag.started) return;
  const y = drag.lastY, edge = 80;
  let dy = 0;
  if (y < edge) dy = -Math.ceil((edge - y) / 3); else if (y > window.innerHeight - edge) dy = Math.ceil((y - (window.innerHeight - edge)) / 3);
  if (dy) { const before = window.scrollY; window.scrollBy(0, dy); if (window.scrollY !== before) updateTarget(drag.lastX, drag.lastY); }
  // 날짜별 시간표의 주 줄(가로): 좌우 가장자리로 끌면 옆 날짜로 넘어감
  const strip = [...document.querySelectorAll('#board .weekdays')].find(el => { const r = el.getBoundingClientRect(); return y >= r.top && y <= r.bottom; });
  const sr = strip && strip.getBoundingClientRect();
  if (sr) {
    const x = drag.lastX, hedge = 70;
    let dx = 0;
    if (x < sr.left + hedge) dx = -Math.ceil((sr.left + hedge - x) / 6); else if (x > sr.right - hedge) dx = Math.ceil((x - (sr.right - hedge)) / 6);
    if (dx) { const b = strip.scrollLeft; strip.scrollLeft += dx; if (strip.scrollLeft !== b) updateTarget(drag.lastX, drag.lastY); }
  }
  drag.raf = requestAnimationFrame(autoScroll);
}
function updateTarget(x, y) {
  clearHighlight();
  const e = { clientX: x, clientY: y };
  const t = dragTarget(e.clientX, e.clientY);
  const tip = $('#dragTip');
  if (drag.kind === 'session') { updateSessionTarget(t, e, tip); return; }
  const c = D.byId[drag.id], ex = S.exams[drag.id];
  drag.target = null;
  if (!t) { tip.hidden = true; return; }
  if (t.group !== groupOf(c)) {
    tip.hidden = false; tip.textContent = `${groupOf(c)} 줄 안에서만 옮길 수 있어요`;
  } else {
    const start = Math.max(1, Math.min(NP - ex.len + 1, t.p - drag.grabP));
    const place = { date: t.date, start, len: ex.len, room: ex.room };
    const cf = conflictsOf(c, place), wn = warningsOf(c, place);
    const cls = cf.length ? 'bad' : 'ok';
    $$('.cell', t.track).forEach(el => { const p = +el.dataset.p; if (p >= start && p < start + ex.len) el.classList.add(cls); });
    drag.target = place;
    tip.hidden = false;
    const cb = combinedAt(c, place);
    const tt = { ...ex }; moveExamStart(tt, start);
    tip.textContent = `${fmt(t.date)} ${pRange(start, ex.len)} ${examTime(tt)}` + (cf.length ? '\n' + cf.map(describeConflict).join('\n') : ' · 겹침 없음') + (cb.length ? `\n합반: ${combinedLabel(cb)}와 같은 시간에 한 시험` : '') + (wn.length ? '\n' + wn.join('\n') : '');
  }
  tip.style.whiteSpace = 'pre-line';
  tip.style.left = Math.min(window.innerWidth - 330, e.clientX + 14) + 'px';
  tip.style.top = (e.clientY + 18) + 'px';
}
function endDrag(e, cancelled) {
  if (!drag) return;
  const d = drag; drag = null;
  if (d.raf) cancelAnimationFrame(d.raf);
  window.removeEventListener('pointermove', onDragMove);
  window.removeEventListener('pointerup', onUp);
  window.removeEventListener('pointercancel', onCancel);
  clearHighlight();
  $('#dragTip').hidden = true;
  document.body.classList.remove('dragging');
  if (d.ghost) d.ghost.remove();
  if (d.el) d.el.classList.remove('src');
  if (cancelled) return;
  if (d.kind === 'session') { endSessionDrag(d); return; }
  if (!d.started) { openDrawer(d.id); return; }
  if (d.target) {
    const ex = S.exams[d.id];
    if (ex.date !== d.target.date || ex.start !== d.target.start) {
      const before = `${fmt(ex.date)} ${examTime(ex)}`;
      ex.date = d.target.date; moveExamStart(ex, d.target.start); ex.keep = false;
      changed();
      const c = D.byId[d.id];
      const n = conflictsOf(c, { date: ex.date, start: ex.start, len: ex.len, room: ex.room }).length;
      toast(`${c.course}(${groupOf(c)}) ${before} → ${fmt(ex.date)} ${examTime(ex)}${n ? ` · 겹침 ${n}건` : ''}`);
    }
  }
}
const onUp = e => endDrag(e, false);
const onCancel = e => endDrag(e, true);

/* ---------- 수업(시험 아닌) 끌기 ----------
   8·15주차 수업·직접 옮긴 수업은 바로, 다른 주차 수업은 꾹 눌러(LONG_PRESS_MS) 푼 뒤. 놓으면 applySession()으로 기록 */
const LONG_PRESS_MS = 600;
function sessionDragFrom(el, e) {
  const ref = { cid: el.dataset.cid, from: el.dataset.from, mkId: el.dataset.mk || null };
  const cur = sessionOf(ref); if (!cur) return null;
  const r = el.getBoundingClientRect();
  const grabP = Math.max(0, Math.min(cur.len - 1, Math.floor((e.clientX - r.left) / (r.width / cur.len))));
  return { kind: 'session', ref, el, x0: e.clientX, y0: e.clientY, started: false, grabP };
}
function listenDrag() {
  window.addEventListener('pointermove', onDragMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
}
function beginSessionDrag(el, e) { drag = sessionDragFrom(el, e); if (drag) listenDrag(); }
function updateSessionTarget(t, e, tip) {
  const cur = sessionOf(drag.ref), c = cur.c;
  drag.target = null;
  if (!t) { tip.hidden = true; return; }
  if (t.group !== groupOf(c)) { tip.hidden = false; tip.textContent = `${groupOf(c)} 줄 안에서만 옮길 수 있어요`; }
  else {
    const start = Math.max(1, Math.min(NP - cur.len + 1, t.p - drag.grabP));
    const place = { date: t.date, start, len: cur.len, room: cur.room, self: drag.ref };
    const cf = conflictsOf(c, place);
    $$('.cell', t.track).forEach(el => { const p = +el.dataset.p; if (p >= start && p < start + cur.len) el.classList.add(cf.length ? 'bad' : 'ok'); });
    drag.target = place;
    const tt = { start: cur.start, len: cur.len, time: cur.time }; moveExamStart(tt, start);
    tip.hidden = false;
    tip.textContent = `${cur.week ? `${cur.week}주차 ` : ''}수업 → ${fmt(t.date)} ${pRange(start, cur.len)} ${sessionTime(tt)}` + (cf.length ? '\n' + cf.map(describeConflict).join('\n') : ' · 겹침 없음');
  }
  tip.style.whiteSpace = 'pre-line';
  tip.style.left = Math.min(window.innerWidth - 330, e.clientX + 14) + 'px';
  tip.style.top = (e.clientY + 18) + 'px';
}
function endSessionDrag(d) {
  if (!d.started) { if (d.justUnlocked) render(); else openSessionDrawer(d.ref); return; }
  if (!d.target) return;
  const cur = sessionOf(d.ref);
  if (cur.date === d.target.date && cur.start === d.target.start) return;
  const before = `${fmt(cur.date)} ${sessionTime(cur)}`;
  const tt = { start: cur.start, len: cur.len, time: cur.time }; moveExamStart(tt, d.target.start);
  const ref = applySession(d.ref, { date: d.target.date, start: tt.start, len: tt.len, time: tt.time || null });
  (ui.unlocked = ui.unlocked || new Set()).add(sessionKey(ref));
  changed();
  const now = sessionOf(ref);
  const n = conflictsOf(now.c, { date: now.date, start: now.start, len: now.len, room: now.room, self: ref }).length;
  toast(`${now.c.course}(${groupOf(now.c)}) ${now.week ? `${now.week}주차 ` : ''}수업 ${before} → ${fmt(now.date)} ${sessionTime(now)}${n ? ` · 겹침 ${n}건` : ''}`);
}
/* 꾹 누르기: 고정된 수업을 풀어서 옮길 수 있게. 누른 채로 움직이면 바로 끌기 */
let press = null;
function startLongPress(el, e) {
  cancelPress();
  press = { el, x0: e.clientX, y0: e.clientY, timer: setTimeout(firePress, LONG_PRESS_MS) };
  el.classList.add('pressing');
  window.addEventListener('pointermove', onPressMove);
  window.addEventListener('pointerup', onPressUp);
  window.addEventListener('pointercancel', onPressCancel);
}
function stopPressListen() {
  window.removeEventListener('pointermove', onPressMove);
  window.removeEventListener('pointerup', onPressUp);
  window.removeEventListener('pointercancel', onPressCancel);
}
function cancelPress() { if (!press) return; clearTimeout(press.timer); press.el.classList.remove('pressing'); stopPressListen(); press = null; }
function onPressMove(e) { if (press && Math.hypot(e.clientX - press.x0, e.clientY - press.y0) > 8) cancelPress(); }
function onPressUp() { if (!press) return; cancelPress(); toast('고정된 수업이에요. 꾹 누르면(0.6초) 옮길 수 있어요.'); }
function onPressCancel() { cancelPress(); }
function firePress() {
  const p = press; if (!p) return;
  stopPressListen(); press = null;
  const el = p.el;
  (ui.unlocked = ui.unlocked || new Set()).add(el.dataset.key);
  el.classList.remove('pressing'); el.classList.add('movable', 'unlocked', 'has-badge');
  const cur = sessionOf({ cid: el.dataset.cid, from: el.dataset.from, mkId: el.dataset.mk || null });
  if (cur) toast(`${cur.c.course}(${groupOf(cur.c)}) ${cur.week ? `${cur.week}주차 ` : ''}수업을 옮길 수 있어요. 끌어서 옮기거나 눌러서 날짜·시간을 고치세요.`);
  drag = sessionDragFrom(el, { clientX: p.x0, clientY: p.y0 });   // 누른 채로 움직이면 바로 끌기
  if (drag) { drag.justUnlocked = true; listenDrag(); }
}
