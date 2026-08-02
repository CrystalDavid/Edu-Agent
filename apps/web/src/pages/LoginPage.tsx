import type {
  AuthenticationProviderAvailability,
  AuthenticationSessionStatus,
  LocalLoginRequest
} from "@edu-agent/contracts";
import { Alert, Button, Card, Space, Spin, Typography } from "antd";

export function LoginPage(props: {
  provider: AuthenticationProviderAvailability | null;
  session: AuthenticationSessionStatus | null;
  onLogin: (profile: LocalLoginRequest["profile"]) => Promise<void>;
}) {
  return (
    <main className="identity-page" data-testid="login-page">
      <Card className="identity-card">
        <div className="identity-brand">
          <span className="brand-mark">EA</span>
          <div>
            <Typography.Title level={2}>登录 Edu Agent</Typography.Title>
            <Typography.Text type="secondary">
              身份供应商只验证你是谁；学校、角色和课程权限由 Edu-Agent 管理。
            </Typography.Text>
          </div>
        </div>

        {!props.provider ? (
          <Spin tip="正在检查身份供应商" />
        ) : !props.provider.available ? (
          <Alert
            type="error"
            showIcon
            message="身份供应商暂不可用"
            description={props.provider.safeReason}
          />
        ) : props.provider.mode === "oidc" ? (
          <Button
            data-testid="oidc-login-button"
            type="primary"
            size="large"
            block
            onClick={() => window.location.assign(props.provider!.loginPath!)}
          >
            使用学校统一身份登录
          </Button>
        ) : (
          <section className="local-identity-list" aria-label="本地合成身份">
            <Alert
              type="info"
              showIcon
              message="本地演示身份"
              description="这些账号只包含合成数据，不是密码登录，也不会连接真实学校身份系统。"
            />
            {props.provider.localProfiles.map((profile) => (
              <button
                data-testid={`login-profile-${profile.profile}`}
                type="button"
                key={profile.profile}
                className="local-identity-option"
                onClick={() => void props.onLogin(profile.profile)}
              >
                <strong>{profile.displayName}</strong>
                <span>{profile.description}</span>
              </button>
            ))}
          </section>
        )}

        <Space direction="vertical" size={4} className="identity-security-note">
          <Typography.Text strong>会话安全</Typography.Text>
          <Typography.Text type="secondary">
            登录后使用 HttpOnly Cookie；浏览器不会保存身份 Token、tenant 或角色。
          </Typography.Text>
          {props.session && !props.session.authenticated && props.session.demoBypassAvailable ? (
            <Typography.Text type="warning">
              当前服务允许显式 Demo bypass，但门户仍建议通过本地身份登录进行验收。
            </Typography.Text>
          ) : null}
        </Space>
      </Card>
    </main>
  );
}
