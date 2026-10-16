'use strict';

const TINT_PRESETS = ['#2563eb', '#1f2328', '#ffffff', '#dc2626', '#16a34a', '#d97706'];

function loadTint() {
  try {
    const t = JSON.parse(localStorage.getItem('crm.tint') || 'null');
    if (t && typeof t.on === 'boolean' && typeof t.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(t.color)) return t;
  } catch (_) { /* 忽略损坏的本地存储 */ }
  return { on: false, color: '#2563eb' };
}

const state = {
  role: localStorage.getItem('crm.role') || 'designer',
  projectId: localStorage.getItem('crm.project') || '',
  projects: [],
  tab: 'assets',
  sort: 'time',
  query: '',
  selected: '', // 当前在右侧详情面板展示的资源 logical 名
  tint: loadTint(), // 着色预览，仅展示用
  data: { project: null, config: {}, assets: [], releases: [], pending: null },
};

let lightboxAsset = null; // 大图弹窗当前展示的资源

const $ = (sel) => document.querySelector(sel);

/** 当前项目的作用域 API 前缀；pj('/state') -> /api/projects/<pid>/state */
function pj(p = '') {
  return `/api/projects/${encodeURIComponent(state.projectId)}${p}`;
}

async function api(path, opts) {
  const res = await fetch(path, opts);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

function toast(msg, ms = 2200) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (el.hidden = true), ms);
}

function saveTint() {
  localStorage.setItem('crm.tint', JSON.stringify(state.tint));
}

async function refresh() {
  await loadProjects();
  if (!state.projectId) {
    state.data = { project: null, config: {}, assets: [], releases: [], pending: null };
    render();
    return;
  }
  state.data = await api(pj('/state'));
  render();
}

/** 拉取项目列表，并校正当前选中的项目（被删/不存在时回退第一个） */
async function loadProjects() {
  const r = await api('/api/projects');
  state.projects = r.projects;
  if (!r.projects.some((p) => p.id === state.projectId)) {
    state.projectId = r.projects[0] ? r.projects[0].id : '';
    if (state.projectId) localStorage.setItem('crm.project', state.projectId);
    else localStorage.removeItem('crm.project');
  }
}

/* ---------------- 渲染 ---------------- */

function render() {
  renderRoles();
  renderProjectSwitch();
  const has = !!state.projectId;
  $('#noProject').hidden = has;
  $('#tabs').hidden = !has;
  document.querySelector('main').hidden = !has;
  if (!has) return;
  renderTabs();
  renderAssets();
  renderDetail();
  renderPending();
  renderReleases();
  renderDiffPickers();
}

function renderRoles() {
  document.querySelectorAll('#roleSwitch button').forEach((b) => {
    b.classList.toggle('active', b.dataset.role === state.role);
  });
  const isDesigner = state.role === 'designer';
  document.querySelectorAll('.designer-only').forEach((el) => (el.hidden = !isDesigner));
  // 编辑按钮额外要求已选中项目（不能只按角色放开）
  $('#editProjectBtn').hidden = !isDesigner || !state.projectId;
  $('#noProjectHint').hidden = isDesigner || state.projects.length > 0;
}

function renderProjectSwitch() {
  const sel = $('#projectSelect');
  const opts = state.projects
    .map((p) => `<option value="${p.id}">${escapeHtml(p.name)} · ${p.id}</option>`)
    .join('');
  if (sel.dataset.filled !== opts) {
    sel.innerHTML = opts;
    sel.dataset.filled = opts;
  }
  sel.value = state.projectId;
}

function renderTabs() {
  document.querySelectorAll('#tabs button').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === state.tab);
  });
  document.querySelectorAll('.tab-panel').forEach((p) => {
    p.hidden = p.id !== `tab-${state.tab}`;
  });
}

function sortedAssets() {
  const q = state.query.trim().toLowerCase();
  // 已删除的图标不在列表展示（详情面板仍保留「恢复」入口）
  let list = state.data.assets.filter((a) => a.status !== 'removed' && (!q || a.logical.includes(q)));
  if (state.sort === 'name') {
    list = list.slice().sort((a, b) => a.logical.localeCompare(b.logical));
  } else {
    list = list.slice().sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  }
  return list;
}

/**
 * 分组视图：按版本 / 按日期，其余排序返回 null（平铺列表）。
 * 返回 [{ label, assets }]，顺序即展示顺序。
 */
function assetGroups() {
  const list = sortedAssets();
  if (state.sort === 'version') {
    const byKey = new Map();
    for (const a of list) {
      const key = a.addedVersion || '';
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(a);
    }
    // 组顺序：未发布（最新）在前，其余按发布记录倒序（releases 已是最新在前）
    const order = ['', ...state.data.releases.map((r) => r.version)];
    return order
      .filter((k) => byKey.has(k))
      .map((k) => ({
        label: k ? `v${k}` : '未发布',
        assets: byKey.get(k).sort((a, b) => a.logical.localeCompare(b.logical)),
      }));
  }
  if (state.sort === 'date') {
    const byKey = new Map();
    for (const a of list) {
      const key = (a.updatedAt || '').slice(0, 10);
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(a);
    }
    return [...byKey.keys()].sort((x, y) => y.localeCompare(x)).map((k) => ({
      label: k,
      assets: byKey.get(k).sort((a, b) =>
        (b.updatedAt || '').localeCompare(a.updatedAt || '') || a.logical.localeCompare(b.logical)),
    }));
  }
  return null;
}

function previewUrl(a) {
  const scales = a.scales && a.scales.length ? a.scales : [3];
  const max = Math.max(...scales);
  return `/uploads/${encodeURIComponent(state.projectId)}/${a.logical}/source@${max}x.png`;
}

/* 资源列表：只展示图标 + 名称，详细信息见右侧面板；按版本 / 按日期时分组展示 */
function renderAssets() {
  const grid = $('#assetGrid');
  const groups = assetGroups();
  if (groups) {
    grid.classList.add('grouped');
    $('#assetEmpty').hidden = groups.length > 0;
    grid.innerHTML = groups.map((g) => `
      <div class="asset-group">
        <div class="asset-group-title">${escapeHtml(g.label)}<span class="muted">${g.assets.length} 个</span></div>
        <div class="asset-group-grid">${g.assets.map(assetCard).join('')}</div>
      </div>`).join('');
  } else {
    grid.classList.remove('grouped');
    const list = sortedAssets();
    $('#assetEmpty').hidden = list.length > 0;
    grid.innerHTML = list.map(assetCard).join('');
  }
}

function assetCard(a) {
  const removed = a.status === 'removed';
  const cls = [
    'asset-card',
    removed ? 'removed' : '',
    a.logical === state.selected ? 'selected' : '',
  ].filter(Boolean).join(' ');
  return `
  <div class="${cls}" data-logical="${escapeHtml(a.logical)}" title="${escapeHtml(a.logical)}">
    <div class="asset-thumb">
      <img src="${previewUrl(a)}" alt="${escapeHtml(a.logical)}" loading="lazy" onerror="this.style.display='none'">
    </div>
    <div class="asset-name">${escapeHtml(a.logical)}</div>
    ${removed ? '<span class="card-flag">已删除</span>' : ''}
  </div>`;
}

/* 未发布的修改横幅：上传 / 删除 / 恢复后，由发布新版本批量提交 */
function renderPending() {
  const p = state.data.pending;
  const banner = $('#pendingBanner');
  if (!p || !p.hasChanges) {
    banner.hidden = true;
    return;
  }
  $('#pendingText').innerHTML =
    `有修改未保存：新增 ${p.added.length} · 修改 ${p.modified.length} · 删除 ${p.removed.length}，请保存发布新版本`;
  banner.hidden = false;
}

/* 右侧详情面板 */
function renderDetail() {
  const empty = $('#detailEmpty');
  const body = $('#detailBody');
  const a = state.data.assets.find((x) => x.logical === state.selected);
  if (!a) {
    state.selected = '';
    empty.hidden = false;
    body.hidden = true;
    body.innerHTML = '';
    return;
  }

  empty.hidden = true;
  body.hidden = false;
  const isDesigner = state.role === 'designer';
  const removed = a.status === 'removed';
  const scales = (a.scales || []).map((s) => '@' + s + 'x').join(' / ') || '-';
  const tintable = !!a.vectorLike; // 着色预览只对矢量图（单色图标）开放

  body.innerHTML = `
    <div class="detail-preview preview-stage" title="点击查看大图">
      <img src="${previewUrl(a)}" alt="${escapeHtml(a.logical)}" onerror="this.style.display='none'">
      <div class="tint-layer"></div>
    </div>
    <div class="detail-name">
      <span class="asset-name">${escapeHtml(a.logical)}</span>
      ${removed ? '<span class="tag warn">已删除</span>' : ''}
      <span class="tag">png</span>
    </div>
    <div class="info-rows">
      <div class="info-row"><span class="k">Android</span>
        <span class="v"><code data-copy="${escapeHtml(a.androidName)}" title="点击复制">${escapeHtml(a.androidName)}</code></span></div>
      <div class="info-row"><span class="k">iOS</span>
        <span class="v"><code data-copy="${escapeHtml(a.iosName)}" title="点击复制">${escapeHtml(a.iosName)}</code></span></div>
      <div class="info-row"><span class="k">原始尺寸</span><span class="v">${a.width}×${a.height}</span></div>
      <div class="info-row"><span class="k">倍率</span><span class="v">${scales}</span></div>
      <div class="info-row"><span class="k">更新时间</span><span class="v">${fmtTime(a.updatedAt)}</span></div>
    </div>
    <div class="tint-box" ${tintable ? '' : 'hidden'}>
      <label class="tint-toggle">
        <input type="checkbox" id="tintToggle" ${state.tint.on ? 'checked' : ''}>
        着色预览 <span class="muted">（仅展示用）</span>
      </label>
      <div class="tint-controls" ${state.tint.on ? '' : 'hidden'}>
        <input type="color" id="tintColor" value="${state.tint.color}" title="自定义着色">
        <div class="swatches">
          ${TINT_PRESETS.map((c) =>
            `<span class="swatch ${c.toLowerCase() === state.tint.color.toLowerCase() ? 'active' : ''}"
                   data-swatch="${c}" style="background:${c}" title="${c}"></span>`).join('')}
        </div>
      </div>
    </div>
    ${tintable ? '' : '<div class="muted detail-tip">位图不支持着色预览，仅矢量图（单色图标）可着色。</div>'}
    <div class="detail-actions">
      <button data-act="zoom">查看大图</button>
      ${isDesigner ? (removed
        ? '<button data-act="restore">恢复</button>'
        : '<button data-act="remove" class="danger">删除</button>') : ''}
    </div>
    <div class="muted detail-tip">点击图片查看大图；着色仅对矢量图生效、仅用于预览，不会修改源图与打包产物。</div>
  `;

  syncPreviewStages();
}

/* 着色预览：按图标 alpha 形状填充单色（CSS mask），仅矢量图（单色图标）开放、仅展示用 */
function syncStage(stage, a) {
  if (!stage) return;
  const img = stage.querySelector('img');
  const layer = stage.querySelector('.tint-layer');
  if (!img || !layer) return;
  if (a && a.vectorLike && state.tint.on) {
    const url = previewUrl(a);
    layer.style.maskImage = `url("${url}")`;
    layer.style.webkitMaskImage = `url("${url}")`;
    layer.style.backgroundColor = state.tint.color;
    layer.hidden = false;
    img.hidden = true;
  } else {
    layer.hidden = true;
    layer.style.backgroundColor = '';
    img.hidden = false;
  }
}

function syncPreviewStages() {
  const a = state.data.assets.find((x) => x.logical === state.selected) || null;
  syncStage($('#assetDetail .preview-stage'), a);
  syncStage($('#lightbox .preview-stage'), lightboxAsset);
}

function setTint(on, color) {
  state.tint.on = on;
  if (color) state.tint.color = color;
  saveTint();
  renderDetail();
}

function updateSwatchActive() {
  document.querySelectorAll('#assetDetail .swatch').forEach((s) => {
    s.classList.toggle('active', s.dataset.swatch.toLowerCase() === state.tint.color.toLowerCase());
  });
}

/* ---------------- 大图弹窗 ---------------- */

function openLightbox() {
  const a = state.data.assets.find((x) => x.logical === state.selected);
  if (!a) return;
  lightboxAsset = a;
  $('#lightboxTitle').textContent = a.logical;
  const scales = (a.scales || []).map((s) => '@' + s + 'x').join(' / ');
  $('#lightboxMeta').textContent = `原始尺寸 ${a.width}×${a.height}${scales ? ' · ' + scales : ''}`;
  $('#lightboxImg').src = previewUrl(a);
  syncStage($('#lightbox .preview-stage'), a);
  $('#lightbox').showModal();
}

function closeLightbox() {
  lightboxAsset = null;
  $('#lightbox').close();
}

/* ---------------- 版本 / diff ---------------- */

function renderReleases() {
  const wrap = $('#releaseList');
  const rels = state.data.releases;
  $('#releaseEmpty').hidden = rels.length > 0;
  wrap.innerHTML = rels.map(releaseItem).join('');
}

function releaseItem(r) {
  const c = r.changelog || { added: [], modified: [], removed: [] };
  const chips = [
    ...(c.added || []).map((n) => `<span class="chip add">+ ${n}</span>`),
    ...(c.modified || []).map((n) => `<span class="chip mod">~ ${n}</span>`),
    ...(c.removed || []).map((n) => `<span class="chip del">- ${n}</span>`),
  ].join('') || '<span class="muted">无资源变化</span>';

  return `
  <div class="release-item">
    <div class="release-head">
      <span class="release-ver">v${r.version}</span>
      <span class="muted">${r.assetCount} 个资源</span>
      <span class="muted">by ${r.by || 'unknown'}</span>
      <span class="release-time">${fmtTime(r.at)}</span>
    </div>
    ${r.note ? `<div class="release-note">${escapeHtml(r.note)}</div>` : ''}
    <div class="chips">${chips}</div>
    ${r.artifacts ? `<div class="usage">Android: ${escapeHtml(r.artifacts.android.artifact)}
iOS:     ${escapeHtml(r.artifacts.ios.packageName)} (SPM)  ·  ${escapeHtml(r.artifacts.ios.localUsage)}</div>` : ''}
  </div>`;
}

function renderDiffPickers() {
  const rels = state.data.releases; // 已是倒序
  const opts = rels.map((r) => `<option value="${r.version}">v${r.version}</option>`).join('');
  const from = $('#diffFrom');
  const to = $('#diffTo');
  if (from.dataset.filled === opts) return;
  from.innerHTML = `<option value="">（上一版）</option>` + opts;
  to.innerHTML = opts;
  from.dataset.filled = opts;
  if (rels[0]) to.value = rels[0].version;
  if (rels[1]) from.value = rels[1].version;
}

async function loadDiff() {
  if (!state.projectId) return;
  const from = $('#diffFrom').value;
  const to = $('#diffTo').value;
  if (!to) {
    $('#diffBody').innerHTML = '<div class="empty">还没有发布记录。</div>';
    return;
  }
  const d = await api(pj(`/diff?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`));
  const col = (title, cls, arr) => `
    <div class="diff-col ${cls}">
      <h3>${title}（${arr.length}）</h3>
      ${arr.length ? `<ul>${arr.map((n) => `<li>${n}</li>`).join('')}</ul>` : '<div class="muted">无</div>'}
    </div>`;
  $('#diffBody').innerHTML =
    col('新增', 'add', d.added) + col('修改', 'mod', d.modified) + col('删除', 'del', d.removed);
}

/* ---------------- 项目对话框 ---------------- */

let dialogMode = 'create'; // create | edit
const DEFAULT_GROUP_ID = 'com.example.design';

function normIdPreview(raw) {
  return raw.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').replace(/^[^a-z]+/, '').slice(0, 32);
}
function pascalPreview(id) {
  return id.split(/[_-]/).map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join('');
}

function openProjectDialog(mode) {
  dialogMode = mode;
  const form = $('#projectForm');
  form.reset();
  form.querySelectorAll('input').forEach((el) => (el.dataset.dirty = ''));
  $('#projectFormError').hidden = true;

  if (mode === 'edit') {
    const p = state.projects.find((x) => x.id === state.projectId);
    if (!p) return;
    $('#projectDialogTitle').textContent = `编辑项目：${p.name}`;
    form.elements.id.value = p.id;
    form.elements.id.disabled = true;
    form.elements.name.value = p.name;
    form.elements.prefix.value = p.prefix;
    form.elements.groupId.value = p.groupId;
    form.elements.artifactId.value = p.artifactId;
    form.elements.iosPackage.value = p.iosPackage;
    form.querySelectorAll('input').forEach((el) => (el.dataset.dirty = '1'));
  } else {
    $('#projectDialogTitle').textContent = '新建项目';
    form.elements.id.disabled = false;
    form.elements.groupId.value = DEFAULT_GROUP_ID;
  }
  $('#projectDialog').showModal();
}

/** 新建时根据 ID 自动推导前缀 / 坐标，用户改过的字段不覆盖 */
function deriveFromId() {
  if (dialogMode !== 'create') return;
  const form = $('#projectForm');
  const id = normIdPreview(form.elements.id.value);
  const auto = (key, value) => {
    const el = form.elements[key];
    if (!el.dataset.dirty) el.value = value;
  };
  auto('prefix', `${id.replace(/[^a-z0-9]/g, '')}_`);
  auto('artifactId', `${id}-assets`);
  auto('iosPackage', `${pascalPreview(id)}Assets`);
}

async function submitProjectForm(e) {
  e.preventDefault();
  const form = $('#projectForm');
  const body = {
    name: form.elements.name.value,
    prefix: form.elements.prefix.value,
    groupId: form.elements.groupId.value,
    artifactId: form.elements.artifactId.value,
    iosPackage: form.elements.iosPackage.value,
  };
  const errBox = $('#projectFormError');
  try {
    if (dialogMode === 'create') {
      body.id = form.elements.id.value;
      const r = await api('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      state.projectId = r.project.id;
      localStorage.setItem('crm.project', state.projectId);
      $('#projectDialog').close();
      await refresh();
      toast(`已创建项目「${r.project.name}」`);
    } else {
      const r = await api(`/api/projects/${encodeURIComponent(state.projectId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      $('#projectDialog').close();
      await refresh();
      toast('项目配置已更新（新前缀从下次发布起生效）');
    }
  } catch (err) {
    errBox.textContent = err.message;
    errBox.hidden = false;
  }
}

/* ---------------- 交互 ---------------- */

async function copyText(s, label = '已复制') {
  try {
    await navigator.clipboard.writeText(s);
    toast(label);
  } catch (_) {
    toast('复制失败');
  }
}

function bind() {
  $('#roleSwitch').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    state.role = btn.dataset.role;
    localStorage.setItem('crm.role', state.role);
    render();
  });

  $('#projectSelect').addEventListener('change', (e) => {
    state.projectId = e.target.value;
    state.selected = '';
    localStorage.setItem('crm.project', state.projectId);
    refresh().catch((err) => toast('切换项目失败：' + err.message));
  });

  $('#newProjectBtn').addEventListener('click', () => openProjectDialog('create'));
  $('#createFirstProjectBtn').addEventListener('click', () => openProjectDialog('create'));
  $('#editProjectBtn').addEventListener('click', () => openProjectDialog('edit'));
  $('#projectCancel').addEventListener('click', () => $('#projectDialog').close());
  $('#projectForm').addEventListener('submit', submitProjectForm);
  $('#projectForm').elements.id.addEventListener('input', deriveFromId);
  ['name', 'prefix', 'groupId', 'artifactId', 'iosPackage'].forEach((key) => {
    $('#projectForm').elements[key].addEventListener('input', (e) => (e.target.dataset.dirty = '1'));
  });

  $('#tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    state.tab = btn.dataset.tab;
    render();
    if (state.tab === 'diff') loadDiff();
  });

  $('#sortSwitch').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    state.sort = btn.dataset.sort;
    document.querySelectorAll('#sortSwitch button').forEach((b) => b.classList.toggle('active', b === btn));
    renderAssets();
  });
  document.querySelector('#sortSwitch button').classList.add('active');

  $('#searchInput').addEventListener('input', (e) => {
    state.query = e.target.value;
    renderAssets();
  });

  const dz = $('#dropzone');
  const input = $('#fileInput');
  dz.addEventListener('click', () => input.click());
  input.addEventListener('change', () => uploadFiles(input.files));
  ['dragenter', 'dragover'].forEach((ev) =>
    dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('dragover'); }));
  ['dragleave', 'drop'].forEach((ev) =>
    dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('dragover'); }));
  dz.addEventListener('drop', (e) => uploadFiles(e.dataTransfer.files));

  $('#publishBtn').addEventListener('click', publish);
  $('#pendingPublishBtn').addEventListener('click', publish);

  /* 资源卡片：点击选中，右侧展示详情 */
  $('#assetGrid').addEventListener('click', (e) => {
    const card = e.target.closest('.asset-card');
    if (!card) return;
    state.selected = card.dataset.logical;
    renderAssets();
    renderDetail();
  });

  /* 详情面板：预览点击看大图、复制、删除 / 恢复、着色 */
  const detail = $('#assetDetail');
  detail.addEventListener('click', async (e) => {
    const swatch = e.target.closest('[data-swatch]');
    if (swatch) {
      setTint(state.tint.on, swatch.dataset.swatch);
      return;
    }
    const copyEl = e.target.closest('[data-copy]');
    if (copyEl) {
      copyText(copyEl.dataset.copy, `已复制 ${copyEl.dataset.copy}`);
      return;
    }
    const actBtn = e.target.closest('[data-act]');
    if (actBtn) {
      const act = actBtn.dataset.act;
      if (act === 'zoom') return openLightbox();
      if ((act === 'remove' || act === 'restore') && state.selected) {
        const logical = state.selected;
        try {
          await api(pj(`/assets/${encodeURIComponent(logical)}/${act}`), { method: 'POST' });
          toast(act === 'remove'
            ? `已删除「${logical}」，发布新版本后生效`
            : `已恢复「${logical}」，发布新版本后生效`);
          await refresh();
        } catch (err) {
          toast('操作失败：' + err.message);
        }
      }
      return;
    }
    if (e.target.closest('.preview-stage')) openLightbox();
  });
  detail.addEventListener('input', (e) => {
    if (e.target.id !== 'tintColor') return;
    state.tint.color = e.target.value;
    saveTint();
    // 拖动取色器时只同步颜色，不重建面板
    const layers = [$('#assetDetail .tint-layer'), $('#lightboxTint')];
    layers.forEach((l) => { if (l) l.style.backgroundColor = state.tint.color; });
    updateSwatchActive();
  });
  detail.addEventListener('change', (e) => {
    if (e.target.id === 'tintToggle') setTint(e.target.checked, state.tint.color);
    if (e.target.id === 'tintColor') setTint(true, e.target.value);
  });

  /* 大图弹窗 */
  $('#lightboxClose').addEventListener('click', closeLightbox);
  const lb = $('#lightbox');
  lb.addEventListener('click', (e) => { if (e.target === lb) closeLightbox(); });
  lb.addEventListener('close', () => { lightboxAsset = null; });

  $('#diffFrom').addEventListener('change', loadDiff);
  $('#diffTo').addEventListener('change', loadDiff);
}

async function uploadFiles(fileList) {
  if (!state.projectId) return toast('请先创建项目');
  const files = Array.from(fileList || []).filter((f) => f.type === 'image/png' || /\.png$/i.test(f.name));
  if (!files.length) return toast('请选择 PNG 文件');

  const fd = new FormData();
  files.forEach((f) => fd.append('files', f));

  const box = $('#uploadResult');
  box.innerHTML = `正在上传 ${files.length} 个文件…`;
  try {
    const r = await api(pj('/assets'), { method: 'POST', body: fd });
    box.innerHTML =
      `上传完成：新增 ${r.created}，更新 ${r.updated}。修改已保存到资源库，发布新版本后生效。` +
      (r.warnings && r.warnings.length
        ? `<div class="warn">${r.warnings.map(escapeHtml).join('<br>')}</div>`
        : '');
    await refresh();
  } catch (err) {
    box.innerHTML = `<span class="warn">上传失败：${escapeHtml(err.message)}</span>`;
  }
}

async function publish() {
  if (!state.projectId) return toast('请先创建项目');
  const p = state.data.pending;
  if (p && !p.hasChanges) {
    // 资源内容与最新版本一致；改前缀 / 坐标后重发布是合法场景，确认后放行
    const ok = confirm('当前没有资源修改（资源库与最新版本一致）。\n仍要发布新版本吗？可用于让新的资源前缀 / 打包坐标生效。');
    if (!ok) return;
  }
  const btn = $('#publishBtn');
  const box = $('#publishResult');
  btn.disabled = true;
  box.textContent = '正在构建 Android AAR 与 iOS SPM 包…';
  try {
    const r = await api(pj('/publish'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ by: state.role, note: $('#publishNote').value }),
    });
    box.innerHTML = `发布成功：<b>v${r.release.version}</b>，${r.release.assetCount} 个资源`;
    $('#publishNote').value = '';
    await refresh();
    toast(`已发布 v${r.release.version}`);
  } catch (err) {
    box.innerHTML = `<span class="warn">发布失败：${escapeHtml(err.message)}</span>`;
  } finally {
    btn.disabled = false;
  }
}

/* ---------------- 工具 ---------------- */

function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

bind();
refresh().catch((e) => toast('加载失败：' + e.message));
