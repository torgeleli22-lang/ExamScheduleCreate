/* ---------- 자료 넣기 (선택한 학년도·학기·시험에 아직 자료가 없을 때) ----------
   위쪽에서 학년도·학기·중간/기말을 고르면, 그 시험이 없을 때 이 화면이 나온다.
   - 파일을 한꺼번에 넣으면 종류를 알아서 알아본다(recognizeFile): 강의시간표(xlsx) / 요일별 수업일 현황(pdf·hwp·xlsx) / 보강(hwp·xlsx·pdf)
   - 같은 학기 다른 시험(중간→기말)의 자료를 그대로 가져올 수도 있다. 새로 넣은 파일이 있으면 그것이 우선.
   - 보강은 시간표·수업일 현황이 있어야 수업과 짝지을 수 있다(parseMakeups). */

/** 다음에 만들 시험 기본값: 최근 학기에 빠진 시험이 있으면 그 학기, 둘 다 있으면 다음 학기 */
function nextMissing() {
  const last = sortedPlans()[0];
  const now = new Date();
  if (!last) return { termYear: now.getFullYear(), term: now.getMonth() < 7 ? 1 : 2, kind: 'mid' };
  const same = sortedPlans().filter(p => p.termYear === last.termYear && p.term === last.term);
  for (const k of ['mid', 'final']) if (!same.some(p => p.kind === k)) return { termYear: last.termYear, term: last.term, kind: k };
  return last.term === 1 ? { termYear: last.termYear, term: 2, kind: 'mid' } : { termYear: last.termYear + 1, term: 1, kind: 'mid' };
}
const findPlan = (y, t, k) => sortedPlans().find(p => p.termYear === +y && p.term === +t && p.kind === k);

/** 위쪽 선택칸이 바뀌었을 때: 있으면 그 시험으로, 없으면 자료 넣기 화면 */
function selectExam(termYear, term, kind) {
  const p = findPlan(termYear, term, kind);
  if (p) { ui.missing = null; ui.wiz = null; switchPlan(p.id); return; }
  openWizard({ termYear: +termYear, term: +term, kind });
}
function openWizard(sel = nextMissing()) {
  closeDrawer();
  ui.missing = { termYear: +sel.termYear, term: +sel.term, kind: sel.kind };
  const same = sortedPlans().find(p => p.termYear === ui.missing.termYear && p.term === ui.missing.term);
  ui.wiz = { files: [], tt: null, cal: null, calText: '', mk: [], groupsOff: {}, base: same ? same.id : '', alsoOther: !same, dept: S?.dept || '', busy: '' };
  render();
}
function closeWizard() { ui.missing = null; ui.wiz = null; render(); }

/** 지금 넣은 자료로 만들 시험의 시간표·수업일·보강. 준비가 안 됐으면 classes/calendar가 null */
function wizardSource() {
  const w = ui.wiz, base = w.base ? Store.plans[w.base] : null;
  // 시간표는 다른 학기 것도 쓸 수 있지만, 수업일 현황·보강은 같은 학기 것만 가져온다
  const sameTerm = base && base.termYear === ui.missing.termYear && base.term === ui.missing.term;
  const classes = w.tt ? w.tt.classes.filter(c => !w.groupsOff[groupOf(c)]) : base ? base.classes : null;
  const calendar = w.cal?.data || (sameTerm ? base.calendar : null);
  const year = ui.missing.termYear;
  let makeups = sameTerm && !w.tt ? (base.makeups || []).slice() : [];
  const unmatched = [];
  if (classes && calendar) for (const f of w.mk) {
    const r = parseMakeups(f.text, classes, calendar, year);
    for (const m of r.makeups) if (!makeups.some(x => x.id === m.id)) makeups.push(m);
    unmatched.push(...r.unmatched.map(u => ({ ...u, file: f.name })));
  }
  const sources = { timetable: w.tt?.name || base?.sources?.timetable || '', calendar: w.cal?.name || base?.sources?.calendar || '', makeups: w.mk.map(f => f.name).join(', ') };
  return { classes, calendar, year, makeups, unmatched, sources, dept: base?.dept };
}
function wizardIssues(src) {
  const out = [];
  if (!src.classes) out.push('강의시간표(.xlsx)를 넣어 주세요.');
  else if (!src.classes.length) out.push('고른 반에 수업이 없어요.');
  if (!src.calendar) out.push('요일별 수업일 현황(.pdf, .hwp, .xlsx 또는 붙여넣기)을 넣어 주세요.');
  else for (const k of kindsToMake()) if (!src.calendar.weeks[KINDS[k].week - 1]) out.push(`수업일 현황에 ${KINDS[k].week}주차(${KINDS[k].label})가 없어요.`);
  return out;
}
const otherKind = k => (k === 'mid' ? 'final' : 'mid');
function kindsToMake() {
  const m = ui.missing, out = [m.kind];
  const o = otherKind(m.kind);
  if (ui.wiz.alsoOther && !findPlan(m.termYear, m.term, o)) out.push(o);
  return out.sort((a, b) => (a === 'mid' ? -1 : 1));
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
  const w = ui.wiz, m = ui.missing; if (!w || !m) return;
  const title = `${m.termYear}학년도 ${m.term}학기 ${KINDS[m.kind].label}`;
  const others = sortedPlans();
  const src = wizardSource();
  const issues = wizardIssues(src);
  const kinds = kindsToMake();
  const examWeeks = {}; for (const k of kinds) examWeeks[KINDS[k].week] = KINDS[k].label;
  const ttGroups = w.tt ? [...new Set(w.tt.classes.map(groupOf))].sort() : [];
  const shifted = src.calendar ? shiftedDays(src.calendar, src.year) : [];
  const o = otherKind(m.kind), otherExists = !!findPlan(m.termYear, m.term, o);
  const mkRows = src.makeups.map(x => {
    const c = src.classes.find(cc => cc.id === x.classId);
    return `<tr><td>${esc(c ? groupOf(c) : '')}</td><td>${esc(c ? c.course : x.classId)}</td><td>${x.from ? esc(fmt(x.from)) : '-'}</td><td>${esc(fmt(x.to))} ${pRange(x.start, x.end - x.start + 1)}</td></tr>`;
  }).join('');

  $('#createPanel').innerHTML = `
    <div class="row" style="justify-content:space-between"><h2>${esc(title)} · 자료 넣기</h2>
      ${Object.keys(Store.plans).length ? `<button type="button" class="btn small" id="wClose">취소하고 돌아가기</button>` : ''}</div>
    <p class="hint">이 시험은 아직 없어요. 그 학기 <b>강의시간표</b>와 <b>요일별 수업일 현황</b>, 있으면 <b>보강</b> 자료를 한꺼번에 넣으세요. 어떤 자료인지는 알아서 알아봐요. 지난 시험 기록은 그대로 남아요.</p>
    <section class="step"><h3><span class="n">1</span>자료</h3>
      ${others.length ? `<label class="field" for="wBase"><span>다른 시험의 자료 가져오기 (같은 학기 중간→기말이면 그대로 쓰면 돼요. 아래에 새 파일을 넣으면 그 자료가 우선해요)</span>
        <select id="wBase"><option value="">가져오지 않음</option>${others.map(p => `<option value="${esc(p.id)}"${p.id === w.base ? ' selected' : ''}>${esc(p.title)} · 수업 ${p.classes.length}개${(p.makeups || []).length ? ` · 보강 ${p.makeups.length}건` : ''}</option>`).join('')}</select></label>` : ''}
      <div class="dropzone" id="wDrop" data-drop="wizard">
        <b>여기에 파일을 끌어다 놓거나</b>
        <label class="btn small primary" for="wFiles">파일 고르기 (여러 개 가능)</label><input type="file" id="wFiles" multiple accept=".xlsx,.xlsm,.xls,.pdf,.hwp,.txt,.csv" hidden>
        <span class="hint">강의시간표 .xlsx/.xls · 수업일 현황 .pdf/.hwp/.xlsx · 보강 .hwp/.xls/.xlsx</span>
      </div>
      ${w.files.length ? `<div class="filelist">${w.files.map(f => `<div class="it ${f.type === 'unknown' ? 'bad' : 'ok'}"><span class="ty">${esc(TYPE_LABEL[f.type])}</span><span>${esc(f.name)}</span><span class="hint">${esc(f.msg)}</span></div>`).join('')}</div>` : ''}
      ${w.busy ? `<p class="hint">${esc(w.busy)}</p>` : ''}
      ${ttGroups.length ? `<div class="field"><span>시험 대상 반 (전공심화·야간처럼 빼야 할 반은 체크를 푸세요)</span><div class="radios">${ttGroups.map(g => {
          const n = w.tt.classes.filter(c => groupOf(c) === g).length;
          return `<label><input type="checkbox" data-group="${esc(g)}"${w.groupsOff[g] ? '' : ' checked'}>${esc(g)} <small class="hint">${n}개</small></label>`; }).join('')}</div></div>` : ''}
      <details${src.calendar && !w.cal?.error ? '' : ' open'}><summary class="hint">요일별 수업일 현황 직접 붙여넣기·고치기</summary>
        <label class="field" for="wCalText"><span>'주 / 월~토' 표 (PDF·한글에서 읽은 결과도 여기 나와요. 틀린 곳을 고친 뒤 '표 다시 읽기')</span>
          <textarea id="wCalText" rows="6" placeholder="주	월	화	수	목	금	토&#10;1	3/2	3/3	3/4	3/5	3/6	3/7&#10;…">${esc(w.calText)}</textarea></label>
        <div class="row"><button type="button" class="btn small" id="wCalParse">표 다시 읽기</button></div>
        ${w.cal?.error ? `<div class="result bad">${esc(w.cal.msg)}</div>` : ''}
      </details>
    </section>
    <section class="step"><h3><span class="n">2</span>확인</h3>
      ${src.classes ? `<p class="hint">수업 ${src.classes.length}개 · ${new Set(src.classes.map(groupOf)).size}개 반 · 교수님 ${new Set(src.classes.map(c => c.prof).filter(Boolean)).size}분${src.sources.timetable ? ` (${esc(src.sources.timetable)})` : ''}</p>` : ''}
      ${src.makeups.length || src.unmatched.length ? `<div class="field"><span>보강 ${src.makeups.length}건${src.unmatched.length ? ` · 짝을 못 찾은 줄 ${src.unmatched.length}개` : ''} (보강일에는 그 수업이 있는 것으로, 결강일에는 원래 수업이 없는 것으로 겹침을 검사해요)</span>
        ${mkRows ? `<div class="miniscroll"><table class="mklist"><thead><tr><th>반</th><th>과목</th><th>결강일</th><th>보강</th></tr></thead><tbody>${mkRows}</tbody></table></div>` : ''}
        ${src.unmatched.length ? `<div class="checks">${src.unmatched.map(u => `<div class="it warn">${esc(u.why)}: ${esc(u.line.replace(/\t+/g, ' '))}</div>`).join('')}</div>` : ''}</div>` : ''}
      ${src.calendar ? `<p class="hint">색칠된 줄이 시험 주차예요. 주황 날짜는 실제 요일과 다른 요일 수업을 하는 날(대체 수업일)이라 그 요일 시간표로 겹침을 검사해요.</p>
        ${shifted.length ? `<ul class="plain">${shifted.map(x => `<li>${esc(fmt(x.iso))} → ${esc(x.col)}요일 ${x.week}주차 수업일</li>`).join('')}</ul>` : ''}
        ${calendarPreview(src.calendar, src.year, examWeeks)}` : ''}
      ${otherExists ? '' : `<label class="chkline"><input type="checkbox" id="wAlso"${w.alsoOther ? ' checked' : ''}> 같은 자료로 ${KINDS[o].label}(${KINDS[o].week}주차)도 같이 만들기</label>`}
      <label class="field" for="wDept"><span>학과</span><input type="text" id="wDept" value="${esc(w.dept || src.dept || '')}"></label>
      ${issues.length ? `<div class="checks">${issues.map(t => `<div class="it warn">${esc(t)}</div>`).join('')}</div>` : ''}
      <div class="row"><button type="button" class="btn primary" id="wCreate"${issues.length || w.busy ? ' disabled' : ''}>${esc(kinds.map(k => KINDS[k].label).join('·'))} 만들기</button></div>
    </section>`;
}

/** 넣은 파일들을 알아보고 마법사 상태에 반영 */
async function wizardAddFiles(files) {
  const w = ui.wiz; if (!w || !files.length) return;
  w.busy = `파일 ${files.length}개 읽는 중…`; renderWizard();
  for (const f of files) {
    const r = await recognizeFile(f);
    w.files = w.files.filter(x => x.name !== r.name).concat([{ name: r.name, type: r.type, msg: r.msg }]);
    if (r.type === 'timetable') { w.tt = { name: r.name, classes: r.classes }; w.groupsOff = {}; }
    else if (r.type === 'calendar') { w.cal = { name: r.name, data: r.calendar, msg: r.msg }; w.calText = r.text; }
    else if (r.type === 'makeups') { w.mk = w.mk.filter(x => x.name !== r.name).concat([{ name: r.name, text: r.text }]); }
  }
  w.busy = '';
  renderWizard();
}

function createFromWizard() {
  const w = ui.wiz, m = ui.missing, src = wizardSource();
  if (wizardIssues(src).length) return;
  const made = [];
  for (const k of kindsToMake()) {
    const p = makePlan({ termYear: m.termYear, term: m.term, kind: k, dept: (w.dept || '').trim() || src.dept || S?.dept,
      calendar: src.calendar, classes: src.classes, sources: src.sources, taken: Store.plans });
    p.year = src.year;
    p.makeups = clone(src.makeups);
    Store.plans[p.id] = p; made.push(p);
    touchPlan(p);
  }
  ui.missing = null; ui.wiz = null;
  const first = made.find(p => p.kind === m.kind) || made[0];
  switchPlan(first.id);
  setTab('board');
  toast(`${made.map(p => p.title).join(', ')}을(를) 만들었어요.${src.makeups.length ? ` 보강 ${src.makeups.length}건 반영.` : ''}`);
}

function bindWizard() {
  const box = $('#createPanel');
  box.addEventListener('click', e => {
    if (e.target.closest('#wClose')) { closeWizard(); return; }
    if (e.target.closest('#wCreate')) { createFromWizard(); return; }
    if (e.target.closest('#wCalParse')) {
      const w = ui.wiz; w.calText = $('#wCalText').value;
      const r = parseCalendarText(w.calText);
      w.cal = r.data ? { name: w.cal?.name || '붙여넣은 표', data: r.data, msg: r.msg } : { error: true, msg: r.msg };
      renderWizard();
    }
  });
  box.addEventListener('change', e => {
    const w = ui.wiz, el = e.target; if (!w) return;
    if (el.id === 'wFiles') { const fs = [...el.files]; el.value = ''; wizardAddFiles(fs); return; }
    if (el.id === 'wBase') w.base = el.value;
    else if (el.id === 'wAlso') w.alsoOther = el.checked;
    else if (el.id === 'wDept') { w.dept = el.value; return; }
    else if (el.dataset.group) w.groupsOff[el.dataset.group] = !el.checked;
    else if (el.id === 'wCalText') {
      w.calText = el.value;
      if (el.value.trim()) { const r = parseCalendarText(el.value); w.cal = r.data ? { name: '붙여넣은 표', data: r.data, msg: r.msg } : { error: true, msg: r.msg }; }
    } else return;
    renderWizard();
  });
}
