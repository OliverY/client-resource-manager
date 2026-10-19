import { Card, Descriptions, Empty, List, Space, Tag, Typography } from 'antd';

import { fmtTime } from '../api.js';

function ChangelogChips({ changelog }) {
  const c = changelog || { added: [], modified: [], removed: [] };
  const chips = [
    ...(c.added || []).map((n) => ({ key: `a-${n}`, color: 'success', text: `+ ${n}` })),
    ...(c.modified || []).map((n) => ({ key: `m-${n}`, color: 'processing', text: `~ ${n}` })),
    ...(c.removed || []).map((n) => ({ key: `r-${n}`, color: 'error', text: `- ${n}` })),
  ];
  if (!chips.length) {
    return <Typography.Text type="secondary">无资源变化</Typography.Text>;
  }
  return (
    <Space size={[6, 6]} wrap>
      {chips.map((chip) => (
        <Tag key={chip.key} color={chip.color} bordered={false}>
          {chip.text}
        </Tag>
      ))}
    </Space>
  );
}

export default function ReleasesPanel({ releases }) {
  if (!releases.length) {
    return (
      <Card styles={{ body: { padding: '40px 16px' } }}>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有发布记录。" />
      </Card>
    );
  }

  return (
    <Card styles={{ body: { padding: '4px 20px' } }}>
      <List
        dataSource={releases}
        renderItem={(r) => (
          <List.Item style={{ display: 'block', padding: '16px 0' }}>
            <Space size={10} wrap style={{ width: '100%' }}>
              <Tag color="blue" style={{ fontWeight: 600, marginInlineEnd: 0 }}>
                v{r.version}
              </Tag>
              <Typography.Text type="secondary">{r.assetCount} 个资源</Typography.Text>
              <Typography.Text type="secondary">by {r.by || 'unknown'}</Typography.Text>
              <Typography.Text type="secondary" style={{ marginLeft: 'auto' }}>
                {fmtTime(r.at)}
              </Typography.Text>
            </Space>

            {r.note && (
              <Typography.Paragraph style={{ margin: '8px 0 0' }}>{r.note}</Typography.Paragraph>
            )}

            <div style={{ marginTop: 8 }}>
              <ChangelogChips changelog={r.changelog} />
            </div>

            {r.artifacts && (
              <Descriptions
                size="small"
                column={1}
                bordered
                style={{ marginTop: 12 }}
                items={[
                  {
                    key: 'android',
                    label: 'Android',
                    children: (
                      <Typography.Text code copyable>
                        {r.artifacts.android.artifact}
                      </Typography.Text>
                    ),
                  },
                  {
                    key: 'ios',
                    label: 'iOS',
                    children: (
                      <Space size={6} wrap>
                        <Typography.Text code copyable>
                          {r.artifacts.ios.packageName}
                        </Typography.Text>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          SPM · {r.artifacts.ios.localUsage}
                        </Typography.Text>
                      </Space>
                    ),
                  },
                ]}
              />
            )}
          </List.Item>
        )}
      />
    </Card>
  );
}
