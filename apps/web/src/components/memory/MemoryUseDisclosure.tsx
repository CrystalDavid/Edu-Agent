import type {
  MemoryApplicationDecision,
  MemoryApplicationOutcomeStatus,
  MemoryApplicationReasonCode,
  MemoryContextExplanation,
  MemoryContextSourceKind
} from "@edu-agent/contracts";
import { Tag } from "antd";

import {
  cleanDisplayText,
  teacherPreferenceLabel
} from "../../presentation";
import { shouldShowMemoryUseDisclosure } from "./memory-use-disclosure-visibility";

const includedDecisions = new Set<MemoryApplicationDecision>([
  "selected",
  "injected"
]);

export function MemoryUseDisclosure(props: {
  memoryContext: MemoryContextExplanation | null | undefined;
  variant?: "compact" | "detailed";
}) {
  const memoryContext = props.memoryContext;
  if (!shouldShowMemoryUseDisclosure(memoryContext)) return null;

  const variant = props.variant ?? "compact";
  const includedWorkingMemory = memoryContext.workingMemory.filter((entry) =>
    includedDecisions.has(entry.decision)
  );
  const excludedWorkingMemory = memoryContext.workingMemory.filter(
    (entry) => !includedDecisions.has(entry.decision)
  );
  const includedPreferences = memoryContext.durablePreferences.filter((entry) =>
    includedDecisions.has(entry.decision)
  );
  const excludedPreferences = memoryContext.durablePreferences.filter(
    (entry) => !includedDecisions.has(entry.decision)
  );
  const excludedPreferenceRefs = new Set(
    excludedPreferences.map((entry) => entry.preferenceRef)
  );
  const excludedWorkingMemoryRefs = new Set(
    excludedWorkingMemory.map((entry) => entry.sourceRef)
  );
  const remainingExcluded = memoryContext.excluded.filter(
    (entry) =>
      (entry.sourceKind !== "teacher_preference" ||
        !excludedPreferenceRefs.has(entry.sourceRef)) &&
      (entry.sourceKind !== "working_memory" ||
        !excludedWorkingMemoryRefs.has(entry.sourceRef))
  );
  const referencedSourceCount = countReferencedSources(memoryContext);

  return (
    <section
      className={`memory-use-disclosure memory-use-disclosure--${variant}`}
      data-testid="memory-use-disclosure"
      data-pack-ref={memoryContext.packRef}
      data-pack-content-hash={memoryContext.packContentHash}
    >
      <details>
        <summary data-testid="memory-use-toggle">
          <span>
            本次参考了 <strong>{referencedSourceCount}</strong> 项上下文
          </span>
          <span className="memory-use-disclosure__hint">展开查看</span>
        </summary>

        <div className="memory-use-disclosure__body">
          {memoryContext.currentTurn ? (
            <MemoryGroup
              title="当前要求"
              testId="memory-current-instruction"
            >
              <MemoryItem
                summary={`“${cleanDisplayText(memoryContext.currentTurn.displaySummary)}”`}
                decision="injected"
                reasonCode="current_instruction"
                detailed={variant === "detailed"}
              />
            </MemoryGroup>
          ) : null}

          {includedWorkingMemory.length > 0 ? (
            <MemoryGroup
              title="同一任务上下文"
              testId="memory-working-memory"
            >
              {includedWorkingMemory.map((entry) => (
                <MemoryItem
                  key={`${entry.sourceRef}:${entry.decision}`}
                  summary={cleanDisplayText(entry.displaySummary)}
                  decision={entry.decision}
                  reasonCode={entry.reasonCode}
                  detailed={variant === "detailed"}
                  testId="memory-working-memory-item"
                />
              ))}
            </MemoryGroup>
          ) : null}

          {includedPreferences.length > 0 ? (
            <MemoryGroup
              title="已确认偏好"
              testId="memory-preferences"
            >
              {includedPreferences.map((preference) => (
                <PreferenceItem
                  key={`${preference.preferenceRef}:${preference.preferenceVersion}:${preference.decision}`}
                  preference={preference}
                  detailed={variant === "detailed"}
                />
              ))}
            </MemoryGroup>
          ) : null}

          {(
            excludedWorkingMemory.length > 0 ||
            excludedPreferences.length > 0 ||
            remainingExcluded.length > 0
          ) ? (
            <MemoryGroup
              title="未采用或被排除"
              testId="memory-excluded"
              muted
            >
              {excludedWorkingMemory.map((entry) => (
                <MemoryItem
                  key={`${entry.sourceRef}:${entry.decision}`}
                  summary={cleanDisplayText(entry.displaySummary)}
                  decision={entry.decision}
                  reasonCode={entry.reasonCode}
                  detailed={variant === "detailed"}
                  alwaysShowReason
                  testId="memory-excluded-item"
                />
              ))}
              {excludedPreferences.map((preference) => (
                <PreferenceItem
                  key={`${preference.preferenceRef}:${preference.preferenceVersion}:${preference.decision}`}
                  preference={preference}
                  detailed={variant === "detailed"}
                  excluded
                />
              ))}
              {remainingExcluded.map((entry) => (
                <MemoryItem
                  key={`${entry.sourceKind}:${entry.sourceRef}:${entry.reasonCode}`}
                  summary={sourceKindLabel(entry.sourceKind)}
                  decision="excluded"
                  reasonCode={entry.reasonCode}
                  detailed={variant === "detailed"}
                  alwaysShowReason
                  testId="memory-excluded-item"
                />
              ))}
            </MemoryGroup>
          ) : null}

          {variant === "detailed" ? (
            <div
              className="memory-use-disclosure__metadata"
              data-testid="memory-run-metadata"
            >
              <div>
                <span>上下文清单</span>
                <strong data-testid="memory-pack-ref">
                  {shortReference(memoryContext.packRef)}
                </strong>
              </div>
              <div>
                <span>内容校验</span>
                <strong data-testid="memory-pack-hash">
                  {shortHash(memoryContext.packContentHash)}
                </strong>
              </div>
              <div>
                <span>Skill</span>
                <strong>{skillVersionLabel(memoryContext)}</strong>
              </div>
              <div>
                <span>策略版本</span>
                <strong>{memoryContext.policyVersion}</strong>
              </div>
              <div>
                <span>方案处置</span>
                <strong data-testid="memory-outcome-status">
                  {outcomeLabel(memoryContext.outcomeStatus)}
                </strong>
              </div>
            </div>
          ) : null}

          <p
            className="memory-use-disclosure__disclaimer"
            data-testid="memory-disclaimer"
          >
            这里表示系统在生成时参考了这些信息，不代表模型一定完整采用。你仍需审阅最终方案。
          </p>
        </div>
      </details>
    </section>
  );
}

function MemoryGroup(props: {
  title: string;
  testId: string;
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <section
      className={`memory-use-group${props.muted ? " memory-use-group--muted" : ""}`}
      data-testid={props.testId}
    >
      <h3>{props.title}</h3>
      <div className="memory-use-group__items">{props.children}</div>
    </section>
  );
}

function MemoryItem(props: {
  summary: string;
  decision: MemoryApplicationDecision;
  reasonCode: MemoryApplicationReasonCode;
  detailed: boolean;
  alwaysShowReason?: boolean;
  testId?: string;
}) {
  return (
    <article className="memory-use-item" data-testid={props.testId}>
      <div className="memory-use-item__content">
        <p>{props.summary}</p>
        {(
          props.alwaysShowReason ||
          props.detailed ||
          !includedDecisions.has(props.decision)
        ) ? (
          <small>原因：{reasonLabel(props.reasonCode)}</small>
        ) : null}
      </div>
      {props.detailed ? <DecisionTag decision={props.decision} /> : null}
    </article>
  );
}

function PreferenceItem(props: {
  preference: MemoryContextExplanation["durablePreferences"][number];
  detailed: boolean;
  excluded?: boolean;
}) {
  const preference = props.preference;
  return (
    <article className="memory-use-item" data-testid="memory-preference">
      <div className="memory-use-item__content">
        <p>
          <strong>{teacherPreferenceLabel(preference.preferenceKey)}</strong>
          <span>：{cleanDisplayText(preference.preferenceValue)}</span>
        </p>
        {preference.currentStatus === "revoked" ? (
          <small className="memory-use-item__revoked">
            本次运行当时参考，当前已撤销
          </small>
        ) : null}
        {props.excluded || props.detailed ? (
          <small>原因：{reasonLabel(preference.reasonCode)}</small>
        ) : null}
        {props.detailed && preference.currentStatus === "active" ? (
          <small>当前状态：有效</small>
        ) : null}
        {props.detailed && preference.targetFields.length > 0 ? (
          <small>作用字段：{preference.targetFields.join("、")}</small>
        ) : null}
        {props.detailed && preference.outcomeStatus ? (
          <small>后续处置：{outcomeLabel(preference.outcomeStatus)}</small>
        ) : null}
      </div>
      {props.detailed ? <DecisionTag decision={preference.decision} /> : null}
    </article>
  );
}

function DecisionTag(props: { decision: MemoryApplicationDecision }) {
  return (
    <Tag className={`memory-use-decision memory-use-decision--${props.decision}`}>
      {props.decision}
    </Tag>
  );
}

function countReferencedSources(memoryContext: MemoryContextExplanation): number {
  const references = new Set<string>();
  if (memoryContext.currentTurn) {
    references.add(`current_instruction:${memoryContext.currentTurn.turnRef}`);
  }
  for (const entry of memoryContext.workingMemory) {
    if (includedDecisions.has(entry.decision)) {
      references.add(`${entry.sourceKind}:${entry.sourceRef}`);
    }
  }
  for (const entry of memoryContext.durablePreferences) {
    if (includedDecisions.has(entry.decision)) {
      references.add(`teacher_preference:${entry.preferenceRef}`);
    }
  }
  return references.size;
}

function sourceKindLabel(sourceKind: MemoryContextSourceKind): string {
  return {
    current_instruction: "当前要求",
    working_memory: "同一任务上下文",
    teacher_preference: "已确认偏好"
  }[sourceKind];
}

function reasonLabel(reasonCode: MemoryApplicationReasonCode): string {
  return {
    current_instruction: "本轮明确要求",
    same_task_working_memory: "来自同一任务的短期上下文",
    active_confirmed_preference: "已由教师确认且当时有效",
    owner_mismatch: "不属于当前授权范围",
    duplicate_key: "已有同类偏好被优先采用",
    token_budget: "超出本次上下文预算",
    skill_not_allowed: "当前任务不允许使用",
    current_instruction_override: "被本轮明确要求覆盖",
    expired: "当时已过期",
    revoked: "当时已撤销",
    superseded: "已被较新版本替代"
  }[reasonCode];
}

function outcomeLabel(
  outcomeStatus: MemoryApplicationOutcomeStatus | null
): string {
  if (!outcomeStatus) return "暂未处置";
  return {
    adopted: "已采用",
    edited: "修改后采用",
    rejected: "已拒绝",
    deferred: "已暂缓",
    unknown: "尚未关联处置"
  }[outcomeStatus];
}

function shortHash(hash: string): string {
  return `${hash.slice(0, 8)}…${hash.slice(-8)}`;
}

function shortReference(reference: string): string {
  if (reference.length <= 24) return reference;
  const suffix = reference.split(":").at(-1) ?? reference;
  if (suffix.length <= 24) return suffix;
  return `${suffix.slice(0, 10)}…${suffix.slice(-8)}`;
}

function skillVersionLabel(memoryContext: MemoryContextExplanation): string {
  return memoryContext.skillRef.endsWith(`@${memoryContext.skillVersion}`)
    ? memoryContext.skillRef
    : `${memoryContext.skillRef}@${memoryContext.skillVersion}`;
}
