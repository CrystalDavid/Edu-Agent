import { useEffect, useState } from "react";

import type {
  AuthenticationProviderAvailability,
  LocalCredentialLoginRequest,
  LocalSmsChallenge
} from "@edu-agent/contracts";
import { Alert, Button, Input, Tabs, Typography } from "antd";

type LoginMode = "password" | "sms";

export function LoginPage(props: {
  provider: AuthenticationProviderAvailability | null;
  onLogin: (input: LocalCredentialLoginRequest) => Promise<void>;
  onRequestSmsCode: (phone: string) => Promise<LocalSmsChallenge>;
}) {
  const [mode, setMode] = useState<LoginMode>("password");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState<LocalSmsChallenge | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(
      () => setCooldown((current) => Math.max(0, current - 1)),
      1000
    );
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const updatePhone = (value: string) => {
    setPhone(value.replace(/\D/gu, "").slice(0, 11));
    setChallenge(null);
    setCode("");
    setCooldown(0);
    setError(null);
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      if (mode === "password") {
        await props.onLogin({
          method: "password",
          phone,
          password,
          returnTo: "/overview"
        });
      } else {
        if (!challenge) {
          throw new Error("请先获取验证码。");
        }
        await props.onLogin({
          method: "sms",
          phone,
          challengeRef: challenge.challengeRef,
          code,
          returnTo: "/overview"
        });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "登录失败，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  };

  const requestCode = async () => {
    setSendingCode(true);
    setError(null);
    try {
      const next = await props.onRequestSmsCode(phone);
      setChallenge(next);
      setCooldown(next.retryAfterSeconds);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "验证码获取失败。");
    } finally {
      setSendingCode(false);
    }
  };

  const localLogin = props.provider?.mode === "local" && props.provider.available;

  return (
    <main className="login-page" data-testid="login-page">
      <section className="login-shell">
        <aside className="login-story" aria-label="Edu-Agent 产品介绍">
          <div className="login-logo-row">
            <span className="login-logo-mark">EA</span>
            <strong>Edu-Agent</strong>
          </div>
          <div className="login-story-copy">
            <span className="login-eyebrow">TEACH WITH CLARITY</span>
            <h1>让每一次教学准备，都有清晰依据</h1>
            <p>从备课、课堂实施到课后反思，把教师的真实工作连成一条可恢复的教学闭环。</p>
          </div>
          <div className="login-visual" aria-hidden="true">
            <div className="login-visual-orbit login-visual-orbit-one" />
            <div className="login-visual-orbit login-visual-orbit-two" />
            <div className="login-visual-main-card">
              <span className="login-visual-label">今日教学</span>
              <strong>一次函数 · 斜率与图像变化</strong>
              <div className="login-visual-progress"><span /></div>
              <small>计划、证据与反思保持同步</small>
            </div>
            <div className="login-visual-float login-visual-float-plan">
              <span>✓</span>
              <div><strong>教学计划</strong><small>教师已批准</small></div>
            </div>
            <div className="login-visual-float login-visual-float-evidence">
              <span>↗</span>
              <div><strong>学习证据</strong><small>可追溯</small></div>
            </div>
          </div>
          <div className="login-story-points">
            <span>备课协同</span>
            <span>证据追溯</span>
            <span>教学反思</span>
          </div>
        </aside>

        <section className="login-panel" aria-label="登录 Edu-Agent">
          <div className="login-panel-inner">
            <div className="login-heading">
              <Typography.Title level={2}>欢迎登录</Typography.Title>
              <Typography.Text type="secondary">
                登录后继续今天的教学工作
              </Typography.Text>
            </div>

            {!props.provider ? (
              <div className="login-provider-loading" role="status">
                <span className="login-loading-dot" />
                正在连接登录服务…
              </div>
            ) : !props.provider.available ? (
              <Alert
                type="error"
                showIcon
                title="登录服务暂不可用"
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
            ) : localLogin ? (
              <>
                <Tabs
                  activeKey={mode}
                  onChange={(key) => {
                    setMode(key as LoginMode);
                    setError(null);
                  }}
                  items={[
                    { key: "password", label: "密码登录" },
                    { key: "sms", label: "验证码登录" }
                  ]}
                />

                <form
                  className="login-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void submit();
                  }}
                >
                  <label htmlFor="login-phone">手机号</label>
                  <Input
                    id="login-phone"
                    data-testid="login-phone"
                    size="large"
                    inputMode="numeric"
                    autoComplete="tel"
                    placeholder="请输入手机号"
                    value={phone}
                    onChange={(event) => updatePhone(event.target.value)}
                    maxLength={11}
                  />

                  {mode === "password" ? (
                    <>
                      <label htmlFor="login-password">密码</label>
                      <Input.Password
                        id="login-password"
                        data-testid="login-password"
                        size="large"
                        autoComplete="current-password"
                        placeholder="请输入登录密码"
                        value={password}
                        onChange={(event) => {
                          setPassword(event.target.value);
                          setError(null);
                        }}
                      />
                    </>
                  ) : (
                    <>
                      <label htmlFor="login-code">验证码</label>
                      <div className="login-code-row">
                        <Input
                          id="login-code"
                          data-testid="login-code"
                          size="large"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          placeholder="请输入 6 位验证码"
                          value={code}
                          onChange={(event) => {
                            setCode(event.target.value.replace(/\D/gu, "").slice(0, 6));
                            setError(null);
                          }}
                          maxLength={6}
                        />
                        <Button
                          data-testid="request-login-code"
                          size="large"
                          disabled={cooldown > 0 || phone.length !== 11}
                          loading={sendingCode}
                          onClick={() => void requestCode()}
                        >
                          {cooldown > 0 ? `${cooldown}s` : "获取验证码"}
                        </Button>
                      </div>
                      {challenge ? (
                        <Alert
                          data-testid="local-demo-code"
                          type="info"
                          showIcon
                          title={`本地演示验证码：${challenge.demoCode}`}
                          description={`验证码已为 ${challenge.phoneMasked} 生成，5 分钟内有效。`}
                        />
                      ) : null}
                    </>
                  )}

                  {error ? (
                    <Alert
                      data-testid="login-error"
                      type="error"
                      showIcon
                      title={error}
                    />
                  ) : null}

                  <Button
                    data-testid="login-submit"
                    type="primary"
                    size="large"
                    htmlType="submit"
                    block
                    loading={submitting}
                    disabled={
                      phone.length !== 11 ||
                      (mode === "password" ? password.length < 8 : code.length !== 6)
                    }
                  >
                    登录
                  </Button>
                </form>

                <div className="login-demo-note">
                  <span className="login-demo-dot" />
                  当前为本地演示环境，登录后进入林老师工作空间
                </div>
              </>
            ) : null}
          </div>
        </section>
      </section>
    </main>
  );
}
