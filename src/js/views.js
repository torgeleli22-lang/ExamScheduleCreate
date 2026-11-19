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
      const badge = st.bad.length ? `<span class="badge b-bad">겹침</span>` : st.combined.length ? `<span class="badge b-cb">합반</span>` : st.keep ? `<span class="badge b-ok">기존</span>` : st.done ? `<span class="badge b-ok">확정</span>` : st.moved ? `<span class="badge b-mv">이동</span>` : '';
      const tip = [`${it.c.course} (${it.c.prof}) ${g}`, `${fmt(ex.date)} ${examTime(ex)} (${pRange(ex.start, ex.len)}) · ${roomLabel(ex.room)} · ${ex.method}`,
        st.moved ? `↪ ${S.examWeek}주차 수업 ${fmt(defaultDate(it.c))} ${pRange(defaultStart(it.c), defaultLen(it.c))}에서 옮김` : '', st.keep ? '✓ 기존 시간표 수업 진행' : '', st.combined.length ? `합반: ${combinedLabel(st.combined)}와 같은 시간에 한 시험` : '', ...st.bad.map(describeConflict), ...st.warn].filter(Boolean).join('\n');
      return `<button type="button" class="blk exam y${esc(year)}${st.bad.length ? ' bad' : ''}${badge ? ' has-badge' : ''}" style="${pos}" data-id="${esc(it.c.id)}" title="${esc(tip)}"><span class="t">${esc(it.c.course)}</span><span class="s">${ex.time ? `${esc(examTime(ex))} · ` : ''}${st.moved && (ex.date !== defaultDate(it.c) || ex.start !== defaultStart(it.c)) ? `${S.examWeek}주차 · ${esc(fmt(defaultDate(it.c)))}에서 옮김` : st.moved ? `${S.examWeek}주차 · 시간 변경` : `${S.examWeek}주차${D.examMakeup[it.c.id] ? '(보강)' : ''} · ${esc(it.c.prof)} · ${esc(roomLabel(ex.room))}`}</span>${badge}</button>`;
    }).join('');
    rows += `<div class="grow${prevYear !== null && prevYear !== year ? ' yb' : ''}"><div class="glabel y${esc(year)}">${esc(g)}</div><div class="track" style="grid-template-rows:repeat(${lanes},minmax(30px,auto))">${cells}${blocks}</div></div>`;
    prevYear = year;
  }
  return `<section class="day${D.dateMap[d] && D.dateMap[d].week === S.examWeek ? ' examday' : ''}" data-day="${d}">
    <div class="dayhead"><h3>${+m}/${+dd}<span class="dow">(${DOW[dowOf(d)]})</span></h3><span class="tag ${lab.cls}">${esc(lab.text)}</span>
    <span class="cnt">시험 ${nExam}과목</span></div>
    <div class="scroller"><div class="grid">${head}${rows}</div></div></section>`;
}
function renderBoard() {
  const statusCache = {};
  for (const c of S.classes) statusCache[c.id] = statusOf(c);
  $('#rangeText').textContent = daysLabel(stripDates());
  renderRangePop();
  const keepable = S.classes.filter(c => { const st = statusCache[c.id]; return !st.noslot && !st.moved && !st.keep && !st.bad.length; }).length;
  const kb = $('#btnKeepAll');
  kb.textContent = `옮기지 않은 과목 모두 '기존 시간표 수업 진행' 확정 (${keepable})`;
  kb.disabled = !keepable || isLocked();
  renderMakeupNotice();
  renderDayRows(statusCache);
}
/** 보강 때문에 시험 주차 수업이 밀린(또는 당겨진) 과목 알림 */
function renderMakeupNotice() {
  const box = $('#mkNotice'), list = shiftedByMakeup();
  box.hidden = !list.length;
  if (!list.length) { box.innerHTML = ''; return; }
  box.innerHTML = `<b>보강 때문에 ${S.examWeek}주차(시험)가 옮겨진 과목 ${list.length}개</b> <span class="hint">기본 시험 시간을 보강 시간으로 옮겼어요. 원래 ${S.examWeek}주차 날짜에는 평소 수업이 있는 것으로 봐요.</span>
    <ul>${list.map(x => `<li><span class="gtag">${esc(groupOf(x.c))}</span> ${esc(x.c.course)} (${esc(x.c.prof)}) : ${S.examWeek}주차 ${esc(fmt(x.ew))} ${pRange(x.c.start, lenOf(x.c))} → <b>${esc(fmt(x.to))} ${pRange(x.m.start, x.m.end - x.m.start + 1)}</b> ${x.pushed ? `(밀림 · ${x.m.from ? `${esc(fmt(x.m.from))} 결강분 ` : ''}보강이 ${S.examWeek}주차 뒤)` : `(${S.examWeek}주차 수업 결강 → 보강)`}</li>`).join('')}</ul>`;
}
/** 고른 날짜들 (일요일 제외). 고른 적이 없으면 시험 주차 날짜들이 들어가는 주의 월~토 */
function stripDates() {
  const r = boardRange();
  if (r.days) return r.days.filter(d => dowOf(d) !== 0);
  const out = [];
  for (let d = r.from; d <= r.to && out.length < 90; d = addDays(d, 1)) if (dowOf(d) !== 0) out.push(d);
  return out;
}
/** 고른 날짜를 주(월요일 시작)마다 한 줄로: 줄 안에서는 날짜가 가로로 (넘치면 옆으로 넘김) */
function renderDayRows(statusCache) {
  const box = $('#board');
  const keep = {};   // 다시 그려도 줄마다 보던 자리 유지
  box.querySelectorAll('.weekrow').forEach(el => { keep[el.dataset.week] = el.querySelector('.weekdays').scrollLeft; });
  const weeks = new Map();
  for (const d of stripDates()) { const m = mondayOf(d); if (!weeks.has(m)) weeks.set(m, []); weeks.get(m).push(d); }
  const md = d => fmt(d).replace(/\(.\)/, '');
  box.innerHTML = [...weeks].map(([m, ds]) => {
    const sem = [...new Set(ds.map(d => D.dateMap[d]?.week).filter(Boolean))].sort((a, b) => a - b);
    const semTxt = sem.length ? `학기 ${sem[0]}${sem.length > 1 ? `~${sem[sem.length - 1]}` : ''}주차` : '수업일 아님';
    const hasExam = sem.includes(S.examWeek);
    return `<section class="weekrow" data-week="${m}">
      <div class="weekrow-head"><b>${esc(md(ds[0]))}${ds.length > 1 ? ` ~ ${esc(md(ds[ds.length - 1]))}` : ''}</b> <span class="wk${hasExam ? ' wk-exam' : ''}">${esc(semTxt)}</span> <span class="hint">${ds.length}일</span></div>
      <div class="weekdays">${ds.map(d => renderDaySection(d, statusCache)).join('')}</div></section>`;
  }).join('') || `<p class="hint">'날짜 선택'을 눌러 날짜를 골라 주세요.</p>`;
  box.querySelectorAll('.weekrow').forEach(el => { if (keep[el.dataset.week]) el.querySelector('.weekdays').scrollLeft = keep[el.dataset.week]; });
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
  if (st.combined?.length) out.push(`<span class="pill cb" title="같은 과목 ${esc(combinedLabel(st.combined))}와 같은 시간에 한 시험">합반 ${esc(combinedLabel(st.combined))}</span>`);
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
      <td><select aria-label="교시 수" data-f="len"${dis}>${opts(range(1, 6), ex.len, v => `${v}교시`)}</select><span class="sub">${st.noslot ? '' : examTime(ex)}</span></td>
      <td><input type="text" aria-label="강의실" data-f="room" value="${esc(ex.room)}" size="7" list="roomList"${dis}></td>
      <td><input type="text" class="note" aria-label="요청사항" data-f="note" value="${esc(ex.note)}" placeholder="교수님 요청사항"></td>
      <td><input type="checkbox" aria-label="확정" data-f="done"${ex.done ? ' checked' : ''}></td>
    </tr>`;
  }).join('');
  $('#listTable').innerHTML = `<thead><tr><th>상태</th><th>반</th><th>과목 · 교수</th><th>원래 수업</th><th>방식</th><th>시험 날짜</th><th>시작</th><th>길이</th><th>강의실</th><th>요청사항·메모</th><th>확정</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="11" class="hint">조건에 맞는 과목이 없어요.</td></tr>`}</tbody>`;
}
