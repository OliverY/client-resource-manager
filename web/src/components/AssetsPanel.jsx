import { useState } from 'react';
import { Alert, App as AntApp, Button, Input, Segmented, Space, Typography } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';

import UploadCard from './UploadCard.jsx';
import PublishCard from './PublishCard.jsx';
import AssetGrid from './AssetGrid.jsx';
import AssetDetail from './AssetDetail.jsx';
import Lightbox from './Lightbox.jsx';
import { api, projectPath } from '../api.js';

const SORT_OPTIONS = [
  { label: '时间倒序', value: 'time' },
  { label: '按名称', value: 'name' },
  { label: '按版本', value: 'version' },
  { label: '按日期', value: 'date' },
];

export default function AssetsPanel({
  projectId,
  data,
  role,
  sort,
  onSortChange,
  query,
  onQueryChange,
  selected,
  onSelect,
  selectedAsset,
  tint,
  onTintChange,
  onRefresh,
}) {
  const { message, modal } = AntApp.useApp();
  const isDesigner = role === 'designer';

  const [publishing, setPublishing] = useState(false);
  const [note, setNote] = useState('');
  const [publishResult, setPublishResult] = useState(null);
  const [zoom, setZoom] = useState(false);

  const pending = data.pending;

  const publish = async () => {
    if (publishing) return;
    if (pending && !pending.hasChanges) {
      // 资源内容与最新版本一致；改前缀 / 坐标后重发布是合法场景，确认后放行
      const ok = await new Promise((resolve) => {
        modal.confirm({
          title: '仍要发布新版本吗？',
          content: '当前没有资源修改（资源库与最新版本一致）。可用于让新的资源前缀 / 打包坐标生效。',
          okText: '继续发布',
          cancelText: '取消',
          onOk: () => resolve(true),
          onCancel: () => resolve(false),
        });
      });
      if (!ok) return;
    }

    setPublishing(true);
    setPublishResult({ type: 'info', text: '正在构建 Android AAR 与 iOS SPM 包…' });
    try {
      const r = await api(projectPath(projectId, '/publish'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ by: role, note }),
      });
      setPublishResult({
        type: 'success',
        text: `发布成功：v${r.release.version}，${r.release.assetCount} 个资源`,
      });
      setNote('');
      message.success(`已发布 v${r.release.version}`);
      await onRefresh();
    } catch (err) {
      setPublishResult({ type: 'error', text: `发布失败：${err.message}` });
      message.error(`发布失败：${err.message}`);
    } finally {
      setPublishing(false);
    }
  };

  const changeStatus = async (act) => {
    if (!selectedAsset) return;
    const logical = selectedAsset.logical;
    try {
      await api(projectPath(projectId, `/assets/${encodeURIComponent(logical)}/${act}`), { method: 'POST' });
      message.success(
        act === 'remove'
          ? `已删除「${logical}」，发布新版本后生效`
          : `已恢复「${logical}」，发布新版本后生效`,
      );
      await onRefresh();
    } catch (err) {
      message.error('操作失败：' + err.message);
    }
  };

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {isDesigner && (
        <UploadCard
          projectId={projectId}
          releaseVersion={data.releases[0] ? data.releases[0].version : ''}
          onUploaded={onRefresh}
        />
      )}

      {pending && pending.hasChanges && (
        <Alert
          type="warning"
          showIcon
          icon={<ExclamationCircleOutlined />}
          message={`有修改未保存：新增 ${pending.added.length} · 修改 ${pending.modified.length} · 删除 ${pending.removed.length}，请保存发布新版本`}
          action={
            isDesigner ? (
              <Button size="small" type="primary" onClick={publish} loading={publishing}>
                保存并发布新版本
              </Button>
            ) : null
          }
        />
      )}

      {isDesigner && (
        <PublishCard
          note={note}
          onNoteChange={setNote}
          onPublish={publish}
          publishing={publishing}
          result={publishResult}
        />
      )}

      <div className="assets-layout">
        <div className="assets-main">
          <Space size={12} wrap style={{ width: '100%', justifyContent: 'space-between', marginBottom: 12 }}>
            <Input.Search
              allowClear
              placeholder="搜索资源名…"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              style={{ width: 260 }}
            />
            <Space size={8}>
              <Typography.Text type="secondary">排序</Typography.Text>
              <Segmented value={sort} onChange={onSortChange} options={SORT_OPTIONS} />
            </Space>
          </Space>

          <AssetGrid
            assets={data.assets}
            releases={data.releases}
            sort={sort}
            query={query}
            projectId={projectId}
            selected={selected}
            onSelect={onSelect}
          />
        </div>

        <aside className="assets-aside">
          <AssetDetail
            asset={selectedAsset}
            projectId={projectId}
            role={role}
            tint={tint}
            onTintChange={onTintChange}
            onRemove={() => changeStatus('remove')}
            onRestore={() => changeStatus('restore')}
            onZoom={() => setZoom(true)}
          />
        </aside>
      </div>

      <Lightbox
        open={zoom && !!selectedAsset}
        asset={selectedAsset}
        projectId={projectId}
        tint={tint}
        onClose={() => setZoom(false)}
      />
    </Space>
  );
}
