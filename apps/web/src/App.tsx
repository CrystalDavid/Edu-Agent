import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
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
  Tag,
  Tooltip,
  Typography
} from "antd";

import {
  ApiError,
  loadTeacherWorkbench,
  loadWorkspace
} from "./api";
import { cleanDisplayText } from "./presentation";
import { useAppRoute, type AppRoute } from "./route";

const DashboardPage = lazy(() =>
  import("./pages/DashboardPage").then((module) => ({
    default: module.DashboardPage
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

const { Text } = Typography;

type NavIconName =
  | "workspace"
  | "goal"
  | "evidence"
  | "copilot"
  | "plan"
  | "runs"
  | "style"
  | "settings"
  | "search"
  | "help"
  | "plus";

type NavigationItem = {
  key: Exclude<AppRoute, "/style-guide">;
  label: string;
  compactLabel: string;
  icon: NavIconName;
};

const navigation: NavigationItem[] = [
  {
    key: "/",
    label: "今日工作台",
    compactLabel: "工作台",
    icon: "workspace"
  },
  {
    key: "/goals",
    label: "教学目标",
    compactLabel: "目标",
    icon: "goal"
  },
  {
    key: "/evidence",
    label: "学习证据",
    compactLabel: "证据",
    icon: "evidence"
  },
  {
    key: "/copilot",
    label: "教师助手",
    compactLabel: "助手",
    icon: "copilot"
  },
  {
    key: "/teaching-plan",
    label: "教学计划",
    compactLabel: "计划",
    icon: "plan"
  },
  {
    key: "/runs",
    label: "运行记录",
    compactLabel: "记录",
    icon: "runs"
  }
];

function AppIcon({
  name,
  className
}: {
  name: NavIconName;
  className?: string;
}) {
  const paths: Record<NavIconName, string[]> = {
    workspace: ["M4 4h6v6H4z", "M14 4h6v6h-6z", "M4 14h6v6H4z", "M14 14h6v6h-6z"],
    goal: [
      "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
      "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z",
      "M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"
    ],
    evidence: ["M5 3h14v18H5z", "M8 8h8", "M8 12h8", "M8 16h5"],
    copilot: [
      "M7 7.5A5 5 0 0 1 17 7.5v3A5 5 0 0 1 12 15a5 5 0 0 1-5-4.5z",
      "M9 19h6",
      "M12 15v4",
      "M4 9h3",
      "M17 9h3"
    ],
    plan: ["M6 3h12v18H6z", "M9 8h6", "M9 12h6", "M9 16h4", "M9 3v3", "M15 3v3"],
    runs: ["M4 12a8 8 0 1 0 2.3-5.7L4 8.6", "M4 4v4.6h4.6", "M12 8v5l3 2"],
    style: ["M5 19 12 5l7 14", "M8 14h8"],
    settings: [
      "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z",
      "M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3l-.7.3a1.7 1.7 0 0 0-1.1 1.5V21H9v-.2a1.7 1.7 0 0 0-1.1-1.5l-.7-.3a1.7 1.7 0 0 0-1.9.3l-.1.1L2.4 16.6l.1-.1a1.7 1.7 0 0 0 .3-1.9l-.3-.7A1.7 1.7 0 0 0 1 12.8V9h.2a1.7 1.7 0 0 0 1.5-1.1l.3-.7a1.7 1.7 0 0 0-.3-1.9l-.1-.1L5.4 2.4l.1.1a1.7 1.7 0 0 0 1.9.3l.7-.3A1.7 1.7 0 0 0 9.2 1H13v.2a1.7 1.7 0 0 0 1.1 1.5l.7.3a1.7 1.7 0 0 0 1.9-.3l.1-.1 2.8 2.8-.1.1a1.7 1.7 0 0 0-.3 1.9l.3.7A1.7 1.7 0 0 0 21 9.2V13h-.2a1.7 1.7 0 0 0-1.5 1.1z"
    ],
    search: ["M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z", "m16 16 4 4"],
    help: ["M9.5 9a2.6 2.6 0 1 1 3.4 2.5c-.9.3-1.4.9-1.4 1.8", "M11.5 17h.01", "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z"],
    plus: ["M12 5v14", "M5 12h14"]
  };
  return (
    <svg
      className={className ?? "app-icon"}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name].map((path) => (
        <path d={path} key={path} />
      ))}
    </svg>
  );
}

function PageLoading() {
  return (
    <div className="route-loading" aria-label="页面加载中">
      <Skeleton active paragraph={{ rows: 6 }} />
    </div>
  );
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
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
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

  const retryBootstrap = () => {
    initialRequest.current = null;
    setWorkspace(null);
    bootstrap();
  };

  const searchOptions = useMemo(
    () =>
      workspace
        ? [
            {
              label: cleanDisplayText(workspace.courseRun.className),
              hint: "当前课程",
              route: "/goals" as const
            },
            {
              label: workspace.learningObjective.title,
              hint: "教学目标",
              route: "/goals" as const
            },
            {
              label: "学习证据",
              hint: `${workspace.evidence.observations.length} 条直接观察`,
              route: "/evidence" as const
            },
            {
              label: workspace.latestTeachingPlan.title,
              hint: "教学计划",
              route: "/teaching-plan" as const
            }
          ].filter((item) =>
            `${item.label}${item.hint}`.includes(searchTerm.trim())
          )
        : [],
    [searchTerm, workspace]
  );

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

  return (
    <div
      className={`teacher-shell ${
        sidebarExpanded ? "teacher-shell--expanded" : ""
      }`}
    >
      <aside className="side-rail" aria-label="教师工作台导航">
        <div className="brand">
          <div className="brand__mark font-brand">教</div>
          <div className="brand__copy">
            <strong>Edu Agent</strong>
            <span>教师工作台</span>
          </div>
        </div>

        <nav className="primary-nav" aria-label="主要页面">
          {navigation.map((item) => (
            <Tooltip
              key={item.key}
              title={sidebarExpanded ? null : item.label}
              placement="right"
            >
              <button
                type="button"
                className={
                  route === item.key ? "nav-item nav-item--active" : "nav-item"
                }
                aria-current={route === item.key ? "page" : undefined}
                aria-label={item.label}
                onClick={() => navigate(item.key)}
              >
                <AppIcon name={item.icon} />
                <span className="nav-item__compact">{item.compactLabel}</span>
                <span className="nav-item__expanded">{item.label}</span>
              </button>
            </Tooltip>
          ))}
        </nav>

        <div className="rail-footer">
          <Tooltip
            title={sidebarExpanded ? null : "样式与字体"}
            placement="right"
          >
            <button
              type="button"
              className={
                route === "/style-guide"
                  ? "nav-item nav-item--active"
                  : "nav-item"
              }
              aria-current={
                route === "/style-guide" ? "page" : undefined
              }
              aria-label="样式与字体"
              onClick={() => navigate("/style-guide")}
            >
              <AppIcon name="style" />
              <span className="nav-item__compact">样式</span>
              <span className="nav-item__expanded">样式与字体</span>
            </button>
          </Tooltip>
          <Tooltip
            title={sidebarExpanded ? null : "设置"}
            placement="right"
          >
            <button
              type="button"
              className="nav-item"
              aria-label="设置"
              onClick={() => setInspectorOpen(true)}
            >
              <AppIcon name="settings" />
              <span className="nav-item__compact">设置</span>
              <span className="nav-item__expanded">设置</span>
            </button>
          </Tooltip>
          <button
            type="button"
            className="rail-expand-button"
            aria-label={sidebarExpanded ? "收起侧栏" : "展开侧栏"}
            onClick={() => setSidebarExpanded((current) => !current)}
          >
            <span aria-hidden="true">{sidebarExpanded ? "‹" : "›"}</span>
            <span className="nav-item__expanded">收起侧栏</span>
          </button>
        </div>
      </aside>

      <div className="workspace-shell">
        <header className="topbar">
          <div className="topbar__context">
            <strong>教师工作台</strong>
            <span>{className} · {workspace.courseRun.subject}</span>
          </div>

          <div className="global-search">
            <Input
              value={searchTerm}
              allowClear
              prefix={<AppIcon name="search" />}
              placeholder="搜索课程、目标、证据和教学计划"
              aria-label="全局搜索"
              onChange={(event) => setSearchTerm(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && searchOptions[0]) {
                  navigate(searchOptions[0].route);
                  setSearchTerm("");
                }
              }}
            />
            {searchTerm.trim() ? (
              <div className="search-results" role="listbox">
                {searchOptions.length ? (
                  searchOptions.map((item) => (
                    <button
                      key={`${item.route}:${item.label}`}
                      type="button"
                      onClick={() => {
                        navigate(item.route);
                        setSearchTerm("");
                      }}
                    >
                      <span>{item.label}</span>
                      <small>{item.hint}</small>
                    </button>
                  ))
                ) : (
                  <p>没有找到匹配内容</p>
                )}
              </div>
            ) : null}
          </div>

          <div className="topbar__actions">
            <Button
              type="primary"
              icon={<AppIcon name="plus" />}
              onClick={() => navigate("/copilot")}
            >
              新建任务
            </Button>
            <Tooltip title="帮助与使用边界">
              <Button
                type="text"
                className="icon-button"
                aria-label="帮助"
                icon={<AppIcon name="help" />}
                onClick={() => setInspectorOpen(true)}
              />
            </Tooltip>
            <Tooltip title="当前使用示例数据，未连接真实学校系统">
              <Tag className="demo-environment-tag">演示环境</Tag>
            </Tooltip>
            <div className="teacher-identity">
              <Avatar>{teacherName.slice(0, 1)}</Avatar>
              <div>
                <strong>{teacherName}</strong>
                <small>数学教师</small>
              </div>
            </div>
          </div>
        </header>

        <main className="workspace-main">
          <Suspense fallback={<PageLoading />}>
            {route === "/" ? (
              <DashboardPage
                workspace={workspace}
                navigate={navigate}
              />
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
