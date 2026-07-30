import { useEffect, useMemo, useState } from "react";

import type {
  PedagogicalStrategy,
  SuggestionDispositionKind,
  SuggestionDispositionResult,
  TeacherWorkspace,
  TeachingPlan
} from "@edu-agent/contracts";
import {
  Alert,
  Button,
  Card,
  Collapse,
  Divider,
  Drawer,
  Input,
  Modal,
  Result,
  Space,
  Spin,
  Tag,
  Typography
} from "antd";

import {
  ApiError,
  createTeacherCopilotTask,
  disposeSuggestion,
  loadPendingProposals,
  loadProposalDetail,
  type RecoverableCopilotTask
} from "../api";
import { SemanticTag } from "../components/SemanticTag";
import {
  planFieldLabels,
  TeachingPlanDiffView
} from "../components/TeachingPlanView";
import { cleanDisplayText } from "../presentation";
import type { AppRoute } from "../route";
import { applyDiffToPlan } from "../teaching-plan";

const { Paragraph, Text, Title } = Typography;
const { TextArea } = Input;

export function CopilotPage(props: {
  workspace: TeacherWorkspace;
  task: RecoverableCopilotTask | null;
  setTask: (task: RecoverableCopilotTask) => void;
  refreshWorkspace: () => Promise<void>;
  navigate: (route: AppRoute) => void;
  proposalRevisionRef: string | null;
  navigateProposal: (proposalRevisionRef: string) => void;
  initialPrompt?: string;
}) {
  const [generating, setGenerating] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [disposing, setDisposing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedStrategyId, setSelectedStrategyId] = useState<
    string | null
  >(props.task?.strategies[0]?.strategyId ?? null);
  const [editOpen, setEditOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [teacherEdits, setTeacherEdits] = useState<
    Partial<TeachingPlan>
  >({});
  const [disposition, setDisposition] =
    useState<SuggestionDispositionResult | null>(null);
  const [pendingProposals, setPendingProposals] = useState(
    props.workspace.pendingSuggestions.filter(
      (proposal) => proposal.status === "pending"
    )
  );
  const [taskPrompt, setTaskPrompt] = useState(
    props.initialPrompt ||
      "根据当前学习证据，比较两种明日课堂调整策略"
  );

  useEffect(() => {
    if (props.initialPrompt) {
      setTaskPrompt(props.initialPrompt);
      return;
    }
    const prefill = window.sessionStorage.getItem("copilot-prefill");
    if (prefill) {
      setTaskPrompt(prefill);
      window.sessionStorage.removeItem("copilot-prefill");
    }
  }, [props.initialPrompt]);

  useEffect(() => {
    let active = true;
    void loadPendingProposals()
      .then((result) => {
        if (active) setPendingProposals(result.items);
      })
      .catch((caught: unknown) => {
        if (active) setError(errorMessage(caught));
      });
    return () => {
      active = false;
    };
  }, [props.workspace.pendingSuggestions]);

  useEffect(() => {
    if (!props.proposalRevisionRef) return;
    let active = true;
    setRecovering(true);
    setError(null);
    void loadProposalDetail(props.proposalRevisionRef)
      .then((detail) => {
        if (!active) return;
        props.setTask(detail);
        setTaskPrompt(detail.request.requestText);
        setSelectedStrategyId(
          detail.disposition?.selectedStrategyId ??
            detail.strategies[0]?.strategyId ??
            null
        );
        setTeacherEdits(
          (detail.disposition?.teacherEdits ??
            {}) as Partial<TeachingPlan>
        );
        setDisposition(
          detail.disposition
            ? {
                replayed: true,
                dispositionRef:
                  detail.disposition.dispositionRef,
                disposition: detail.disposition.disposition,
                implementationObserved: false,
                instructionalDecisionCreated: false,
                resultingRevision: detail.inReviewRevision
              }
            : null
        );
      })
      .catch((caught: unknown) => {
        if (active) setError(errorMessage(caught));
      })
      .finally(() => {
        if (active) setRecovering(false);
      });
    return () => {
      active = false;
    };
  }, [props.proposalRevisionRef, props.setTask]);

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
  const baselineRevision =
    props.task && "baselineRevision" in props.task
      ? props.task.baselineRevision
      : props.workspace.currentTeachingPlan;
  const selectedPlan = useMemo(() => {
    if (!selectedDiff) return null;
    return applyDiffToPlan(
      baselineRevision.content,
      selectedDiff
    );
  }, [baselineRevision.content, selectedDiff]);
  const proposalDisposed =
    props.task !== null &&
    "status" in props.task &&
    props.task.status === "disposed";

  async function generate() {
    setGenerating(true);
    setError(null);
    setDisposition(null);
    try {
      const result = await createTeacherCopilotTask({
        requestText: taskPrompt,
        courseRunRef: props.workspace.courseRun.courseRunRef,
        goalRef: props.workspace.goal.goalRef,
        learningObjectiveRefs: [
          props.workspace.learningObjective.objectiveRef
        ],
        selectedEvidenceRefs: [
          ...props.workspace.evidence.observations.map(
            (item) => item.observationRef
          ),
          ...props.workspace.evidence.claims.map(
            (item) => item.claimRef
          )
        ],
        requestVersion: 1,
        purpose: "teacher-copilot.adjust-next-lesson",
        idempotencyKey: `ui:teacher-copilot:${crypto.randomUUID()}`
      });
      props.setTask(result);
      setSelectedStrategyId(
        result.strategies[0]?.strategyId ?? null
      );
      setTeacherEdits({});
      await props.refreshWorkspace();
      props.navigateProposal(result.proposalRevisionRef);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setGenerating(false);
    }
  }

  async function submitDisposition(
    kind: SuggestionDispositionKind
  ) {
    if (!props.task || !selectedStrategyId || proposalDisposed) return;
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
          expectedProposalRevisionNumber:
            "proposalRevisionNumber" in props.task
              ? props.task.proposalRevisionNumber
              : 1,
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
      const [detail, pending] = await Promise.all([
        loadProposalDetail(props.task.proposalRevisionRef),
        loadPendingProposals()
      ]);
      props.setTask(detail);
      setPendingProposals(pending.items);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setDisposing(false);
    }
  }

  const contextPanel = (
    <CopilotContextPanel
      workspace={props.workspace}
      task={props.task}
    />
  );

  return (
    <div className="page-stack copilot-page">
      <header className="page-header page-header--compact">
        <div>
          <span className="page-icon page-icon--purple" aria-hidden="true">✦</span>
          <div>
            <Title>教师助手</Title>
            <Paragraph>
              围绕当前教学目标和学习证据比较策略，最终判断始终由教师完成。
            </Paragraph>
          </div>
        </div>
        <Button
          className="context-drawer-trigger"
          onClick={() => setContextOpen(true)}
        >
          查看依据与边界
        </Button>
      </header>

      <Alert
        className="proposal-boundary"
        type="info"
        showIcon
        title="以下内容为教学建议草稿，需由教师判断和修改。"
        description="接受建议只会形成待审核的教学计划版本，不表示课堂已经实施，也不会自动发布。"
      />
      <Alert
        type="warning"
        showIcon
        title="当前使用本地演示教师身份"
        description="前端显式发送合成教师身份；这不是正式登录或 SSO。服务端默认不会在缺失身份时自动放行。"
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

      <Card className="task-composer" variant="borderless">
        <div>
          <Text strong>当前教学任务</Text>
          <Text type="secondary">
            用一句话说明你想比较或调整什么
          </Text>
        </div>
        <Input
          value={taskPrompt}
          onChange={(event) => setTaskPrompt(event.target.value)}
          aria-label="教师助手任务说明"
        />
        <Button
          type="primary"
          loading={generating}
          disabled={!taskPrompt.trim()}
          onClick={generate}
          data-testid="generate-copilot"
        >
          {props.task ? "提交新的备课任务" : "生成两种策略"}
        </Button>
      </Card>

      <Card
        className="workspace-card"
        variant="borderless"
        data-testid="pending-proposals"
      >
        <div className="section-heading">
          <div>
            <Text className="section-kicker">可恢复审阅</Text>
            <Title level={3}>待审建议</Title>
          </div>
          <Tag>{pendingProposals.length} 条</Tag>
        </div>
        {pendingProposals.length ? (
          <Space orientation="vertical" size="middle">
            {pendingProposals.map((proposal) => (
              <Card
                key={proposal.proposalRevisionRef}
                size="small"
              >
                <Space orientation="vertical" size="small">
                  <Text strong>{proposal.requestText}</Text>
                  <Text type="secondary">
                    {proposal.strategyTitles.join(" / ")} ·{" "}
                    {new Date(proposal.createdAt).toLocaleString(
                      "zh-CN"
                    )}
                  </Text>
                  <Button
                    onClick={() =>
                      props.navigateProposal(
                        proposal.proposalRevisionRef
                      )
                    }
                    data-testid="continue-proposal-review"
                  >
                    继续审阅
                  </Button>
                </Space>
              </Card>
            ))}
          </Space>
        ) : (
          <Text type="secondary">当前没有待审建议。</Text>
        )}
      </Card>

      {recovering ? (
        <Card className="workspace-card loading-card" variant="borderless">
          <Spin />
          <Text>正在从 PostgreSQL 恢复建议、请求与证据…</Text>
        </Card>
      ) : null}

      {generating ? (
        <Card className="workspace-card loading-card" variant="borderless">
          <Spin size="large" />
          <Title level={4}>正在准备课堂策略</Title>
          <Paragraph>
            助手正在读取允许使用的证据，并形成可审查的建议草稿。
          </Paragraph>
        </Card>
      ) : null}

      {props.task && selectedStrategy ? (
        <div className="copilot-workspace">
          <aside className="copilot-evidence-column">
            <EvidenceContext
              workspace={props.workspace}
              task={props.task}
            />
          </aside>

          <section className="copilot-main-column">
            <div className="section-heading">
              <div>
                <Text className="section-kicker">课堂策略</Text>
                <Title level={2}>比较教学策略</Title>
              </div>
              <Tag>选择后可继续修改</Tag>
            </div>

            <div className="strategy-comparison-grid">
              {props.task.strategies.map((strategy, index) => (
                <StrategyCard
                  key={strategy.strategyId}
                  label={index === 0 ? "策略 A" : "策略 B"}
                  strategy={strategy}
                  selected={
                    strategy.strategyId === selectedStrategyId
                  }
                  onSelect={() => {
                    setSelectedStrategyId(strategy.strategyId);
                    setTeacherEdits({});
                    setDisposition(null);
                  }}
                />
              ))}
            </div>

            {selectedDiff && selectedPlan ? (
              <TeachingPlanDiffView
                diff={selectedDiff}
                baseline={baselineRevision.content}
                proposed={selectedPlan}
                parentRevisionNumber={
                  Math.max(
                    1,
                    props.task.draftRevision.revisionNumber - 1
                  )
                }
                draftRevisionNumber={
                  props.task.draftRevision.revisionNumber
                }
              />
            ) : null}

            {proposalDisposed ? (
              <Alert
                type="info"
                showIcon
                title="这条建议已经完成最终处置"
                description="系统从持久化记录恢复了原处置；同一 Proposal 版本不能再次处置。"
              />
            ) : (
              <Card
                className="workspace-card disposition-card"
                variant="borderless"
              >
                <div>
                  <Text className="section-kicker">教师控制</Text>
                  <Title level={3}>教师处置</Title>
                  <Paragraph>
                    接受表示你完成了建议处置，不表示课堂已实施；保存只形成待审核版本。
                  </Paragraph>
                </div>
                <Space wrap>
                  <Button
                    type="primary"
                    loading={disposing}
                    onClick={() => submitDisposition("accepted")}
                    data-testid="accept-suggestion"
                  >
                    接受并提交审阅
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
                    拒绝
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
            )}

            {disposition ? (
              <Result
                status="success"
                title={`已记录：${dispositionLabel(
                  disposition.disposition
                )}`}
                subTitle={
                  disposition.resultingRevision
                    ? `已形成第 ${disposition.resultingRevision.revisionNumber} 版，状态为待审核；没有发布。`
                    : "没有创建新的教学计划版本，也没有写入已实施教学事实。"
                }
                extra={[
                  <Button
                    key="plan"
                    type="primary"
                    onClick={() =>
                      props.navigate("/teaching-plan")
                    }
                  >
                    查看教学计划
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
          </section>

          <aside className="copilot-explanation-column">
            {contextPanel}
          </aside>
        </div>
      ) : (
        <div className="copilot-empty-grid">
          <EvidenceContext workspace={props.workspace} task={null} />
          <Card className="workspace-card copilot-launch" variant="borderless">
            <SemanticTag kind="claim">
              {`${props.workspace.evidence.claims.length} 条待复核解释`}
            </SemanticTag>
            <Title level={2}>先看证据，再启动任务</Title>
            <Paragraph>
              当前只读取本课程、教学目标、学习证据和教学计划；不会修改正式教育事实。
            </Paragraph>
            <Button
              type="primary"
              loading={generating}
              onClick={generate}
            >
              生成两种课堂调整策略
            </Button>
          </Card>
          <div className="copilot-explanation-column">
            {contextPanel}
          </div>
        </div>
      )}

      <Drawer
        title="系统为什么这样建议"
        open={contextOpen}
        onClose={() => setContextOpen(false)}
        size={420}
      >
        {contextPanel}
      </Drawer>

      <Modal
        title="编辑教学计划变更"
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        width={820}
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
        {selectedPlan && selectedDiff ? (
          <div className="edit-fields">
            <Alert
              type="info"
              showIcon
              title="所有建议变更字段均可编辑"
              description="每项可单独撤销。未修改项沿用所选策略；保存前请检查下方修改摘要。"
            />
            {selectedDiff.changes.map((change) => {
              const field = change.field;
              const currentValue =
                teacherEdits[field] ?? selectedPlan[field];
              const arrayValue = Array.isArray(
                selectedPlan[field]
              );
              return (
                <label className="edit-field" key={field}>
                  <span className="edit-field__heading">
                    <Text strong>{planFieldLabels[field]}</Text>
                    {field in teacherEdits ? (
                      <Button
                        type="link"
                        size="small"
                        onClick={() =>
                          setTeacherEdits((current) => {
                            const next = { ...current };
                            delete next[field];
                            return next;
                          })
                        }
                        data-testid={`undo-${fieldTestId(field)}`}
                      >
                        撤销此项
                      </Button>
                    ) : null}
                  </span>
                  <TextArea
                    rows={arrayValue ? 4 : 3}
                    value={
                      Array.isArray(currentValue)
                        ? currentValue.join("\n")
                        : currentValue
                    }
                    onChange={(event) => {
                      const nextValue = arrayValue
                        ? event.target.value
                            .split(/\r?\n/)
                            .map((item) => item.trim())
                            .filter(Boolean)
                        : event.target.value;
                      setTeacherEdits(
                        (current) =>
                          ({
                            ...current,
                            [field]: nextValue
                          }) as Partial<TeachingPlan>
                      );
                    }}
                    data-testid={`edit-${fieldTestId(field)}`}
                  />
                  <small>{change.reason}</small>
                </label>
              );
            })}
            <Divider />
            <div className="edit-summary" data-testid="edit-summary">
              <Text strong>保存前修改摘要</Text>
              {Object.keys(teacherEdits).length ? (
                <ul>
                  {(
                    Object.keys(
                      teacherEdits
                    ) as Array<keyof TeachingPlan>
                  ).map((field) => (
                    <li key={field}>{planFieldLabels[field]}</li>
                  ))}
                </ul>
              ) : (
                <Text type="secondary">尚未修改任何字段</Text>
              )}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function EvidenceContext({
  workspace,
  task
}: {
  workspace: TeacherWorkspace;
  task: RecoverableCopilotTask | null;
}) {
  const evidence =
    task && "evidence" in task
      ? task.evidence
      : {
          observations: workspace.evidence.observations.filter(
            (item) =>
              !task ||
              task.request.selectedEvidenceRefs.includes(
                item.observationRef
              )
          ),
          claims: workspace.evidence.claims.filter(
            (item) =>
              !task ||
              task.request.selectedEvidenceRefs.includes(
                item.claimRef
              )
          )
        };
  return (
    <Card className="workspace-card evidence-context" variant="borderless">
      <Text className="section-kicker">当前依据</Text>
      <Title level={3}>目标与证据</Title>
      <section>
        <Text type="secondary">当前教学目标</Text>
        <p>{workspace.goal.title}</p>
      </section>
      <section>
        <Text type="secondary">直接观察</Text>
        {evidence.observations.map((observation) => (
          <article key={observation.observationRef}>
            <strong>{cleanDisplayText(observation.learnerLabel)}</strong>
            <p>{observation.summary}</p>
            <small>
              {new Date(observation.observedAt).toLocaleString(
                "zh-CN"
              )}
            </small>
          </article>
        ))}
      </section>
      <section>
        <Text type="secondary">未知项</Text>
        <ul>
          {Array.from(
            new Set(
              evidence.observations.flatMap(
                (item) => item.unknowns
              )
            )
          ).map((unknown) => (
            <li key={unknown}>{unknown}</li>
          ))}
        </ul>
      </section>
      <section>
        <Text type="secondary">辅助情况</Text>
        <p>
          {evidence.observations[0]?.assistance
            .description ?? "未记录"}
        </p>
      </section>
      <section>
        <Text type="secondary">待复核解释</Text>
        <p>{evidence.claims.length} 条（不作为学生能力定论）</p>
      </section>
    </Card>
  );
}

function StrategyCard(props: {
  label: string;
  strategy: PedagogicalStrategy;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <article
      className={`strategy-card ${
        props.selected ? "strategy-card--selected" : ""
      }`}
      role="button"
      tabIndex={0}
      aria-pressed={props.selected}
      onClick={props.onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          props.onSelect();
        }
      }}
      data-testid={props.selected ? "strategy-detail" : undefined}
    >
      <div className="strategy-card__header">
        <span>{props.label}</span>
        <Tag>{props.selected ? "当前选择" : "选择此策略"}</Tag>
      </div>
      <Title level={3}>
        {cleanDisplayText(props.strategy.title)}
      </Title>
      <Paragraph>
        {cleanDisplayText(props.strategy.rationale)}
      </Paragraph>
      <StrategySection title="使用证据">
        <div className="strategy-evidence">
          {Array.from(
            new Set(
              props.strategy.evidenceRefs.map(shortEvidenceLabel)
            )
          ).map((label) => (
            <Tag key={label}>{label}</Tag>
          ))}
        </div>
      </StrategySection>
      <StrategySection title="证据缺口">
        <ul>
          {props.strategy.knownGaps.map((gap) => (
            <li key={gap}>{cleanDisplayText(gap)}</li>
          ))}
        </ul>
      </StrategySection>
      <StrategySection title="适用条件">
        <p>{cleanDisplayText(props.strategy.applicability)}</p>
      </StrategySection>
      <StrategySection title="不适用条件">
        <ul>
          {props.strategy.unsuitableConditions.map((condition) => (
            <li key={condition}>
              {cleanDisplayText(condition)}
            </li>
          ))}
        </ul>
      </StrategySection>
      <StrategySection title="建议课堂动作">
        <ol>
          {props.strategy.suggestedMoves.map((move) => (
            <li key={move}>{cleanDisplayText(move)}</li>
          ))}
        </ol>
      </StrategySection>
      <StrategySection title="后续需要采集的证据">
        <ul>
          {props.strategy.followUpEvidence.map((evidence) => (
            <li key={evidence}>{cleanDisplayText(evidence)}</li>
          ))}
        </ul>
      </StrategySection>
      <Alert
        type="warning"
        title="把握说明（不是概率）"
        description={cleanDisplayText(
          props.strategy.confidenceExplanation
        )}
      />
    </article>
  );
}

function StrategySection(props: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="strategy-section">
      <Text strong>{props.title}</Text>
      {props.children}
    </section>
  );
}

function CopilotContextPanel(props: {
  workspace: TeacherWorkspace;
  task: RecoverableCopilotTask | null;
}) {
  return (
    <Card className="workspace-card context-panel" variant="borderless">
      <Text className="section-kicker">建议解释</Text>
      <Title level={3}>建议依据与控制边界</Title>
      <dl>
        <div>
          <dt>使用的数据</dt>
          <dd>
            当前课程、学习目标、{props.workspace.evidence.observations.length}
            条观察与 {props.workspace.evidence.claims.length}
            条待复核解释
          </dd>
        </div>
        <div>
          <dt>教师原始请求</dt>
          <dd>
            {props.task?.request.requestText ??
              "任务启动后按原文持久化"}
          </dd>
        </div>
        <div>
          <dt>本次任务边界</dt>
          <dd>
            {props.task
              ? `${props.task.request.selectedEvidenceRefs.length} 条证据引用已固定，不随后台变化`
              : "任务启动时固定"}
          </dd>
        </div>
        <div>
          <dt>助手状态</dt>
          <dd>本地演示助手，不连接外部模型</dd>
        </div>
        <div>
          <dt>教师控制</dt>
          <dd>接受、编辑、拒绝、延后；系统不能自动发布</dd>
        </div>
      </dl>
      <Alert
        type="info"
        title="边界"
        description="建议不会改写已有证据、教学目标或已发布内容；系统也不能代替教师作出教学承诺。"
      />
      <Collapse
        ghost
        size="small"
        className="technical-disclosure"
        items={[
          {
            key: "technical",
            label: "查看技术详情",
            children: (
              <dl className="detail-list">
                <div>
                  <dt>Contract</dt>
                  <dd>{props.task?.contractRef ?? "任务创建后生成"}</dd>
                </div>
                <div>
                  <dt>AuthorizationDecision</dt>
                  <dd>
                    {props.task?.authorizationDecisionRef ??
                      "任务创建后生成"}
                  </dd>
                </div>
                <div>
                  <dt>ModelProvider</dt>
                  <dd>MockModelProvider</dd>
                </div>
              </dl>
            )
          }
        ]}
      />
    </Card>
  );
}

function fieldTestId(field: keyof TeachingPlan): string {
  return field.replace(
    /[A-Z]/g,
    (character) => `-${character.toLowerCase()}`
  );
}

function shortEvidenceLabel(reference: string): string {
  if (reference.includes("observation")) {
    return "直接观察";
  }
  if (reference.includes("claim")) {
    return "待复核解释";
  }
  return "其他依据";
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
