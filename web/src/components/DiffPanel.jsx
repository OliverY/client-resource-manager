import { useEffect, useState } from 'react';
import { Alert, Card, Col, Empty, List, Row, Select, Space, Spin, Typography } from 'antd';
import { SwapRightOutlined } from '@ant-design/icons';

import { api, projectPath } from '../api.js';

const COLUMNS = [
  { key: 'added', title: '新增', color: '#16a34a' },
  { key: 'modified', title: '修改', color: '#3b6cf6' },
  { key: 'removed', title: '删除', color: '#dc2626' },
];

export default function DiffPanel({ projectId, releases, active }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [diff, setDiff] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // releases 倒序：默认「最新 vs 上一版」
  useEffect(() => {
    setTo(releases[0] ? releases[0].version : '');
    setFrom(releases[1] ? releases[1].version : '');
  }, [releases]);

  useEffect(() => {
    if (!active || !projectId || !to) {
      setDiff(null);
      return;
    }
    let alive = true;
    setLoading(true);
    setError('');
    api(projectPath(projectId, `/diff?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`))
      .then((d) => alive && setDiff(d))
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [active, projectId, from, to]);

  const versionOptions = releases.map((r) => ({ value: r.version, label: `v${r.version}` }));

  return (
    <Card
      title="版本对比"
      extra={
        <Space size={6}>
          <Select
            value={from || ''}
            onChange={setFrom}
            style={{ width: 130 }}
            options={[{ value: '', label: '（上一版）' }, ...versionOptions]}
            disabled={!releases.length}
          />
          <SwapRightOutlined style={{ color: '#8c96a8' }} />
          <Select
            value={to || undefined}
            onChange={setTo}
            placeholder="选择版本"
            style={{ width: 130 }}
            options={versionOptions}
            disabled={!releases.length}
          />
        </Space>
      }
    >
      {!releases.length ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有发布记录。" />
      ) : error ? (
        <Alert type="error" showIcon message={error} />
      ) : (
        <Spin spinning={loading}>
          <Row gutter={[12, 12]}>
            {COLUMNS.map((col) => {
              const items = (diff && diff[col.key]) || [];
              return (
                <Col key={col.key} xs={24} md={8}>
                  <Card
                    type="inner"
                    size="small"
                    title={
                      <Space size={6}>
                        <span className="dot" style={{ background: col.color }} />
                        {col.title}
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          {items.length}
                        </Typography.Text>
                      </Space>
                    }
                  >
                    {items.length ? (
                      <List
                        size="small"
                        dataSource={items}
                        style={{ maxHeight: 420, overflow: 'auto' }}
                        renderItem={(name) => (
                          <List.Item style={{ padding: '4px 0', borderBlockEnd: 'none' }}>
                            <Typography.Text style={{ fontSize: 13 }} ellipsis>
                              {name}
                            </Typography.Text>
                          </List.Item>
                        )}
                      />
                    ) : (
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        无
                      </Typography.Text>
                    )}
                  </Card>
                </Col>
              );
            })}
          </Row>
        </Spin>
      )}
    </Card>
  );
}
