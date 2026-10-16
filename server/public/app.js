'use strict';

const state = {
  role: localStorage.getItem('crm.role') || 'designer',
  tab: 'assets',
  sort: 'time',
  query: '',
  data: { assets: [], releases: [], config: {} },
};

const $ = (sel) => document.querySelector(sel);

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

async function refresh() {
  state.data = await api('/api/state');
  render();
}

/* ---------------- 渲染 ---------------- */

function render() {
  renderRoles();
  renderTabs();
  renderAssets();
  renderReleases();
  renderDiffPickers();
}

function renderRoles() {
  document.querySelectorAll('#roleSwitch button').forEach((b) => {
    b.classList.toggle('active', b.dataset.role === state.role);
  });
  const isDesigner = state.role === 'designer';
  document.querySelectorAll('.designer-only').forEach((el) => (el.hidden = !isDesigner));
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
  let list = state.data.assets.filter((a) => !q || a.logical.includes(q));
  if (state.sort === 'name') {
    list = list.slice().sort((a, b) => a.logical.localeCompare(b.logical));
  } else {
    list = list.slice().sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  }
  return list;
}

function renderAssets() {
  const grid = $('#assetGrid');
  const list = sortedAssets();
  $('#assetEmpty').hidden = list.length > 0;
  grid.innerHTML = list.map(assetCard).join('');
}

function assetCard(a) {
  const preview = `/uploads/${a.logical}/source@${Math.max(...a.scales)}x.png`;
  const isDesigner = state.role === 'designer';
  const removed = a.status === 'removed';
  return `
  <div class="asset-card ${removed ? 'removed' : ''}">
    <div class="asset-thumb"><img src="${preview}" alt="${a.logical}" loading="lazy"
      onerror="this.style.display='none'"></div>
    <div class="asset-meta">
      <div class="asset-name">${a.logical}</div>
      <div class="asset-sub">
        Android · <code>${a.androidName}</code><br>
        iOS · <code>${a.iosName}</code><br>
        ${a.width}×${a.height} · ${a.scales.map((s) => '@' + s + 'x').join(' / ')}
      </div>
      <div class="asset-tags">
        ${removed ? '<span class="tag warn">已废弃</span>' : ''}
        <span class="tag">png</span>
      </div>
      ${isDesigner ? `<div class="asset-actions">
        ${removed
          ? `<button data-restore="${a.logical}">恢复</button>`
          : `<button data-remove="${a.logical}">标记废弃</button>`}
      </div>` : ''}
    </div>
  </div>`;
}

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
  const from = $('#diffFrom').value;
  const to = $('#diffTo').value;
  if (!to) {
    $('#diffBody').innerHTML = '<div class="empty">还没有发布记录。</div>';
    return;
  }
  const d = await api(`/api/diff?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  const col = (title, cls, arr) => `
    <div class="diff-col ${cls}">
      <h3>${title}（${arr.length}）</h3>
      ${arr.length ? `<ul>${arr.map((n) => `<li>${n}</li>`).join('')}</ul>` : '<div class="muted">无</div>'}
    </div>`;
  $('#diffBody').innerHTML =
    col('新增', 'add', d.added) + col('修改', 'mod', d.modified) + col('删除', 'del', d.removed);
}

/* ---------------- 交互 ---------------- */

function bind() {
  $('#roleSwitch').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    state.role = btn.dataset.role;
    localStorage.setItem('crm.role', state.role);
    render();
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

  $('#assetGrid').addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const remove = btn.dataset.remove;
    const restore = btn.dataset.restore;
    if (remove) await api(`/api/assets/${encodeURIComponent(remove)}/remove`, { method: 'POST' });
    if (restore) await api(`/api/assets/${encodeURIComponent(restore)}/restore`, { method: 'POST' });
    await refresh();
    toast(remove ? '已标记废弃（不物理删除）' : '已恢复');
  });

  $('#diffFrom').addEventListener('change', loadDiff);
  $('#diffTo').addEventListener('change', loadDiff);
}

async function uploadFiles(fileList) {
  const files = Array.from(fileList || []).filter((f) => f.type === 'image/png' || /\.png$/i.test(f.name));
  if (!files.length) return toast('请选择 PNG 文件');

  const fd = new FormData();
  files.forEach((f) => fd.append('files', f));

  const box = $('#uploadResult');
  box.innerHTML = `正在上传 ${files.length} 个文件…`;
  try {
    const r = await api('/api/assets', { method: 'POST', body: fd });
    box.innerHTML =
      `上传完成：新增 ${r.created}，更新 ${r.updated}` +
      (r.warnings && r.warnings.length
        ? `<div class="warn">${r.warnings.map(escapeHtml).join('<br>')}</div>`
        : '');
    await refresh();
  } catch (err) {
    box.innerHTML = `<span class="warn">上传失败：${escapeHtml(err.message)}</span>`;
  }
}

async function publish() {
  const btn = $('#publishBtn');
  const box = $('#publishResult');
  btn.disabled = true;
  box.textContent = '正在构建 Android AAR 与 iOS SPM 包…';
  try {
    const r = await api('/api/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ by: state.role, note: $('#publishNote').value }),
    });
    box.innerHTML = `发布成功：<b>v${r.release.version}</b>`;
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
