import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";

import type {
  CreateTeacherCopilotTaskResult,
  TeacherWorkspace
} from "@edu-agent/contracts";
import {
  Avatar,
  Button,
  Input,
  Result,
  Skeleton,
  Space,
  Tooltip,
  Typography
} from "antd";

import {
  ApiError,
  loadTeacherWorkbench,
  loadWorkspace
} from "./api";
import {
  WorkspaceIcon,
  type WorkspaceIconName
} from "./components/WorkspaceIcon";
import { recentFiles } from "./demo-read-model";
import { cleanDisplayText } from "./presentation";
import { useAppRoute, type AppRoute } from "./route";

const DashboardPage = lazy(() =>
  import("./pages/DashboardPage").then((module) => ({
    default: module.DashboardPage
  }))
);
const SchedulePage = lazy(() =>
  import("./pages/SchedulePage").then((module) => ({
    default: module.SchedulePage
  }))
);
const CoursesPage = lazy(() =>
  import("./pages/CoursesPage").then((module) => ({
    default: module.CoursesPage
  }))
);
const StudentsPage = lazy(() =>
  import("./pages/StudentsPage").then((module) => ({
    default: module.StudentsPage
  }))
);
const AssignmentsPage = lazy(() =>
  import("./pages/AssignmentsPage").then((module) => ({
    default: module.AssignmentsPage
  }))
);
const FilesPage = lazy(() =>
  import("./pages/FilesPage").then((module) => ({
    default: module.FilesPage
  }))
);
const SettingsPage = lazy(() =>
  import("./pages/SettingsPage").then((module) => ({
    default: module.SettingsPage
  }))
);
const GoalsPage = lazy(() =>
  import("./pages/GoalsPage").then((module) => ({
    default: module.GoalsPage
  }))
);
const EvidencePage = lazy(() =>
  import("./pages/EvidencePage").then((module) => ({
    default: module.EvidencePage
  }))
);
const CopilotPage = lazy(() =>
  import("./pages/CopilotPage").then((module) => ({
    default: module.CopilotPage
  }))
);
const TeachingPlanPage = lazy(() =>
  import("./pages/TeachingPlanPage").then((module) => ({
    default: module.TeachingPlanPage
  }))
);
const RunsPage = lazy(() =>
  import("./pages/RunsPage").then((module) => ({
    default: module.RunsPage
  }))
);
const StyleGuidePage = lazy(() =>
  import("./pages/StyleGuidePage").then((module) => ({
    default: module.StyleGuidePage
  }))
);
const InspectorPanel = lazy(() =>
  import("./components/InspectorPanel").then((module) => ({
    default: module.InspectorPanel
  }))
);

type NavigationItem = {
  route:
    | "/"
    | "/schedule"
    | "/courses"
    | "/students"
    | "/assignments"
    | "/files";
  label: string;
  icon: WorkspaceIconName;
};

const navigation: NavigationItem[] = [
  { route: "/", label: "工作台", icon: "workspace" },
  { route: "/schedule", label: "日程", icon: "schedule" },
  { route: "/courses", label: "课程", icon: "course" },
  { route: "/students", label: "学生", icon: "students" },
  { route: "/assignments", label: "作业", icon: "assignment" },
  { route: "/files", label: "文件", icon: "files" }
];

const quickCommands = [
  "准备明天的课程",
  "制作一次函数课件",
  "根据最近作业调整教学重点",
  "查看今天未交作业",
  "查看需要关注的学生",
  "安排本周备课时间"
] as const;

function PageLoading() {
  return (
    <div className="route-loading" aria-label="页面加载中">
      <Skeleton active paragraph={{ rows: 6 }} />
    </div>
  );
}

function activePrimaryRoute(route: AppRoute): NavigationItem["route"] | null {
  if (navigation.some((item) => item.route === route)) {
    return route as NavigationItem["route"];
  }
  if (
    route === "/goals" ||
    route === "/copilot" ||
    route === "/teaching-plan"
  ) {
    return "/courses";
  }
  if (route === "/evidence") return "/students";
  return null;
}

function commandDestination(command: string): AppRoute {
  if (command.includes("未交") || command.includes("作业")) {
    return command.includes("调整") ? "/copilot" : "/assignments";
  }
  if (command.includes("学生") || command.includes("学情")) {
    return "/students";
  }
  if (command.includes("日程") || command.includes("备课时间")) {
    return "/schedule";
  }
  if (
    command.includes("课件") ||
    command.includes("文件") ||
    command.includes("教案")
  ) {
    return "/files";
  }
  if (
    command.includes("准备") ||
    command.includes("调整") ||
    command.includes("策略")
  ) {
    return "/copilot";
  }
  return "/courses";
}

export function App() {
  const { route, navigate } = useAppRoute();
  const [workspace, setWorkspace] =
    useState<TeacherWorkspace | null>(null);
  const [task, setTask] =
    useState<CreateTeacherCopilotTaskResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandText, setCommandText] = useState("");
  const [agentTaskPrompt, setAgentTaskPrompt] = useState("");
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [identityOpen, setIdentityOpen] = useState(false);
  const initialRequest = useRef<Promise<TeacherWorkspace> | null>(
    null
  );

  const refreshWorkspace = useCallback(async () => {
    const next = await loadWorkspace();
    setWorkspace(next);
  }, []);

  const bootstrap = useCallback(() => {
    let active = true;
    setLoading(true);
    setError(null);
    initialRequest.current ??= loadTeacherWorkbench();
    void initialRequest.current
      .then((result) => {
        if (active) setWorkspace(result);
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(
            caught instanceof Error
              ? caught
              : new Error("无法加载教师工作台")
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => bootstrap(), [bootstrap]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "k"
      ) {
        event.preventDefault();
        setCommandText("");
        setNotificationOpen(false);
        setIdentityOpen(false);
        setCommandOpen(true);
        return;
      }
      if (event.key === "Escape") {
        setCommandOpen(false);
        setNotificationOpen(false);
        setIdentityOpen(false);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  const retryBootstrap = () => {
    initialRequest.current = null;
    setWorkspace(null);
    bootstrap();
  };

  const openCommand = (initialValue = "") => {
    setCommandText(initialValue);
    setNotificationOpen(false);
    setIdentityOpen(false);
    setCommandOpen(true);
  };

  const executeCommand = (value: string) => {
    const command = value.trim();
    if (!command) return;
    const destination = commandDestination(command);
    if (destination === "/copilot") {
      setAgentTaskPrompt(command);
    }
    setCommandText("");
    setCommandOpen(false);
    navigate(destination);
  };

  if (loading) {
    return (
      <div className="boot-screen">
        <div className="boot-card">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      </div>
    );
  }

  if (error || !workspace) {
    return (
      <div className="boot-screen">
        <Result
          status="error"
          title={
            <Typography.Title level={2}>
              教师工作台未能启动
            </Typography.Title>
          }
          subTitle={
            <div className="startup-diagnostic">
              <p>{error?.message ?? "请确认本地演示服务已经启动。"}</p>
              {error instanceof ApiError ? (
                <dl>
                  <div>
                    <dt>请求服务</dt>
                    <dd>{error.service}</dd>
                  </div>
                  <div>
                    <dt>安全错误代码</dt>
                    <dd>{error.code}</dd>
                  </div>
                </dl>
              ) : null}
              <details>
                <summary>查看本地启动指南</summary>
                <p>
                  在项目根目录运行{" "}
                  <code>corepack pnpm demo:doctor</code>，再运行{" "}
                  <code>corepack pnpm demo:dev</code>。
                </p>
                <p>
                  完整说明：<code>docs/demo/LOCAL_DEMO.md</code>
                </p>
              </details>
            </div>
          }
          extra={
            <Space>
              <Button type="primary" onClick={retryBootstrap}>
                重试
              </Button>
              <Button
                href="/api/health"
                target="_blank"
                rel="noreferrer"
              >
                检查服务状态
              </Button>
            </Space>
          }
        />
      </div>
    );
  }

  const teacherName = cleanDisplayText(workspace.identity.teacherName);
  const className = cleanDisplayText(workspace.courseRun.className);
  const activeRoute = activePrimaryRoute(route);

  return (
    <div className="teacher-shell">
      <aside className="side-rail" aria-label="教师工作台导航">
        <Tooltip title={`${teacherName} · 数学教师`} placement="right">
          <button
            type="button"
            className="rail-avatar"
            aria-label="林老师头像"
            onClick={() => {
              setIdentityOpen((current) => !current);
              setNotificationOpen(false);
            }}
          >
            <Avatar size={38}>林</Avatar>
          </button>
        </Tooltip>

        <nav className="primary-nav" aria-label="主要页面">
          {navigation.map((item) => (
            <Tooltip
              key={item.route}
              title={item.label}
              placement="right"
            >
              <button
                type="button"
                className={
                  activeRoute === item.route
                    ? "nav-item nav-item--active"
                    : "nav-item"
                }
                aria-current={
                  activeRoute === item.route ? "page" : undefined
                }
                aria-label={item.label}
                onClick={() => navigate(item.route)}
              >
                <WorkspaceIcon name={item.icon} />
                <span>{item.label}</span>
              </button>
            </Tooltip>
          ))}
        </nav>

        <div className="rail-footer">
          <Tooltip title="设置" placement="right">
            <button
              type="button"
              className={
                route === "/settings" ||
                route === "/runs" ||
                route === "/style-guide"
                  ? "nav-item nav-item--active"
                  : "nav-item"
              }
              aria-current={
                route === "/settings" ||
                route === "/runs" ||
                route === "/style-guide"
                  ? "page"
                  : undefined
              }
              aria-label="设置"
              onClick={() => navigate("/settings")}
            >
              <WorkspaceIcon name="settings" />
              <span>设置</span>
            </button>
          </Tooltip>
        </div>
      </aside>

      <div className="workspace-shell">
        <header className="topbar">
          <div className="topbar__context">
            <strong>教师工作台</strong>
            <span>{className} · {workspace.courseRun.subject}</span>
          </div>

          <button
            type="button"
            className="global-command"
            aria-label="打开搜索与任务输入"
            aria-haspopup="dialog"
            onClick={() => openCommand()}
            data-testid="global-agent-input"
          >
            <WorkspaceIcon name="search" />
            <span>搜索课程、学生和文件，或告诉我你想完成什么</span>
            <kbd>Ctrl K</kbd>
          </button>

          <div className="topbar__actions">
            <Button
              type="primary"
              icon={<WorkspaceIcon name="plus" />}
              onClick={() => openCommand()}
            >
              新建
            </Button>
            <div className="topbar-popover-anchor">
              <Tooltip title="通知">
                <Button
                  type="text"
                  className="icon-button"
                  aria-label="通知"
                  icon={<WorkspaceIcon name="bell" />}
                  onClick={() => {
                    setNotificationOpen((current) => !current);
                    setIdentityOpen(false);
                  }}
                />
              </Tooltip>
              {notificationOpen ? (
                <div className="compact-popover" role="status">
                  <strong>通知</strong>
                  <span>暂无新通知</span>
                </div>
              ) : null}
            </div>
            <Tooltip title="帮助">
              <Button
                type="text"
                className="icon-button"
                aria-label="帮助"
                icon={<WorkspaceIcon name="help" />}
                onClick={() => setInspectorOpen(true)}
              />
            </Tooltip>
            <div className="topbar-popover-anchor">
              <button
                type="button"
                className="teacher-identity"
                aria-label="林老师身份菜单"
                onClick={() => {
                  setIdentityOpen((current) => !current);
                  setNotificationOpen(false);
                }}
              >
                <Avatar size={34}>林</Avatar>
                <span>{teacherName}</span>
              </button>
              {identityOpen ? (
                <div className="identity-popover">
                  <strong>{teacherName}</strong>
                  <span>数学教师</span>
                  <span className="demo-note">
                    演示环境 · 当前使用示例数据
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setIdentityOpen(false);
                      navigate("/settings");
                    }}
                  >
                    打开设置
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <main className="workspace-main">
          <Suspense fallback={<PageLoading />}>
            {route === "/" ? (
              <DashboardPage
                workspace={workspace}
                navigate={navigate}
                openAgentTask={executeCommand}
              />
            ) : null}
            {route === "/schedule" ? (
              <SchedulePage navigate={navigate} />
            ) : null}
            {route === "/courses" ? (
              <CoursesPage workspace={workspace} navigate={navigate} />
            ) : null}
            {route === "/students" ? (
              <StudentsPage workspace={workspace} navigate={navigate} />
            ) : null}
            {route === "/assignments" ? (
              <AssignmentsPage
                navigate={navigate}
                openAgentTask={executeCommand}
              />
            ) : null}
            {route === "/files" ? (
              <FilesPage workspace={workspace} navigate={navigate} />
            ) : null}
            {route === "/settings" ? (
              <SettingsPage navigate={navigate} />
            ) : null}
            {route === "/goals" ? (
              <GoalsPage workspace={workspace} />
            ) : null}
            {route === "/evidence" ? (
              <EvidencePage workspace={workspace} />
            ) : null}
            {route === "/copilot" ? (
              <CopilotPage
                workspace={workspace}
                task={task}
                setTask={setTask}
                refreshWorkspace={refreshWorkspace}
                navigate={navigate}
                initialPrompt={agentTaskPrompt}
              />
            ) : null}
            {route === "/teaching-plan" ? (
              <TeachingPlanPage
                workspace={workspace}
                task={task}
              />
            ) : null}
            {route === "/runs" ? (
              <RunsPage workspace={workspace} task={task} />
            ) : null}
            {route === "/style-guide" ? <StyleGuidePage /> : null}
          </Suspense>
        </main>
      </div>

      {commandOpen ? (
        <CommandPalette
          value={commandText}
          onChange={setCommandText}
          onClose={() => setCommandOpen(false)}
          onExecute={executeCommand}
          className={className}
        />
      ) : null}

      {inspectorOpen ? (
        <Suspense fallback={null}>
          <InspectorPanel
            open={inspectorOpen}
            onClose={() => setInspectorOpen(false)}
            workspace={workspace}
            task={task}
          />
        </Suspense>
      ) : null}
    </div>
  );
}

function CommandPalette(props: {
  value: string;
  className: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onExecute: (value: string) => void;
}) {
  const filteredCommands = props.value.trim()
    ? quickCommands.filter((command) =>
        command.includes(props.value.trim())
      )
    : quickCommands;

  return (
    <div
      className="command-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) props.onClose();
      }}
    >
      <section
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-labelledby="command-title"
        data-testid="agent-command-palette"
      >
        <header>
          <div>
            <h2 id="command-title">搜索或开始一项任务</h2>
            <p>当前范围：{props.className} · 数学</p>
          </div>
          <button
            type="button"
            className="command-close"
            aria-label="关闭任务面板"
            onClick={props.onClose}
          >
            ×
          </button>
        </header>
        <Input
          autoFocus
          value={props.value}
          size="large"
          prefix={<WorkspaceIcon name="search" />}
          placeholder="输入课程、学生、文件或想完成的事情"
          aria-label="搜索与任务输入"
          onChange={(event) => props.onChange(event.target.value)}
          onPressEnter={() => {
            const next = props.value.trim() || filteredCommands[0];
            if (next) props.onExecute(next);
          }}
        />

        <div className="command-section">
          <span className="command-section__label">快捷任务</span>
          <div className="command-list">
            {filteredCommands.length ? (
              filteredCommands.map((command) => (
                <button
                  type="button"
                  key={command}
                  onClick={() => props.onExecute(command)}
                >
                  <WorkspaceIcon name="chevron" />
                  <span>{command}</span>
                </button>
              ))
            ) : (
              <button
                type="button"
                onClick={() => props.onExecute(props.value)}
              >
                <WorkspaceIcon name="chevron" />
                <span>作为新任务开始：{props.value}</span>
              </button>
            )}
          </div>
        </div>

        <div className="command-context">
          <div>
            <span>建议使用</span>
            <strong>{props.className} · 一次函数</strong>
          </div>
          <div>
            <span>最近文件</span>
            <strong>{recentFiles[0]?.name}</strong>
          </div>
        </div>
      </section>
    </div>
  );
}
