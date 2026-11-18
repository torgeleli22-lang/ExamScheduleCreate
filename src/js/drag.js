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
    tip.textContent = `${fmt(t.date)} ${pRange(start, ex.len)} ${tRange(start, ex.len)}` + (cf.length ? '\n' + cf.map(describeConflict).join('\n') : ' · 겹침 없음') + (wn.length ? '\n' + wn.join('\n') : '');
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
  if (!d.started) { openDrawer(d.id); return; }
  if (d.target) {
    const ex = S.exams[d.id];
    if (ex.date !== d.target.date || ex.start !== d.target.start) {
      const before = `${fmt(ex.date)} ${pRange(ex.start, ex.len)}`;
      ex.date = d.target.date; ex.start = d.target.start; ex.keep = false;
      changed();
      const c = D.byId[d.id];
      const n = conflictsOf(c, { date: ex.date, start: ex.start, len: ex.len, room: ex.room }).length;
      toast(`${c.course}(${groupOf(c)}) ${before} → ${fmt(ex.date)} ${pRange(ex.start, ex.len)}${n ? ` · 겹침 ${n}건` : ''}`);
    }
  }
}
const onUp = e => endDrag(e, false);
const onCancel = e => endDrag(e, true);
