import { Modal, Space, Typography } from 'antd';

import { previewUrl } from '../api.js';

export default function Lightbox({ open, asset, projectId, tint, onClose }) {
  if (!asset) return null;

  const tinted = asset.vectorLike && tint.on;
  const url = previewUrl(projectId, asset);
  const scales = (asset.scales || []).map((s) => `@${s}x`).join(' / ');

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={760}
      centered
      title={
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{asset.logical}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>
            原始尺寸 {asset.width}×{asset.height}
            {scales ? ` · ${scales}` : ''}
          </Typography.Text>
        </Space>
      }
    >
      <div className="lightbox-stage">
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
      <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 10 }}>
        大图与着色仅用于展示（着色仅对矢量图生效），不影响源图与打包产物。
      </Typography.Text>
    </Modal>
  );
}
