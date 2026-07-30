import { Alert, Card, Tag, Typography } from "antd";

import { designTokens } from "../design-tokens";

const { Paragraph, Text, Title } = Typography;

const swatches = [
  ["品牌蓝", designTokens.colorBrand],
  ["悬停蓝", designTokens.colorBrandHover],
  ["浅蓝背景", designTokens.colorBrandSoft],
  ["页面背景", designTokens.colorPage],
  ["卡片背景", designTokens.colorSurface],
  ["主文字", designTokens.colorText],
  ["边框", designTokens.colorBorder],
  ["警告", designTokens.colorWarning],
  ["错误", designTokens.colorDanger]
] as const;

export function StyleGuidePage() {
  return (
    <div className="page-stack style-guide-page">
      <header className="page-header page-header--compact">
        <div>
          <span className="page-icon page-icon--blue" aria-hidden="true">Aa</span>
          <div>
            <Title>样式与字体</Title>
            <Paragraph>
              检查界面令牌、简体中文回退、繁体展示字、英文数字和不同字重。
            </Paragraph>
          </div>
        </div>
        <Tag>本地字体资源</Tag>
      </header>

      <Alert
        type="warning"
        showIcon
        title="昭源環方不宣称完整支持简化字"
        description="实测简体样例全部回退到 Microsoft YaHei UI。简体正文固定使用系统中文字体；昭源環方只用于下方明确列出的繁体展示文本，界面不会把简体自动转换为繁体。"
      />

      <Card className="workspace-card" variant="borderless">
        <div className="section-heading">
          <div>
            <Text className="section-kicker">字体策略</Text>
            <Title level={3}>覆盖与实际回退</Title>
          </div>
          <Tag>本地 WOFF2</Tag>
        </div>
        <div className="type-sample-grid">
          <article>
            <Text type="secondary">简体中文 · 系统中文字体</Text>
            <p
              className="type-sample font-system-sc"
              data-font-probe="simplified"
            >
              明日教学焦点：一次函数斜率与图像关系。
            </p>
            <small>
              Microsoft YaHei UI / PingFang SC / Microsoft YaHei
            </small>
          </article>
          <article>
            <Text type="secondary">繁体展示 · 昭源環方</Text>
            <p
              className="type-sample font-chiron"
              data-font-probe="traditional"
            >
              昭源環方 教師工作臺
            </p>
            <small>Chiron GoRound TC WS v1.011 · 仅九个展示字形</small>
          </article>
          <article>
            <Text type="secondary">英文 · Nunito</Text>
            <p
              className="type-sample font-nunito"
              data-font-probe="latin"
            >
              Edu Agent · Teacher Workspace
            </p>
            <small>Nunito variable · 固定版本</small>
          </article>
          <article>
            <Text type="secondary">数字与拉丁标点</Text>
            <p
              className="type-sample font-nunito"
              data-font-probe="numbers"
            >
              0123456789 · 42% · 2026/09/20 · A–B
            </p>
            <small>Nunito；中文标点由系统中文字体回退</small>
          </article>
        </div>
        <div className="weight-samples">
          {[400, 600].map((weight) => (
            <div key={weight}>
              <span>{weight}</span>
              <p
                className="font-nunito"
                style={{ fontWeight: weight }}
              >
                Evidence informs judgment
              </p>
              <p
                className="font-system-sc"
                style={{ fontWeight: weight }}
              >
                证据支持判断
              </p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="workspace-card" variant="borderless">
        <div className="section-heading">
          <div>
            <Text className="section-kicker">颜色令牌</Text>
            <Title level={3}>明亮蓝色工作台</Title>
          </div>
        </div>
        <div className="token-grid">
          {swatches.map(([label, value]) => (
            <article key={label}>
              <span
                className="token-swatch"
                style={{ background: value }}
                aria-hidden="true"
              />
              <strong>{label}</strong>
              <code>{value}</code>
            </article>
          ))}
        </div>
      </Card>
    </div>
  );
}
