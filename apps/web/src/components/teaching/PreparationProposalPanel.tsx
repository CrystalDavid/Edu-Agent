import { useEffect, useMemo, useState } from "react";

import type {
  ModelExecutionView,
  ProposalReviewDetail,
  TeachingPlanRevisionView
} from "@edu-agent/contracts";
import { Alert, Button, Input, Tag, Typography } from "antd";

import { modelExecutionStatusLabel } from "../../presentation";
import { MemoryUseDisclosure } from "../memory/MemoryUseDisclosure";
import { WorkspaceIcon } from "../WorkspaceIcon";

const { Title } = Typography;

export function PreparationProposalPanel(props: {
  proposal: ProposalReviewDetail | null;
  execution: ModelExecutionView | null;
  inReviewRevision: TeachingPlanRevisionView | null;
  loading: boolean;
  onAccept: (strategyId: string) => void;
  onReject: (strategyId: string) => void;
  onAdjust: (strategyId: string, adjustment: string) => void;
  onApprove: () => void;
}) {
  const [selectedStrategyId, setSelectedStrategyId] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const [adjustment, setAdjustment] = useState("");

  useEffect(() => {
    setSelectedStrategyId(props.proposal?.strategies[0]?.strategyId ?? null);
    setAdjusting(false);
    setAdjustment("");
  }, [props.proposal?.proposalRevisionRef]);

  const selected = useMemo(
    () => props.proposal?.strategies.find(
      (strategy) => strategy.strategyId === selectedStrategyId
    ) ?? null,
    [props.proposal, selectedStrategyId]
  );

  if (!props.proposal && !props.execution && !props.inReviewRevision) {
    return null;
  }
  const proposal = props.proposal;

  return (
    <section
      className="preparation-proposal-panel"
      id="preparation-proposal"
      data-testid="preparation-proposal-panel"
    >
      <header className="preparation-proposal-panel__header">
        <Title level={3}>
          {props.inReviewRevision
            ? "确认教学方案"
            : props.proposal
              ? "选择教学方案"
              : "正在准备教学方案"}
        </Title>
        {props.execution ? (
          <Tag color={props.execution.status === "succeeded" ? "success" : "processing"}>
            {modelExecutionStatusLabel(props.execution.status)}
          </Tag>
        ) : null}
      </header>

      <MemoryUseDisclosure memoryContext={props.proposal?.memoryContext} />

      {props.execution && props.execution.status !== "succeeded" ? (
        <Alert
          type={isFailed(props.execution.status) ? "error" : "info"}
          showIcon
          title={isFailed(props.execution.status) ? "本次方案生成未完成" : "系统正在准备方案"}
          description={props.execution.safeMessage ?? "完成后会在本页显示可比较的方案。"}
        />
      ) : null}

      {proposal ? (
        <>
          <div className="preparation-proposal-grid">
            {proposal.strategies.map((strategy, index) => {
              const plan = strategy.proposedPlanChanges ??
                (index === 0 ? proposal.draftRevision.content : null);
              const selectedCard = strategy.strategyId === selectedStrategyId;
              return (
                <button
                  type="button"
                  key={strategy.strategyId}
                  className={selectedCard ? "is-selected" : ""}
                  aria-pressed={selectedCard}
                  onClick={() => setSelectedStrategyId(strategy.strategyId)}
                  data-testid={`preparation-strategy-${index + 1}`}
                >
                  <span className="preparation-proposal-card__topline">
                    <Tag>{`方案 ${String.fromCharCode(65 + index)}`}</Tag>
                    {selectedCard ? <WorkspaceIcon name="check" /> : null}
                  </span>
                  <strong>{strategy.title}</strong>
                  <small>{strategy.summary ?? strategy.rationale}</small>
                  {plan ? (
                    <dl>
                      <div><dt>目标</dt><dd>{plan.objective}</dd></div>
                      <div><dt>课堂流程</dt><dd>{plan.openingActivity}</dd></div>
                    </dl>
                  ) : null}
                </button>
              );
            })}
          </div>

          {selected ? (
            <details className="preparation-proposal-more">
              <summary>查看方案依据</summary>
              <div className="preparation-proposal-detail">
                <div>
                  <strong>建议理由</strong>
                  <p>{selected.rationale}</p>
                </div>
                <div>
                  <strong>教学动作</strong>
                  <p>{(selected.teachingMoves ?? selected.suggestedMoves).join("；")}</p>
                </div>
              </div>
            </details>
          ) : null}

          {proposal.status === "pending" && selectedStrategyId ? (
            <div className="preparation-proposal-actions">
              {adjusting ? (
                <div className="preparation-proposal-adjustment ai-task-composer">
                  <Input.TextArea
                    className="ai-task-input"
                    value={adjustment}
                    maxLength={500}
                    autoSize={{ minRows: 2, maxRows: 4 }}
                    placeholder="例如：这个班基础较弱，减少讨论，多做分步练习"
                    onChange={(event) => setAdjustment(event.target.value)}
                  />
                  <Button
                    type="primary"
                    loading={props.loading}
                    disabled={!adjustment.trim()}
                    onClick={() => props.onAdjust(selectedStrategyId, adjustment.trim())}
                  >
                    按这句话重新生成
                  </Button>
                  <Button onClick={() => setAdjusting(false)}>取消</Button>
                </div>
              ) : (
                <>
                  <Button
                    type="primary"
                    loading={props.loading}
                    onClick={() => props.onAccept(selectedStrategyId)}
                    data-testid="workspace-accept-proposal"
                  >
                    确认方案
                  </Button>
                  <Button onClick={() => setAdjusting(true)}>交给助手调整</Button>
                  <Button
                    danger
                    type="text"
                    loading={props.loading}
                    onClick={() => props.onReject(selectedStrategyId)}
                  >
                    不采用
                  </Button>
                </>
              )}
            </div>
          ) : null}
        </>
      ) : null}

      {props.inReviewRevision ? (
        <div className="preparation-plan-approval">
          <span className="preparation-plan-approval__icon"><WorkspaceIcon name="document" /></span>
          <div>
            <strong>{props.inReviewRevision.title}</strong>
            <small>进行中</small>
          </div>
          <Button
            type="primary"
            loading={props.loading}
            onClick={props.onApprove}
            data-testid="workspace-approve-plan"
          >
            确认方案
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function isFailed(status: ModelExecutionView["status"]): boolean {
  return [
    "retryable_failed",
    "permanently_failed",
    "timed_out",
    "budget_exceeded",
    "validation_failed",
    "cancelled"
  ].includes(status);
}
