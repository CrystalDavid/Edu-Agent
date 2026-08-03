import { useEffect, useRef, useState } from "react";

import type {
  OrganizationRole,
  WorkspaceMembershipView
} from "@edu-agent/contracts";

import type { AppRoute } from "../../route";
import { cleanDisplayText, roleLabel } from "../../presentation";
import { WorkspaceIcon, type WorkspaceIconName } from "../WorkspaceIcon";
import { TeacherAvatar } from "./TeacherAvatar";

type NavigationItem = {
  route: PortalRoute;
  label: string;
  icon: WorkspaceIconName;
};

type PortalRoute =
  | "/overview"
  | "/schedule"
  | "/teaching"
  | "/students"
  | "/files"
  | "/agent"
  | "/settings";

const navigation: NavigationItem[] = [
  { route: "/overview", label: "概览", icon: "workspace" },
  { route: "/schedule", label: "日程", icon: "schedule" },
  { route: "/teaching", label: "教学", icon: "course" },
  { route: "/students", label: "学生", icon: "students" },
  { route: "/files", label: "文件", icon: "files" },
  { route: "/agent", label: "Agent", icon: "agent" }
];

const profileItems: Array<{
  label: string;
  section: string;
  icon: WorkspaceIconName;
}> = [
  { label: "个人信息", section: "profile", icon: "user" },
  { label: "账号和学校", section: "identity", icon: "lock" },
  { label: "角色与课程", section: "workspace", icon: "workspace" },
  { label: "隐私与数据", section: "privacy", icon: "lock" },
  { label: "系统状态", section: "system", icon: "settings" }
];

function activeRoute(route: AppRoute): PortalRoute | null {
  if (route === "/" || route === "/overview") return "/overview";
  if (route === "/courses" || route === "/assignments" || route === "/goals" || route === "/teaching-plan") return "/teaching";
  if (route === "/evidence") return "/students";
  if (route === "/copilot") return "/agent";
  if (route === "/runs" || route === "/style-guide") return "/settings";
  return navigation.some((item) => item.route === route) ? (route as PortalRoute) : null;
}
export function TeacherSidebar(props: {
  route: AppRoute;
  teacherName: string;
  schoolName: string;
  roles: OrganizationRole[];
  memberships: WorkspaceMembershipView[];
  currentMembershipRef: string;
  onSwitchWorkspace: (membershipRef: string) => Promise<void>;
  onLogout: () => Promise<void>;
  onNavigate: (route: AppRoute) => void;
}) {
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const current = activeRoute(props.route);
  const teacherName = cleanDisplayText(props.teacherName);
  const schoolName = cleanDisplayText(props.schoolName);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const openSettings = (section?: string) => {
    setProfileOpen(false);
    if (section) {
      window.sessionStorage.setItem("teacher-settings-section", section);
    }
    props.onNavigate("/settings");
  };

  return (
    <aside className="teacher-sidebar" aria-label="普通教师端主导航">
      <div className="teacher-sidebar__identity" ref={profileRef}>
        <button
          data-testid="teacher-profile-trigger"
          type="button"
          className="teacher-profile-trigger"
          aria-expanded={profileOpen}
          aria-haspopup="menu"
          onClick={() => setProfileOpen((value) => !value)}
        >
          <TeacherAvatar displayName={teacherName} size={46} />
          <span>
            <strong>{teacherName}</strong>
            <small>{schoolName}</small>
          </span>
          <WorkspaceIcon name="more" />
        </button>
        {profileOpen ? (
          <TeacherProfileMenu
            onSelect={openSettings}
            teacherName={teacherName}
            schoolName={schoolName}
            roles={props.roles}
            memberships={props.memberships}
            currentMembershipRef={props.currentMembershipRef}
            onSwitchWorkspace={props.onSwitchWorkspace}
            onExit={() => void props.onLogout()}
          />
        ) : null}
      </div>

      <nav className="teacher-sidebar__nav">
        {navigation.map((item) => (
          <button
            type="button"
            key={item.route}
            className={current === item.route ? "is-active" : ""}
            aria-current={current === item.route ? "page" : undefined}
            onClick={() => props.onNavigate(item.route)}
          >
            <WorkspaceIcon name={item.icon} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="teacher-sidebar__footer">
        <button
          type="button"
          className="teacher-settings-shortcut"
          onClick={() => openSettings()}
          aria-label="打开设置"
        >
          <WorkspaceIcon name="settings" />
          <span>设置</span>
        </button>
      </div>
    </aside>
  );
}

export function TeacherProfileMenu(props: {
  onSelect: (section: string) => void;
  teacherName: string;
  schoolName: string;
  roles: OrganizationRole[];
  memberships: WorkspaceMembershipView[];
  currentMembershipRef: string;
  onSwitchWorkspace: (membershipRef: string) => Promise<void>;
  onExit: () => void;
}) {
  return (
    <div className="teacher-profile-menu" role="menu" aria-label="教师设置菜单">
      <header>
        <TeacherAvatar displayName={props.teacherName} size={38} />
        <span>
          <strong>{props.teacherName}</strong>
          <small>{props.schoolName} · {props.roles.map(roleLabel).join(" / ")}</small>
        </span>
      </header>
      {props.memberships.length > 1 ? (
        <div className="teacher-profile-menu__workspaces">
          <small>切换学校工作空间</small>
          {props.memberships
            .filter((membership) => membership.membershipStatus === "active")
            .map((membership) => (
              <button
                type="button"
                key={membership.membershipRef}
                disabled={membership.membershipRef === props.currentMembershipRef}
                onClick={() => void props.onSwitchWorkspace(membership.membershipRef)}
              >
                {cleanDisplayText(membership.organizationName)}
                {membership.membershipRef === props.currentMembershipRef ? "（当前）" : ""}
              </button>
            ))}
        </div>
      ) : null}
      <div className="teacher-profile-menu__items">
        {profileItems.map((item) => (
          <button
            type="button"
            role="menuitem"
            key={item.section}
            onClick={() => props.onSelect(item.section)}
          >
            <WorkspaceIcon name={item.icon} />
            <span>{item.label}</span>
          </button>
        ))}
      </div>
      <button data-testid="profile-logout" type="button" className="profile-exit" role="menuitem" onClick={props.onExit}>
        退出登录
      </button>
    </div>
  );
}
