/* ---------- 저장 ----------
   - 기본: 이 브라우저 localStorage('exam-planner:v2'). 예전 v1 데이터('exam-planner:v1')는 처음 열 때 계획 하나로 옮긴다(원본은 그대로 둠).
   - claude.ai 아티팩트로 열면 window.claude.use('db')의 'plans/{planId}' 문서에 계획별로 저장한다.
     삭제는 {deleted:true} 표시만 남겨 다른 사람 화면에서도 지워지게 한다. 지금 보는 계획(currentId)은 브라우저마다 따로. */
const LS_KEY = 'exam-planner:v2';
const LS_KEY_V1 = 'exam-planner:v1';
const TAB_ID = Math.random().toString(36).slice(2, 10);

function persistLocal() { try { localStorage.setItem(LS_KEY, JSON.stringify(Store)); return true; } catch { return false; } }
function loadLocal() {
  try { const t = localStorage.getItem(LS_KEY); if (t) { const st = toStore(JSON.parse(t)); if (st && Object.keys(st.plans).length) return st; } } catch {}
  try { const t = localStorage.getItem(LS_KEY_V1); if (t) return toStore(JSON.parse(t)); } catch {}
  return null;
}

const cloud = { col: null, loaded: false, mode: 'local', queue: {}, writing: {}, timer: {} };
function setSave(mode, detail) {
  if (mode) cloud.mode = mode;
  const el = $('#saveState');
  const map = { local: '이 브라우저에 저장돼요', loading: '저장된 내용 불러오는 중', saving: '저장 중', cloud: '저장됨', offline: '저장소 연결 대기 중 · 이 브라우저에 보관', error: '저장소에 저장하지 못했어요 · 이 브라우저에 보관' };
  el.textContent = map[cloud.mode] || '';
  el.className = 'savepill ' + cloud.mode;
  if (detail) el.title = String(detail);
}
/** 계획 p가 바뀌었다고 알림 → 로컬 저장 + (있으면) 클라우드 예약 */
function touchPlan(p) {
  p.rev = (p.rev || 0) + 1; p.updatedAt = Date.now(); p.writer = TAB_ID;
  persistLocal();
  queueCloud(p.id);
}
function queueCloud(id) {
  if (!cloud.col) return;
  cloud.queue[id] = true; setSave('saving');
  clearTimeout(cloud.timer[id]); cloud.timer[id] = setTimeout(() => flushCloud(id), 700);
}
async function flushCloud(id) {
  if (!cloud.col || cloud.writing[id] || !cloud.queue[id]) return;
  cloud.writing[id] = true; delete cloud.queue[id];
  const p = Store.plans[id];
  try {
    const body = p ? { payload: JSON.stringify(p), rev: p.rev || 0, updatedAt: p.updatedAt || 0, writer: TAB_ID }
      : { deleted: true, updatedAt: Date.now(), writer: TAB_ID };
    await cloud.col.doc(id).set(body);
    if (!Object.keys(cloud.queue).length) setSave('cloud');
  } catch (err) {
    if (err && err.code === 'unavailable') { cloud.queue[id] = true; setTimeout(() => flushCloud(id), 1500 + Math.random() * 1500); }
    else setSave('error', err && (err.message || err.code));
  } finally {
    cloud.writing[id] = false;
    if (cloud.queue[id] && cloud.mode !== 'error') { clearTimeout(cloud.timer[id]); cloud.timer[id] = setTimeout(() => flushCloud(id), 400); }
  }
}
/** 클라우드에서 온 문서 하나를 반영. 바뀐 게 있으면 true */
function applyRemote(id, d) {
  const local = Store.plans[id];
  if (d.deleted) {
    if (local && (local.updatedAt || 0) <= (d.updatedAt || 0)) { delete Store.plans[id]; return true; }
    return false;
  }
  if (d.writer === TAB_ID || (local && (local.updatedAt || 0) >= (d.updatedAt || 0))) return false;
  try { const p = JSON.parse(d.payload); if (!validPlan(p)) return false; Store.plans[id] = upgradePlan(p); return true; } catch { return false; }
}
async function initCloud() {
  if (!(window.claude && typeof window.claude.use === 'function')) { setSave('local'); return; }
  let db = null;
  try { db = await window.claude.use('db'); } catch { db = null; }
  if (!db) { setSave('local'); return; }
  try { cloud.col = db.collection('plans'); } catch { setSave('local'); return; }
  setSave('loading');
  const timer = setTimeout(() => { if (!cloud.loaded) setSave('offline'); }, 10000);
  cloud.col.onSnapshot(async snap => {
    const definitive = !snap.metadata.fromCache;
    let dirty = false;
    const seen = new Set();
    for (const doc of snap.docs) { seen.add(doc.id); if (applyRemote(doc.id, doc.data() || {})) dirty = true; }
    if (definitive && !cloud.loaded) {
      cloud.loaded = true; clearTimeout(timer);
      if (snap.empty) await importLegacyCloud(db);
      // 이 브라우저에만 있거나 더 최신인 계획은 올린다
      for (const p of Object.values(Store.plans)) {
        const d = snap.docs.find(x => x.id === p.id)?.data();
        if (!seen.has(p.id) || (d && !d.deleted && (p.updatedAt || 0) > (d.updatedAt || 0))) queueCloud(p.id);
      }
      if (!Object.keys(cloud.queue).length && cloud.mode !== 'error') setSave('cloud');
    }
    if (dirty) { persistLocal(); afterStoreChanged(); }
  }, err => { clearTimeout(timer); cloud.col = null; setSave('error', err && (err.message || err.code)); });
}
/** 예전 버전이 'planner/state' 한 문서에 저장했던 내용이 있으면 계획으로 가져온다 */
async function importLegacyCloud(db) {
  try {
    const snap = await db.doc('planner/state').get();
    if (!snap.exists) return;
    const s = JSON.parse(snap.data().payload);
    if (!validPlan(s)) return;
    const p = upgradePlan(s);
    const local = Store.plans[p.id];
    if (!local || (local.updatedAt || 0) < (s.updatedAt || 0)) { Store.plans[p.id] = p; persistLocal(); afterStoreChanged(); }
  } catch {}
}
/** 저장소가 바깥(클라우드)에서 바뀐 뒤: 보고 있던 계획을 다시 잡고 화면 갱신 */
function afterStoreChanged() {
  if (!Object.keys(Store.plans).length && S) Store.plans[S.id] = S;   // 마지막 계획까지 지워지면 보던 것을 남긴다
  if (!Store.plans[Store.currentId]) Store.currentId = latestPlanId(Store);
  usePlan(Store.plans[Store.currentId]);
  if (typeof render === 'function') { render(); if (ui.drawerId && D.byId[ui.drawerId]) openDrawer(ui.drawerId); }
}
