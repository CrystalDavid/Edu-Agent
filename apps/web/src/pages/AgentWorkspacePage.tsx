import { useEffect, useMemo, useState, type FormEvent } from "react";

import type { LessonPreparationTaskSummary } from "@edu-agent/contracts";
import { Alert, Button, Input, Spin } from "antd";

import { loadLessonPreparationTasks } from "../api";
import { WorkspaceIcon } from "../components/WorkspaceIcon";
import { formatDisplayDate, lessonPreparationStatusLabel } from "../presentation";
import type { AppRoute } from "../route";

export function AgentWorkspacePage(props: {
  navigate: (route: AppRoute) => void;
  navigatePreparation: (
    taskRef: string,
    destination?: "/agent" | "/copilot" | "/teaching-plan" | "/runs",
    prompt?: string
  ) => void;
}) {
  const [tasks, setTasks] = useState<LessonPreparationTaskSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadLessonPreparationTasks()
      .then((result) => {
        if (active) setTasks(result.items);
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : "无法读取备课任务。");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const activeTasks = useMemo(
    () => tasks
      .filter((task) => !["completed", "cancelled"].includes(task.status))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [tasks]
  );
  const nextTask = activeTasks[0] ?? null;
  const recentTasks = activeTasks.slice(0, 4);
  const suggestions = nextTask
    ? ["完善教学目标", "调整课堂练习", "优化板书设计"]
    : [];

  const startAssistant = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!nextTask) {
      props.navigate("/teaching");
      return;
    }
    props.navigatePreparation(
      nextTask.taskRef,
      "/agent",
      prompt.trim() || undefined
    );
  };

  return (
    <div className="portal-page agent-home-page" data-testid="agent-home-page">
      {error ? <Alert type="error" showIcon message={error} /> : null}
      {loading ? <Spin size="large" /> : null}

      {!loading ? (
        <main className="agent-workspace-home">
          <section className="agent-focus" aria-label="助手入口">
            <h1>{nextTask ? `继续准备「${nextTask.lessonTitle}」` : "今天先做什么？"}</h1>
            <form className="agent-composer" onSubmit={startAssistant}>
              <button
                type="button"
                className="agent-composer__attach"
                aria-label="打开资料"
                onClick={() => props.navigate("/files")}
              >
                <WorkspaceIcon name="plus" variant="filled" />
              </button>
              <Input.TextArea
                aria-label="告诉 Agent 你想完成什么"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                autoSize={{ minRows: 1, maxRows: 4 }}
                placeholder="告诉 Agent 你想完成什么…"
              />
              <span className="agent-composer__mode">Agent</span>
              <span className="agent-composer__voice" aria-hidden="true">
                <WorkspaceIcon name="voice" variant="filled" />
              </span>
              <Button
                type="primary"
                htmlType="submit"
                aria-label={nextTask ? "继续这项工作" : "选择课时"}
                icon={<WorkspaceIcon name="send" variant="filled" />}
              />
            </form>
            {suggestions.length > 0 ? (
              <div className="agent-prompt-suggestions" aria-label="常用需求">
                {suggestions.map((suggestion) => (
                  <button type="button" key={suggestion} onClick={() => setPrompt(suggestion)}>
                    {suggestion}
                  </button>
                ))}
              </div>
            ) : null}
          </section>

          <section className="agent-recent-work" aria-label="最近工作">
            <header>
              <h2>最近工作</h2>
              {recentTasks.length > 0 ? <span>{recentTasks.length} 项未完成</span> : null}
            </header>
            <div className="agent-task-list" data-testid="agent-task-list">
              {recentTasks.length > 0 ? recentTasks.map((task) => (
                <button
                  type="button"
                  key={task.taskRef}
                  onClick={() => props.navigatePreparation(task.taskRef, "/agent")}
                >
                  <span>
                    <strong>{task.lessonTitle}</strong>
                    <small>{lessonPreparationStatusLabel(task.status)}{task.dueAt ? ` · ${formatDisplayDate(task.dueAt)}` : ""}</small>
                  </span>
                  <WorkspaceIcon name="arrowRight" />
                </button>
              )) : (
                <button type="button" onClick={() => props.navigate("/teaching")}>
                  <span><strong>选择一节课开始</strong><small>从课程进入新的教学工作</small></span>
                  <WorkspaceIcon name="arrowRight" />
                </button>
              )}
            </div>
          </section>
        </main>
      ) : null}
    </div>
  );
}
