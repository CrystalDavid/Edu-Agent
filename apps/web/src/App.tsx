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
  Button,
  Menu,
  Result,
  Skeleton,
  Space,
  Tag,
  Typography
} from "antd";

import {
  ApiError,
  loadTeacherWorkbench,
  loadWorkspace
} from "./api";
import { SemanticTag } from "./components/SemanticTag";
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

type NavigationItem = {
  key: Exclude<AppRoute, "/style-guide">;
  label: string;
  technicalLabel: string;
  icon: NavIconName;
};

type NavIconName =
  | "today"
  | "goal"
  | "evidence"
  | "copilot"
  | "plan"
  | "runs";

const navigation: NavigationItem[] = [
  {
    key: "/",
    label: "今日工作台",
    technicalLabel: "Today",
    icon: "today"
  },
  {
    key: "/goals",
    label: "教学目标",
    technicalLabel: "Goals",
    icon: "goal"
  },
  {
    key: "/evidence",
    label: "学习证据",
    technicalLabel: "Evidence",
    icon: "evidence"
  },
  {
    key: "/copilot",
    label: "教师助手",
    technicalLabel: "Teacher Copilot",
    icon: "copilot"
  },
  {
    key: "/teaching-plan",
    label: "教学计划",
    technicalLabel: "TeachingPlan",
    icon: "plan"
  },
  {
    key: "/runs",
    label: "运行记录",
    technicalLabel: "Runs",
    icon: "runs"
  }
];

function NavIcon({ name }: { name: NavIconName }) {
  const paths: Record<NavIconName, string> = {
    today:
      "M4 5.5h16v14H4z M8 3v5 M16 3v5 M4 10h16",
    goal:
      "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
    evidence:
      "M5 3h14v18H5z M8 8h8 M8 12h8 M8 16h5",
    copilot:
      "M7 7.5A5 5 0 0 1 17 7.5v3A5 5 0 0 1 12 15a5 5 0 0 1-5-4.5z M9 19h6 M12 15v4 M4 9h3 M17 9h3",
    plan:
      "M6 3h12v18H6z M9 8h6 M9 12h6 M9 16h4 M9 3v3 M15 3v3",
    runs:
      "M4 12a8 8 0 1 0 2.3-5.7L4 8.6 M4 4v4.6h4.6 M12 8v5l3 2"
  };
  return (
    <svg
      className="nav-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const initialRequest = useRef<Promise<TeacherWorkspace> | null>(
    null
  );

  useEffect(() => {
    const compact = window.matchMedia("(max-width: 1100px)");
    const synchronize = () => {
      setSidebarCollapsed(compact.matches);
    };
    synchronize();
    compact.addEventListener("change", synchronize);
    return () => compact.removeEventListener("change", synchronize);
  }, []);

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
              <p>
                {error?.message ??
                  "请确认 Docker PostgreSQL、迁移和合成数据 Seed 已完成。"}
              </p>
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
                检查 API Health
              </Button>
            </Space>
          }
        />
      </div>
    );
  }

  return (
    <div
      className={`teacher-shell ${
        sidebarCollapsed ? "teacher-shell--collapsed" : ""
      }`}
    >
      <aside className="side-rail" aria-label="教师工作台导航">
        <div className="brand">
          <div className="brand__mark font-chiron">教</div>
          <div className="brand__copy">
            <strong>Edu Agent</strong>
            <span>教师工作台</span>
          </div>
          <Button
            type="text"
            className="sidebar-toggle"
            aria-label={
              sidebarCollapsed ? "展开侧栏" : "收起侧栏"
            }
            onClick={() =>
              setSidebarCollapsed((current) => !current)
            }
          >
            {sidebarCollapsed ? "›" : "‹"}
          </Button>
        </div>

        <Menu
          mode="inline"
          inlineCollapsed={sidebarCollapsed}
          selectedKeys={[route]}
          onClick={({ key }) => navigate(key as AppRoute)}
          items={navigation.map((item) => ({
            key: item.key,
            icon: <NavIcon name={item.icon} />,
            label: (
              <span className="nav-copy">
                <strong>{item.label}</strong>
                <small>{item.technicalLabel}</small>
              </span>
            )
          }))}
        />

        <div className="rail-footer">
          <button
            type="button"
            className="style-guide-link"
            onClick={() => navigate("/style-guide")}
            aria-current={
              route === "/style-guide" ? "page" : undefined
            }
          >
            <span aria-hidden="true">Aa</span>
            <span className="rail-footer__copy">样式与字体</span>
          </button>
          <div className="rail-status">
            <span className="status-dot" aria-hidden="true" />
            <span className="rail-footer__copy">
              PostgreSQL · Mock
            </span>
          </div>
        </div>
      </aside>

      <div className="workspace-shell">
        <header className="topbar">
          <div className="topbar__context">
            <Text type="secondary">当前课程</Text>
            <strong>
              {workspace.identity.schoolName} ·{" "}
              {workspace.courseRun.className}
            </strong>
          </div>
          <div className="topbar__actions">
            <Tag className="mode-tag">Mock</Tag>
            <Button
              type="text"
              className="inspector-button"
              onClick={() => setInspectorOpen(true)}
            >
              依据与边界
            </Button>
            <div className="teacher-identity">
              <span>林</span>
              <div>
                <strong>{workspace.identity.teacherName}</strong>
                <small>数学教师</small>
              </div>
            </div>
          </div>
        </header>

        <div className="synthetic-banner" role="note">
          <SemanticTag kind="mock">合成演示</SemanticTag>
          <span>
            全部数据为合成数据；真实模型与外部网络均已关闭。
          </span>
        </div>

        <main className="workspace-main">
          <Suspense fallback={<PageLoading />}>
            {route === "/" ? (
              <DashboardPage
                workspace={workspace}
                navigate={navigate}
                openInspector={() => setInspectorOpen(true)}
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
