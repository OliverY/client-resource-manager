import { Alert, Button, Card, Input, Space, Typography } from 'antd';

export default function PublishCard({ note, onNoteChange, onPublish, publishing, result }) {
  return (
    <Card
      title="发布"
      extra={
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          上传 / 删除只是修改资源库，点「发布新版本」批量提交为正式版本
        </Typography.Text>
      }
    >
      <Space.Compact style={{ width: '100%' }}>
        <Input
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          placeholder="本次发布说明（可选）"
          allowClear
          disabled={publishing}
          onPressEnter={onPublish}
        />
        <Button type="primary" loading={publishing} onClick={onPublish}>
          发布新版本
        </Button>
      </Space.Compact>

      {result && (
        <Alert
          style={{ marginTop: 12 }}
          type={result.type}
          showIcon
          message={result.text}
        />
      )}
    </Card>
  );
}
