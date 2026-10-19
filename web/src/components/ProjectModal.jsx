import { useEffect, useState } from 'react';
import { Alert, Button, Col, Collapse, Form, Input, Modal, Row, Space, Typography } from 'antd';
import { App as AntApp } from 'antd';
import { SettingOutlined } from '@ant-design/icons';

import { api } from '../api.js';

const DEFAULT_GROUP_ID = 'com.example.design';

const RE_PROJECT_ID = /^[a-z][a-z0-9_-]{0,31}$/;
const RE_PREFIX = /^[a-z0-9_]*$/;
const RE_GROUP_ID = /^[a-zA-Z0-9_.]+$/;
const RE_ARTIFACT_ID = /^[a-zA-Z0-9_-]+$/;
const RE_IOS_PACKAGE = /^[A-Za-z][A-Za-z0-9_]*$/;

const normId = (raw) =>
  String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .replace(/^[^a-z]+/, '')
    .slice(0, 32);

const pascal = (id) =>
  id
    .split(/[_-]/)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');

export default function ProjectModal({ open, mode, project, onCancel, onSaved }) {
  const { message } = AntApp.useApp();
  const [form] = Form.useForm();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const isEdit = mode === 'edit';

  useEffect(() => {
    if (!open) return;
    setError('');
    form.resetFields();
    if (isEdit && project) {
      form.setFieldsValue({
        id: project.id,
        name: project.name,
        prefix: project.prefix,
        groupId: project.groupId,
        artifactId: project.artifactId,
        iosPackage: project.iosPackage,
      });
    } else {
      form.setFieldsValue({ groupId: DEFAULT_GROUP_ID });
    }
  }, [open, isEdit, project, form]);

  /** 新建时根据 ID 自动推导前缀 / 坐标，用户改过的字段不覆盖 */
  const handleValuesChange = (changed) => {
    if (isEdit || !('id' in changed)) return;
    const id = normId(changed.id);
    const auto = (key, value) => {
      if (!form.isFieldTouched(key)) form.setFieldValue(key, value);
    };
    auto('prefix', `${id.replace(/[^a-z0-9]/g, '')}_`);
    auto('artifactId', id ? `${id}-assets` : '');
    auto('iosPackage', id ? `${pascal(id)}Assets` : '');
  };

  const handleFinish = async (values) => {
    setError('');
    setSaving(true);
    try {
      if (!isEdit) {
        const r = await api('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...values, id: values.id }),
        });
        message.success(`已创建项目「${r.project.name}」`);
        onSaved(r.project);
      } else {
        await api(`/api/projects/${encodeURIComponent(project.id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(values),
        });
        message.success('项目配置已更新（新前缀从下次发布起生效）');
        onSaved(null);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      width={600}
      onCancel={onCancel}
      maskClosable={!saving}
      title={
        <div className="modal-title">
          <span className="modal-title-main">{isEdit ? '编辑项目' : '新建项目'}</span>
          <span className="modal-title-sub">
            {isEdit
              ? `${project ? project.name : ''} · #${project ? project.id : ''}`
              : '项目用于隔离不同 App 的资源、版本与打包产物'}
          </span>
        </div>
      }
      footer={
        <Space size={8}>
          <Button onClick={onCancel} disabled={saving}>
            取消
          </Button>
          <Button type="primary" loading={saving} onClick={() => form.submit()}>
            保存
          </Button>
        </Space>
      }
    >
      <Form
        form={form}
        layout="vertical"
        onValuesChange={handleValuesChange}
        onFinish={handleFinish}
        className="project-form"
      >
        <Row gutter={12}>
          <Col span={12}>
            <Form.Item
              name="id"
              label="项目 ID"
              tooltip="小写字母开头，仅含小写字母 / 数字 / 下划线 / 中划线，创建后不可修改"
              rules={[
                { required: true, message: '请填写项目 ID' },
                { pattern: RE_PROJECT_ID, message: '小写字母开头，≤32 位' },
              ]}
            >
              <Input placeholder="如 demo" autoComplete="off" spellCheck={false} disabled={isEdit} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="name"
              label="项目名称"
              tooltip="展示用名称，留空则与项目 ID 相同"
              rules={[{ max: 50, message: '项目名称过长（>50 字符）' }]}
            >
              <Input placeholder="如 Demo App" autoComplete="off" />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item
          name="prefix"
          label="资源前缀"
          tooltip="生成资源物理名时使用，如 demo_；留空表示不加前缀"
          extra={isEdit ? '修改后从下次发布起生效' : '新建时会按项目 ID 自动推导，一般无需修改'}
          rules={[{ pattern: RE_PREFIX, message: '只能含小写字母、数字、下划线' }]}
        >
          <Input placeholder="如 demo_" autoComplete="off" spellCheck={false} />
        </Form.Item>

        <Collapse
          ghost
          size="small"
          className="project-advanced"
          items={[
            {
              key: 'advanced',
              label: (
                <Space size={6}>
                  <SettingOutlined style={{ color: '#8c96a8' }} />
                  <span>打包坐标</span>
                  <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>
                    默认自动生成，一般无需修改
                  </Typography.Text>
                </Space>
              ),
              children: (
                <div className="project-subpanel">
                  <Form.Item
                    name="groupId"
                    label="groupId（Android Maven）"
                    rules={[{ pattern: RE_GROUP_ID, message: 'groupId 格式不合法' }]}
                  >
                    <Input autoComplete="off" spellCheck={false} />
                  </Form.Item>
                  <Form.Item
                    name="artifactId"
                    label="artifactId（Android Maven）"
                    rules={[{ pattern: RE_ARTIFACT_ID, message: 'artifactId 格式不合法' }]}
                  >
                    <Input placeholder="如 demo-assets" autoComplete="off" spellCheck={false} />
                  </Form.Item>
                  <Form.Item
                    name="iosPackage"
                    label="iOS SPM 包名"
                    rules={[{ pattern: RE_IOS_PACKAGE, message: 'iOS 包名必须是合法标识符' }]}
                  >
                    <Input placeholder="如 DemoAssets" autoComplete="off" spellCheck={false} />
                  </Form.Item>
                </div>
              ),
            },
          ]}
        />

        {error && <Alert type="error" showIcon message={error} />}
      </Form>
    </Modal>
  );
}
