/* ---------- GitHub 저장 ----------
   정적 페이지(GitHub Pages)가 GitHub API로 저장소 파일을 직접 읽고 쓴다.
   - 위치: 저장소의 'data' 브랜치 / data/plans.json (코드가 있는 main과 분리 → 저장해도 사이트 재배포·코드 기록에 영향 없음)
   - 토큰(fine-grained, 이 저장소 Contents 읽기·쓰기)이 있으면 바뀐 뒤 몇 초 뒤 자동 커밋, 없으면 불러와서 보기만.
   - 다른 컴퓨터가 먼저 저장했으면(409) 다시 불러와 mergeStores()로 합친 뒤 저장.
   - 토큰은 이 브라우저 localStorage에만 둔다. */
const GH_KEY = 'exam-planner:github';
const GH_API = 'https://api.github.com';
const GH_SAVE_DELAY = 4000;
const gh = { cfg: null, sha: null, lastText: null, timer: null, busy: false, again: false, dirty: false, mode: 'off', error: '', repoInfo: null, savedAt: 0, loadedAt: 0 };

/** GitHub Pages 주소(<owner>.github.io/<repo>/)에서 저장소를 짐작 */
function ghGuessRepo(loc = location) {
  const h = loc.hostname || '';
  if (!h.endsWith('.github.io')) return '';
  const owner = h.split('.')[0];
  const seg = (loc.pathname || '').split('/').filter(Boolean)[0];
  return `${owner}/${seg && !seg.includes('.') ? seg : h}`;
}
function ghLoadCfg() {
  let c = {};
  try { c = JSON.parse(localStorage.getItem(GH_KEY) || '{}') || {}; } catch {}
  gh.cfg = { repo: c.repo || ghGuessRepo(), branch: c.branch || 'data', path: c.path || 'data/plans.json', token: c.token || '' };
}
function ghStoreCfg() { try { localStorage.setItem(GH_KEY, JSON.stringify(gh.cfg)); } catch {} }
const ghOn = () => !!(gh.cfg && /^[\w.-]+\/[\w.-]+$/.test(gh.cfg.repo));
const ghCanWrite = () => ghOn() && !!gh.cfg.token;

function b64EncodeUtf8(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function b64DecodeUtf8(b64) {
  const bin = atob(String(b64).replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

class GhError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
async function ghApi(method, path, body, accept) {
  const headers = { Accept: accept || 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  if (gh.cfg.token) headers.Authorization = 'Bearer ' + gh.cfg.token;
  if (body) headers['Content-Type'] = 'application/json';
  let r;
  try { r = await fetch(`${GH_API}/repos/${gh.cfg.repo}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' }); }
  catch { throw new GhError(0, 'GitHub에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.'); }
  return r;
}
async function ghFail(r, what) {
  let detail = '';
  try { detail = (await r.json()).message || ''; } catch {}
  const s = r.status;
  const msg = s === 401 ? '토큰이 틀렸거나 만료됐어요. 새 토큰을 넣어 주세요.'
    : s === 403 && /rate limit/i.test(detail) ? 'GitHub 요청 한도를 넘었어요. 토큰을 넣으면 한도가 늘어나요. 잠시 후 다시 해 주세요.'
    : s === 403 ? '이 토큰에 저장소 쓰기 권한이 없어요. 토큰의 Repository permissions에서 Contents를 Read and write로 해 주세요.'
    : s === 404 ? `${what}을(를) 찾지 못했어요. 저장소 이름을 확인해 주세요. 비공개 저장소라면 토큰이 필요해요.`
    : `${what} 실패 (${s}) ${detail}`;
  return new GhError(s, msg);
}

/** 저장소 정보(공개 여부·기본 브랜치) */
async function ghRepoInfo() {
  const r = await ghApi('GET', '');
  if (!r.ok) throw await ghFail(r, '저장소');
  const j = await r.json();
  gh.repoInfo = { private: !!j.private, defaultBranch: j.default_branch || 'main', canPush: !!(j.permissions && j.permissions.push), url: j.html_url };
  return gh.repoInfo;
}
/** 저장 브랜치가 없으면 기본 브랜치에서 만든다 */
async function ghEnsureBranch() {
  const b = encodeURIComponent(gh.cfg.branch);
  const r = await ghApi('GET', `/git/ref/heads/${b}`);
  if (r.ok) return;
  if (r.status !== 404) throw await ghFail(r, '브랜치');
  const info = gh.repoInfo || await ghRepoInfo();
  const base = await ghApi('GET', `/git/ref/heads/${encodeURIComponent(info.defaultBranch)}`);
  if (!base.ok) throw await ghFail(base, '기본 브랜치');
  const sha = (await base.json()).object.sha;
  const c = await ghApi('POST', '/git/refs', { ref: `refs/heads/${gh.cfg.branch}`, sha });
  if (!c.ok && c.status !== 422) throw await ghFail(c, '브랜치 만들기');
}
/** GitHub의 data/plans.json → { store|null, sha|null } (파일·브랜치가 아직 없으면 store null) */
async function ghRead() {
  const path = `/contents/${gh.cfg.path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(gh.cfg.branch)}`;
  const r = await ghApi('GET', path);
  if (r.status === 404) {
    if (!gh.repoInfo) await ghRepoInfo();   // 저장소 자체가 없으면 여기서 오류
    return { store: null, sha: null };
  }
  if (!r.ok) throw await ghFail(r, '저장 파일');
  const j = await r.json();
  let text;
  if (j.encoding === 'base64' && j.content) text = b64DecodeUtf8(j.content);
  else {   // 1MB가 넘으면 content가 비어 온다 → 원본으로 다시 받기
    const raw = await ghApi('GET', path, null, 'application/vnd.github.raw+json');
    if (!raw.ok) throw await ghFail(raw, '저장 파일');
    text = await raw.text();
  }
  const store = toStore(JSON.parse(text));
  if (!store) throw new GhError(0, `GitHub의 ${gh.cfg.path}가 이 도구의 저장 형식이 아니에요.`);
  return { store, sha: j.sha, text };
}
async function ghWrite(text, message) {
  const body = { message, content: b64EncodeUtf8(text), branch: gh.cfg.branch };
  if (gh.sha) body.sha = gh.sha;
  const r = await ghApi('PUT', `/contents/${gh.cfg.path.split('/').map(encodeURIComponent).join('/')}`, body);
  if (r.status === 409 || (r.status === 422 && !gh.sha)) return false;   // 다른 곳에서 먼저 저장함
  if (!r.ok) throw await ghFail(r, '저장');
  gh.sha = (await r.json()).content.sha;
  return true;
}
const ghPayloadText = () => JSON.stringify(storePayload(Store), null, 1) + '\n';

/** GitHub 내용과 이 브라우저 내용을 합친다. 이 브라우저 쪽이 바뀌면 화면을 다시 그린다. → GitHub에 올릴 게 있는지 */
function ghMergeIn(remote) {
  if (!remote.store) return true;
  const m = mergeStores(Store, remote.store);
  if (m.localChanged) {
    Store.plans = m.plans; Store.deleted = m.deleted;
    persistLocal({ silent: true });
    afterStoreChanged();
  }
  return m.remoteChanged;
}
function ghSetMode(mode, error = '') {
  gh.mode = mode; gh.error = error;
  if (cloud.col) return;   // claude.ai 저장소를 쓰는 중이면 그쪽 표시 유지
  setSave(mode, error);
  if (ui.tab === 'history' && typeof renderGitHubCard === 'function') renderGitHubCard();
}
function commitMessage() {
  const p = S && Store.plans[S.id];
  return p ? `시험 데이터 저장: ${p.title}` : '시험 데이터 저장';
}

/** 불러오기 + 합치기 + (쓸 수 있고 바뀐 게 있으면) 저장. 한 번에 하나만 돈다. */
async function ghSync({ push = true, fresh = false } = {}) {
  if (!ghOn()) return;
  if (gh.busy) { gh.again = true; gh.againFresh = gh.againFresh || fresh; return; }
  gh.busy = true; gh.dirty = false;
  try {
    ghSetMode(gh.loadedAt ? 'gh-saving' : 'gh-loading');
    if (!gh.repoInfo) await ghRepoInfo().catch(e => { if (e.status !== 403) throw e; });
    for (let attempt = 0; attempt < 3; attempt++) {
      if (fresh || !gh.loadedAt || attempt > 0 || !gh.sha) {
        const remote = await ghRead();
        gh.sha = remote.sha; gh.lastText = remote.text ?? null; gh.loadedAt = Date.now();
        ghMergeIn(remote);
      }
      if (!push || !ghCanWrite()) break;
      const text = ghPayloadText();
      if (text === gh.lastText) break;          // 바뀐 게 없음
      if (!gh.sha) await ghEnsureBranch();
      if (await ghWrite(text, commitMessage())) { gh.lastText = text; gh.savedAt = Date.now(); break; }
      if (attempt === 2) throw new GhError(409, '다른 곳에서 계속 저장하고 있어서 저장하지 못했어요. 잠시 후 다시 해 주세요.');
    }
    ghSetMode(ghCanWrite() ? 'gh-saved' : 'gh-readonly');
  } catch (err) {
    gh.dirty = true;
    ghSetMode('gh-error', err.message || String(err));
  } finally {
    gh.busy = false;
    if (gh.again) { const f = gh.againFresh; gh.again = gh.againFresh = false; ghSync({ push, fresh: f }); }
  }
}
/** 이 브라우저 저장소가 바뀔 때마다 부른다 (persistLocal). 잠시 모았다가 한 번에 커밋. */
function ghQueue() {
  if (!ghCanWrite() || !gh.loadedAt) return;
  if (ghPayloadText() === gh.lastText) return;
  gh.dirty = true;
  ghSetMode('gh-pending');
  clearTimeout(gh.timer);
  gh.timer = setTimeout(() => ghSync(), GH_SAVE_DELAY);
}
function ghSaveNow() { clearTimeout(gh.timer); return ghSync(); }
function initGitHub() {
  ghLoadCfg();
  window.addEventListener('beforeunload', e => { if (gh.dirty || gh.busy) { ghSaveNow(); e.preventDefault(); e.returnValue = ''; } });
  // 다른 컴퓨터에서 저장한 내용: 이 창으로 돌아올 때 다시 불러온다 (30초에 한 번까지)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && ghOn() && gh.loadedAt && Date.now() - gh.loadedAt > 30000) ghSync({ fresh: true });
  });
  if (ghOn()) ghSync();
}

/* ---------- 학기별 기록 탭의 'GitHub 저장' 카드 ---------- */
function ghStatusText() {
  const m = gh.mode;
  if (!ghOn()) return { cls: '', text: '연결 안 됨 · 이 브라우저에만 저장돼요' };
  if (m === 'gh-error') return { cls: 'bad', text: gh.error };
  if (m === 'gh-loading') return { cls: '', text: 'GitHub에서 불러오는 중…' };
  if (m === 'gh-saving' || m === 'gh-pending') return { cls: '', text: '저장 중…' };
  if (!ghCanWrite()) return { cls: '', text: `GitHub에서 불러왔어요 (${fmtStamp(gh.loadedAt)}). 토큰이 없어서 보기만 할 수 있어요. 고친 내용은 이 브라우저에만 남아요.` };
  return { cls: 'ok', text: gh.savedAt ? `GitHub에 저장했어요 (${fmtStamp(gh.savedAt)})` : `GitHub와 같아요 (${fmtStamp(gh.loadedAt)} 확인)` };
}
function renderGitHubCard() {
  const box = $('#ghCard'); if (!box) return;
  const c = gh.cfg, st = ghStatusText(), info = gh.repoInfo;
  const fileUrl = ghOn() ? `https://github.com/${c.repo}/commits/${encodeURIComponent(c.branch)}/${c.path}` : '';
  box.innerHTML = `<h2>GitHub에 저장</h2>
    <p class="hint">저장소의 <b>${esc(c.branch)}</b> 브랜치 <code>${esc(c.path)}</code> 파일에 모든 시험을 저장해요. 어느 컴퓨터에서 열어도 같은 내용을 불러오고, 저장할 때마다 커밋 기록이 남아요.</p>
    <div class="row">
      <label class="field" for="ghRepo"><span>저장소 (아이디/저장소)</span><input type="text" id="ghRepo" value="${esc(c.repo)}" placeholder="torgeleli22-lang/ExamScheduleCreate" size="32"></label>
      <label class="field" for="ghToken"><span>토큰 ${c.token ? '(저장됨)' : '(저장하려면 필요)'}</span><input type="password" id="ghToken" value="" placeholder="${c.token ? '••••••••  바꾸려면 새로 입력' : 'github_pat_…'}" size="30" autocomplete="off"></label>
    </div>
    <div class="row">
      <button type="button" class="btn small primary" id="ghConnect">연결하고 불러오기</button>
      ${ghCanWrite() ? '<button type="button" class="btn small" id="ghSave">지금 저장</button>' : ''}
      ${c.token ? '<button type="button" class="btn small danger" id="ghForget">이 브라우저에서 토큰 지우기</button>' : ''}
      ${fileUrl ? `<a class="btn small" href="${esc(fileUrl)}" target="_blank" rel="noopener">저장 기록 보기</a>` : ''}
    </div>
    <div class="result ${st.cls}">${esc(st.text)}</div>
    ${info && !info.private ? '<p class="hint" style="color:var(--warn)">이 저장소는 공개(public)라서 저장한 시험 일정과 메모를 누구나 볼 수 있어요. 메모에 민감한 내용은 쓰지 마세요.</p>' : ''}
    <details><summary class="hint">토큰 만드는 법</summary><ol class="plain">
      <li>GitHub → 오른쪽 위 프로필 → Settings → Developer settings → Personal access tokens → <b>Fine-grained tokens</b> → Generate new token</li>
      <li>Expiration: 1년 정도, Repository access: <b>Only select repositories</b> → 이 저장소만 선택</li>
      <li>Repository permissions → <b>Contents: Read and write</b> (나머지는 그대로)</li>
      <li>만든 토큰(github_pat_…)을 위 칸에 붙여 넣고 '연결하고 불러오기'. 토큰은 이 브라우저에만 저장돼요. 공용 컴퓨터라면 다 쓴 뒤 지워 주세요.</li>
    </ol></details>`;
}
function bindGitHubCard() {
  $('#historyBox').addEventListener('click', e => {
    if (e.target.closest('#ghConnect')) {
      const repo = $('#ghRepo').value.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/+$/, '');
      const token = $('#ghToken').value.trim();
      if (repo !== gh.cfg.repo) { gh.sha = null; gh.lastText = null; gh.loadedAt = 0; gh.repoInfo = null; }
      gh.cfg.repo = repo;
      if (token) { gh.cfg.token = token; gh.repoInfo = null; }
      ghStoreCfg();
      if (!ghOn()) { ghSetMode('gh-error', '저장소를 "아이디/저장소" 모양으로 입력해 주세요.'); return; }
      gh.loadedAt = 0; ghSync({ fresh: true });
      return;
    }
    if (e.target.closest('#ghSave')) { ghSaveNow(); return; }
    if (e.target.closest('#ghForget')) { gh.cfg.token = ''; gh.repoInfo = null; ghStoreCfg(); ghSetMode(ghOn() ? 'gh-readonly' : 'local'); renderGitHubCard(); toast('이 브라우저에서 토큰을 지웠어요.'); }
  });
}
