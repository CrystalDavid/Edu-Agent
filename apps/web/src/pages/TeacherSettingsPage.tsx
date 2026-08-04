import { useEffect, useState } from "react";

import type { AuthenticationSessionStatus } from "@edu-agent/contracts";
import { Button, Input } from "antd";

import { IdentityOrganizationSettings } from "../components/portal/IdentityOrganizationSettings";
import { TeacherPreferenceSettings } from "../components/portal/TeacherPreferenceSettings";
import { PageHeader, StatusPill } from "../components/portal/PortalPrimitives";
import { SettingsRow, SettingsSection } from "../components/portal/SettingsSection";
import { TeacherAvatar } from "../components/portal/TeacherAvatar";
import { WorkspaceIcon } from "../components/WorkspaceIcon";
import { cleanDisplayText, roleLabel } from "../presentation";
import type { AppRoute } from "../route";

type AuthenticatedSession = Extract<
  AuthenticationSessionStatus,
  { authenticated: true }
>;

const sectionLinks = [
  ["profile", "个人信息"],
  ["identity", "账号和学校"],
  ["workspace", "角色与课程"],
  ["personalization", "Agent 偏好"],
  ["privacy", "隐私与数据"],
  ["system", "系统状态"]
] as const;

export function TeacherSettingsPage(props: {
  navigate: (route: AppRoute) => void;
  onAction: (message: string) => void;
  authSession: AuthenticatedSession;
}) {
  const [activeSection, setActiveSection] = useState("profile");

  useEffect(() => {
    const requested = window.sessionStorage.getItem("teacher-settings-section");
    if (requested && sectionLinks.some(([section]) => section === requested)) {
      setActiveSection(requested);
      window.sessionStorage.removeItem("teacher-settings-section");
      window.setTimeout(
        () => document.getElementById(`settings-${requested}`)?.scrollIntoView({ block: "start" }),
        50
      );
    }
  }, []);

  const chooseSection = (section: string) => {
    setActiveSection(section);
    document.getElementById(`settings-${section}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const workspace = props.authSession.currentWorkspace;
  const teacherName = cleanDisplayText(props.authSession.user.displayName);
  const schoolName = workspace ? cleanDisplayText(workspace.organizationName) : "未选择";

  return (
    <div className="portal-page settings-page-v1" data-testid="settings-page">
      <PageHeader title="设置" subtitle="查看账号、学校、权限与数据治理状态" />
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="设置分区">
          {sectionLinks.map(([id, label]) => (
            <button
              type="button"
              key={id}
              className={activeSection === id ? "is-active" : ""}
              onClick={() => chooseSection(id)}
            >
              {label}
            </button>
          ))}
        </nav>

        <main className="settings-content">
          <SettingsSection id="profile" title="个人信息" description="姓名与联系方式来自当前登录账号。">
            <div className="profile-form">
              <div className="profile-avatar-field">
                <TeacherAvatar displayName={teacherName} size={72} />
                <span>头像由当前账号提供</span>
              </div>
              <label>姓名<Input value={teacherName} readOnly /></label>
              <label>联系方式<Input value={props.authSession.user.email ?? "未提供"} readOnly /></label>
              <label>当前学校<Input value={schoolName} readOnly /></label>
            </div>
          </SettingsSection>

          <SettingsSection id="identity" title="账号和学校" description="查看服务端会话、学校成员关系与数据治理请求。">
            <IdentityOrganizationSettings session={props.authSession} onAction={props.onAction} />
          </SettingsSection>

          <SettingsSection id="workspace" title="角色与课程" description="角色决定可见职责，每次读取仍会检查具体课程权限。">
            <SettingsRow
              label="当前角色"
              description={workspace?.roles.map(roleLabel).join(" / ") ?? "未选择"}
              control={<StatusPill tone="success">已验证</StatusPill>}
            />
            <SettingsRow
              label="当前学校"
              description={schoolName}
              control={<StatusPill tone="blue">使用中</StatusPill>}
            />
            <SettingsRow
              label="授权课程"
              description="只显示学校管理员分配给当前成员的课程"
              control={<span>{workspace?.courseRunRefs.length ?? 0} 门</span>}
            />
          </SettingsSection>

          <SettingsSection
            id="personalization"
            title="Agent 偏好"
            description="查看并管理您明确确认、允许 Agent 在后续备课中使用的长期偏好。"
          >
            <TeacherPreferenceSettings onAction={props.onAction} />
          </SettingsSection>

          <SettingsSection id="privacy" title="隐私与数据" description="数据请求会登记到服务端，不在浏览器拼装或删除业务历史。">
            <SettingsRow
              label="数据导出与去标识"
              description="提交受控请求后由学校管理员按保留规则审核"
              control={<Button onClick={() => chooseSection("identity")}>查看数据治理</Button>}
            />
            <SettingsRow
              label="操作记录"
              description="查看有权限的模型运行与审计结果"
              control={<Button onClick={() => props.navigate("/runs")}>查看记录</Button>}
            />
          </SettingsSection>

          <SettingsSection id="system" title="系统状态" description="只显示当前可验证的运行状态。">
            <SettingsRow label="登录会话" control={<StatusPill tone="success">正常</StatusPill>} />
            <SettingsRow label="当前工作空间" description={schoolName} control={<StatusPill tone="success">已连接</StatusPill>} />
            <SettingsRow
              label="运行与审计"
              control={(
                <Button icon={<WorkspaceIcon name="clock" />} onClick={() => props.navigate("/runs")}>
                  查看记录
                </Button>
              )}
            />
          </SettingsSection>
        </main>
      </div>
    </div>
  );
}
