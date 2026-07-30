import { useEffect, useRef, useState } from "react";

import { Avatar } from "antd";

import type { AppRoute } from "../../route";
import type { PortalRoute } from "../../teacher-portal-data";
import { WorkspaceIcon, type WorkspaceIconName } from "../WorkspaceIcon";

type NavigationItem = {
  route: PortalRoute;
  label: string;
  icon: WorkspaceIconName;
};

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
  { label: "账号和身份", section: "identity", icon: "lock" },
  { label: "角色与工作空间", section: "workspace", icon: "workspace" },
  { label: "外观和字体", section: "appearance", icon: "eye" },
  { label: "通知设置", section: "notifications", icon: "bell" },
  { label: "上下文和记忆", section: "memory", icon: "memory" },
  { label: "个人方法和 Skill", section: "skills", icon: "lesson" },
  { label: "自动化授权", section: "automation", icon: "automation" },
  { label: "隐私与数据", section: "privacy", icon: "lock" },
  { label: "系统信息", section: "system", icon: "settings" }
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
  onNavigate: (route: AppRoute) => void;
}) {
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const current = activeRoute(props.route);

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
      <div className="teacher-sidebar__brand" aria-label="Edu Agent">
        <span className="brand-mark">EA</span>
        <span>
          <strong>Edu Agent</strong>
          <small>教师工作空间</small>
        </span>
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

      <div className="teacher-sidebar__footer" ref={profileRef}>
        {profileOpen ? (
          <TeacherProfileMenu
            onSelect={openSettings}
            onExit={() => {
              setProfileOpen(false);
              window.alert("当前为本地演示环境，没有真实账号会话需要退出。");
            }}
          />
        ) : null}
        <button
          type="button"
          className="teacher-profile-trigger"
          aria-expanded={profileOpen}
          aria-haspopup="menu"
          onClick={() => setProfileOpen((value) => !value)}
        >
          <Avatar size={40} className="teacher-avatar">林</Avatar>
          <span>
            <strong>{props.teacherName}</strong>
            <small>数学教师</small>
          </span>
          <WorkspaceIcon name="more" />
        </button>
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
  onExit: () => void;
}) {
  return (
    <div className="teacher-profile-menu" role="menu" aria-label="教师设置菜单">
      <header>
        <Avatar size={38} className="teacher-avatar">林</Avatar>
        <span>
          <strong>林老师</strong>
          <small>明远实验中学 · 数学教师</small>
        </span>
      </header>
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
      <button type="button" className="profile-exit" role="menuitem" onClick={props.onExit}>
        退出演示
      </button>
    </div>
  );
}
