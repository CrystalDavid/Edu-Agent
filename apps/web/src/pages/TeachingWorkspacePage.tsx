import { useState } from "react";

import type { AppRoute } from "../route";
import {
  CourseWorkspace,
  ExamWorkspace,
  HomeworkWorkspace
} from "../components/portal/TeachingComponents";
import { PageHeader } from "../components/portal/PortalPrimitives";

type TeachingTab = "course" | "homework" | "exam";

export function TeachingWorkspacePage(props: {
  navigate: (route: AppRoute) => void;
  initialTab?: TeachingTab;
  onAction: (message: string) => void;
}) {
  const [tab, setTab] = useState<TeachingTab>(props.initialTab ?? "course");
  const handleAction = (action: string) => {
    if (action === "调整下一课" || action === "生成新版本") {
      window.sessionStorage.setItem(
        "copilot-prefill",
        action === "调整下一课"
          ? "根据当前学习证据，提出并比较下一课的两种调整策略"
          : "根据当前教学目标和证据，生成可审阅的教学计划新版本建议"
      );
      props.navigate("/copilot");
      return;
    }
    if (action.includes("Agent") || action.includes("讲评") || action.includes("调整下一课") || action.includes("个别指导")) {
      window.sessionStorage.setItem("agent-prefill", action);
      props.navigate("/agent");
      return;
    }
    if (action === "查看历史" || action === "查看变更") {
      props.navigate("/teaching-plan");
      return;
    }
    props.onAction(`${action}：当前为高保真界面预览，未写入正式业务数据。`);
  };
  return (
    <div className="portal-page teaching-page" data-testid="teaching-page">
      <PageHeader title="教学" subtitle="课程、作业和测试围绕同一教学上下文组织" />
      <div className="teaching-tabs" role="tablist" aria-label="教学工作区">
        {([
          ["course", "课程", "组织章节、目标与材料"],
          ["homework", "作业", "查看提交和作答情况"],
          ["exam", "测试", "分析班级与知识点表现"]
        ] as const).map(([value, label, description]) => (
          <button
            type="button"
            role="tab"
            key={value}
            aria-selected={tab === value}
            className={tab === value ? "is-active" : ""}
            onClick={() => setTab(value)}
          >
            <strong>{label}</strong>
            <span>{description}</span>
          </button>
        ))}
      </div>
      {tab === "course" ? <CourseWorkspace onAction={handleAction} /> : null}
      {tab === "homework" ? <HomeworkWorkspace onAction={handleAction} /> : null}
      {tab === "exam" ? <ExamWorkspace onAction={handleAction} /> : null}
    </div>
  );
}
