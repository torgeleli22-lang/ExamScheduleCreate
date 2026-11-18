/* ---------- 화면: 요약 · 날짜별 배치 · 과목 목록 ---------- */
const isLocked = () => !!(S && S.locked);
function render() {
  renderPlanPicker();
  // 고른 학년도·학기·시험에 자료가 없으면: 자료 넣기 화면만
  document.body.classList.toggle('missing', !!ui.missing);
  $('#createPanel').hidden = !ui.missing;
  if (ui.missing) {
    $('#deptLabel').textContent = S.dept;
    $('#titleLabel').textContent = `${ui.missing.termYear}학년도 ${ui.missing.term}학기 ${KINDS[ui.missing.kind].label}`;
    renderWizard();
    return;
  }
  $('#deptLabel').textContent = S.dept;
  $('#titleLabel').textContent = `${S.title} 시간표`;
  const locked = isLocked();
  document.body.classList.toggle('locked', locked);
  $('#lockBanner').hidden = !locked;
  if (locked) $('#lockBanner').innerHTML = `<span>🔒 보관된 기록이에요. 보기·엑셀 내보내기만 할 수 있어요.</span><button type="button" class="btn small" id="btnUnlock">보관 해제하고 수정하기</button>`;
  $('#btnRegister').disabled = locked;
  renderSummary();
  if (ui.tab === 'board') renderBoard();
  if (ui.tab === 'courses') renderList();
  if (ui.tab === 'history') renderHistory();
  if (ui.tab === 'setup') renderSetup();
  if (ui.drawerId) refreshDrawerChecks();
  if (ui.reg) refreshRegister();
  if (locked) lockControls();
}
/** 보관(잠금)된 계획: 입력 칸을 모두 막는다. 탭 이동·필터·복사·내보내기는 그대로 */
function lockControls() {
  $$('#listTable input, #listTable select, #drawer input, #drawer select, #drawer textarea, #drawer .slotbtn, #drawer #dReset, #drawer #dToReg, #setupGrid .editable, #btnKeepAll, #rangeBtn, #rangeReset, #createPanel button')
    .forEach(el => { el.disabled = true; });
}
/* 위쪽 학년도·학기·시험 선택칸. 없는 조합을 고르면 ui.missing → 자료 넣기 화면 */
function renderPlanPicker() {
  const cur = ui.missing || { termYear: S.termYear, term: S.term, kind: S.kind };
  const now = new Date().getFullYear();
  const years = [...new Set([...Object.values(Store.plans).map(p => p.termYear), now - 1, now, now + 1, +cur.termYear])].sort((a, b) => b - a);
  const has = (y, t, k) => sortedPlans().some(p => p.termYear === y && p.term === t && p.kind === k);
  $('#selYear').innerHTML = years.map(y => `<option value="${y}"${y === +cur.termYear ? ' selected' : ''}>${y}학년도</option>`).join('');
  $('#selTerm').value = String(cur.term);
  $('#selKind').innerHTML = ['mid', 'final'].map(k => `<option value="${k}"${k === cur.kind ? ' selected' : ''}>${KINDS[k].label}${has(+cur.termYear, +cur.term, k) ? '' : ' (자료 없음)'}</option>`).join('');
}
function renderSummary() {
  const k = counts();
  $('#summary').innerHTML = `
    <span class="chip">시험 과목 <b>${k.total}</b>${k.noslot ? ` · 시험 없음 ${k.noslot}` : ''}</span>
    <button type="button" class="chip ${k.bad ? 'bad' : 'ok'}" data-jump="bad">겹침 <b>${k.bad}</b></button>
    <button type="button" class="chip ${k.warn ? 'warn' : ''}" data-jump="warn">확인 필요 <b>${k.warn}</b></button>
    <button type="button" class="chip" data-jump="moved">날짜·시간 변경 <b>${k.moved}</b></button>
    <button type="button" class="chip ${k.keep ? 'ok' : ''}" data-jump="keep">기존 시간표 수업 진행 <b>${k.keep}</b></button>
    <button type="button" class="chip ${k.und ? 'warn' : ''}" data-jump="undecided">방식 미정 <b>${k.und}</b></button>
    <button type="button" class="chip ${k.done === k.all ? 'ok' : ''}" data-jump="done">확정 <b>${k.done}</b> / ${k.all}</button>`;
}
function lanesFor(items) {
  const sorted = items.slice().sort((a, b) => a.s - b.s || (a.kind === 'fixed' ? -1 : 1));
  const ends = [];
  for (const it of sorted) {
    let lane = ends.findIndex(e => e < it.s);
    if (lane < 0) { lane = ends.length; ends.push(it.e); } else ends[lane] = it.e;
    it.lane = lane;
  }
  return Math.max(1, ends.length);
}

/* ---------- 날짜별 배치: 주차(가로 칸) × 요일(세로 줄) 판 ----------
   기간은 계획마다 S.range = {from, to}. 없으면 시험 주차 날짜들이 들어가는 주(월~토)로 잡는다.
   이 학과 15주차는 화 12/8, 수 12/16, 월 12/21처럼 여러 주에 흩어져 있어서 이 판으로 보면 한눈에 보인다. */
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const mondayOf = iso => addDays(iso, -((dowOf(iso) + 6) % 7));
function defaultRange() {
  const ds = [];
  for (const c of S.classes) { const d = defaultDate(c); if (d) ds.push(d); const ex = S.exams[c.id]; if (ex && hasSlot(ex) && ex.date) ds.push(ex.date); }
  if (!ds.length) return { from: D.allDates[0] || '', to: D.allDates[0] || '' };
  ds.sort();
  return { from: mondayOf(ds[0]), to: addDays(mondayOf(ds[ds.length - 1]), 5) };
}
/** 지금 판의 기간 → { from, to, days? }. days가 있으면 '특정일' 모드(그 날짜만 진하게) */
function boardRange() {
  const r = S.range;
  if (r && Array.isArray(r.days) && r.days.length) { const ds = r.days.slice().sort(); return { from: ds[0], to: ds[ds.length - 1], days: ds }; }
  if (r && r.from && r.to && r.from <= r.to) return { from: r.from, to: r.to };
  return defaultRange();
}
const inBoardRange = (r, d) => (r.days ? r.days.includes(d) : d >= r.from && d <= r.to);
const WEEK_ROWS = ['월', '화', '수', '목', '금', '토'];
function weekBadge(it) {
  if (it.kind === 'makeup') return `<span class="wk wk-mk" title="${esc(it.from ? `${fmt(it.from)} 결강한 수업의 보강` : '보강')}">보강${it.week ? ` · ${it.week}주차분` : ''}</span>`;
  if (it.kind === 'exam') return `<span class="wk wk-exam">${S.examWeek}주차${D.examMakeup[it.c.id] ? '(보강)' : ''}</span>`;
  return `<span class="wk">${it.week}주차</span>`;
}
function weekCard(it, st) {
  const c = it.c, g = groupOf(c), y = esc(String(c.year));
  const head = `<span class="g">${esc(g)}</span><span class="p">${pRange(it.s, it.e - it.s + 1)}</span><span class="t">${esc(c.course)}</span>`;
  if (it.kind !== 'exam') {   // 고정 수업·보강: 한 줄로 작게
    const tip = it.kind === 'makeup' ? `보강: ${c.course}(${c.prof}) ${it.from ? fmt(it.from) + `(${it.week || '?'}주차) 결강분` : ''} → ${pRange(it.s, it.e - it.s + 1)} ${roomLabel(it.room)}` : `${it.week}주차 정상 수업: ${c.course}(${c.prof}) ${roomLabel(c.room)}`;
    return `<div class="wcard fixed${it.kind === 'makeup' ? ' mk' : ''}" title="${esc(tip)}">${weekBadge(it)}${head}</div>`;
  }
  const ex = S.exams[c.id];
  const notes = [];
  if (st.moved) notes.push(`<span class="mvnote">↪ ${S.examWeek}주차 ${esc(fmt(defaultDate(c)))} ${pRange(defaultStart(c), defaultLen(c))}에서 옮김</span>`);
  if (st.keep) notes.push('<span class="keepnote">✓ 기존 시간표 수업 진행</span>');
  else if (st.done) notes.push('<span class="keepnote">✓ 확정</span>');
  if (st.bad.length) notes.push(`<span class="badnote">겹침 ${st.bad.length}</span>`);
  const tip = [`${c.course} (${c.prof}) ${g}`, `${fmt(ex.date)} ${pRange(ex.start, ex.len)} ${tRange(ex.start, ex.len)} · ${roomLabel(ex.room)} · ${ex.method}`, ...st.bad.map(describeConflict), ...st.warn].join('\n');
  return `<button type="button" class="wcard exam y${y}${st.bad.length ? ' bad' : ''}" data-id="${esc(c.id)}" title="${esc(tip)}">${head}<span class="x">${weekBadge(it)}${notes.join('')}<span>${esc(c.prof)} · ${esc(roomLabel(ex.room))} · ${esc(ex.method)}</span></span></button>`;
}
function renderWeekGrid(statusCache) {
  const r = boardRange();
  $('#rangeText').textContent = rangeLabel(r);
  const showFixed = ui.showFixed !== false;
  $('#showFixed').checked = showFixed;
  const weeks = [];
  for (let m = mondayOf(r.from); m <= r.to && weeks.length < 10; m = addDays(m, 7)) weeks.push(m);
  let html = `<div></div>` + weeks.map((m, i) => {
    const sem = [...new Set(range(0, 5).map(k => D.dateMap[addDays(m, k)]?.week).filter(Boolean))].sort((a, b) => a - b);
    return `<div class="wh"><b>${i + 1}주차</b>${esc(fmt(m).replace(/\(.\)/, ''))} ~ ${esc(fmt(addDays(m, 5)).replace(/\(.\)/, ''))}${sem.length ? ` · 학기 ${sem[0]}${sem.length > 1 ? `~${sem[sem.length - 1]}` : ''}주` : ''}</div>`;
  }).join('');
  for (const dw of WEEK_ROWS) {
    html += `<div class="wday">${dw}</div>`;
    for (const m of weeks) {
      const d = addDays(m, WEEK_ROWS.indexOf(dw));
      const info = D.dateMap[d];
      const items = itemsOn(d, null).filter(it => showFixed || it.kind === 'exam')
        .sort((a, b) => a.s - b.s || groupOf(a.c).localeCompare(groupOf(b.c)));
      const real = DOW[dowOf(d)];
      let tag = '<span class="tag">수업일 아님</span>';
      if (info) {
        const ex = info.week === S.examWeek;
        const txt = info.col !== real ? `${info.col}요일 ${info.week}주차 수업일` : `${info.week}주차`;
        tag = `<span class="tag ${ex ? '' : info.col !== real ? 'alt' : ''}">${esc(txt)}${ex ? ' · 시험 주차' : ''}</span>`;
      }
      const cls = ['wcell', inBoardRange(r, d) ? '' : 'out', info && info.week === S.examWeek ? 'examday' : '', ui.focusDay === d ? 'sel' : ''].filter(Boolean).join(' ');
      html += `<div class="${cls}" data-date="${d}"><div class="wdate"><button type="button" class="linkbtn" data-daydetail="${d}" title="반×교시 자세히 보기">${esc(fmt(d))}</button>${tag}</div>${items.map(it => weekCard(it, statusCache[it.c.id])).join('')}</div>`;
    }
  }
  const g = $('#weekGrid');
  g.style.gridTemplateColumns = `34px repeat(${weeks.length}, minmax(250px, 1fr))`;
  g.innerHTML = html;
}
/** 날짜 하나의 반×교시 자세한 시간표 (날짜를 누르면 아래에 펼침) */
function renderDaySection(d, statusCache) {
  const head = `<div class="ghead"><div></div><div class="periods">${PERIODS.map((p, i) => `<div><b>${i + 1}</b>${i + 1 === LUNCH ? '점심' : p[0]}</div>`).join('')}</div></div>`;
  const showFixed = ui.showFixed !== false;
  const items = itemsOn(d, null).filter(it => showFixed || it.kind === 'exam');
  const nExam = items.filter(i => i.kind === 'exam').length;
  const lab = dayInfoLabel(d);
  const [, m, dd] = d.split('-');
  let rows = '', prevYear = null;
  for (const g of D.groups) {
    const gi = items.filter(i => groupOf(i.c) === g);
    const lanes = lanesFor(gi);
    const year = g.slice(0, -1);
    const cells = range(1, NP).map(p => `<div class="cell${p === LUNCH ? ' lunch' : ''}" style="grid-column:${p}" data-date="${d}" data-group="${g}" data-p="${p}"></div>`).join('');
    const blocks = gi.map(it => {
      const pos = `grid-column:${it.s} / span ${Math.min(NP, it.e) - it.s + 1};grid-row:${it.lane + 1}`;
      if (it.kind !== 'exam') {
        const what = it.kind === 'makeup' ? `보강${it.week ? `(${it.week}주차분)` : ''}` : `${it.week}주차 수업`;
        return `<div class="blk fixed" style="${pos}" title="${esc(`${what}: ${it.c.course}(${it.c.prof}) ${roomLabel(it.room)}`)}"><span class="t">${esc(it.c.course)}</span><span class="s">${esc(what)} · ${esc(it.c.prof)}</span></div>`;
      }
      const ex = S.exams[it.c.id], st = statusCache[it.c.id];
      const badge = st.bad.length ? `<span class="badge b-bad">겹침</span>` : st.keep ? `<span class="badge b-ok">기존</span>` : st.done ? `<span class="badge b-ok">확정</span>` : st.moved ? `<span class="badge b-mv">이동</span>` : '';
      const tip = [`${it.c.course} (${it.c.prof}) ${g}`, `${fmt(ex.date)} ${pRange(ex.start, ex.len)} ${tRange(ex.start, ex.len)} · ${roomLabel(ex.room)} · ${ex.method}`, ...st.bad.map(describeConflict), ...st.warn].join('\n');
      return `<button type="button" class="blk exam y${esc(year)}${st.bad.length ? ' bad' : ''}${badge ? ' has-badge' : ''}" style="${pos}" data-id="${esc(it.c.id)}" title="${esc(tip)}"><span class="t">${esc(it.c.course)}</span><span class="s">${S.examWeek}주차 · ${esc(it.c.prof)} · ${esc(roomLabel(ex.room))}</span>${badge}</button>`;
    }).join('');
    rows += `<div class="grow${prevYear !== null && prevYear !== year ? ' yb' : ''}"><div class="glabel y${esc(year)}">${esc(g)}</div><div class="track" style="grid-template-rows:repeat(${lanes},minmax(30px,auto))">${cells}${blocks}</div></div>`;
    prevYear = year;
  }
  return `<section class="day${ui.focusDay === d ? ' focus' : ''}" data-day="${d}">
    <div class="dayhead"><h3>${+m}/${+dd}<span class="dow">(${DOW[dowOf(d)]})</span></h3><span class="tag ${lab.cls}">${esc(lab.text)}</span>
    <span class="cnt">시험 ${nExam}과목</span></div>
    <div class="scroller"><div class="grid">${head}${rows}</div></div></section>`;
}
function renderBoard() {
  const statusCache = {};
  for (const c of S.classes) statusCache[c.id] = statusOf(c);
  renderWeekGrid(statusCache);
  renderRangePop();
  const keepable = S.classes.filter(c => { const st = statusCache[c.id]; return !st.noslot && !st.moved && !st.keep && !st.bad.length; }).length;
  const kb = $('#btnKeepAll');
  kb.textContent = `옮기지 않은 과목 모두 '기존 시간표 수업 진행' 확정 (${keepable})`;
  kb.disabled = !keepable || isLocked();
  renderDayStrip(statusCache);
}
/** 고른 기간의 날짜마다 작은 반×교시 시간표를 가로로 나란히 (옆으로 넘겨 봄). 일요일은 뺌 */
function stripDates() {
  const r = boardRange();
  if (r.days) return r.days.filter(d => dowOf(d) !== 0);
  const out = [];
  for (let d = r.from; d <= r.to && out.length < 60; d = addDays(d, 1)) if (dowOf(d) !== 0) out.push(d);
  return out;
}
function renderDayStrip(statusCache) {
  const strip = $('#board');
  const keep = strip.scrollLeft;   // 옮긴 뒤 다시 그려도 보던 자리 유지
  const dates = stripDates();
  strip.innerHTML = dates.map(d => renderDaySection(d, statusCache)).join('') || '<p class="hint">기간을 골라 주세요.</p>';
  strip.scrollLeft = ui.stripScroll === 0 ? 0 : keep;
  ui.stripScroll = null;
  if (ui.focusDay) { const el = strip.querySelector(`.day[data-day="${ui.focusDay}"]`); if (el) strip.scrollLeft = el.offsetLeft - strip.offsetLeft; }
  updateStripPos();
}
function updateStripPos() {
  const strip = $('#board'), days = [...strip.querySelectorAll('.day')];
  if (!days.length) { $('#stripPos').textContent = ''; return; }
  const left = strip.scrollLeft, right = left + strip.clientWidth;
  const vis = days.filter(el => el.offsetLeft - strip.offsetLeft + el.offsetWidth / 2 >= left && el.offsetLeft - strip.offsetLeft + el.offsetWidth / 2 <= right);
  const f = vis[0]?.dataset.day, l = vis[vis.length - 1]?.dataset.day;
  $('#stripPos').textContent = f ? `${fmt(f)}${l && l !== f ? ` ~ ${fmt(l)}` : ''} · 전체 ${days.length}일` : `전체 ${days.length}일`;
}
/** 날짜별 시간표를 그 날짜로 넘김 */
function focusStripDay(d) {
  ui.focusDay = d;
  const strip = $('#board'), el = strip.querySelector(`.day[data-day="${d}"]`);
  strip.querySelectorAll('.day.focus').forEach(x => x.classList.remove('focus'));
  if (el) { el.classList.add('focus'); strip.scrollTo({ left: el.offsetLeft - strip.offsetLeft, behavior: 'auto' }); strip.scrollIntoView({ block: 'nearest' }); }
  updateStripPos();
}
/** 옮기지 않았고 겹침 없는 과목을 모두 '기존 시간표 수업 진행'으로 확정 */
function keepAllUnmoved() {
  let n = 0;
  for (const c of S.classes) {
    const st = statusOf(c);
    if (st.noslot || st.moved || st.keep || st.bad.length) continue;
    Object.assign(S.exams[c.id], { keep: true, done: true }); n++;
  }
  return n;
}
function dateOptions(cur) {
  const list = D.candDates.slice();
  if (cur && !list.includes(cur)) { list.push(cur); list.sort(); }
  return list.map(d => `<option value="${d}"${d === cur ? ' selected' : ''}>${fmt(d)} ${D.dateMap[d] ? `· ${D.dateMap[d].col}${D.dateMap[d].week}` : ''}</option>`).join('');
}
function filteredClasses() {
  const f = ui.filter, q = f.q.trim().toLowerCase();
  const dayIdx = d => DAY_ORDER.indexOf(d);
  return S.classes.filter(c => {
    if (f.group && groupOf(c) !== f.group) return false;
    if (f.prof && c.prof !== f.prof) return false;
    if (q && !`${c.course} ${c.prof} ${c.room} ${S.exams[c.id].room} ${groupOf(c)}`.toLowerCase().includes(q)) return false;
    if (f.status) {
      const st = statusOf(c);
      if (f.status === 'bad' && !st.bad.length) return false;
      if (f.status === 'warn' && !st.warn.length) return false;
      if (f.status === 'moved' && !st.moved) return false;
      if (f.status === 'undecided' && !st.undecided) return false;
      if (f.status === 'keep' && !st.keep) return false;
      if (f.status === 'open' && st.done) return false;
      if (f.status === 'done' && !st.done) return false;
    }
    return true;
  }).sort((a, b) => groupOf(a).localeCompare(groupOf(b)) || dayIdx(a.day) - dayIdx(b.day) || a.start - b.start);
}
function statusPills(st) {
  const out = [];
  if (st.noslot) out.push('<span class="pill na">시험 없음</span>');
  if (st.bad.length) out.push(`<span class="pill bad" title="${esc(st.bad.map(describeConflict).join('\n'))}">겹침 ${st.bad.length}</span>`);
  if (st.warn.length) out.push(`<span class="pill warn" title="${esc(st.warn.join('\n'))}">확인 ${st.warn.length}</span>`);
  if (st.moved) out.push('<span class="pill mv">변경</span>');
  if (st.keep) out.push('<span class="pill ok">기존 시간표 수업 진행</span>');
  else if (st.done) out.push('<span class="pill ok">확정</span>');
  if (!out.length) out.push('<span class="pill na">기본</span>');
  return `<div class="st">${out.join('')}</div>`;
}
function renderList() {
  const f = ui.filter;
  $('#fGroup').innerHTML = `<option value="">전체</option>` + opts(D.groups, f.group);
  $('#fProf').innerHTML = `<option value="">전체</option>` + opts(D.profs, f.prof);
  $('#fStatus').value = f.status;
  if (document.activeElement !== $('#fQ')) $('#fQ').value = f.q;
  const rows = filteredClasses().map(c => {
    const ex = S.exams[c.id], st = statusOf(c), dis = st.noslot ? ' disabled' : '';
    const id = esc(c.id);
    return `<tr data-id="${id}" class="${st.bad.length ? 'rbad' : ''}">
      <td>${statusPills(st)}</td>
      <td class="gtag">${esc(groupOf(c))}</td>
      <td><button type="button" class="linkbtn" data-open="${id}">${esc(c.course)}</button><span class="sub">${esc(c.prof)}</span></td>
      <td>${esc(c.day)} ${pRange(c.start, lenOf(c))}<span class="sub">${S.examWeek}주차 ${fmt(defaultDate(c))}</span></td>
      <td><select aria-label="방식" data-f="method">${opts(METHODS, ex.method)}</select></td>
      <td><select aria-label="날짜" data-f="date"${dis}>${dateOptions(ex.date)}</select></td>
      <td><select aria-label="시작 교시" data-f="start"${dis}>${opts(range(1, NP), ex.start, v => `${v}교시`)}</select></td>
      <td><select aria-label="교시 수" data-f="len"${dis}>${opts(range(1, 6), ex.len, v => `${v}교시`)}</select><span class="sub">${st.noslot ? '' : tRange(ex.start, ex.len)}</span></td>
      <td><input type="text" aria-label="강의실" data-f="room" value="${esc(ex.room)}" size="7" list="roomList"${dis}></td>
      <td><input type="text" class="note" aria-label="요청사항" data-f="note" value="${esc(ex.note)}" placeholder="교수님 요청사항"></td>
      <td><input type="checkbox" aria-label="확정" data-f="done"${ex.done ? ' checked' : ''}></td>
    </tr>`;
  }).join('');
  $('#listTable').innerHTML = `<thead><tr><th>상태</th><th>반</th><th>과목 · 교수</th><th>원래 수업</th><th>방식</th><th>시험 날짜</th><th>시작</th><th>길이</th><th>강의실</th><th>요청사항·메모</th><th>확정</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="11" class="hint">조건에 맞는 과목이 없어요.</td></tr>`}</tbody>`;
}
