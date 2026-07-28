import { useCallback, useEffect, useState } from "react";

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

import { loadWorkspace } from "./api";
import { InspectorPanel } from "./components/InspectorPanel";
import { SemanticTag } from "./components/SemanticTag";
import { CopilotPage } from "./pages/CopilotPage";
import { DashboardPage } from "./pages/DashboardPage";
import { EvidencePage } from "./pages/EvidencePage";
import { GoalsPage } from "./pages/GoalsPage";
import { RunsPage } from "./pages/RunsPage";
import { TeachingPlanPage } from "./pages/TeachingPlanPage";
import { useAppRoute, type AppRoute } from "./route";

const { Text } = Typography;

const navigation: Array<{
  key: AppRoute;
  label: string;
  marker: string;
}> = [
  { key: "/", label: "今日工作台", marker: "今" },
  { key: "/goals", label: "教学改进 Goal", marker: "目" },
  { key: "/evidence", label: "学习证据", marker: "证" },
  { key: "/copilot", label: "Teacher Copilot", marker: "辅" },
  { key: "/teaching-plan", label: "TeachingPlan", marker: "案" },
  { key: "/runs", label: "运行记录", marker: "录" }
];

export function App() {
  const { route, navigate } = useAppRoute();
  const [workspace, setWorkspace] =
    useState<TeacherWorkspace | null>(null);
  const [task, setTask] =
    useState<CreateTeacherCopilotTaskResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);

  const refreshWorkspace = useCallback(async () => {
    const next = await loadWorkspace();
    setWorkspace(next);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void loadWorkspace()
      .then((result) => {
        if (active) setWorkspace(result);
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(
            caught instanceof Error
              ? caught.message
              : "无法加载教师工作台"
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
            error ??
            "请确认 Docker PostgreSQL、迁移和合成数据 Seed 已完成。"
          }
          extra={
            <Button
              type="primary"
              onClick={() => window.location.reload()}
            >
              重新加载
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="teacher-shell">
      <aside className="side-rail">
        <div className="brand">
          <div className="brand__mark">E</div>
          <div>
            <strong>Edu Agent</strong>
            <span>教师工作台</span>
          </div>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[route]}
          onClick={({ key }) => navigate(key as AppRoute)}
          items={navigation.map((item) => ({
            key: item.key,
            icon: (
              <span className="nav-marker" aria-hidden="true">
                {item.marker}
              </span>
            ),
            label: item.label
          }))}
        />
        <div className="rail-status">
          <div className="rail-status__dot" />
          <div>
            <strong>本地模式</strong>
            <span>PostgreSQL · Mock</span>
          </div>
        </div>
      </aside>

      <div className="workspace-shell">
        <header className="topbar">
          <div>
            <Text type="secondary">当前学校</Text>
            <strong>{workspace.identity.schoolName}</strong>
          </div>
          <Space wrap className="topbar__actions">
            <Tag color="purple">Mock 模式</Tag>
            <Tag color="gold">全部数据为合成数据</Tag>
            <Button
              className="inspector-button"
              onClick={() => setInspectorOpen(true)}
            >
              依据与边界
            </Button>
            <div className="teacher-identity">
              <span>林</span>
              <div>
                <strong>{workspace.identity.teacherName}</strong>
                <small>数学教师 · 合成身份</small>
              </div>
            </div>
          </Space>
        </header>

        <div className="synthetic-banner" role="note">
          <SemanticTag kind="fact">合成演示</SemanticTag>
          <span>
            本页面不含真实学校、教师或学生信息，也没有调用外部模型与云服务。
          </span>
        </div>

        <main className="workspace-main">
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
            <TeachingPlanPage workspace={workspace} task={task} />
          ) : null}
          {route === "/runs" ? (
            <RunsPage workspace={workspace} task={task} />
          ) : null}
        </main>
      </div>

      <InspectorPanel
        open={inspectorOpen}
        onClose={() => setInspectorOpen(false)}
        workspace={workspace}
        task={task}
      />
    </div>
  );
}
