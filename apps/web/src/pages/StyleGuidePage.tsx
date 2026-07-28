import { Alert, Card, Tag, Typography } from "antd";

const { Paragraph, Text, Title } = Typography;

const swatches = [
  ["Primary", "#5B8FF9"],
  ["Blue 100", "#EAF2FF"],
  ["Page", "#F5F7FB"],
  ["Border", "#E3E9F2"],
  ["Text", "#1F2A37"],
  ["Warning", "#FFF8E8"],
  ["Success", "#ECFDF3"],
  ["Mock", "#F4F0FF"]
] as const;

export function StyleGuidePage() {
  return (
    <div className="page-stack style-guide-page">
      <header className="page-header page-header--compact">
        <div>
          <Text className="section-kicker">STYLE GUIDE</Text>
          <Title>样式与字体</Title>
          <Paragraph>
            本页用于检查浅蓝色设计令牌、简体中文回退、繁体展示字、
            英文数字和不同字重。字体全部由本地静态资源提供。
          </Paragraph>
        </div>
      </header>

      <Alert
        type="warning"
        showIcon
        title="昭源環方不宣称完整支持简化字"
        description="简体正文固定使用 Microsoft YaHei UI / PingFang SC 等系统 SC 字体；昭源環方只用于下方明确列出的繁体展示文本。界面不会把简体自动转换为繁体。"
      />

      <Card className="workspace-card" variant="borderless">
        <div className="section-heading">
          <div>
            <Text className="section-kicker">TYPE SAMPLES</Text>
            <Title level={3}>字体覆盖与回退</Title>
          </div>
          <Tag>self-hosted WOFF2</Tag>
        </div>
        <div className="type-sample-grid">
          <article>
            <Text type="secondary">简体中文 · 系统 SC 回退</Text>
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
            <small>Chiron GoRound TC WS v1.011</small>
          </article>
          <article>
            <Text type="secondary">English · Nunito</Text>
            <p
              className="type-sample font-nunito"
              data-font-probe="latin"
            >
              Teacher Copilot · Evidence First
            </p>
            <small>Nunito variable · pinned commit</small>
          </article>
          <article>
            <Text type="secondary">数字与标点</Text>
            <p
              className="type-sample font-nunito"
              data-font-probe="numbers"
            >
              0123456789 · 42% · 2026/09/20 · A–B
            </p>
            <small>Nunito + 系统中文标点回退</small>
          </article>
        </div>
        <div className="weight-samples">
          {[300, 400, 500, 600, 700, 800].map((weight) => (
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
            <Text className="section-kicker">DESIGN TOKENS</Text>
            <Title level={3}>浅蓝色界面令牌</Title>
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
