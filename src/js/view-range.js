/* ---------- 날짜별 배치의 기간 고르기 (달력) ----------
   '기간' 버튼 → 아래에 달력 두 달이 펼쳐진다(#rangePop). 날짜 칸에는 학기 주차·대체 수업일·보강·시험 주차가 작게 보인다.
   - 기간 모드: 날짜를 끌어서 범위, 또는 시작일·끝일을 차례로 누르기. 줄 왼쪽 주차 칸 = 그 주 월~토.
   - 날짜 골라 담기 모드: 날짜를 눌러 넣고 빼기, 끌면 지나간 날짜를 한꺼번에(첫 칸이 담겨 있었으면 빼기).
   고르면 바로 S.range에 저장된다: { from, to } 또는 { from, to, days:[…] } */

const ymOf = iso => iso.slice(0, 7);
const addMonths = (ym, n) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7); };
/** 한 달을 월요일부터 시작하는 주 줄들로: [[iso×7], …] (일요일까지) */
function monthWeeks(ym) {
  const first = `${ym}-01`, last = addDays(`${addMonths(ym, 1)}-01`, -1), rows = [];
  for (let m = mondayOf(first); m <= last; m = addDays(m, 7)) rows.push(range(0, 6).map(k => addDays(m, k)));
  return rows;
}
const datesBetween = (a, b) => { const [x, y] = a <= b ? [a, b] : [b, a], out = []; for (let d = x; d <= y; d = addDays(d, 1)) out.push(d); return out; };
function rangeLabel(r) {
  if (r.days) return `특정일 ${r.days.length}일 · ${r.days.slice(0, 4).map(d => fmt(d)).join(', ')}${r.days.length > 4 ? ' …' : ''}`;
  const weeks = Math.round((Date.parse(mondayOf(r.to)) - Date.parse(mondayOf(r.from))) / 6048e5) + 1;
  return `${fmt(r.from)} ~ ${fmt(r.to)} · ${weeks}주`;
}

/** 끄는 중이면 그 결과를 미리 보여 준다 */
function rangePreview() {
  const rp = ui.rp, cur = boardRange();
  if (rp.mode === 'range') {
    const a = rp.drag ? rp.drag.start : rp.anchor;
    if (a && rp.hover) { const [from, to] = a <= rp.hover ? [a, rp.hover] : [rp.hover, a]; return { from, to }; }
    if (a) return { from: a, to: a };
    return cur.days ? { from: cur.from, to: cur.to } : cur;
  }
  const set = new Set(cur.days || []);
  if (rp.drag) for (const d of rp.drag.swept) rp.drag.paint === 'add' ? set.add(d) : set.delete(d);
  return { days: [...set].sort() };
}

function renderRangePop() {
  const pop = $('#rangePop'), rp = ui.rp;
  const open = !!(rp && rp.open) && !isLocked();
  pop.hidden = !open;
  $('#rangeBtn').setAttribute('aria-expanded', String(open));
  if (!open) return;
  const sel = rangePreview();
  const picked = new Set(sel.days || []);
  const mkTo = new Set((D.makeups || []).map(m => m.to));
  const month = ym => {
    const [y, m] = ym.split('-');
    const rows = monthWeeks(ym).map(row => {
      const sem = [...new Set(row.map(d => D.dateMap[d]?.week).filter(Boolean))].sort((a, b) => a - b);
      const wk = `<button type="button" class="rwk" data-wk="${row[0]}" title="이 주 월~토 ${rp.mode === 'range' ? '고르기' : '담기/빼기'}">${sem.length ? `${sem[0]}${sem.length > 1 ? `~${sem[sem.length - 1]}` : ''}주` : '–'}</button>`;
      return wk + row.map(d => {
        if (ymOf(d) !== ym) return '<span class="rday blank"></span>';
        const info = D.dateMap[d], real = DOW[dowOf(d)];
        const shifted = info && info.col !== real;
        const cls = ['rday', dowOf(d) === 0 ? 'sun' : '', info ? '' : 'nc', info && info.week === S.examWeek ? 'ex' : '', shifted ? 'sh' : '', mkTo.has(d) ? 'mk' : ''];
        if (sel.days) { if (picked.has(d)) cls.push('pick'); }
        else if (d >= sel.from && d <= sel.to) cls.push('inr', d === sel.from ? 'rs' : '', d === sel.to ? 're' : '');
        const tip = [fmt(d), info ? `${info.col}요일 시간표 ${info.week}주차${shifted ? ` (${real}요일에 ${info.col}요일 수업)` : ''}` : '수업일 현황에 없는 날',
          info && info.week === S.examWeek ? '시험 주차' : '', mkTo.has(d) ? '보강 있음' : ''].filter(Boolean).join(' · ');
        const lab = info ? (shifted ? `${info.col}${info.week}` : `${info.week}주`) : '';
        return `<button type="button" class="${cls.filter(Boolean).join(' ')}" data-d="${d}" title="${esc(tip)}"><span class="dn">${+d.slice(8)}</span><span class="dl">${esc(lab)}</span></button>`;
      }).join('');
    }).join('');
    return `<div class="rmonth"><h4>${y}년 ${+m}월</h4><div class="rgrid"><span class="rhd">주차</span>${['월', '화', '수', '목', '금', '토', '일'].map(x => `<span class="rhd">${x}</span>`).join('')}${rows}</div></div>`;
  };
  const r = boardRange();
  const hint = rp.mode === 'range'
    ? (rp.anchor ? `${fmt(rp.anchor)}부터 — 끝 날짜를 누르세요.` : '날짜를 끌어서 기간을 잡거나, 시작일과 끝일을 차례로 누르세요. 왼쪽 주차 칸을 누르면 그 주(월~토)가 잡혀요.')
    : '보고 싶은 날짜만 눌러서 담으세요. 끌면 지나간 날짜를 한꺼번에 담거나 빼요. 판에는 담은 날짜만 진하게 보여요.';
  pop.innerHTML = `
    <div class="rtool">
      <div class="seg" role="radiogroup" aria-label="고르는 방법">
        <button type="button" role="radio" aria-checked="${rp.mode === 'range'}" data-mode="range">기간</button>
        <button type="button" role="radio" aria-checked="${rp.mode === 'days'}" data-mode="days">날짜 골라 담기</button>
      </div>
      <div class="row">
        <button type="button" class="btn small" data-nav="-1" aria-label="이전 달">‹</button>
        <button type="button" class="btn small" data-nav="1" aria-label="다음 달">›</button>
        <button type="button" class="btn small" data-preset="exam">시험 주차에 맞추기</button>
        <button type="button" class="btn small" data-preset="widen">앞뒤 1주 넓히기</button>
        ${r.days ? '<button type="button" class="btn small" data-preset="clear">담은 날짜 모두 빼기</button>' : ''}
        <button type="button" class="btn small primary" data-close>닫기</button>
      </div>
    </div>
    <p class="hint">${esc(hint)}</p>
    <div class="rmonths">${month(rp.month)}${month(addMonths(rp.month, 1))}</div>
    <div class="rlegend hint"><span><i class="rsw ex"></i>시험 주차</span><span><i class="rsw sh"></i>다른 요일 수업일(대체)</span><span><i class="rsw mk"></i>보강 있음</span><span><i class="rsw nc"></i>수업일 아님</span></div>
    ${rp.mode === 'range' ? `<div class="row rdirect"><span class="hint">직접 입력</span><input type="date" id="rangeFrom" value="${esc(r.from)}"> ~ <input type="date" id="rangeTo" value="${esc(r.to)}"></div>` : ''}`;
}

function openRangePop() {
  const r = boardRange();
  ui.rp = { open: true, mode: r.days ? 'days' : 'range', month: ymOf(r.from), anchor: null, hover: null, drag: null };
  renderRangePop();
}
function closeRangePop() { if (ui.rp) ui.rp.open = false; ui.rp && (ui.rp.anchor = ui.rp.drag = null); renderRangePop(); }
function commitRange(a, b) {
  const [from, to] = a <= b ? [a, b] : [b, a];
  S.range = { from, to }; changed();
}
function commitDays(days) {
  const ds = [...new Set(days)].sort();
  if (!ds.length) delete S.range; else S.range = { from: ds[0], to: ds[ds.length - 1], days: ds };
  changed();
}

function bindRange() {
  $('#rangeBtn').addEventListener('click', () => { if (isLocked()) return; ui.rp?.open ? closeRangePop() : openRangePop(); });
  const pop = $('#rangePop');
  const dayAt = (x, y) => { const el = document.elementFromPoint(x, y); const b = el && el.closest ? el.closest('#rangePop .rday[data-d]') : null; return b ? b.dataset.d : null; };
  const onMove = e => {
    const rp = ui.rp; if (!rp?.drag) return;
    const d = dayAt(e.clientX, e.clientY);
    if (!d || d === rp.hover) return;
    rp.hover = d; rp.drag.moved = true;
    if (rp.mode === 'days') rp.drag.swept = datesBetween(rp.drag.start, d).filter(x => dowOf(x) !== 0);
    renderRangePop();
  };
  const onUp = () => {
    window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp);
    const rp = ui.rp; if (!rp?.drag) return;
    const dr = rp.drag; rp.drag = null;
    if (rp.mode === 'range') {
      if (dr.moved) { rp.anchor = null; commitRange(dr.start, rp.hover); }
      else { rp.anchor = dr.start; rp.hover = null; renderRangePop(); }   // 끝 날짜를 기다림
      return;
    }
    const cur = new Set(boardRange().days || []);
    for (const d of dr.swept) dr.paint === 'add' ? cur.add(d) : cur.delete(d);
    rp.hover = null;
    commitDays([...cur]);
  };
  pop.addEventListener('pointerdown', e => {
    const b = e.target.closest('.rday[data-d]'); if (!b || e.button !== 0 || isLocked()) return;
    e.preventDefault();
    const rp = ui.rp, d = b.dataset.d;
    if (rp.mode === 'range' && rp.anchor) { const a = rp.anchor; rp.anchor = null; rp.hover = null; commitRange(a, d); return; }
    const picked = (boardRange().days || []).includes(d);
    rp.drag = { start: d, moved: false, paint: picked ? 'remove' : 'add', swept: [d] };
    rp.hover = d;
    renderRangePop();
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });
  pop.addEventListener('click', e => {
    const rp = ui.rp; if (!rp || isLocked()) return;
    const t = e.target;
    if (t.closest('[data-close]')) { closeRangePop(); return; }
    const md = t.closest('[data-mode]');
    if (md) { rp.mode = md.dataset.mode; rp.anchor = null; renderRangePop(); return; }
    const nv = t.closest('[data-nav]');
    if (nv) { rp.month = addMonths(rp.month, +nv.dataset.nav); renderRangePop(); return; }
    const ps = t.closest('[data-preset]');
    if (ps) {
      const p = ps.dataset.preset;
      if (p === 'exam') { delete S.range; rp.mode = 'range'; changed(); rp.month = ymOf(boardRange().from); renderRangePop(); }
      else if (p === 'widen') { const r = boardRange(); commitRange(addDays(mondayOf(r.from), -7), addDays(mondayOf(r.to), 12)); rp.mode = 'range'; renderRangePop(); }
      else if (p === 'clear') commitDays([]);
      return;
    }
    const wk = t.closest('[data-wk]');
    if (wk) {
      const days = range(0, 5).map(k => addDays(wk.dataset.wk, k));
      if (rp.mode === 'range') { rp.anchor = null; commitRange(days[0], days[5]); return; }
      const cur = new Set(boardRange().days || []);
      const all = days.every(d => cur.has(d));
      days.forEach(d => all ? cur.delete(d) : cur.add(d));
      commitDays([...cur]);
    }
  });
  pop.addEventListener('change', e => {
    if (e.target.id !== 'rangeFrom' && e.target.id !== 'rangeTo') return;
    const from = $('#rangeFrom').value, to = $('#rangeTo').value;
    if (!from || !to || isLocked()) return;
    commitRange(from, to);
  });
}
