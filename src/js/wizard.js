/* ---------- 새 시험 만들기 (학기 강의시간표 + 수업일 현황 → 중간고사·기말고사 계획) ----------
   1) 학기 · 만들 시험(중간 8주차 / 기말 15주차)
   2) 자료: 파일 올리기(시간표 xlsx + 수업일 현황 PDF 또는 붙여넣기) 또는 같은 학기 다른 시험에서 가져오기
   3) 미리보기(시험 주차 날짜, 대체 수업일) → 만들기 */

/** 다음에 만들 시험 기본값: 최근 학기에 빠진 시험이 있으면 그 학기, 둘 다 있으면 다음 학기 */
function wizardDefaults() {
  const last = sortedPlans()[0];
  const now = new Date();
  if (!last) return { termYear: now.getFullYear(), term: now.getMonth() < 7 ? 1 : 2, kinds: { mid: true, final: true }, from: '' };
  const same = sortedPlans().filter(p => p.termYear === last.termYear && p.term === last.term);
  const has = k => same.some(p => p.kind === k);
  if (!has('mid') || !has('final')) return { termYear: last.termYear, term: last.term, kinds: { mid: !has('mid'), final: !has('final') }, from: last.id };
  return last.term === 1 ? { termYear: last.termYear, term: 2, kinds: { mid: true, final: true }, from: '' }
    : { termYear: last.termYear + 1, term: 1, kinds: { mid: true, final: true }, from: '' };
}
function openWizard() {
  const d = wizardDefaults();
  ui.wiz = { ...d, dept: S?.dept || '', src: d.from ? 'copy' : 'upload', tt: null, groupsOff: {}, cal: null, calText: '', busy: '' };
  closeDrawer();
  renderWizard();
  $('#modal').hidden = false;
  $('#wYear')?.focus();
}
function closeWizard() { ui.wiz = null; $('#modal').hidden = true; $('#modal').innerHTML = ''; }

/** 마법사 입력에서 실제로 쓸 시간표·수업일. 준비가 안 됐으면 null */
function wizardSource() {
  const w = ui.wiz;
  if (w.src === 'copy') { const p = Store.plans[w.from]; return p ? { classes: p.classes, calendar: p.calendar, year: p.year, sources: p.sources || {}, dept: p.dept } : null; }
  if (!w.tt?.classes || !w.cal?.data) return null;
  const classes = w.tt.classes.filter(c => !w.groupsOff[groupOf(c)]);
  return { classes, calendar: w.cal.data, year: +w.termYear, sources: { timetable: w.tt.name, calendar: w.cal.name || '붙여넣은 표' } };
}
function wizardIssues(src) {
  const w = ui.wiz, out = [];
  if (!(+w.termYear >= 2000)) out.push('학년도를 확인해 주세요.');
  if (!w.kinds.mid && !w.kinds.final) out.push('만들 시험을 하나 이상 골라 주세요.');
  if (!src) out.push(w.src === 'copy' ? '가져올 시험을 골라 주세요.' : '강의시간표와 수업일 현황을 모두 올려 주세요.');
  else {
    if (!src.classes.length) out.push('선택한 반에 수업이 없어요.');
    for (const k of ['mid', 'final']) if (w.kinds[k] && !src.calendar.weeks[KINDS[k].week - 1]) out.push(`수업일 현황에 ${KINDS[k].week}주차(${KINDS[k].label})가 없어요.`);
  }
  return out;
}

function calendarPreview(cal, year, examWeeks) {
  const { dateMap } = buildDateMap(cal, year);
  const isoOf = {}; for (const [iso, x] of Object.entries(dateMap)) isoOf[`${x.col}|${x.week}`] = iso;
  const rows = cal.weeks.map((row, wi) => {
    if (!row) return '';
    const wk = wi + 1;
    const cells = cal.cols.map(col => {
      const iso = isoOf[`${col}|${wk}`];
      const shifted = iso && DOW[dowOf(iso)] !== col;
      return `<td class="${shifted ? 'alt' : ''}"${shifted ? ` title="${esc(`${fmt(iso)}에 ${col}요일 수업`)}"` : ''}>${iso ? esc(fmt(iso)) : ''}</td>`;
    }).join('');
    const label = examWeeks[wk] ? ` <span class="pill ok">${examWeeks[wk]}</span>` : '';
    return `<tr class="${examWeeks[wk] ? 'ex' : ''}"><th>${wk}주${label}</th>${cells}</tr>`;
  }).join('');
  return `<div class="calprev tablebox"><table><thead><tr><th>주차</th>${cal.cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

/* 다시 그리는 도중 포커스된 칸이 지워지면서 change 이벤트가 또 renderWizard를 부를 수 있다 → 끝난 뒤 한 번 더 그린다 */
let wizRendering = false, wizAgain = false;
function renderWizard() {
  if (wizRendering) { wizAgain = true; return; }
  wizRendering = true;
  try { drawWizard(); } finally { wizRendering = false; }
  if (wizAgain) { wizAgain = false; renderWizard(); }
}
function drawWizard() {
  const w = ui.wiz; if (!w) return;
  const others = sortedPlans();
  const src = wizardSource();
  const issues = wizardIssues(src);
  const examWeeks = {}; for (const k of ['mid', 'final']) if (w.kinds[k]) examWeeks[KINDS[k].week] = KINDS[k].label;
  const exists = ['mid', 'final'].filter(k => w.kinds[k] && Store.plans[`${w.termYear}-${w.term}-${k}`]);
  const ttGroups = w.tt?.classes ? [...new Set(w.tt.classes.map(groupOf))].sort() : [];
  const shifted = src ? shiftedDays(src.calendar, src.year) : [];

  const uploadBox = `
    <label class="field" for="wTt"><span>① 학과 강의시간표 (.xlsx) — '요일·학년·반·1~10교시' 머리글이 있는 시트를 찾아 읽어요</span>
      <input type="file" id="wTt" accept=".xlsx"></label>
    ${w.tt ? `<div class="result ${w.tt.error ? 'bad' : w.tt.classes ? 'ok' : ''}">${esc(w.tt.msg)}</div>` : ''}
    ${ttGroups.length ? `<div class="field"><span>시험 대상 반 (전공심화·야간처럼 빼야 할 반은 체크를 푸세요)</span><div class="radios">${ttGroups.map(g => {
        const n = w.tt.classes.filter(c => groupOf(c) === g).length;
        return `<label><input type="checkbox" data-group="${esc(g)}"${w.groupsOff[g] ? '' : ' checked'}>${esc(g)} <small class="hint">${n}개</small></label>`; }).join('')}</div></div>` : ''}
    <label class="field" for="wCalPdf"><span>② 요일별 수업일 현황 (.pdf)</span><input type="file" id="wCalPdf" accept=".pdf,application/pdf"></label>
    <label class="field" for="wCalText"><span>또는 '주 / 월~토' 표를 붙여 넣기 (PDF를 읽은 결과도 여기에 나와요. 틀린 곳은 고친 뒤 '표 다시 읽기')</span>
      <textarea id="wCalText" rows="6" placeholder="주	월	화	수	목	금	토&#10;1	3/2	3/3	3/4	3/5	3/6	3/7&#10;…">${esc(w.calText)}</textarea></label>
    <div class="row"><button type="button" class="btn small" id="wCalParse">표 다시 읽기</button></div>
    ${w.cal ? `<div class="result ${w.cal.error ? 'bad' : w.cal.data ? 'ok' : ''}">${esc(w.cal.msg)}</div>` : ''}`;
  const copyBox = `
    <label class="field" for="wFrom"><span>가져올 시험 (그 시험의 강의시간표·수업일 현황을 그대로 써요. 시험 일정은 새로 시작)</span>
      <select id="wFrom"><option value="">고르세요</option>${others.map(p => `<option value="${esc(p.id)}"${p.id === w.from ? ' selected' : ''}>${esc(p.title)} · 수업 ${p.classes.length}개</option>`).join('')}</select></label>`;

  $('#modal').innerHTML = `<div class="mbox">
    <div class="dhead"><div><h2 id="modalTitle">새 시험 만들기</h2><p>학기 강의시간표와 수업일 현황으로 중간고사·기말고사 시간표를 만들어요. 지난 시험 기록은 그대로 남아요.</p></div>
      <button type="button" class="btn small" id="wClose">닫기</button></div>
    <div class="dbody">
      <section class="step"><h3><span class="n">1</span>학기와 시험</h3>
        <div class="row">
          <label class="field" for="wYear"><span>학년도</span><input type="number" id="wYear" value="${esc(w.termYear)}" min="2020" max="2100" style="width:110px"></label>
          <div class="field"><span>학기</span><div class="radios">${[1, 2].map(t => `<label><input type="radio" name="wTerm" value="${t}"${+w.term === t ? ' checked' : ''}>${t}학기</label>`).join('')}</div></div>
          <div class="field"><span>만들 시험</span><div class="radios">${['mid', 'final'].map(k => `<label><input type="checkbox" data-kind="${k}"${w.kinds[k] ? ' checked' : ''}>${KINDS[k].label} (${KINDS[k].week}주차)</label>`).join('')}</div></div>
        </div>
        <label class="field" for="wDept"><span>학과</span><input type="text" id="wDept" value="${esc(w.dept)}"></label>
        ${exists.length ? `<p class="hint" style="color:var(--warn)">${exists.map(k => KINDS[k].label).join('·')}는 이미 있어요. 만들면 별도 사본(…-2)으로 하나 더 생겨요.</p>` : ''}
      </section>
      <section class="step"><h3><span class="n">2</span>강의시간표 · 수업일 현황</h3>
        <div class="radios">
          <label><input type="radio" name="wSrc" value="upload"${w.src === 'upload' ? ' checked' : ''}>파일 올리기 (새 학기)</label>
          <label><input type="radio" name="wSrc" value="copy"${w.src === 'copy' ? ' checked' : ''}${others.length ? '' : ' disabled'}>다른 시험에서 가져오기 (같은 학기 중간→기말)</label>
        </div>
        ${w.src === 'copy' ? copyBox : uploadBox}
        ${w.busy ? `<p class="hint">${esc(w.busy)}</p>` : ''}
      </section>
      <section class="step"><h3><span class="n">3</span>확인</h3>
        ${src ? `<p class="hint">수업 ${src.classes.length}개 · ${new Set(src.classes.map(groupOf)).size}개 반 · 교수님 ${new Set(src.classes.map(c => c.prof).filter(Boolean)).size}분. 색칠된 줄이 시험 주차예요. 주황 날짜는 실제 요일과 다른 요일 수업을 하는 날(대체 수업일)이라 그 요일 시간표로 겹침을 검사해요.</p>
          ${shifted.length ? `<ul class="plain">${shifted.map(x => `<li>${esc(fmt(x.iso))} → ${esc(x.col)}요일 ${x.week}주차 수업일</li>`).join('')}</ul>` : ''}
          ${calendarPreview(src.calendar, src.year, examWeeks)}` : '<p class="hint">자료를 올리면 여기서 주차별 날짜를 확인할 수 있어요.</p>'}
        ${issues.length ? `<div class="checks">${issues.map(t => `<div class="it warn">${esc(t)}</div>`).join('')}</div>` : ''}
        <div class="row"><button type="button" class="btn primary" id="wCreate"${issues.length || w.busy ? ' disabled' : ''}>시험 만들기</button></div>
      </section>
    </div></div>`;
}

function createFromWizard() {
  const w = ui.wiz, src = wizardSource();
  if (!src || wizardIssues(src).length) return;
  const made = [];
  for (const k of ['mid', 'final']) {
    if (!w.kinds[k]) continue;
    const p = makePlan({ termYear: +w.termYear, term: +w.term, kind: k, dept: w.dept.trim() || src.dept || S?.dept,
      calendar: src.calendar, classes: src.classes, sources: src.sources, taken: Store.plans });
    p.year = src.year;
    Store.plans[p.id] = p; made.push(p);
    touchPlan(p);
  }
  closeWizard();
  switchPlan(made[0].id);
  setTab('board');
  toast(`${made.map(p => p.title).join(', ')}을(를) 만들었어요.`);
}

function bindWizard() {
  const m = $('#modal');
  m.addEventListener('click', e => {
    if (e.target === m || e.target.closest('#wClose')) { closeWizard(); return; }
    if (e.target.closest('#wCreate')) { createFromWizard(); return; }
    if (e.target.closest('#wCalParse')) {
      const w = ui.wiz; w.calText = $('#wCalText').value;
      w.cal = { ...parseCalendarText(w.calText), name: w.cal?.name || '붙여넣은 표' };
      renderWizard();
    }
  });
  m.addEventListener('change', async e => {
    const w = ui.wiz, el = e.target; if (!w) return;
    if (el.id === 'wYear') w.termYear = +el.value;
    else if (el.name === 'wTerm') w.term = +el.value;
    else if (el.dataset.kind) w.kinds[el.dataset.kind] = el.checked;
    else if (el.id === 'wDept') w.dept = el.value;
    else if (el.name === 'wSrc') w.src = el.value;
    else if (el.id === 'wFrom') w.from = el.value;
    else if (el.dataset.group) w.groupsOff[el.dataset.group] = !el.checked;
    else if (el.id === 'wCalText') { w.calText = el.value; if (el.value.trim()) w.cal = { ...parseCalendarText(el.value), name: '붙여넣은 표' }; }
    else if (el.id === 'wTt' && el.files[0]) {
      const f = el.files[0]; w.busy = '강의시간표 읽는 중…'; renderWizard();
      try {
        const res = await parseTimetableXlsx(await f.arrayBuffer());
        const g = new Set(res.classes.map(groupOf)).size, pr = new Set(res.classes.map(c => c.prof).filter(Boolean)).size;
        w.tt = { name: f.name, classes: res.classes, msg: `${f.name}: '${res.sheet}' 시트에서 수업 ${res.classes.length}개(${g}개 반, 교수님 ${pr}분)를 읽었어요.` };
        w.groupsOff = {};
      } catch (err) { w.tt = { error: true, msg: `${f.name}: ${err.message || '파일을 읽지 못했어요.'}` }; }
      w.busy = '';
    } else if (el.id === 'wCalPdf' && el.files[0]) {
      const f = el.files[0]; w.busy = '수업일 현황 PDF 읽는 중…'; renderWizard();
      try { const res = await parseCalendarPdf(await f.arrayBuffer()); w.calText = res.text; w.cal = { ...res, name: f.name, fromPdf: true, msg: `${f.name}: ${res.msg}` }; }
      catch (err) { w.cal = { error: true, msg: `${f.name}: ${err.message || 'PDF를 읽지 못했어요.'}` }; }
      w.busy = '';
    } else return;
    renderWizard();
  });
}
