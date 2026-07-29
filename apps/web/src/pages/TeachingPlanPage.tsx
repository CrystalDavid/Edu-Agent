import { useEffect, useState } from "react";

import type {
  CreateTeacherCopilotTaskResult,
  TeacherWorkspace
} from "@edu-agent/contracts";
import {
  Alert,
  Button,
  Card,
  Space,
  Spin,
  Tag,
  Typography
} from "antd";

import { loadTeachingPlanRevision } from "../api";
import {
  TeachingPlanDiffView,
  TeachingPlanView
} from "../components/TeachingPlanView";
import { applyDiffToPlan } from "../teaching-plan";

const { Paragraph, Text, Title } = Typography;

export function TeachingPlanPage(props: {
  workspace: TeacherWorkspace;
  task: CreateTeacherCopilotTaskResult | null;
}) {
  const [revision, setRevision] = useState(
    props.workspace.latestTeachingPlan
  );
  const [loadingPrevious, setLoadingPrevious] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRevision(props.workspace.latestTeachingPlan);
  }, [props.workspace.latestTeachingPlan]);

  const selectedStrategyId =
    props.workspace.latestTeachingPlan.selectedStrategyId ??
    props.task?.strategies[0]?.strategyId;
  const selectedDiff =
    props.task && selectedStrategyId
      ? props.task.diffsByStrategy[selectedStrategyId]
      : undefined;
  const diffBaseline =
    props.task?.draftRevision.content ??
    props.workspace.latestTeachingPlan.content;
  const diffProposed = selectedDiff
    ? applyDiffToPlan(diffBaseline, selectedDiff)
    : null;

  async function showPrevious() {
    if (!revision.parentRevisionRef) return;
    setLoadingPrevious(true);
    setError(null);
    try {
      setRevision(
        await loadTeachingPlanRevision(revision.parentRevisionRef)
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "加载前一版本失败"
      );
    } finally {
      setLoadingPrevious(false);
    }
  }

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <span className="page-icon page-icon--cyan" aria-hidden="true">▧</span>
          <div>
            <Title>教学计划</Title>
            <Paragraph>
              每次保存都会创建新版本，历史内容保持可追溯；当前不会自动发布。
            </Paragraph>
          </div>
        </div>
        <Space wrap>
          <Tag color="processing">
            {revision.state === "in_review"
              ? "待审核"
              : revision.state === "published"
                ? "已发布"
                : revision.state === "proposal"
                  ? "建议草稿"
                  : "草稿"}
          </Tag>
        </Space>
      </header>

      <Alert
        type="info"
        showIcon
        title="发布边界"
        description="页面没有自动发布路径；接受建议也只会形成待审核版本。"
      />

      {error ? (
        <Alert type="error" showIcon title={error} />
      ) : null}

      <Spin spinning={loadingPrevious}>
        <TeachingPlanView
          revision={revision}
          onPrevious={showPrevious}
        />
      </Spin>

      {revision.revisionRef !==
      props.workspace.latestTeachingPlan.revisionRef ? (
        <Card className="workspace-card revision-return" variant="borderless">
          <div>
            <Title level={4}>你正在查看历史版本</Title>
            <Paragraph>
              历史版本保持不变；返回最近版本不会修改任何数据。
            </Paragraph>
          </div>
          <Button
            type="primary"
            onClick={() =>
              setRevision(props.workspace.latestTeachingPlan)
            }
          >
            返回最近版本
          </Button>
        </Card>
      ) : null}

      {selectedDiff && diffProposed ? (
        <TeachingPlanDiffView
          diff={selectedDiff}
          baseline={diffBaseline}
          proposed={diffProposed}
          parentRevisionNumber={
            Math.max(
              1,
              props.task!.draftRevision.revisionNumber - 1
            )
          }
          draftRevisionNumber={
            props.task!.draftRevision.revisionNumber
          }
          teacherSelection={
            props.workspace.latestTeachingPlan.teacherSelection
          }
        />
      ) : (
        <Card className="workspace-card" variant="borderless">
          <Title level={4}>尚无教师助手变更记录</Title>
          <Paragraph>
            启动课堂调整任务后，这里会显示各字段的修改前后、原因和依据。
          </Paragraph>
        </Card>
      )}
    </div>
  );
}
