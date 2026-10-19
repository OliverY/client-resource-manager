import { useCallback, useEffect, useRef, useState } from 'react';
import { App as AntApp, Button, Card, Empty, Layout, Space, Spin, Tabs, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';

import TopBar from './components/TopBar.jsx';
import ProjectModal from './components/ProjectModal.jsx';
import AssetsPanel from './components/AssetsPanel.jsx';
import ReleasesPanel from './components/ReleasesPanel.jsx';
import DiffPanel from './components/DiffPanel.jsx';
import { api, loadTint, projectPath, saveTint } from './api.js';

const EMPTY_DATA = { project: null, config: {}, assets: [], releases: [], pending: null };

export default function App() {
  const { message } = AntApp.useApp();

  const [role, setRole] = useState(() => localStorage.getItem('crm.role') || 'designer');
  const [projectId, setProjectId] = useState(() => localStorage.getItem('crm.project') || '');
  const [projects, setProjects] = useState([]);
  const [data, setData] = useState(EMPTY_DATA);
  const [tab, setTab] = useState('assets');
  const [sort, setSort] = useState('time');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState('');
  const [tint, setTint] = useState(loadTint);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState({ open: false, mode: 'create' });

  const pidRef = useRef(projectId);
  pidRef.current = projectId;

  const isDesigner = role === 'designer';

  /** 拉取项目列表 + 当前项目全量状态；项目被删/不存在时回退第一个 */
  const refresh = useCallback(async (pid = pidRef.current) => {
    const r = await api('/api/projects');
    setProjects(r.projects);

    let target = pid;
    if (!r.projects.some((p) => p.id === target)) {
      target = r.projects[0] ? r.projects[0].id : '';
      setProjectId(target);
      if (target) localStorage.setItem('crm.project', target);
      else localStorage.removeItem('crm.project');
    }

    if (!target) {
      setData(EMPTY_DATA);
      return;
    }
    const state = await api(projectPath(target, '/state'));
    setData(state);
    setSelected((cur) => (state.assets.some((a) => a.logical === cur) ? cur : ''));
  }, []);

  useEffect(() => {
    setLoading(true);
    refresh()
      .catch((e) => message.error('加载失败：' + e.message))
      .finally(() => setLoading(false));
  }, [refresh, message]);

  const handleRoleChange = (next) => {
    setRole(next);
    localStorage.setItem('crm.role', next);
  };

  const handleProjectChange = (next) => {
    setProjectId(next);
    setSelected('');
    localStorage.setItem('crm.project', next);
    setLoading(true);
    refresh(next)
      .catch((e) => message.error('切换项目失败：' + e.message))
      .finally(() => setLoading(false));
  };

  const handleTintChange = (next) => {
    setTint(next);
    saveTint(next);
  };

  const selectedAsset = data.assets.find((a) => a.logical === selected) || null;

  const tabItems = [
    {
      key: 'assets',
      label: '资源列表',
      children: (
        <AssetsPanel
          projectId={projectId}
          data={data}
          role={role}
          sort={sort}
          onSortChange={setSort}
          query={query}
          onQueryChange={setQuery}
          selected={selected}
          onSelect={setSelected}
          selectedAsset={selectedAsset}
          tint={tint}
          onTintChange={handleTintChange}
          onRefresh={() => refresh()}
        />
      ),
    },
    {
      key: 'releases',
      label: '版本记录',
      children: <ReleasesPanel releases={data.releases} />,
    },
    {
      key: 'diff',
      label: '更新对比',
      children: <DiffPanel projectId={projectId} releases={data.releases} active={tab === 'diff'} />,
    },
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <TopBar
        role={role}
        onRoleChange={handleRoleChange}
        projects={projects}
        projectId={projectId}
        onProjectChange={handleProjectChange}
        isDesigner={isDesigner}
        onNewProject={() => setModal({ open: true, mode: 'create' })}
        onEditProject={() => setModal({ open: true, mode: 'edit' })}
      />

      <Layout.Content style={{ padding: '16px 28px 56px' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto' }}>
          {loading && !data.project ? (
            <div style={{ display: 'grid', placeItems: 'center', minHeight: 320 }}>
              <Spin size="large" tip="加载中…">
                <div style={{ width: 120, height: 60 }} />
              </Spin>
            </div>
          ) : !projectId ? (
            <Card style={{ marginTop: 48, textAlign: 'center' }} styles={{ body: { padding: '40px 24px' } }}>
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <Space direction="vertical" size={4}>
                    <Typography.Text>还没有项目</Typography.Text>
                    <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                      项目用于隔离不同 App 的资源、版本与打包产物。
                    </Typography.Text>
                  </Space>
                }
              >
                {isDesigner ? (
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => setModal({ open: true, mode: 'create' })}>
                    新建第一个项目
                  </Button>
                ) : (
                  <Typography.Text type="secondary">当前为「开发」角色，无法创建项目，请切换为设计师。</Typography.Text>
                )}
              </Empty>
            </Card>
          ) : (
            <Tabs activeKey={tab} onChange={setTab} items={tabItems} />
          )}
        </div>
      </Layout.Content>

      <ProjectModal
        open={modal.open}
        mode={modal.mode}
        project={projects.find((p) => p.id === projectId) || null}
        onCancel={() => setModal((m) => ({ ...m, open: false }))}
        onSaved={async (created) => {
          setModal((m) => ({ ...m, open: false }));
          if (created) {
            setProjectId(created.id);
            setSelected('');
            localStorage.setItem('crm.project', created.id);
            setLoading(true);
            await refresh(created.id).finally(() => setLoading(false));
          } else {
            await refresh();
          }
        }}
      />
    </Layout>
  );
}
