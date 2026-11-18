/* ---------- 기간선택 달력 (날짜별 배치) ----------
   '기간선택' 칸을 누르면 한 달짜리 달력이 칸 아래에 뜬다(#rangePop).
   - 위: ‹ [연도▾] [월▾] ›, 요일 일~토, 앞뒤 달 날짜는 흐리게
   - 시작일을 누르고 끝일을 누르면(또는 끌면) 그 사이가 띠로 이어진다. 같은 날을 두 번 누르면 하루만.
   - 8·15주차(중간·기말 시험 주차) 날짜는 빨간색, 오늘은 점
   - 아래: [오늘]  [취소] [선택]. '선택'을 눌러야 S.range = {from, to}에 저장된다. */

const ymOf = iso => iso.slice(0, 7);
const addMonths = (ym, n) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7); };
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const dotted = iso => iso.replace(/-/g, '.');
/** 달력 한 장: 1일이 든 주의 일요일부터 6주(42칸) */
function calendarCells(ym) {
  const first = `${ym}-01`;
  const start = addDays(first, -dowOf(first));
  return range(0, 41).map(k => addDays(start, k));
}
/** 시험 주차(중간 8주차·기말 15주차, 바꾼 시험 주차 포함) 날짜 */
function examWeekDates() {
  const weeks = new Set([KINDS.mid.week, KINDS.final.week, S.examWeek]);
  return new Set(Object.entries(D.dateMap).filter(([, x]) => weeks.has(x.week)).map(([d]) => d));
}
function rangeLabel(r) {
  if (r.days) return `특정일 ${r.days.length}일 · ${r.days.slice(0, 3).map(dotted).join(', ')}${r.days.length > 3 ? ' …' : ''}`;
  return r.from === r.to ? dotted(r.from) : `${dotted(r.from)} – ${dotted(r.to)}`;
}

function renderRangePop() {
  const pop = $('#rangePop'), rp = ui.rp;
  const open = !!(rp && rp.open) && !isLocked();
  pop.hidden = !open;
  $('#rangeBtn').setAttribute('aria-expanded', String(open));
  $('#rangeBtn').classList.toggle('on', open);
  if (!open) return;
  // 미리보기: 시작일만 있고 마우스가 다른 날 위에 있으면 그 사이를 띠로
  let a = rp.start, b = rp.end || (rp.start && rp.hover) || rp.start;
  if (a && b && b < a) [a, b] = [b, a];
  const ex = examWeekDates(), today = todayIso(), mk = new Set((D.makeups || []).map(m => m.to));
  const [y, m] = rp.month.split('-').map(Number);
  const years = range(Math.min(y, S.year) - 1, Math.max(y, S.year) + 1);
  const cells = calendarCells(rp.month).map(d => {
    const info = D.dateMap[d], real = DOW[dowOf(d)];
    const cls = ['cday'];
    if (ymOf(d) !== rp.month) cls.push('other');
    if (ex.has(d)) cls.push('exam');
    if (d === today) cls.push('today');
    if (mk.has(d)) cls.push('mk');
    if (a && d >= a && d <= b) cls.push(d === a && d === b ? 'one' : d === a ? 'start' : d === b ? 'end' : 'band');
    const tip = [fmt(d), info ? `${info.col}요일 시간표 ${info.week}주차${info.col !== real ? ` (${real}요일에 ${info.col}요일 수업)` : ''}` : '수업일 아님',
      ex.has(d) ? '시험 주차' : '', mk.has(d) ? '보강 있음' : '', d === today ? '오늘' : ''].filter(Boolean).join(' · ');
    return `<button type="button" class="${cls.join(' ')}" data-d="${d}" title="${esc(tip)}"><span>${+d.slice(8)}</span></button>`;
  }).join('');
  const sel = rp.start ? `${dotted(a)}${b !== a ? ` – ${dotted(b)}` : ''}${rp.start && !rp.end ? ' (끝 날짜를 누르세요)' : ''}` : '시작 날짜를 누르세요';
  pop.innerHTML = `
    <div class="calhead">
      <button type="button" class="calnav" data-nav="-1" aria-label="이전 달">‹</button>
      <div class="calym">
        <select id="calYear" aria-label="연도">${years.map(v => `<option value="${v}"${v === y ? ' selected' : ''}>${v}년</option>`).join('')}</select>
        <select id="calMonth" aria-label="월">${range(1, 12).map(v => `<option value="${v}"${v === m ? ' selected' : ''}>${v}월</option>`).join('')}</select>
      </div>
      <button type="button" class="calnav" data-nav="1" aria-label="다음 달">›</button>
    </div>
    <div class="calgrid">
      ${['일', '월', '화', '수', '목', '금', '토'].map(x => `<span class="cdow">${x}</span>`).join('')}
      <span class="cmonth">${y}년 ${m}월</span>
      ${cells}
    </div>
    <p class="calsel">${esc(sel)}</p>
    <p class="callegend"><span class="dot exam"></span>8·15주차(시험 주차) <span class="dot mk"></span>보강</p>
    <div class="calfoot">
      <button type="button" class="linkbtn" data-today>오늘</button>
      <span class="row"><button type="button" class="btn small" data-cancel>취소</button><button type="button" class="btn small primary" data-apply${rp.start ? '' : ' disabled'}>선택</button></span>
    </div>`;
}

function openRangePop() {
  const r = boardRange();
  ui.rp = { open: true, month: ymOf(r.from), start: r.days ? null : r.from, end: r.days ? null : r.to, hover: null, drag: null };
  renderRangePop();
}
function closeRangePop() { if (ui.rp) ui.rp.open = false; renderRangePop(); }
function applyRangePop() {
  const rp = ui.rp; if (!rp?.start) return;
  const end = rp.end || rp.start;
  const [from, to] = rp.start <= end ? [rp.start, end] : [end, rp.start];
  rp.open = false;
  S.range = { from, to };
  ui.stripScroll = 0;
  changed();
}

function bindRange() {
  $('#rangeBtn').addEventListener('click', () => { if (isLocked()) return; ui.rp?.open ? closeRangePop() : openRangePop(); });
  const pop = $('#rangePop');
  // 바깥을 누르면 취소하고 닫기
  document.addEventListener('pointerdown', e => {
    if (!ui.rp?.open) return;
    if (e.target.closest('#rangePop, #rangeBtn')) return;
    closeRangePop();
  });
  const dayAt = (x, y) => { const el = document.elementFromPoint(x, y); const b = el && el.closest ? el.closest('#rangePop .cday[data-d]') : null; return b ? b.dataset.d : null; };
  const onMove = e => {
    const rp = ui.rp; if (!rp?.drag) return;
    const d = dayAt(e.clientX, e.clientY);
    if (!d || d === rp.drag.last) return;
    rp.drag.last = d; rp.drag.moved = true;
    rp.start = rp.drag.from; rp.end = d;
    renderRangePop();
  };
  const onUp = () => {
    window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp);
    const rp = ui.rp; if (!rp?.drag) return;
    const dr = rp.drag; rp.drag = null;
    if (!dr.moved) {   // 누르기: 시작일 → 끝일 → (다시 누르면) 새 시작일
      if (!rp.start || rp.end || dr.fresh) { rp.start = dr.from; rp.end = null; }
      else rp.end = dr.from;
    }
    renderRangePop();
  };
  pop.addEventListener('pointerdown', e => {
    const b = e.target.closest('.cday[data-d]'); if (!b || e.button !== 0) return;
    e.preventDefault();
    const rp = ui.rp, d = b.dataset.d;
    rp.drag = { from: d, last: d, moved: false, fresh: !rp.start || !!rp.end };
    if (ymOf(d) !== rp.month) rp.month = ymOf(d);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });
  pop.addEventListener('pointerover', e => {
    const rp = ui.rp; if (!rp || rp.drag || !rp.start || rp.end) return;
    const b = e.target.closest('.cday[data-d]'); if (!b || b.dataset.d === rp.hover) return;
    rp.hover = b.dataset.d; renderRangePop();
  });
  pop.addEventListener('click', e => {
    const rp = ui.rp; if (!rp) return;
    if (e.target.closest('[data-cancel]')) { closeRangePop(); return; }
    if (e.target.closest('[data-apply]')) { applyRangePop(); return; }
    if (e.target.closest('[data-today]')) { const t = todayIso(); rp.month = ymOf(t); rp.start = t; rp.end = t; renderRangePop(); return; }
    const nv = e.target.closest('[data-nav]');
    if (nv) { rp.month = addMonths(rp.month, +nv.dataset.nav); renderRangePop(); }
  });
  pop.addEventListener('change', e => {
    const rp = ui.rp; if (!rp) return;
    if (e.target.id === 'calYear' || e.target.id === 'calMonth') {
      rp.month = `${$('#calYear').value}-${String($('#calMonth').value).padStart(2, '0')}`;
      renderRangePop();
    }
  });
}
