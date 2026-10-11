import { useEffect, useState } from "react";

import type {
  AuthenticationProviderAvailability,
  LocalCredentialLoginRequest,
  LocalSmsChallenge
} from "@edu-agent/contracts";
import { Alert, Button, Input, Tabs, Typography } from "antd";

import { LoginEducationNetworkDrawing } from "../components/auth/LoginEducationNetworkDrawing";

type LoginMode = "password" | "sms";

function LoginEducationNetworkIllustration() {
  return (
    <svg
      className="login-network-svg"
      viewBox="0 0 1024 1152"
      role="img"
      aria-label="教师、学生和家长协作网络插画"
      preserveAspectRatio="xMidYMid meet"
    >
      <LoginEducationNetworkDrawing />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg className="login-input-icon" aria-hidden="true" viewBox="0 0 24 24">
      <rect x="6.5" y="2.75" width="11" height="18.5" rx="2.5" />
      <path d="M10 18h4" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg className="login-input-icon" aria-hidden="true" viewBox="0 0 24 24">
      <rect x="4.5" y="10" width="15" height="11" rx="2.5" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14.5v2.75" />
    </svg>
  );
}

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
        <aside className="login-story" aria-label="教育智能工作台介绍">
          <div className="login-network-figure">
            <LoginEducationNetworkIllustration />
          </div>
        </aside>

        <section className="login-panel" aria-label="登录教育智能工作台">
          <div className="login-panel-inner">
            <div className="login-heading">
              <Typography.Title level={2}>欢迎登录</Typography.Title>
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
                className="login-oidc-button"
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
                  <Input
                    id="login-phone"
                    data-testid="login-phone"
                    aria-label="手机号"
                    size="large"
                    inputMode="numeric"
                    autoComplete="tel"
                    prefix={<PhoneIcon />}
                    placeholder="请输入手机号"
                    value={phone}
                    onChange={(event) => updatePhone(event.target.value)}
                    maxLength={11}
                  />

                  {mode === "password" ? (
                    <Input.Password
                      id="login-password"
                      data-testid="login-password"
                      aria-label="密码"
                      size="large"
                      autoComplete="current-password"
                      prefix={<LockIcon />}
                      placeholder="请输入登录密码"
                      value={password}
                      visibilityToggle={false}
                      onChange={(event) => {
                        setPassword(event.target.value);
                        setError(null);
                      }}
                    />
                  ) : (
                    <>
                      <div className="login-code-row">
                        <Input
                          id="login-code"
                          data-testid="login-code"
                          aria-label="验证码"
                          size="large"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          prefix={<LockIcon />}
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
                          data-testid="login-code-sent"
                          type="info"
                          showIcon
                          title="验证码已发送"
                          description={`已发送至 ${challenge.phoneMasked}，5 分钟内有效。`}
                        />
                      ) : null}
                    </>
                  )}

                  <div className="login-form-meta">
                    <span>首次使用可直接登录</span>
                    <span>{mode === "password" ? "忘记密码?" : "收不到验证码?"}</span>
                  </div>

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
              </>
            ) : null}
          </div>
        </section>
      </section>
    </main>
  );
}
