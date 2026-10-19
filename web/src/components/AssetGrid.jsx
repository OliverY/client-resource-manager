import { Card, Empty, Space, Tooltip, Typography, theme } from 'antd';

import { groupAssets, previewUrl, sortAssets } from '../api.js';

function AssetCard({ asset, projectId, selected, onSelect }) {
  const { token } = theme.useToken();
  return (
    <Card
      hoverable
      size="small"
      className="asset-card"
      onClick={() => onSelect(asset.logical)}
      cover={
        <div className="asset-thumb">
          <img
            src={previewUrl(projectId, asset)}
            alt={asset.logical}
            loading="lazy"
            onError={(e) => {
              e.currentTarget.style.visibility = 'hidden';
            }}
          />
        </div>
      }
      styles={{ body: { padding: '8px 10px' } }}
      style={{
        cursor: 'pointer',
        borderColor: selected ? token.colorPrimary : undefined,
        boxShadow: selected ? `0 0 0 3px ${token.colorPrimaryBg}` : undefined,
      }}
    >
      <Tooltip title={asset.logical} mouseEnterDelay={0.4}>
        <Typography.Text
          ellipsis
          style={{ fontSize: 12.5, fontWeight: 500, display: 'block', textAlign: 'center' }}
        >
          {asset.logical}
        </Typography.Text>
      </Tooltip>
    </Card>
  );
}

export default function AssetGrid({ assets, releases, sort, query, projectId, selected, onSelect }) {
  const list = sortAssets(assets, sort, query);
  const groups = groupAssets(list, sort, releases);

  if (!list.length) {
    return (
      <Card styles={{ body: { padding: '36px 16px' } }}>
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={query ? '没有匹配的资源' : '还没有资源，先上传一批图片吧。'}
        />
      </Card>
    );
  }

  if (!groups) {
    return (
      <div className="asset-grid">
        {list.map((a) => (
          <AssetCard
            key={a.logical}
            asset={a}
            projectId={projectId}
            selected={selected === a.logical}
            onSelect={onSelect}
          />
        ))}
      </div>
    );
  }

  return (
    <Space direction="vertical" size={18} style={{ width: '100%' }}>
      {groups.map((g) => (
        <div key={g.key}>
          <div className="asset-group-title">
            {g.label}
            <span className="count">{g.assets.length} 个</span>
          </div>
          <div className="asset-grid">
            {g.assets.map((a) => (
              <AssetCard
                key={a.logical}
                asset={a}
                projectId={projectId}
                selected={selected === a.logical}
                onSelect={onSelect}
              />
            ))}
          </div>
        </div>
      ))}
    </Space>
  );
}
