/* ---------- 앱: 공용 UI 상태, 변경 알림, 이벤트 연결, 시작 ---------- */
const TABS = ['board', 'courses', 'history', 'setup'];
const ui = { tab: 'board', filter: { group: '', prof: '', status: '', q: '' }, drawerId: null, reg: null, pending: {}, hist: {}, wiz: null };

/** 지금 계획(S)을 고친 뒤 부른다: 저장 + 다시 그리기. 보관(잠금)된 계획은 저장하지 않는다. */
function changed(opts = {}) {
  if (isLocked()) { toast('보관된 기록이라 바꿀 수 없어요. 먼저 보관을 해제하세요.'); render(); return; }
  touchPlan(S);
  if (!opts.noRender) render();
}

let toastT = null;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 3600); }
async function copyText(text, fallbackEl) {
  try { await navigator.clipboard.writeText(text); toast('복사했어요.'); }
  catch {
    if (fallbackEl) { const rg = document.createRange(); rg.selectNodeContents(fallbackEl); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(rg); }
    toast('자동 복사가 막혀 있어요. 선택된 글을 Ctrl+C로 복사해 주세요.');
  }
}
function listTsv() {
  const head = ['날짜', '요일', '교시', '시간', '반', '과목', '교수', '강의실', '방식', '확정', '메모'];
  const rows = sortedExams().map(c => { const ex = S.exams[c.id], ok = hasSlot(ex);
    return [ok ? fmt(ex.date).replace(/\(.\)/, '') : '', ok ? DOW[dowOf(ex.date)] : '', ok ? pRange(ex.start, ex.len) : '', ok ? examTime(ex) : '', groupOf(c), c.course, c.prof, ok ? roomLabel(ex.room) : '', ex.method, ex.done ? 'O' : '', ex.note.replace(/\s+/g, ' ')]; });
  return [head, ...rows].map(r => r.join('\t')).join('\n');
}
function refreshRoomList() { $('#roomList').innerHTML = D.rooms.map(r => `<option value="${esc(r)}"></option>`).join(''); }
function setTab(tab, push = true) {
  ui.tab = tab;
  for (const b of $$('.tabs button')) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
  for (const p of $$('.tabpanel')) p.hidden = p.id !== 'tab-' + tab;
  if (push && location.hash !== '#' + tab) { try { history.replaceState(null, '', '#' + tab); } catch { location.hash = tab; } }
  render();
}

/* ---------- 파일 끌어다 놓기 (화면 어디서나) ----------
   - 고른 시험이 없을 때(자료 넣기 화면) → 그 화면으로
   - 백업(.json)만 → 학기별 기록의 백업 불러오기
   - 그 밖(시간표·수업일 현황·보강) → 설정 탭 '자료 다시 넣기' (종류를 알아보고 적용 버튼) */
function routeDroppedFiles(files) {
  if (!files.length) return;
  if (ui.missing) { wizardAddFiles(files); return; }
  if (files.every(f => /\.json$/i.test(f.name))) { historyRestoreFile(files[0]); return; }
  setupAddFiles(files);
}
function bindFileDrop() {
  const ov = $('#dropOverlay');
  let depth = 0;
  const hasFiles = e => [...(e.dataTransfer?.types || [])].includes('Files');
  const hide = () => { depth = 0; ov.hidden = true; $$('.dropzone.over').forEach(z => z.classList.remove('over')); };
  window.addEventListener('dragenter', e => {
    if (!hasFiles(e)) return;
    depth++;
    ov.hidden = false;
    ov.querySelector('.dropmsg').textContent = ui.missing ? '놓으면 이 시험의 자료로 넣어요' : '놓으면 자료로 넣어요';
  });
  window.addEventListener('dragover', e => {
    if (!hasFiles(e)) return;
    e.preventDefault();                                   // 브라우저가 파일을 열어 버리지 않게
    e.dataTransfer.dropEffect = 'copy';
    $$('.dropzone').forEach(z => z.classList.toggle('over', z.contains(e.target)));
  });
  window.addEventListener('dragleave', e => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) hide(); });
  window.addEventListener('drop', e => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    hide();
    routeDroppedFiles([...e.dataTransfer.files]);
  });
}

function bind() {
  $('.tabs').addEventListener('click', e => { const b = e.target.closest('button[data-tab]'); if (b) setTab(b.dataset.tab); });
  window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (TABS.includes(h) && h !== ui.tab) setTab(h, false); });
  $('#summary').addEventListener('click', e => { const b = e.target.closest('[data-jump]'); if (!b) return; ui.filter = { group: '', prof: '', status: b.dataset.jump, q: '' }; setTab('courses'); });
  $('#btnExport').addEventListener('click', exportExcel);
  $('#btnRegister').addEventListener('click', () => { if (!isLocked()) openRegister(); });
  // 학년도·학기·시험 선택
  for (const id of ['#selYear', '#selTerm', '#selKind']) $(id).addEventListener('change', () => {
    selectExam(+$('#selYear').value, +$('#selTerm').value, $('#selKind').value);
    if (!ui.missing) toast(`${S.title}을(를) 열었어요.`);
  });
  $('#lockBanner').addEventListener('click', e => { if (e.target.closest('#btnUnlock')) { S.locked = false; touchPlan(S); render(); toast('보관을 풀었어요. 이제 수정할 수 있어요.'); } });

  // 날짜별 배치: 주차×요일 판(카드는 날짜 칸으로) + 펼친 날짜의 반×교시 시간표(블록은 교시까지)
  const tb = $('#tab-board');
  tb.addEventListener('pointerdown', e => {
    const b = e.target.closest('.blk.exam'); if (!b || e.button !== 0 || isLocked()) return;
    const id = b.dataset.id, ex = S.exams[id];
    let grabP = 0;
    if (b.classList.contains('blk')) { const r = b.getBoundingClientRect(); grabP = Math.max(0, Math.min(ex.len - 1, Math.floor((e.clientX - r.left) / (r.width / ex.len)))); }
    drag = { id, el: b, x0: e.clientX, y0: e.clientY, started: false, grabP };
    e.preventDefault();
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  });
  tb.addEventListener('click', e => {
    if (e.target.closest('#btnKeepAll')) {
      if (isLocked()) return;
      const n = keepAllUnmoved(); changed();
      toast(`${n}과목을 '기존 시간표 수업 진행'으로 확정했어요.`); return;
    }
    if (e.target.closest('#rangeReset')) { if (isLocked()) return; delete S.range; changed(); return; }
    const b = e.target.closest('.blk.exam');
    if (b && (e.detail === 0 || isLocked())) openDrawer(b.dataset.id);
  });
  tb.addEventListener('change', e => {
    if (e.target.id === 'showFixed') { ui.showFixed = e.target.checked; renderBoard(); if (isLocked()) lockControls(); return; }
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (drag) endDrag(e, true); else if (ui.rp?.open) closeRangePop(); else if (ui.drawerId || ui.reg) closeDrawer();
  });

  const lt = $('#listTable');
  lt.addEventListener('change', e => {
    const el = e.target, f = el.dataset.f, tr = el.closest('tr[data-id]'); if (!f || !tr || isLocked()) return;
    setExamField(tr.dataset.id, f, el.type === 'checkbox' ? el.checked : el.value);
    changed();
  });
  lt.addEventListener('click', e => { const b = e.target.closest('[data-open]'); if (b) openDrawer(b.dataset.open); });
  $('#fGroup').addEventListener('change', e => { ui.filter.group = e.target.value; renderList(); if (isLocked()) lockControls(); });
  $('#fProf').addEventListener('change', e => { ui.filter.prof = e.target.value; renderList(); if (isLocked()) lockControls(); });
  $('#fStatus').addEventListener('change', e => { ui.filter.status = e.target.value; renderList(); if (isLocked()) lockControls(); });
  $('#fQ').addEventListener('input', e => { ui.filter.q = e.target.value; renderList(); if (isLocked()) lockControls(); });
  $('#btnCopyTsv').addEventListener('click', () => copyText(listTsv()));



  bindDrawer();
  bindRange();
  bindFileDrop();
  bindSetup();
  bindHistory();
  bindWizard();
}

(function boot() {
  const seed = JSON.parse(document.getElementById('seed').textContent);
  Store = loadLocal();
  if (!Store) {
    // 처음 여는 브라우저: 저장소에 들어 있는 기본 자료(data/seed.json)로 계획 하나를 만든다
    Store = newStore();
    const p = upgradePlan({ v: 1, ...seed, exams: {}, extraDates: [], rev: 0, updatedAt: 0 });
    Store.plans[p.id] = p; Store.currentId = p.id;
  }
  if (!Store.plans[Store.currentId]) Store.currentId = latestPlanId(Store);
  usePlan(Store.plans[Store.currentId]);
  persistLocal();
  refreshRoomList();
  bind();
  const h = location.hash.slice(1);
  setTab(TABS.includes(h) ? h : 'board', false);
  setSave('local');
  initCloud();
  initGitHub();
  getDownloads();
})();
window.__planner = {
  openRegister, saveRegister, get reg() { return ui.reg; }, get state() { return S; }, get store() { return Store; },
  derive, render, conflictsOf, warningsOf, statusOf, counts, freeSlots, itemsOn, buildWorkbook, parseCalendarText, parseTimetableXlsx,
  parseCalendarPdf, openDrawer, changed, switchPlan, openWizard, gh, ghSync,
};
