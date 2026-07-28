import { useEffect, useMemo, useState } from "react";

import type {
  CreateTeacherCopilotTaskResult,
  SuggestionDispositionKind,
  SuggestionDispositionResult,
  TeacherWorkspace,
  TeachingPlan
} from "@edu-agent/contracts";
import {
  Alert,
  Button,
  Card,
  Divider,
  Input,
  Modal,
  Result,
  Segmented,
  Space,
  Spin,
  Steps,
  Tag,
  Typography
} from "antd";

import {
  ApiError,
  createTeacherCopilotTask,
  disposeSuggestion
} from "../api";
import { SemanticTag } from "../components/SemanticTag";
import {
  TeachingPlanDiffView
} from "../components/TeachingPlanView";
import type { AppRoute } from "../route";
import { applyDiffToPlan } from "../teaching-plan";

const { Paragraph, Text, Title } = Typography;
const { TextArea } = Input;

export function CopilotPage(props: {
  workspace: TeacherWorkspace;
  task: CreateTeacherCopilotTaskResult | null;
  setTask: (task: CreateTeacherCopilotTaskResult) => void;
  refreshWorkspace: () => Promise<void>;
  navigate: (route: AppRoute) => void;
}) {
  const [generating, setGenerating] = useState(false);
  const [disposing, setDisposing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedStrategyId, setSelectedStrategyId] = useState<
    string | null
  >(props.task?.strategies[0]?.strategyId ?? null);
  const [editOpen, setEditOpen] = useState(false);
  const [teacherEdits, setTeacherEdits] = useState<
    Partial<TeachingPlan>
  >({});
  const [disposition, setDisposition] =
    useState<SuggestionDispositionResult | null>(null);

  useEffect(() => {
    if (
      props.task &&
      !props.task.strategies.some(
        (strategy) => strategy.strategyId === selectedStrategyId
      )
    ) {
      setSelectedStrategyId(
        props.task.strategies[0]?.strategyId ?? null
      );
    }
  }, [props.task, selectedStrategyId]);

  const selectedStrategy = props.task?.strategies.find(
    (strategy) => strategy.strategyId === selectedStrategyId
  );
  const selectedDiff =
    selectedStrategyId && props.task
      ? props.task.diffsByStrategy[selectedStrategyId]
      : undefined;
  const selectedPlan = useMemo(() => {
    if (!selectedDiff) return null;
    return applyDiffToPlan(
      props.workspace.latestTeachingPlan.content,
      selectedDiff
    );
  }, [props.workspace.latestTeachingPlan.content, selectedDiff]);

  async function generate() {
    setGenerating(true);
    setError(null);
    setDisposition(null);
    try {
      const result = await createTeacherCopilotTask({
        courseRunRef: props.workspace.courseRun.courseRunRef,
        goalRef: props.workspace.goal.goalRef,
        purpose: "teacher-copilot.adjust-next-lesson",
        idempotencyKey: `ui:teacher-copilot:${crypto.randomUUID()}`
      });
      props.setTask(result);
      setSelectedStrategyId(
        result.strategies[0]?.strategyId ?? null
      );
      setTeacherEdits({});
      await props.refreshWorkspace();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setGenerating(false);
    }
  }

  async function submitDisposition(
    kind: SuggestionDispositionKind
  ) {
    if (!props.task || !selectedStrategyId) return;
    setDisposing(true);
    setError(null);
    try {
      const result = await disposeSuggestion(
        props.task.proposalRevisionRef,
        {
          purpose: "teacher-copilot.review-suggestion",
          idempotencyKey:
            `ui:suggestion-disposition:${crypto.randomUUID()}`,
          disposition: kind,
          selectedStrategyId,
          teacherEdits:
            kind === "accepted_with_changes" ? teacherEdits : {},
          note:
            kind === "deferred"
              ? "教师选择稍后再处理，不产生教学承诺。"
              : undefined
        }
      );
      setDisposition(result);
      await props.refreshWorkspace();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setDisposing(false);
    }
  }

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <Space wrap>
            <Text className="section-kicker">TEACHER COPILOT</Text>
            <SemanticTag kind="mock" />
            <SemanticTag kind="suggestion">Proposal only</SemanticTag>
          </Space>
          <Title>调整明天课堂</Title>
          <Paragraph>
            短生命周期 Task Coordinator
            会整理证据、生成两套可区分策略与结构化 Diff；最终判断始终由教师作出。
          </Paragraph>
        </div>
      </header>

      <Steps
        className="copilot-steps"
        current={props.task ? (disposition ? 3 : 2) : 0}
        items={[
          { title: "确认依据" },
          { title: "比较策略" },
          { title: "审阅 Diff" },
          { title: "教师处置" }
        ]}
      />

      {error ? (
        <Alert
          type="error"
          showIcon
          title="操作未完成"
          description={error}
          closable
          onClose={() => setError(null)}
        />
      ) : null}

      {!props.task ? (
        <Card className="workspace-card copilot-launch" variant="borderless">
          <div className="copilot-launch__signal">
            <span>02</span>
            <p>条 EvidenceObservation</p>
          </div>
          <div>
            <SemanticTag kind="claim">2 条候选 Claim</SemanticTag>
            <Title level={2}>先看证据，再启动任务</Title>
            <Paragraph>
              任务只读取当前 CourseRun、Goal、LearningObjective、
              Evidence 与 TeachingPlan。它不会修改 Goal、EvidenceClaim
              或发布内容。
            </Paragraph>
            <Button
              type="primary"
              size="large"
              loading={generating}
              onClick={generate}
              data-testid="generate-copilot"
            >
              生成两种课堂调整策略
            </Button>
          </div>
        </Card>
      ) : null}

      {generating ? (
        <Card className="workspace-card loading-card" variant="borderless">
          <Spin size="large" />
          <Title level={4}>正在执行确定性 Mock 流程</Title>
          <Paragraph>
            创建 Task / TaskRun / AgentRun、固定 Contract，并记录
            ContextManifest、Outbox 与 Audit。
          </Paragraph>
        </Card>
      ) : null}

      {props.task && selectedStrategy ? (
        <>
          <Card className="workspace-card" variant="borderless">
            <div className="section-heading">
              <div>
                <Text className="section-kicker">
                  TWO DISTINCT STRATEGIES
                </Text>
                <Title level={3}>比较教学策略</Title>
              </div>
              <Tag color="purple">MockModelProvider</Tag>
            </div>
            <Segmented
              block
              value={selectedStrategyId ?? undefined}
              onChange={(value) => {
                setSelectedStrategyId(String(value));
                setTeacherEdits({});
                setDisposition(null);
              }}
              options={props.task.strategies.map((strategy, index) => ({
                label: `策略 ${index === 0 ? "A" : "B"} · ${
                  strategy.title
                }`,
                value: strategy.strategyId
              }))}
            />
            <article
              className="strategy-detail"
              data-testid="strategy-detail"
            >
              <Space wrap>
                <SemanticTag kind="suggestion" />
                <Tag>{selectedStrategy.strategyId}</Tag>
              </Space>
              <Title level={3}>{selectedStrategy.title}</Title>
              <Paragraph>{selectedStrategy.rationale}</Paragraph>
              <div className="strategy-columns">
                <div>
                  <Text strong>建议动作</Text>
                  <ol>
                    {selectedStrategy.suggestedMoves.map((move) => (
                      <li key={move}>{move}</li>
                    ))}
                  </ol>
                </div>
                <div>
                  <Text strong>适用条件</Text>
                  <Paragraph>
                    {selectedStrategy.applicability}
                  </Paragraph>
                  <Text strong>不适用条件</Text>
                  <ul>
                    {selectedStrategy.unsuitableConditions.map(
                      (condition) => (
                        <li key={condition}>{condition}</li>
                      )
                    )}
                  </ul>
                </div>
              </div>
              <Alert
                type="info"
                showIcon
                title="把握说明（不是概率）"
                description={selectedStrategy.confidenceExplanation}
              />
              <div className="strategy-evidence">
                {selectedStrategy.evidenceRefs.map((ref) => (
                  <Tag key={ref}>{ref}</Tag>
                ))}
              </div>
            </article>
          </Card>

          {selectedDiff ? (
            <TeachingPlanDiffView diff={selectedDiff} />
          ) : null}

          <Card
            className="workspace-card disposition-card"
            variant="borderless"
          >
            <div>
              <Text className="section-kicker">TEACHER CONTROL</Text>
              <Title level={3}>教师处置</Title>
              <Paragraph>
                接受仅表示你处理了建议，不表示课堂已经实施；任何保存都形成新的不可变
                Revision，状态最高只到 in_review。
              </Paragraph>
            </div>
            <Space wrap>
              <Button
                type="primary"
                loading={disposing}
                onClick={() => submitDisposition("accepted")}
                data-testid="accept-suggestion"
              >
                接受整项并提交审阅
              </Button>
              <Button
                onClick={() => setEditOpen(true)}
                data-testid="edit-suggestion"
              >
                修改字段
              </Button>
              <Button
                danger
                loading={disposing}
                onClick={() => submitDisposition("rejected")}
                data-testid="reject-suggestion"
              >
                拒绝整项
              </Button>
              <Button
                loading={disposing}
                onClick={() => submitDisposition("deferred")}
                data-testid="defer-suggestion"
              >
                延后
              </Button>
            </Space>
          </Card>

          {disposition ? (
            <Result
              status="success"
              title={`已记录：${dispositionLabel(
                disposition.disposition
              )}`}
              subTitle={
                disposition.resultingRevision
                  ? `已形成 ${disposition.resultingRevision.revisionRef}，状态 in_review；没有发布。`
                  : "没有创建新的 TeachingPlan Revision，也没有写入已实施教学事实。"
              }
              extra={[
                <Button
                  key="plan"
                  type="primary"
                  onClick={() => props.navigate("/teaching-plan")}
                >
                  查看 TeachingPlan
                </Button>,
                <Button
                  key="run"
                  onClick={() => props.navigate("/runs")}
                >
                  查看运行依据
                </Button>
              ]}
            />
          ) : null}
        </>
      ) : null}

      <Modal
        title="修改 TeachingPlan 字段"
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        width={720}
        okText="保存教师修改"
        cancelText="取消"
        okButtonProps={{
          disabled: Object.keys(teacherEdits).length === 0,
          "data-testid": "save-teacher-edits"
        }}
        onOk={() => {
          setEditOpen(false);
          void submitDisposition("accepted_with_changes");
        }}
      >
        {selectedPlan ? (
          <Space
            orientation="vertical"
            size={18}
            className="full-width"
          >
            <Alert
              type="info"
              showIcon
              title="这里只记录教师主动修改"
              description="未修改字段沿用所选策略；保存后生成新的 in_review Revision，不覆盖草稿。"
            />
            <label className="field-label">
              <Text strong>支持策略</Text>
              <TextArea
                rows={4}
                value={
                  teacherEdits.supportStrategy ??
                  selectedPlan.supportStrategy
                }
                onChange={(event) =>
                  setTeacherEdits((current) => ({
                    ...current,
                    supportStrategy: event.target.value
                  }))
                }
                data-testid="edit-support-strategy"
              />
            </label>
            <label className="field-label">
              <Text strong>后续行动</Text>
              <TextArea
                rows={4}
                value={
                  teacherEdits.followUp ?? selectedPlan.followUp
                }
                onChange={(event) =>
                  setTeacherEdits((current) => ({
                    ...current,
                    followUp: event.target.value
                  }))
                }
                data-testid="edit-follow-up"
              />
            </label>
            <Divider />
            <Text type="secondary">
              当前已修改字段：
              {Object.keys(teacherEdits).join("、") || "暂无"}
            </Text>
          </Space>
        ) : null}
      </Modal>
    </div>
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return `${error.message}（${error.code}）`;
  }
  return error instanceof Error ? error.message : "发生未知错误";
}

function dispositionLabel(
  disposition: SuggestionDispositionKind
): string {
  return {
    accepted: "已接受",
    accepted_with_changes: "修改后接受",
    rejected: "已拒绝",
    deferred: "已延后"
  }[disposition];
}
