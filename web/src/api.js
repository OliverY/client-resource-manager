/** 与服务端交互的薄封装 + 资源相关的纯函数工具 */

const TINT_KEY = 'crm.tint';
export const TINT_PRESETS = ['#2563eb', '#1f2328', '#ffffff', '#dc2626', '#16a34a', '#d97706'];

export async function api(path, opts) {
  const res = await fetch(path, opts);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

/** 当前项目的作用域 API 前缀；projectPath(pid, '/state') -> /api/projects/<pid>/state */
export function projectPath(pid, p = '') {
  return `/api/projects/${encodeURIComponent(pid)}${p}`;
}

/** 预览图地址：矢量取 source.svg，位图取最高倍率源图 */
export function previewUrl(pid, asset) {
  const base = `/uploads/${encodeURIComponent(pid)}/${asset.logical}`;
  if (asset.format === 'svg') return `${base}/source.svg`;
  const scales = asset.scales && asset.scales.length ? asset.scales : [3];
  return `${base}/source@${Math.max(...scales)}x.png`;
}

export function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function loadTint() {
  try {
    const t = JSON.parse(localStorage.getItem(TINT_KEY) || 'null');
    if (t && typeof t.on === 'boolean' && typeof t.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(t.color)) {
      return t;
    }
  } catch (_) {
    /* 忽略损坏的本地存储 */
  }
  return { on: false, color: '#2563eb' };
}

export function saveTint(t) {
  localStorage.setItem(TINT_KEY, JSON.stringify(t));
}

/**
 * 下载单个资源产物。走 fetch + Blob 而不是 <a download>：
 * 服务端转换失败时能拿到 JSON 错误并提示，不会让页面跳到一段报错文本。
 */
export async function downloadAsset(pid, asset, kind) {
  const res = await fetch(projectPath(pid, `/assets/${encodeURIComponent(asset.logical)}/download?kind=${kind}`));
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      if (j && j.error) msg = j.error;
    } catch (_) {
      /* 非 JSON 响应，保留状态码 */
    }
    throw new Error(msg);
  }
  const blob = await res.blob();
  const cd = res.headers.get('Content-Disposition') || '';
  const m = cd.match(/filename="?([^";]+)"?/);
  const filename = m ? m[1] : asset.logical;

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return filename;
}

/** 过滤 + 排序：已删除的不进列表（详情面板仍可恢复），其余按时间倒序或名称 */
export function sortAssets(assets, sort, query) {
  const q = query.trim().toLowerCase();
  let list = assets.filter((a) => a.status !== 'removed' && (!q || a.logical.includes(q)));
  if (sort === 'name') {
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
export function groupAssets(list, sort, releases) {
  if (sort === 'version') {
    const byKey = new Map();
    for (const a of list) {
      const key = a.addedVersion || '';
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(a);
    }
    // 组顺序：未发布（最新）在前，其余按发布记录倒序（releases 已是最新在前）
    const order = ['', ...releases.map((r) => r.version)];
    return order
      .filter((k) => byKey.has(k))
      .map((k) => ({
        key: k || 'unpublished',
        label: k ? `v${k}` : '未发布',
        assets: byKey.get(k).sort((a, b) => a.logical.localeCompare(b.logical)),
      }));
  }
  if (sort === 'date') {
    const byKey = new Map();
    for (const a of list) {
      const key = (a.updatedAt || '').slice(0, 10);
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(a);
    }
    return [...byKey.keys()]
      .sort((x, y) => y.localeCompare(x))
      .map((k) => ({
        key: k || 'unknown',
        label: k || '未知日期',
        assets: byKey.get(k).sort(
          (a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '') || a.logical.localeCompare(b.logical),
        ),
      }));
  }
  return null;
}
