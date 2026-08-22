import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";

import type {
  AuthenticationProviderAvailability,
  AuthenticationSessionStatus,
  TeacherWorkspace
} from "@edu-agent/contracts";
import {
  Button,
  Result,
  Skeleton,
  Space,
  Typography
} from "antd";

import {
  ApiError,
  type RecoverableCopilotTask,
  loadAuthenticationProvider,
  loadAuthenticationSession,
  loadTeacherWorkbench,
  loadWorkspace,
  loginWithLocalCredentials,
  logoutAuthenticationSession,
  requestLocalSmsCode,
  switchAuthenticationWorkspace
} from "./api";
import { TeacherSidebar } from "./components/portal/TeacherSidebar";
import { LoginPage } from "./pages/LoginPage";
import { WorkspaceSelectionPage } from "./pages/WorkspaceSelectionPage";
import { WorkspaceIcon } from "./components/WorkspaceIcon";
import { cleanDisplayText } from "./presentation";
import { useAppRoute } from "./route";

const OverviewPage = lazy(() =>
  import("./pages/OverviewPage").then((module) => ({
    default: module.OverviewPage
  }))
);
const TeacherSchedulePage = lazy(() =>
  import("./pages/TeacherSchedulePage").then((module) => ({
    default: module.TeacherSchedulePage
  }))
);
const TeachingWorkspacePage = lazy(() =>
  import("./pages/TeachingWorkspacePage").then((module) => ({
    default: module.TeachingWorkspacePage
  }))
);
const StudentWorkspacePage = lazy(() =>
  import("./pages/StudentWorkspacePage").then((module) => ({
    default: module.StudentWorkspacePage
  }))
);
const TeacherFilesPage = lazy(() =>
  import("./pages/TeacherFilesPage").then((module) => ({
    default: module.TeacherFilesPage
  }))
);
const AgentWorkspacePage = lazy(() =>
  import("./pages/AgentWorkspacePage").then((module) => ({
    default: module.AgentWorkspacePage
  }))
);
const ReflectionAgentPage = lazy(() =>
  import("./pages/ReflectionAgentPage").then((module) => ({
    default: module.ReflectionAgentPage
  }))
);
const TeacherSettingsPage = lazy(() =>
  import("./pages/TeacherSettingsPage").then((module) => ({
    default: module.TeacherSettingsPage
  }))
);
// Gate 2 semantic detail pages remain reachable but are no longer primary
// teacher navigation. This preserves the verified proposal/diff/audit flow.
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

function PageLoading() {
  return (
    <div className="portal-route-loading" aria-label="页面加载中">
      <Skeleton active paragraph={{ rows: 8 }} />
    </div>
  );
}
export function App() {
  const {
    route,
    navigate,
    goBack,
    proposalRevisionRef,
    navigateProposal,
    preparationTaskRef,
    navigatePreparation,
    reflectionRef,
    navigateReflection,
    lessonRef,
    navigateLesson,
    fileAssetRef,
    fileLessonRef,
    navigateFiles
  } = useAppRoute();
  const [workspace, setWorkspace] = useState<TeacherWorkspace | null>(null);
  const [authSession, setAuthSession] =
    useState<AuthenticationSessionStatus | null>(null);
  const [authProvider, setAuthProvider] =
    useState<AuthenticationProviderAvailability | null>(null);
  const [task, setTask] =
    useState<RecoverableCopilotTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [authReloadKey, setAuthReloadKey] = useState(0);
  const noticeTimer = useRef<number | null>(null);

  const refreshWorkspace = useCallback(async () => {
    const next = await loadWorkspace();
    setWorkspace(next);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void (async () => {
      const [session, provider] = await Promise.all([
        loadAuthenticationSession(),
        loadAuthenticationProvider()
      ]);
      const nextWorkspace =
        session.authenticated && session.currentWorkspace
          ? await loadTeacherWorkbench()
          : null;
      if (!active) return;
      setAuthSession(session);
      setAuthProvider(provider);
      setWorkspace(nextWorkspace);
    })()
      .catch((caught: unknown) => {
        if (active) {
          setError(caught instanceof Error ? caught : new Error("无法加载教师工作空间"));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [authReloadKey]);

  useEffect(() => {
    const expire = () => {
      setWorkspace(null);
      setAuthSession(null);
      setAuthReloadKey((current) => current + 1);
    };
    window.addEventListener("edu-agent:session-expired", expire);
    return () => window.removeEventListener("edu-agent:session-expired", expire);
  }, []);
  useEffect(() => () => {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
  }, []);

  const showNotice = (message: string) => {
    setNotice(message);
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 3200);
  };

  const retryBootstrap = () => {
    setWorkspace(null);
    setAuthReloadKey((current) => current + 1);
  };

  if (loading) {
    return (
      <div className="portal-boot-screen">
        <div className="portal-boot-card">
          <span className="brand-mark">EA</span>
          <Skeleton active paragraph={{ rows: 7 }} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="portal-boot-screen">
        <Result
          status="error"
          title={<Typography.Title level={2}>教师工作空间未能启动</Typography.Title>}
          subTitle={
            <div className="startup-diagnostic">
              <p>{error?.message ?? "请确认应用服务已经启动。"}</p>
              {error instanceof ApiError ? (
                <dl>
                  <div><dt>请求服务</dt><dd>{error.service}</dd></div>
                  <div><dt>安全错误代码</dt><dd>{error.code}</dd></div>
                </dl>
              ) : null}
              <details>
                <summary>查看启动指南</summary>
                <p>运行 <code>corepack pnpm app:doctor</code>，再运行 <code>corepack pnpm app:dev</code>。</p>
                <p>完整说明：<code>docs/engineering/README.md</code></p>
              </details>
            </div>
          }
          extra={
            <Space>
              <Button type="primary" onClick={retryBootstrap}>重试</Button>
              <Button href="/api/health" target="_blank" rel="noreferrer">检查服务状态</Button>
            </Space>
          }
        />
      </div>
    );
  }

  if (!authSession || !authSession.authenticated) {
    return (
      <LoginPage
        provider={authProvider}
        onRequestSmsCode={requestLocalSmsCode}
        onLogin={async (input) => {
          const session = await loginWithLocalCredentials(input);
          const nextWorkspace =
            session.authenticated && session.currentWorkspace
              ? await loadTeacherWorkbench()
              : null;
          setAuthSession(session);
          setWorkspace(nextWorkspace);
          if (!session.authenticated) {
            throw new Error("登录会话未能建立。");
          }
        }}
      />
    );
  }

  if (!authSession.currentWorkspace) {
    return (
      <WorkspaceSelectionPage
        session={authSession}
        onSelect={async (membershipRef) => {
          setLoading(true);
          try {
            const session = await switchAuthenticationWorkspace({
              membershipRef,
              expectedSessionVersion: authSession.sessionVersion
            });
            setAuthSession(session);
            if (session.authenticated && session.currentWorkspace) {
              setWorkspace(await loadTeacherWorkbench());
            }
          } catch (caught) {
            setError(caught instanceof Error ? caught : new Error("无法切换学校工作空间。"));
          } finally {
            setLoading(false);
          }
        }}
        onLogout={async () => {
          await logoutAuthenticationSession();
          setWorkspace(null);
          setAuthSession(null);
          setAuthReloadKey((current) => current + 1);
        }}
      />
    );
  }

  if (!workspace) {
    return (
      <div className="portal-boot-screen">
        <Result
          status="info"
          title="当前学校尚未初始化教师课程工作区"
          subTitle="身份与学校工作空间已建立，但该学校还没有可用的教师课程数据。"
          extra={<Button onClick={retryBootstrap}>重新检查</Button>}
        />
      </div>
    );
  }

  const teacherName = cleanDisplayText(workspace.identity.teacherName);
  const sessionTeacherName = cleanDisplayText(authSession.user.displayName);
  const schoolName = cleanDisplayText(
    authSession.currentWorkspace.organizationName
  );
  return (
    <div className="teacher-portal-shell">
      <TeacherSidebar
        route={route}
        teacherName={sessionTeacherName || teacherName}
        schoolName={schoolName}
        roles={authSession.currentWorkspace.roles}
        memberships={authSession.memberships}
        currentMembershipRef={authSession.currentWorkspace.membershipRef}
        onSwitchWorkspace={async (membershipRef) => {
          const session = await switchAuthenticationWorkspace({
            membershipRef,
            expectedSessionVersion: authSession.sessionVersion
          });
          setAuthSession(session);
          setWorkspace(null);
          if (session.authenticated && session.currentWorkspace) {
            setWorkspace(await loadTeacherWorkbench());
          }
        }}
        onLogout={async () => {
          await logoutAuthenticationSession();
          setWorkspace(null);
          setAuthSession(null);
          setAuthReloadKey((current) => current + 1);
        }}
        onNavigate={navigate}
      />
      <main className="teacher-portal-main">
        <Suspense fallback={<PageLoading />}>
          {route === "/" || route === "/overview" ? (
            <OverviewPage workspace={workspace} navigate={navigate} navigateLesson={navigateLesson} navigateFiles={navigateFiles} navigatePreparation={navigatePreparation} />
          ) : null}
          {route === "/schedule" ? <TeacherSchedulePage navigate={navigate} /> : null}
          {route === "/teaching" || route === "/courses" ? (
            <TeachingWorkspacePage navigateFiles={navigateFiles} navigateCourseOverview={() => navigate("/teaching")} navigateLesson={navigateLesson} navigatePreparation={navigatePreparation} navigateReflection={navigateReflection} initialLessonRef={lessonRef} initialTab="course" onAction={showNotice} />
          ) : null}
          {route === "/assignments" ? (
            <TeachingWorkspacePage navigateFiles={navigateFiles} navigateCourseOverview={() => navigate("/teaching")} navigateLesson={navigateLesson} navigatePreparation={navigatePreparation} navigateReflection={navigateReflection} initialTab="homework" onAction={showNotice} />
          ) : null}
          {route === "/students" ? (
            <StudentWorkspacePage navigate={navigate} onAction={showNotice} />
          ) : null}
          {route === "/files" ? (
            <TeacherFilesPage
              onAction={showNotice}
              initialAssetRef={fileAssetRef}
              initialLessonRef={fileLessonRef}
            />
          ) : null}
          {route === "/agent" ? (
            reflectionRef ? (
              <ReflectionAgentPage
                reflectionRef={reflectionRef}
                navigate={navigate}
                navigateLesson={navigateLesson}
                navigatePreparation={navigatePreparation}
                onAction={showNotice}
              />
            ) : preparationTaskRef ? (
              <CopilotPage
                workspace={workspace}
                task={task}
                setTask={setTask}
                refreshWorkspace={refreshWorkspace}
                navigate={navigate}
                proposalRevisionRef={proposalRevisionRef}
                navigateProposal={navigateProposal}
                preparationTaskRef={preparationTaskRef}
                navigatePreparation={navigatePreparation}
                initialPrompt={new URLSearchParams(window.location.search).get("prompt") ?? ""}
              />
            ) : (
              <AgentWorkspacePage
                navigate={navigate}
                navigatePreparation={navigatePreparation}
              />
            )
          ) : null}
          {route === "/settings" ? (
            <TeacherSettingsPage
              navigate={navigate}
              onAction={showNotice}
              authSession={authSession}
            />
          ) : null}
          {route === "/goals" ? <GoalsPage workspace={workspace} /> : null}
          {route === "/evidence" ? <EvidencePage workspace={workspace} /> : null}
          {route === "/copilot" ? (
            <div className="legacy-detail-shell">
              <header>
                <button type="button" onClick={() => goBack("/agent")}><WorkspaceIcon name="arrowLeft" />返回上一步</button>
                <span>教学建议详情</span>
              </header>
              <CopilotPage
                workspace={workspace}
                task={task}
                setTask={setTask}
                refreshWorkspace={refreshWorkspace}
                navigate={navigate}
                proposalRevisionRef={proposalRevisionRef}
                navigateProposal={navigateProposal}
                preparationTaskRef={preparationTaskRef}
                navigatePreparation={navigatePreparation}
                initialPrompt=""
              />
            </div>
          ) : null}
          {route === "/teaching-plan" ? (
            <div className="legacy-detail-shell">
              <header>
                <button type="button" onClick={() => goBack("/teaching")}><WorkspaceIcon name="arrowLeft" />返回上一步</button>
                <span>教学计划版本与变更</span>
              </header>
              <TeachingPlanPage
                workspace={workspace}
                task={task}
                refreshWorkspace={refreshWorkspace}
                preparationTaskRef={preparationTaskRef}
                navigatePreparation={navigatePreparation}
                navigateLesson={navigateLesson}
                navigateFiles={navigateFiles}
              />
            </div>
          ) : null}
          {route === "/runs" ? (
            <div className="legacy-detail-shell">
              <header>
                <button type="button" onClick={() => goBack("/settings")}><WorkspaceIcon name="arrowLeft" />返回上一步</button>
                <span>系统记录与技术详情</span>
              </header>
              <RunsPage workspace={workspace} task={task} preparationTaskRef={preparationTaskRef} />
            </div>
          ) : null}
        </Suspense>
      </main>
      {notice ? (
        <div className="portal-toast" role="status">
          <WorkspaceIcon name="check" />
          <span>{notice}</span>
          <button type="button" aria-label="关闭提示" onClick={() => setNotice(null)}><WorkspaceIcon name="close" /></button>
        </div>
      ) : null}
    </div>
  );
}
