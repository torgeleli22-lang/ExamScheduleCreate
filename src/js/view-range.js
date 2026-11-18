/* ---------- 날짜 선택 달력 (날짜별 배치) ----------
   '날짜 선택' 버튼 → 한 달 달력(#rangePop).
   - 8·15주차(시험 주차) 날짜는 다른 색 + 칸 안에 "8주차"/"15주차"
   - 고르기: 날짜를 누르면 하나씩 넣고 빼기, 끌면 연속으로(첫 칸이 이미 골라져 있었으면 연속으로 빼기),
     Shift+누르기 = 마지막으로 누른 날부터 여기까지 연속
   - 아래: [오늘] [시험 주차 날짜] [모두 해제]   [취소] [선택] — '선택'을 눌러야 S.range = {from, to, days}에 저장
   고른 날짜는 아래 '날짜별 시간표'에 주(월~토)마다 한 줄씩 가로로 나온다. */

const ymOf = iso => iso.slice(0, 7);
const addMonths = (ym, n) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7); };
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const datesBetween = (a, b) => { const [x, y] = a <= b ? [a, b] : [b, a], out = []; for (let d = x; d <= y; d = addDays(d, 1)) out.push(d); return out; };
/** 달력 한 장: 1일이 든 주의 일요일부터 6주(42칸) */
function calendarCells(ym) {
  const first = `${ym}-01`;
  const start = addDays(first, -dowOf(first));
  return range(0, 41).map(k => addDays(start, k));
}
/** 시험 주차(중간 8주차·기말 15주차, 바꾼 시험 주차 포함) 날짜 → 주차 */
function examWeekDates() {
  const weeks = new Set([KINDS.mid.week, KINDS.final.week, S.examWeek]);
  return new Map(Object.entries(D.dateMap).filter(([, x]) => weeks.has(x.week)).map(([d, x]) => [d, x.week]));
}
/** 고른 날짜 요약: 이어진 날은 묶어서 "11/18(수)~11/21(토), 11/23(월) · 5일" */
function daysLabel(days) {
  if (!days.length) return '날짜를 골라 주세요';
  const runs = [];
  for (const d of days) { const r = runs[runs.length - 1]; if (r && addDays(r[1], 1) === d) r[1] = d; else runs.push([d, d]); }
  const txt = runs.slice(0, 3).map(([a, b]) => (a === b ? fmt(a) : `${fmt(a)}~${fmt(b)}`)).join(', ');
  return `${txt}${runs.length > 3 ? ' …' : ''} · ${days.length}일`;
}

function renderRangePop() {
  const pop = $('#rangePop'), rp = ui.rp;
  const open = !!(rp && rp.open) && !isLocked();
  pop.hidden = !open;
  $('#rangeBtn').setAttribute('aria-expanded', String(open));
  if (!open) return;
  const sel = new Set(rp.days);
  if (rp.drag && rp.drag.moved) for (const d of rp.drag.swept) rp.drag.paint === 'add' ? sel.add(d) : sel.delete(d);
  const ex = examWeekDates(), today = todayIso(), mk = new Set((D.makeups || []).map(m => m.to));
  const [y, m] = rp.month.split('-').map(Number);
  const years = range(Math.min(y, S.year) - 1, Math.max(y, S.year) + 1);
  const cells = calendarCells(rp.month);
  const html = cells.map((d, i) => {
    const info = D.dateMap[d], real = DOW[dowOf(d)];
    const cls = ['cday'];
    if (ymOf(d) !== rp.month) cls.push('other');
    if (ex.has(d)) cls.push('exam', `w${ex.get(d)}`);
    if (d === today) cls.push('today');
    if (mk.has(d)) cls.push('mk');
    if (sel.has(d)) {
      cls.push('pick');
      if (i % 7 && sel.has(cells[i - 1])) cls.push('jl');          // 왼쪽 날도 골랐으면 띠로 잇기
      if (i % 7 !== 6 && sel.has(cells[i + 1])) cls.push('jr');
    }
    const tip = [fmt(d), info ? `${info.col}요일 시간표 ${info.week}주차${info.col !== real ? ` (${real}요일에 ${info.col}요일 수업)` : ''}` : '수업일 아님',
      mk.has(d) ? '보강 있음' : '', d === today ? '오늘' : ''].filter(Boolean).join(' · ');
    return `<button type="button" class="${cls.join(' ')}" data-d="${d}" title="${esc(tip)}"><span class="n">${+d.slice(8)}</span>${ex.has(d) ? `<span class="wkl">${ex.get(d)}주차</span>` : ''}</button>`;
  }).join('');
  const days = [...sel].sort();
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
      ${html}
    </div>
    <p class="calsel">${esc(daysLabel(days))}</p>
    <p class="callegend"><span><i class="sw8"></i> 8주차</span><span><i class="sw15"></i> 15주차</span><span>(시험 주차)</span></p>
    <p class="calhelp">누르면 하나씩 · 끌면 연속 · Shift+누르기 = 이어서</p>
    <div class="calquick"><button type="button" class="linkbtn" data-today>오늘</button><button type="button" class="linkbtn" data-examdays>${S.examWeek}주차 날짜 모두</button><button type="button" class="linkbtn" data-clear>모두 해제</button></div>
    <div class="calfoot">
      <span class="hint">${days.length}일 골랐어요</span>
      <span class="row"><button type="button" class="btn small" data-cancel>취소</button><button type="button" class="btn small primary" data-apply${days.length ? '' : ' disabled'}>선택</button></span>
    </div>`;
}

function openRangePop() {
  const r = boardRange();
  // 직접 고른 적이 있으면 그 날짜들을 이어서 고치고, 처음이면 빈 상태로 (시험 주차 달이 보이게)
  ui.rp = { open: true, month: ymOf(r.days ? r.days[0] : r.from), days: S.range ? stripDates() : [], last: null, drag: null };
  renderRangePop();
}
function closeRangePop() { if (ui.rp) ui.rp.open = false; renderRangePop(); }
function applyRangePop() {
  const rp = ui.rp; if (!rp?.days.length) return;
  const ds = [...new Set(rp.days)].sort();
  rp.open = false;
  S.range = { from: ds[0], to: ds[ds.length - 1], days: ds };
  changed();
}

function bindRange() {
  $('#rangeBtn').addEventListener('click', () => { if (isLocked()) return; ui.rp?.open ? closeRangePop() : openRangePop(); });
  const pop = $('#rangePop');
  document.addEventListener('pointerdown', e => {   // 바깥을 누르면 취소하고 닫기
    if (!ui.rp?.open || e.target.closest('#rangePop, #rangeBtn')) return;
    closeRangePop();
  });
  const dayAt = (x, y) => { const el = document.elementFromPoint(x, y); const b = el && el.closest ? el.closest('#rangePop .cday[data-d]') : null; return b ? b.dataset.d : null; };
  const onMove = e => {
    const rp = ui.rp; if (!rp?.drag) return;
    const d = dayAt(e.clientX, e.clientY);
    if (!d || d === rp.drag.cur) return;
    rp.drag.cur = d; rp.drag.moved = true;
    rp.drag.swept = datesBetween(rp.drag.from, d).filter(x => dowOf(x) !== 0);
    renderRangePop();
  };
  const onUp = () => {
    window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp);
    const rp = ui.rp; if (!rp?.drag) return;
    const dr = rp.drag; rp.drag = null;
    const set = new Set(rp.days);
    if (dr.moved) for (const d of dr.swept) dr.paint === 'add' ? set.add(d) : set.delete(d);
    else if (dr.shift && rp.last) for (const d of datesBetween(rp.last, dr.from).filter(x => dowOf(x) !== 0)) set.add(d);
    else set.has(dr.from) ? set.delete(dr.from) : set.add(dr.from);
    rp.days = [...set].sort();
    rp.last = dr.cur;
    renderRangePop();
  };
  pop.addEventListener('pointerdown', e => {
    const b = e.target.closest('.cday[data-d]'); if (!b || e.button !== 0) return;
    e.preventDefault();
    const rp = ui.rp, d = b.dataset.d;
    rp.drag = { from: d, cur: d, moved: false, shift: e.shiftKey, swept: [d], paint: rp.days.includes(d) ? 'remove' : 'add' };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });
  pop.addEventListener('click', e => {
    const rp = ui.rp; if (!rp) return;
    if (e.target.closest('[data-cancel]')) { closeRangePop(); return; }
    if (e.target.closest('[data-apply]')) { applyRangePop(); return; }
    if (e.target.closest('[data-clear]')) { rp.days = []; renderRangePop(); return; }
    if (e.target.closest('[data-today]')) { const t = todayIso(); rp.month = ymOf(t); if (!rp.days.includes(t) && dowOf(t) !== 0) rp.days = [...rp.days, t].sort(); renderRangePop(); return; }
    if (e.target.closest('[data-examdays]')) {
      const ds = Object.entries(D.dateMap).filter(([, x]) => x.week === S.examWeek).map(([d]) => d).sort();
      rp.days = [...new Set([...rp.days, ...ds])].sort(); if (ds[0]) rp.month = ymOf(ds[0]); renderRangePop(); return;
    }
    const nv = e.target.closest('[data-nav]');
    if (nv) { rp.month = addMonths(rp.month, +nv.dataset.nav); renderRangePop(); }
  });
  pop.addEventListener('change', e => {
    const rp = ui.rp; if (!rp) return;
    if (e.target.id === 'calYear' || e.target.id === 'calMonth') { rp.month = `${$('#calYear').value}-${String($('#calMonth').value).padStart(2, '0')}`; renderRangePop(); }
  });
}
