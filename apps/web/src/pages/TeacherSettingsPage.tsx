import { useEffect, useState } from "react";

import type { AuthenticationSessionStatus } from "@edu-agent/contracts";
import { Button, Input } from "antd";

import { IdentityOrganizationSettings } from "../components/portal/IdentityOrganizationSettings";
import { TeacherPreferenceSettings } from "../components/portal/TeacherPreferenceSettings";
import { SettingsRow, SettingsSection } from "../components/portal/SettingsSection";
import { TeacherAvatar } from "../components/portal/TeacherAvatar";
import { cleanDisplayText } from "../presentation";
import type { AppRoute } from "../route";

type AuthenticatedSession = Extract<
  AuthenticationSessionStatus,
  { authenticated: true }
>;

const sectionLinks = [
  ["profile", "个人信息"],
  ["identity", "账号和学校"],
  ["personalization", "助手偏好"],
  ["privacy", "隐私与数据"]
] as const;

export function TeacherSettingsPage(props: {
  navigate: (route: AppRoute) => void;
  onAction: (message: string) => void;
  authSession: AuthenticatedSession;
}) {
  const [activeSection, setActiveSection] = useState(
    props.authSession.currentWorkspace?.roles.includes("school_admin") ? "identity" : "profile"
  );

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

  const teacherName = cleanDisplayText(props.authSession.user.displayName);

  return (
    <div className="portal-page settings-page-v1" data-testid="settings-page">
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
          {activeSection === "profile" ? (
          <SettingsSection id="profile" title="个人信息">
            <div className="profile-form">
              <div className="profile-avatar-field">
                <TeacherAvatar displayName={teacherName} size={72} />
              </div>
              <label>姓名<Input value={teacherName} readOnly /></label>
              <label>联系方式<Input value={props.authSession.user.email ?? "未提供"} readOnly /></label>
            </div>
          </SettingsSection>
          ) : null}

          {activeSection === "identity" ? (
          <SettingsSection id="identity" title="账号和学校">
            <IdentityOrganizationSettings session={props.authSession} onAction={props.onAction} />
          </SettingsSection>
          ) : null}

          {activeSection === "personalization" ? (
          <SettingsSection
            id="personalization"
            title="助手偏好"
          >
            <TeacherPreferenceSettings onAction={props.onAction} />
          </SettingsSection>
          ) : null}

          {activeSection === "privacy" ? (
          <SettingsSection id="privacy" title="隐私与数据">
            <SettingsRow
              label="数据管理"
              description="导出或删除个人数据"
              control={<Button onClick={() => chooseSection("identity")}>查看</Button>}
            />
          </SettingsSection>
          ) : null}
        </main>
      </div>
    </div>
  );
}
