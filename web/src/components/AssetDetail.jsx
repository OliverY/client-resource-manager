import { useState } from 'react';
import {
  App as AntApp,
  Button,
  Card,
  ColorPicker,
  Descriptions,
  Empty,
  List,
  Popconfirm,
  Space,
  Spin,
  Switch,
  Tag,
  Typography,
  theme,
} from 'antd';
import { DeleteOutlined, DownloadOutlined, EyeOutlined, UndoOutlined } from '@ant-design/icons';

import { TINT_PRESETS, downloadAsset, fmtTime, previewUrl } from '../api.js';

export default function AssetDetail({
  asset,
  projectId,
  role,
  tint,
  onTintChange,
  onRemove,
  onRestore,
  onZoom,
}) {
  const { message } = AntApp.useApp();
  const { token } = theme.useToken();
  const [busyKind, setBusyKind] = useState('');

  if (!asset) {
    return (
      <Card styles={{ body: { padding: '40px 16px' } }}>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="点击左侧资源查看详情" />
      </Card>
    );
  }

  const isDesigner = role === 'designer';
  const removed = asset.status === 'removed';
  const isVector = asset.format === 'svg';
  const tintable = !!asset.vectorLike; // 着色预览只对矢量图（单色图标）开放
  const tinted = tintable && tint.on;
  const url = previewUrl(projectId, asset);
  const scales = (asset.scales || []).map((s) => `@${s}x`).join(' / ') || '-';
  const maxScale = (asset.scales && asset.scales.length ? asset.scales : [3]).slice(-1)[0];

  const download = async (kind, label) => {
    setBusyKind(kind);
    try {
      const filename = await downloadAsset(projectId, asset, kind);
      message.success(`已下载 ${filename}（${label}）`);
    } catch (err) {
      message.error('下载失败：' + err.message);
    } finally {
      setBusyKind('');
    }
  };

  return (
    <Card
      size="small"
      styles={{ body: { padding: 12 } }}
      title={
        <Space size={6} wrap>
          <Typography.Text strong>{asset.logical}</Typography.Text>
          {removed && <Tag color="warning">已删除</Tag>}
          <Tag>{asset.format || 'png'}</Tag>
        </Space>
      }
    >
      <div className="preview-stage" onClick={onZoom} title="点击查看大图">
        <img
          src={url}
          alt={asset.logical}
          style={{ display: tinted ? 'none' : 'block' }}
          onError={(e) => {
            e.currentTarget.style.visibility = 'hidden';
          }}
        />
        {tinted && (
          <div
            className="tint-layer"
            style={{
              backgroundColor: tint.color,
              maskImage: `url("${url}")`,
              WebkitMaskImage: `url("${url}")`,
            }}
          />
        )}
      </div>

      <Descriptions
        column={1}
        size="small"
        colon={false}
        style={{ marginTop: 12 }}
        styles={{
          label: { width: 76, color: token.colorTextSecondary },
          content: { wordBreak: 'break-all' },
        }}
        items={[
          {
            key: 'android',
            label: 'Android',
            children: (
              <Typography.Text code copyable={{ text: asset.androidName, tooltips: ['复制', '已复制'] }}>
                {asset.androidName}
              </Typography.Text>
            ),
          },
          {
            key: 'ios',
            label: 'iOS',
            children: (
              <Typography.Text code copyable={{ text: asset.iosName, tooltips: ['复制', '已复制'] }}>
                {asset.iosName}
              </Typography.Text>
            ),
          },
          { key: 'size', label: '原始尺寸', children: `${asset.width}×${asset.height}` },
          { key: 'scales', label: '倍率', children: scales },
          { key: 'updated', label: '更新时间', children: fmtTime(asset.updatedAt) },
        ]}
      />

      <div className="section-title">
        下载
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          文件名已带前缀
        </Typography.Text>
      </div>
      <List
        size="small"
        bordered
        dataSource={[
          { kind: 'source', label: '原图', sub: isVector ? 'svg 矢量源' : `@${maxScale}x 位图` },
          {
            kind: 'android',
            label: `Android ${isVector ? 'XML' : 'PNG'}`,
            sub: isVector ? 'VectorDrawable' : 'drawable-xxhdpi',
          },
          { kind: 'ios', label: 'iOS 文件', sub: 'imageset 压缩包' },
        ]}
        renderItem={(it) => (
          <List.Item
            style={{ cursor: 'pointer', padding: '7px 10px' }}
            onClick={() => download(it.kind, it.sub)}
            actions={[
              busyKind === it.kind ? (
                <Spin key="loading" size="small" />
              ) : (
                <DownloadOutlined key="icon" style={{ color: token.colorTextTertiary }} />
              ),
            ]}
          >
            <Space direction="vertical" size={0}>
              <Typography.Text style={{ fontSize: 13 }}>{it.label}</Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {it.sub}
              </Typography.Text>
            </Space>
          </List.Item>
        )}
      />

      {tintable ? (
        <div className="tint-box">
          <Space size={8}>
            <Switch
              size="small"
              checked={tint.on}
              onChange={(on) => onTintChange({ ...tint, on })}
            />
            <Typography.Text>着色预览</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              （仅展示用）
            </Typography.Text>
          </Space>
          {tint.on && (
            <Space size={6} wrap style={{ marginTop: 8 }}>
              <ColorPicker
                size="small"
                value={tint.color}
                presets={[{ label: '预设', colors: TINT_PRESETS }]}
                onChangeComplete={(c) => onTintChange({ ...tint, on: true, color: c.toHexString() })}
              />
              {TINT_PRESETS.map((c) => (
                <span
                  key={c}
                  className={`swatch${c.toLowerCase() === tint.color.toLowerCase() ? ' active' : ''}`}
                  style={{ background: c }}
                  title={c}
                  onClick={() => onTintChange({ ...tint, on: true, color: c })}
                />
              ))}
            </Space>
          )}
        </div>
      ) : (
        <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 10 }}>
          位图不支持着色预览，仅矢量图（单色图标）可着色。
        </Typography.Text>
      )}

      <Space style={{ width: '100%', marginTop: 12 }} size={8}>
        <Button icon={<EyeOutlined />} onClick={onZoom} style={{ flex: 1 }}>
          查看大图
        </Button>
        {isDesigner &&
          (removed ? (
            <Button icon={<UndoOutlined />} onClick={onRestore} style={{ flex: 1 }}>
              恢复
            </Button>
          ) : (
            <Popconfirm
              title="标记删除该资源？"
              description="发布新版本后生效，老版本 App 不受影响"
              okText="删除"
              okButtonProps={{ danger: true }}
              cancelText="取消"
              onConfirm={onRemove}
            >
              <Button danger icon={<DeleteOutlined />} style={{ flex: 1 }}>
                删除
              </Button>
            </Popconfirm>
          ))}
      </Space>

      <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 10 }}>
        点击图片查看大图；着色仅对矢量图生效、仅用于预览，不会修改源图与打包产物。
      </Typography.Text>
    </Card>
  );
}
