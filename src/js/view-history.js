/* ---------- 학기별 기록 탭: 모든 시험(학기 × 중간/기말) 목록, 보관(잠금), 삭제, 전체 백업 ---------- */
function renderHistory() {
  const plans = sortedPlans();
  const h = ui.hist;
  const byTerm = new Map();
  for (const p of plans) { const k = `${p.termYear}학년도 ${p.term}학기`; if (!byTerm.has(k)) byTerm.set(k, []); byTerm.get(k).push(p); }
  const card = p => {
    const k = countsOfPlan(p);
    const cur = p.id === S.id;
    const groups = new Set(p.classes.map(groupOf)).size;
    const src = p.sources || {};
    return `<article class="plancard${cur ? ' cur' : ''}" data-plan="${esc(p.id)}">
      <h3>${esc(KINDS[p.kind]?.label || p.title)} <small class="hint">${p.examWeek}주차</small>${p.locked ? '<span class="pill na">🔒 보관됨</span>' : ''}${cur ? '<span class="pill ok">지금 보는 중</span>' : ''}</h3>
      <div class="meta">${esc(p.title)} · 수업 ${p.classes.length}개 · ${groups}개 반</div>
      <div class="st">${k.bad ? `<span class="pill bad">겹침 ${k.bad}</span>` : '<span class="pill ok">겹침 0</span>'}<span class="pill ${k.done === k.all ? 'ok' : 'na'}">확정 ${k.done}/${k.all}</span>${k.moved ? `<span class="pill mv">변경 ${k.moved}</span>` : ''}${k.und ? `<span class="pill warn">방식 미정 ${k.und}</span>` : ''}</div>
      <div class="meta">마지막 수정 ${esc(fmtStamp(p.updatedAt))}${src.timetable || src.calendar ? `<br>자료: ${esc([src.timetable, src.calendar].filter(Boolean).join(', '))}` : ''}</div>
      <div class="row">
        ${cur ? '' : `<button type="button" class="btn small primary" data-act="open">열기</button>`}
        <button type="button" class="btn small" data-act="lock">${p.locked ? '보관 해제' : '보관(잠금)'}</button>
        <button type="button" class="btn small" data-act="backup">이 시험 백업</button>
        <button type="button" class="btn small danger" data-act="del"${plans.length <= 1 ? ' disabled title="마지막 시험은 지울 수 없어요"' : ''}>삭제</button>
      </div>
      ${h.del === p.id ? `<div class="result bad">'${esc(p.title)}'을(를) 지울까요? 되돌릴 수 없어요. 먼저 백업을 받아 두세요.
        <div class="row" style="margin-top:6px"><button type="button" class="btn small danger" data-act="delYes">지우기</button><button type="button" class="btn small" data-act="delNo">취소</button></div></div>` : ''}
    </article>`;
  };
  $('#historyBox').innerHTML = `
    <div class="histhead">
      <p class="hint">학기마다 중간고사·기말고사를 따로 만들어 두고 언제든 다시 열어 볼 수 있어요. 끝난 시험은 '보관(잠금)'하면 실수로 고쳐지지 않아요.</p>
      <div class="row">
        <button type="button" class="btn primary" data-act="new">+ 새 시험 만들기</button>
        <button type="button" class="btn small" data-act="backupAll">전체 백업 저장 (.json)</button>
        <label class="btn small" for="hRestore">백업 불러오기</label><input type="file" id="hRestore" accept=".json,application/json" hidden>
      </div>
    </div>
    ${h.restore ? `<div class="result ${h.restore.error ? 'bad' : ''}" style="margin-bottom:14px">${esc(h.restore.msg)}
      ${h.restore.store ? `<button type="button" class="btn small danger" data-act="restoreYes">불러오기</button> <button type="button" class="btn small" data-act="restoreNo">취소</button>` : ''}</div>` : ''}
    ${[...byTerm].map(([k, list]) => `<section class="term"><h2>${esc(k)}</h2><div class="plancards">${list.map(card).join('')}</div></section>`).join('')
      || '<div class="empty">아직 만든 시험이 없어요.</div>'}`;
}

/** 백업 파일을 지금 저장소와 합칠 계획을 세운다: 없는 시험은 추가, 같은 시험은 백업이 더 최신일 때만 덮어씀 */
function planRestore(raw) {
  const st = toStore(raw);
  if (!st || !Object.keys(st.plans).length) return { error: true, msg: '이 도구의 백업 파일이 아니에요.' };
  let add = 0, over = 0, skip = 0;
  for (const p of Object.values(st.plans)) {
    const cur = Store.plans[p.id];
    if (!cur) add++; else if ((p.updatedAt || 0) > (cur.updatedAt || 0)) over++; else skip++;
  }
  return { store: st, msg: `백업에 시험 ${Object.keys(st.plans).length}개가 있어요: 새로 추가 ${add}개, 백업이 더 최신이라 덮어쓰기 ${over}개, 지금 것이 같거나 최신이라 건너뛰기 ${skip}개.` };
}
function applyRestore(st) {
  let n = 0;
  for (const p of Object.values(st.plans)) {
    const cur = Store.plans[p.id];
    if (!cur || (p.updatedAt || 0) > (cur.updatedAt || 0)) { Store.plans[p.id] = p; persistLocal(); queueCloud(p.id); n++; }
  }
  return n;
}

function switchPlan(id) {
  const p = Store.plans[id]; if (!p) return;
  Store.currentId = id; usePlan(p);
  ui.pending = {}; ui.filter = { group: '', prof: '', status: '', q: '' };
  closeDrawer(); refreshRoomList(); persistLocal(); render();
}

function bindHistory() {
  const box = $('#historyBox');
  box.addEventListener('click', async e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act, id = b.closest('[data-plan]')?.dataset.plan, p = id && Store.plans[id];
    if (act === 'new') { openWizard(); return; }
    if (act === 'backupAll') { await saveFile(`시험시간표_전체백업_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(Store, null, 1)); return; }
    if (act === 'restoreNo') { ui.hist.restore = null; renderHistory(); return; }
    if (act === 'restoreYes') { const n = applyRestore(ui.hist.restore.store); ui.hist.restore = null; afterStoreChanged(); toast(`백업에서 시험 ${n}개를 불러왔어요.`); return; }
    if (!p) return;
    if (act === 'open') { switchPlan(id); setTab('board'); toast(`${p.title}을(를) 열었어요.`); return; }
    if (act === 'lock') { p.locked = !p.locked; touchPlan(p); render(); toast(p.locked ? `${p.title}을(를) 보관했어요. 이제 수정할 수 없어요.` : `${p.title} 보관을 풀었어요.`); return; }
    if (act === 'backup') { await saveFile(`${safeName(p.title)}_백업.json`, JSON.stringify({ v: 2, plans: { [p.id]: p }, currentId: p.id }, null, 1)); return; }
    if (act === 'del') { ui.hist.del = id; renderHistory(); return; }
    if (act === 'delNo') { ui.hist.del = null; renderHistory(); return; }
    if (act === 'delYes') {
      ui.hist.del = null;
      delete Store.plans[id];
      if (Store.currentId === id) Store.currentId = latestPlanId(Store);
      persistLocal(); queueCloud(id);
      switchPlan(Store.currentId);
      toast(`${p.title}을(를) 지웠어요.`); return;
    }
  });
  box.addEventListener('change', async e => {
    if (e.target.id !== 'hRestore' || !e.target.files[0]) return;
    try { ui.hist.restore = planRestore(JSON.parse(await e.target.files[0].text())); }
    catch { ui.hist.restore = { error: true, msg: '파일을 읽지 못했어요. JSON 백업 파일인지 확인해 주세요.' }; }
    renderHistory();
  });
}
