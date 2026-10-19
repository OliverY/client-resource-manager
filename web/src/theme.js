/**
 * antd 主题：沿用原手写样式的品牌色与圆角，保证视觉不跳变。
 */
export const themeConfig = {
  token: {
    colorPrimary: '#3b6cf6',
    colorInfo: '#3b6cf6',
    colorSuccess: '#16a34a',
    colorWarning: '#d97706',
    colorError: '#dc2626',
    colorTextBase: '#1a2233',
    colorBgLayout: '#f4f6fa',
    borderRadius: 8,
    borderRadiusLG: 12,
    fontSize: 14,
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
    boxShadowTertiary: '0 1px 2px rgba(23, 32, 58, .05)',
  },
  components: {
    Layout: {
      headerBg: 'rgba(255, 255, 255, 0.85)',
      headerHeight: 60,
      headerPadding: '0 28px',
      bodyBg: '#f4f6fa',
    },
    Card: {
      headerFontSize: 15,
      boxShadowTertiary: '0 1px 2px rgba(23, 32, 58, .05)',
    },
    Tabs: {
      horizontalItemPadding: '12px 0',
      titleFontSize: 14,
    },
    Select: {
      optionPadding: '7px 12px',
      optionSelectedBg: '#eef3ff',
      optionActiveBg: '#f5f7fc',
      optionSelectedFontWeight: 400,
    },
    Descriptions: {
      labelBg: '#fafbfd',
    },
  },
};
