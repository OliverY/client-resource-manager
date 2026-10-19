import { useEffect, useRef, useState } from 'react';
import { Alert, App as AntApp, Card, Typography, Upload } from 'antd';
import { InboxOutlined } from '@ant-design/icons';

import { api, projectPath } from '../api.js';

const ACCEPT = '.png,.svg,image/png,image/svg+xml';

export default function UploadCard({ projectId, releaseVersion, onUploaded }) {
  const { message } = AntApp.useApp();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const lastBatch = useRef('');

  // 发布成功后清掉「待发布」的旧提示，避免出现「修改已保存…请发布」但版本已经发了的错觉
  useEffect(() => {
    setResult(null);
  }, [releaseVersion]);

  const upload = async (files) => {
    const list = files.filter(
      (f) => f.type === 'image/png' || f.type === 'image/svg+xml' || /\.png$|\.svg$/i.test(f.name),
    );
    if (!list.length) {
      message.warning('请选择 PNG / SVG 文件');
      return;
    }

    setBusy(true);
    setResult(null);
    const fd = new FormData();
    list.forEach((f) => fd.append('files', f.originFileObj || f));

    try {
      const r = await api(projectPath(projectId, '/assets'), { method: 'POST', body: fd });
      setResult({
        type: r.warnings && r.warnings.length ? 'warning' : 'success',
        text: `上传完成：新增 ${r.created}，更新 ${r.updated}。修改已保存到资源库，发布新版本后生效。`,
        warnings: r.warnings || [],
      });
      message.success(`上传完成：新增 ${r.created}，更新 ${r.updated}`);
      await onUploaded();
    } catch (err) {
      setResult({ type: 'error', text: `上传失败：${err.message}`, warnings: [] });
      message.error(`上传失败：${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="上传图片">
      <Upload.Dragger
        multiple
        accept={ACCEPT}
        disabled={busy}
        showUploadList={false}
        // antd 会按文件逐个回调，这里按「整批 uid」去重，保证一次拖拽只发一个批量请求
        beforeUpload={(_file, fileList) => {
          const key = fileList.map((f) => f.uid).join(',');
          if (key !== lastBatch.current) {
            lastBatch.current = key;
            upload(fileList);
          }
          return Upload.LIST_IGNORE;
        }}
      >
        <p className="ant-upload-drag-icon" style={{ marginBottom: 8 }}>
          <InboxOutlined style={{ fontSize: 40, color: '#3b6cf6' }} />
        </p>
        <p className="ant-upload-text">拖拽 PNG / SVG 到这里，或点击选择文件</p>
        <p className="ant-upload-hint">
          支持批量。位图 <Typography.Text code>名称@3x.png</Typography.Text> /{' '}
          <Typography.Text code>名称@2x.png</Typography.Text>（不带后缀默认 @3x）；矢量{' '}
          <Typography.Text code>名称.svg</Typography.Text>（单源，全密度自动派生）
        </p>
        <p className="ant-upload-hint" style={{ marginTop: 4 }}>
          Android 生成 xhdpi / xxhdpi，iOS 生成 @2x / @3x
        </p>
      </Upload.Dragger>

      {result && (
        <Alert
          style={{ marginTop: 12 }}
          type={result.type}
          showIcon
          message={result.text}
          description={
            result.warnings.length ? (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {result.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            ) : null
          }
        />
      )}
    </Card>
  );
}
