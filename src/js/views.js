/* ---------- 화면: 요약 · 날짜별 배치 · 과목 목록 · 교수님 확인 ---------- */
const isLocked = () => !!(S && S.locked);
function render() {
  $('#deptLabel').textContent = S.dept;
  $('#titleLabel').textContent = `${S.title} 시간표`;
  renderPlanPicker();
  const locked = isLocked();
  document.body.classList.toggle('locked', locked);
  $('#lockBanner').hidden = !locked;
  if (locked) $('#lockBanner').innerHTML = `<span>🔒 보관된 기록이에요. 보기·엑셀 내보내기만 할 수 있어요.</span><button type="button" class="btn small" id="btnUnlock">보관 해제하고 수정하기</button>`;
  $('#btnRegister').disabled = locked;
  renderSummary();
  if (ui.tab === 'board') renderBoard();
  if (ui.tab === 'courses') renderList();
  if (ui.tab === 'professors') renderProfs();
  if (ui.tab === 'history') renderHistory();
  if (ui.tab === 'setup') renderSetup();
  if (ui.drawerId) refreshDrawerChecks();
  if (ui.reg) refreshRegister();
  if (locked) lockControls();
}
/** 보관(잠금)된 계획: 입력 칸을 모두 막는다. 탭 이동·필터·복사·내보내기는 그대로 */
function lockControls() {
  $$('#listTable input, #listTable select, #drawer input, #drawer select, #drawer textarea, #drawer .slotbtn, #drawer #dReset, #drawer #dToReg, #setupGrid .editable, #profGrid [data-markdone], #addDate')
    .forEach(el => { el.disabled = true; });
}
function renderPlanPicker() {
  const plans = sortedPlans();
  const byTerm = new Map();
  for (const p of plans) { const k = `${p.termYear}학년도 ${p.term}학기`; if (!byTerm.has(k)) byTerm.set(k, []); byTerm.get(k).push(p); }
  $('#planSel').innerHTML = [...byTerm].map(([k, list]) => `<optgroup label="${esc(k)}">${list.map(p =>
    `<option value="${esc(p.id)}"${p.id === S.id ? ' selected' : ''}>${esc(p.title)}${p.locked ? ' 🔒' : ''}</option>`).join('')}</optgroup>`).join('');
}
function counts() {
  let total = 0, bad = 0, warn = 0, moved = 0, und = 0, done = 0, noslot = 0;
  for (const c of S.classes) {
    const st = statusOf(c);
    if (st.noslot) { noslot++; if (st.done) done++; continue; }
    total++;
    if (st.bad.length) bad++;
    if (st.warn.length) warn++;
    if (st.moved) moved++;
    if (st.undecided) und++;
    if (st.done) done++;
  }
  return { total, bad, warn, moved, und, done, noslot, all: S.classes.length };
}
function renderSummary() {
  const k = counts();
  $('#summary').innerHTML = `
    <span class="chip">시험 과목 <b>${k.total}</b>${k.noslot ? ` · 시험 없음 ${k.noslot}` : ''}</span>
    <button type="button" class="chip ${k.bad ? 'bad' : 'ok'}" data-jump="bad">겹침 <b>${k.bad}</b></button>
    <button type="button" class="chip ${k.warn ? 'warn' : ''}" data-jump="warn">확인 필요 <b>${k.warn}</b></button>
    <button type="button" class="chip" data-jump="moved">날짜·시간 변경 <b>${k.moved}</b></button>
    <button type="button" class="chip ${k.und ? 'warn' : ''}" data-jump="undecided">방식 미정 <b>${k.und}</b></button>
    <button type="button" class="chip ${k.done === k.all ? 'ok' : ''}" data-jump="done">확정 <b>${k.done}</b> / ${k.all}</button>`;
}
function boardDates() {
  const set = new Set();
  for (const col of S.calendar.cols) { const d = D.colDates[col]?.[S.examWeek - 1]; if (d) set.add(d); }
  for (const c of S.classes) { const ex = S.exams[c.id]; if (hasSlot(ex) && ex.date) set.add(ex.date); }
  for (const d of S.extraDates || []) set.add(d);
  return [...set].sort();
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
function renderBoard() {
  const dates = boardDates();
  const html = [];
  const statusCache = {};
  for (const c of S.classes) statusCache[c.id] = statusOf(c);
  const head = `<div class="ghead"><div></div><div class="periods">${PERIODS.map((p, i) => `<div><b>${i + 1}</b>${i + 1 === LUNCH ? '점심' : p[0]}</div>`).join('')}</div></div>`;
  for (const d of dates) {
    const items = itemsOn(d, null);
    const nExam = items.filter(i => i.kind === 'exam').length;
    const lab = dayInfoLabel(d);
    const removable = (S.extraDates || []).includes(d) && !nExam;
    const [, m, dd] = d.split('-');
    let rows = '', prevYear = null;
    for (const g of D.groups) {
      const gi = items.filter(i => groupOf(i.c) === g);
      const lanes = lanesFor(gi);
      const year = g.slice(0, -1);
      const cells = range(1, NP).map(p => `<div class="cell${p === LUNCH ? ' lunch' : ''}" style="grid-column:${p}" data-date="${d}" data-group="${g}" data-p="${p}"></div>`).join('');
      const blocks = gi.map(it => {
        const pos = `grid-column:${it.s} / span ${Math.min(NP, it.e) - it.s + 1};grid-row:${it.lane + 1}`;
        if (it.kind === 'fixed') {
          return `<div class="blk fixed" style="${pos}" title="${esc(`${it.week}주차 정상 수업: ${it.c.course}(${it.c.prof}) ${roomLabel(it.c.room)}`)}"><span class="t">${esc(it.c.course)}</span><span class="s">${it.week}주차 수업 · ${esc(it.c.prof)}</span></div>`;
        }
        const ex = S.exams[it.c.id], st = statusCache[it.c.id];
        const badge = st.bad.length ? `<span class="badge b-bad">겹침</span>` : st.done ? `<span class="badge b-ok">확정</span>` : st.moved ? `<span class="badge b-mv">이동</span>` : '';
        const tip = [`${it.c.course} (${it.c.prof}) ${g}`, `${fmt(ex.date)} ${pRange(ex.start, ex.len)} ${tRange(ex.start, ex.len)} · ${roomLabel(ex.room)} · ${ex.method}`, ...st.bad.map(describeConflict), ...st.warn].join('\n');
        return `<button type="button" class="blk exam y${esc(year)}${st.bad.length ? ' bad' : ''}${badge ? ' has-badge' : ''}" style="${pos}" data-id="${esc(it.c.id)}" title="${esc(tip)}"><span class="t">${esc(it.c.course)}</span><span class="s">${esc(it.c.prof)} · ${esc(roomLabel(ex.room))} · ${esc(ex.method)}</span>${badge}</button>`;
      }).join('');
      rows += `<div class="grow${prevYear !== null && prevYear !== year ? ' yb' : ''}"><div class="glabel y${esc(year)}">${esc(g)}</div><div class="track" style="grid-template-rows:repeat(${lanes},minmax(42px,auto))">${cells}${blocks}</div></div>`;
      prevYear = year;
    }
    html.push(`<section class="day" data-day="${d}">
      <div class="dayhead"><h3>${+m}/${+dd}<span class="dow">(${DOW[dowOf(d)]})</span></h3><span class="tag ${lab.cls}">${esc(lab.text)}</span>
      <span class="cnt">시험 ${nExam}과목</span>${removable ? `<button type="button" class="btn small" data-rmdate="${d}">목록에서 빼기</button>` : ''}</div>
      <div class="scroller"><div class="grid">${head}${rows}</div></div></section>`);
  }
  $('#board').innerHTML = html.join('');
  const shown = new Set(dates);
  $('#addDate').innerHTML = `<option value="">날짜 선택</option>` + D.candDates.filter(d => !shown.has(d)).map(d => `<option value="${d}">${fmt(d)} · ${D.dateMap[d].col}${D.dateMap[d].week}주차</option>`).join('');
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
  if (st.done) out.push('<span class="pill ok">확정</span>');
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
function profMessage(prof) {
  const list = S.classes.filter(c => c.prof === prof).sort((a, b) => (S.exams[a.id].date || '').localeCompare(S.exams[b.id].date || '') || S.exams[a.id].start - S.exams[b.id].start);
  const lines = [`[${S.title} 일정 확인]`, `${prof} 교수님, 안녕하세요. ${S.dept} 사무실입니다.`, '담당 과목 시험 일정을 아래와 같이 정리했습니다.', ''];
  list.forEach((c, i) => {
    const ex = S.exams[c.id];
    if (!hasSlot(ex)) lines.push(`${i + 1}) ${c.course} (${groupOf(c)}): ${ex.method}`);
    else lines.push(`${i + 1}) ${c.course} (${groupOf(c)}): ${fmt(ex.date)} ${pRange(ex.start, ex.len)} ${tRange(ex.start, ex.len)}, ${roomLabel(ex.room)}, ${ex.method === '미정' ? '시험 방식 미정' : ex.method}`);
    if (ex.note) lines.push(`   메모: ${ex.note}`);
  });
  lines.push('', '시험 방식이나 시간을 바꾸셔야 하면 회신 부탁드립니다. 감사합니다.');
  return lines.join('\n');
}
function renderProfs() {
  $('#profGrid').innerHTML = D.profs.map(p => {
    const list = S.classes.filter(c => c.prof === p);
    const done = list.filter(c => S.exams[c.id].done).length;
    const bad = list.filter(c => statusOf(c).bad.length).length;
    return `<article class="card"><h3>${esc(p)} <small>${list.length}과목 · 확정 ${done}${bad ? ` · <span style="color:var(--bad)">겹침 ${bad}</span>` : ''}</small></h3>
      <pre class="msg" id="msg-${esc(p)}">${esc(profMessage(p))}</pre>
      <div class="row"><button type="button" class="btn small" data-copy="${esc(p)}">문구 복사</button>
      <button type="button" class="btn small" data-markdone="${esc(p)}">이 교수님 과목 모두 확정</button></div></article>`;
  }).join('');
}
