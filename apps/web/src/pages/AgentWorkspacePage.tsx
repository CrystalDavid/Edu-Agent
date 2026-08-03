import { useEffect, useMemo, useState } from "react";

import type { LessonPreparationTaskSummary } from "@edu-agent/contracts";
import { Alert, Button, Empty, Spin, Tag } from "antd";

import { loadLessonPreparationTasks } from "../api";
import { PageHeader } from "../components/portal/PortalPrimitives";
import { WorkspaceIcon } from "../components/WorkspaceIcon";
import { formatDisplayDate, lessonPreparationStatusLabel } from "../presentation";
import type { AppRoute } from "../route";

export function AgentWorkspacePage(props: {
  navigate: (route: AppRoute) => void;
  navigatePreparation: (
    taskRef: string,
    destination?: "/agent" | "/copilot" | "/teaching-plan" | "/runs"
  ) => void;
}) {
  const [tasks, setTasks] = useState<LessonPreparationTaskSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadLessonPreparationTasks()
      .then((result) => {
        if (active) setTasks(result.items);
      })
      .catch((caught) => {
        if (active) {
          setError(caught instanceof Error ? caught.message : "无法读取备课任务。");
        }
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

  return (
    <div className="portal-page agent-home-page" data-testid="agent-home-page">
      <PageHeader
        eyebrow="教学助手"
        title="从备课任务开始"
        subtitle="选择一项备课任务后，系统会展示本次使用的课程、目标和证据，再由你确认是否生成建议。"
        actions={(
          <Button type="primary" onClick={() => props.navigate("/teaching")}>
            <WorkspaceIcon name="course" /> 从课时开始备课
          </Button>
        )}
      />

      {error ? <Alert type="error" showIcon message={error} /> : null}
      {loading ? <Spin size="large" /> : null}

      {!loading ? (
        <section className="agent-task-list" aria-label="可继续的备课任务">
          <header>
            <div>
              <h2>继续处理</h2>
              <p>选择尚未完成的备课任务，继续生成、审阅或完善教学建议。</p>
            </div>
            <span>{activeTasks.length} 项</span>
          </header>
          {activeTasks.length === 0 ? (
            <Empty
              description="当前没有待处理的备课任务"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            >
              <Button onClick={() => props.navigate("/teaching")}>选择课时</Button>
            </Empty>
          ) : (
            <div className="agent-task-list__items">
              {activeTasks.map((task) => (
                <article key={task.taskRef}>
                  <div className="agent-task-list__icon">
                    <WorkspaceIcon name="agent" />
                  </div>
                  <div>
                    <h3>{task.lessonTitle}</h3>
                    <p>{task.title}</p>
                    <small>
                      {task.dueAt ? `计划时间 ${formatDisplayDate(task.dueAt)}` : "未设置计划时间"}
                    </small>
                  </div>
                  <Tag>{lessonPreparationStatusLabel(task.status)}</Tag>
                  <Button
                    type="primary"
                    onClick={() => props.navigatePreparation(task.taskRef, "/agent")}
                  >
                    继续处理
                  </Button>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}

      <section className="agent-safety-note">
        <WorkspaceIcon name="check" />
        <div>
          <strong>由教师决定最终结果</strong>
          <p>教学助手只生成可修改的建议；批准教学计划、记录课堂事实和完成任务仍由教师明确操作。</p>
        </div>
      </section>
    </div>
  );
}
