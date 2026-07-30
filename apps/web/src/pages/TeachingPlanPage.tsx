import { useEffect, useState } from "react";

import type {
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

import {
  ApiError,
  approveTeachingPlan,
  loadTeachingPlanRevision,
  loadTeachingPlanState,
  type RecoverableCopilotTask
} from "../api";
import {
  TeachingPlanDiffView,
  TeachingPlanView
} from "../components/TeachingPlanView";
import { applyDiffToPlan } from "../teaching-plan";

const { Paragraph, Text, Title } = Typography;

export function TeachingPlanPage(props: {
  workspace: TeacherWorkspace;
  task: RecoverableCopilotTask | null;
  refreshWorkspace: () => Promise<void>;
}) {
  const [planState, setPlanState] = useState({
    currentApproved: props.workspace.currentTeachingPlan,
    currentInReview: props.workspace.currentInReviewPlan,
    drafts: [] as Array<
      TeacherWorkspace["currentTeachingPlan"]
    >,
    history: [
      props.workspace.currentTeachingPlan
    ] as Array<TeacherWorkspace["currentTeachingPlan"]>
  });
  const [revision, setRevision] = useState(
    props.workspace.currentTeachingPlan
  );
  const [loadingState, setLoadingState] = useState(false);
  const [loadingPrevious, setLoadingPrevious] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setRevision(props.workspace.currentTeachingPlan);
  }, [props.workspace.currentTeachingPlan]);

  useEffect(() => {
    let active = true;
    setLoadingState(true);
    setError(null);
    void loadTeachingPlanState()
      .then((result) => {
        if (!active) return;
        setPlanState(result);
        setRevision(result.currentApproved);
      })
      .catch((caught: unknown) => {
        if (active) setError(errorMessage(caught));
      })
      .finally(() => {
        if (active) setLoadingState(false);
      });
    return () => {
      active = false;
    };
  }, [props.workspace.currentTeachingPlan.revisionRef]);

  const selectedStrategyId =
    planState.currentInReview?.selectedStrategyId ??
    planState.currentApproved.selectedStrategyId ??
    props.task?.strategies[0]?.strategyId;
  const selectedDiff =
    props.task && selectedStrategyId
      ? props.task.diffsByStrategy[selectedStrategyId]
      : undefined;
  const diffBaseline =
    props.task && "baselineRevision" in props.task
      ? props.task.baselineRevision.content
      : planState.currentApproved.content;
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

  async function approveCurrentInReview() {
    const inReview = planState.currentInReview;
    if (!inReview) return;
    setApproving(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await approveTeachingPlan(
        inReview.revisionRef,
        {
          purpose: "teacher-copilot.approve-plan",
          idempotencyKey:
            `ui:teaching-plan-approval:${crypto.randomUUID()}`,
          expectedInReviewRevisionRef: inReview.revisionRef
        }
      );
      const nextState = await loadTeachingPlanState();
      setPlanState(nextState);
      setRevision(nextState.currentApproved);
      await props.refreshWorkspace();
      setSuccess(
        `已创建并批准第 ${result.approvedRevision.revisionNumber} 版；原已批准版本保持不可变。`
      );
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setApproving(false);
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
            {revisionStateLabel(revision.state)}
          </Tag>
        </Space>
      </header>

      <Alert
        type="info"
        showIcon
        title="审核与批准是两个独立动作"
        description="接受建议只形成 in_review；只有下方单独批准操作才会创建新的 approved Revision。本 Gate 不实现 published。"
      />

      {error ? (
        <Alert type="error" showIcon title={error} />
      ) : null}
      {success ? (
        <Alert type="success" showIcon title={success} />
      ) : null}

      <Card className="workspace-card" variant="borderless">
        <Text className="section-kicker">明确读取语义</Text>
        <Title level={3}>当前版本状态</Title>
        <Space orientation="vertical" size="middle">
          <div>
            <Text strong>当前正式教学计划</Text>
            <Paragraph>
              第 {planState.currentApproved.revisionNumber} 版 ·
              approved
            </Paragraph>
            <Button
              onClick={() =>
                setRevision(planState.currentApproved)
              }
              data-testid="view-current-approved"
            >
              查看已批准版本
            </Button>
          </div>
          {planState.currentInReview ? (
            <div>
              <Text strong>当前待审核版本</Text>
              <Paragraph>
                第 {planState.currentInReview.revisionNumber} 版 ·
                in_review（尚未成为当前正式计划）
              </Paragraph>
              <Space wrap>
                <Button
                  onClick={() =>
                    setRevision(planState.currentInReview!)
                  }
                  data-testid="view-current-in-review"
                >
                  查看待审核版本
                </Button>
                <Button
                  type="primary"
                  loading={approving}
                  onClick={approveCurrentInReview}
                  data-testid="approve-teaching-plan"
                >
                  批准为当前教学计划
                </Button>
              </Space>
            </div>
          ) : (
            <Text type="secondary">当前没有待审核版本。</Text>
          )}
        </Space>
      </Card>

      <Spin spinning={loadingPrevious || loadingState}>
        <TeachingPlanView
          revision={revision}
          onPrevious={showPrevious}
        />
      </Spin>

      {revision.revisionRef !==
      planState.currentApproved.revisionRef ? (
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
              setRevision(planState.currentApproved)
            }
          >
            返回当前已批准版本
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
            planState.currentInReview?.teacherSelection ??
            planState.currentApproved.teacherSelection
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

      <Card className="workspace-card" variant="borderless">
        <Title level={3}>草稿与版本历史</Title>
        <Paragraph>
          草稿不会作为当前计划返回；历史包含 draft、in_review 与
          approved，按 Revision 编号倒序排列。
        </Paragraph>
        <Space orientation="vertical" size="small">
          <Text>
            草稿：{planState.drafts.length} 个
          </Text>
          {planState.history.map((item) => (
            <Button
              key={item.revisionRef}
              type="link"
              onClick={() => setRevision(item)}
            >
              第 {item.revisionNumber} 版 ·{" "}
              {revisionStateLabel(item.state)}
            </Button>
          ))}
        </Space>
      </Card>
    </div>
  );
}

function revisionStateLabel(state: string): string {
  return {
    draft: "建议草稿",
    proposal: "Proposal",
    in_review: "待审核",
    approved: "已批准",
    published: "已发布（本 Gate 不创建）"
  }[state] ?? state;
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return `${error.message}（${error.code}）`;
  }
  return error instanceof Error ? error.message : "发生未知错误";
}
