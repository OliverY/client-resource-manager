import { Button, Layout, Segmented, Select, Space, Tag, Tooltip, Typography } from 'antd';
import {
  BgColorsOutlined,
  CheckOutlined,
  CodeOutlined,
  EditOutlined,
  PlusOutlined,
} from '@ant-design/icons';

const initial = (name) => (name || '?').trim().slice(0, 1).toUpperCase();

/** 下拉选项：头像 + 名称 / ID + 最新版本 */
function ProjectOption({ project, selected }) {
  return (
    <div className="proj-option">
      <span className="proj-avatar">{initial(project.name)}</span>
      <span className="proj-option-text">
        <span className="proj-name">{project.name}</span>
        <span className="proj-id">#{project.id}</span>
      </span>
      {project.latestVersion ? (
        <Tag color="blue" bordered={false} style={{ marginInlineEnd: 0, fontSize: 11 }}>
          v{project.latestVersion}
        </Tag>
      ) : (
        <Tag bordered={false} style={{ marginInlineEnd: 0, fontSize: 11, color: '#8c96a8' }}>
          未发布
        </Tag>
      )}
      <span className="proj-check">{selected && <CheckOutlined />}</span>
    </div>
  );
}

export default function TopBar({
  role,
  onRoleChange,
  projects,
  projectId,
  onProjectChange,
  isDesigner,
  onNewProject,
  onEditProject,
}) {
  const current = projects.find((p) => p.id === projectId);

  return (
    <Layout.Header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 20,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        borderBottom: '1px solid #e4e8f0',
        backdropFilter: 'blur(12px)',
      }}
    >
      <Space size={10} align="center">
        <span className="brand-logo" />
        <Typography.Text strong style={{ fontSize: 16, letterSpacing: 0.2 }}>
          图片资源管理器
        </Typography.Text>
        <Tag color="blue" bordered={false} style={{ borderRadius: 999, marginInlineEnd: 0 }}>
          MVP
        </Tag>
      </Space>

      <Space size={12} wrap>
        <Select
          value={projectId || undefined}
          onChange={onProjectChange}
          placeholder={projects.length ? '选择项目' : '暂无项目'}
          disabled={!projects.length}
          showSearch
          optionFilterProp="label"
          filterOption={(input, option) =>
            `${option.project.name} ${option.project.id}`.toLowerCase().includes(input.trim().toLowerCase())
          }
          style={{ width: 250 }}
          popupMatchSelectWidth={320}
          listHeight={320}
          labelRender={() =>
            current ? (
              <span className="proj-trigger">
                <span className="proj-avatar sm">{initial(current.name)}</span>
                <span className="proj-trigger-name">{current.name}</span>
                <span className="proj-trigger-id">#{current.id}</span>
              </span>
            ) : null
          }
          options={projects.map((p) => ({
            value: p.id,
            label: p.name,
            project: p,
          }))}
          optionRender={(option) => (
            <ProjectOption project={option.data.project} selected={option.data.value === projectId} />
          )}
        />
        {isDesigner && (
          <Button icon={<PlusOutlined />} onClick={onNewProject}>
            新建项目
          </Button>
        )}
        {isDesigner && projectId && (
          <Tooltip title="编辑当前项目的名称 / 前缀 / 打包坐标">
            <Button icon={<EditOutlined />} onClick={onEditProject} aria-label="编辑当前项目" />
          </Tooltip>
        )}

        <Segmented
          value={role}
          onChange={onRoleChange}
          options={[
            { label: '设计师', value: 'designer', icon: <BgColorsOutlined /> },
            { label: '开发', value: 'developer', icon: <CodeOutlined /> },
          ]}
        />
      </Space>
    </Layout.Header>
  );
}
