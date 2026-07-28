import { useState } from "react";

import type {
  TeachingPlan,
  TeachingPlanDiff,
  TeachingPlanDiffChange,
  TeacherWorkspace
} from "@edu-agent/contracts";
import {
  Button,
  Collapse,
  Descriptions,
  Space,
  Tag,
  Typography
} from "antd";

import { SemanticTag } from "./SemanticTag";

const { Paragraph, Text, Title } = Typography;

export const planFieldLabels: Record<keyof TeachingPlan, string> = {
  objective: "教学目标",
  lessonFocus: "课堂重点",
  openingActivity: "导入活动",
  teacherQuestions: "教师提问",
  studentActivity: "学生活动",
  supportStrategy: "支持策略",
  independentCheck: "独立检查",
  followUp: "后续行动",
  evidenceRefs: "Evidence 引用"
};

function renderPlanValue(value: string | string[]) {
  if (Array.isArray(value)) {
    return (
      <ul className="compact-list">
        {value.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    );
  }
  return <span>{value}</span>;
}

export function TeachingPlanView(props: {
  revision: TeacherWorkspace["latestTeachingPlan"];
  onPrevious?: () => void;
}) {
  return (
    <article className="plan-document">
      <div className="plan-document__header">
        <div>
          <Space wrap>
            <SemanticTag kind="artifact">TeachingPlan</SemanticTag>
            <Tag
              color={
                props.revision.state === "in_review"
                  ? "processing"
                  : "default"
              }
            >
              {props.revision.state}
            </Tag>
            <Tag>Revision {props.revision.revisionNumber}</Tag>
          </Space>
          <Title level={3}>{props.revision.title}</Title>
          <Text type="secondary">
            {props.revision.revisionRef}
          </Text>
        </div>
        {props.revision.parentRevisionRef && props.onPrevious ? (
          <Button onClick={props.onPrevious}>查看前一 Revision</Button>
        ) : null}
      </div>
      <Descriptions
        column={1}
        bordered
        size="middle"
        items={(
          Object.keys(planFieldLabels) as Array<keyof TeachingPlan>
        ).map((field) => ({
          key: field,
          label: planFieldLabels[field],
          children: renderPlanValue(props.revision.content[field])
        }))}
      />
    </article>
  );
}

function valueText(value: TeachingPlanDiffChange["before"]) {
  if (value === null) return "（无）";
  return Array.isArray(value) ? value.join("\n") : value;
}

export function TeachingPlanDiffView(props: {
  diff: TeachingPlanDiff;
  baseline: TeachingPlan;
  proposed: TeachingPlan;
  parentRevisionNumber?: number;
  draftRevisionNumber?: number;
  teacherSelection?: "accepted" | "modified" | null;
}) {
  const [viewMode, setViewMode] = useState<"changes" | "all">(
    "changes"
  );
  const changedByField = new Map(
    props.diff.changes.map((change) => [change.field, change])
  );
  const rows: DisplayDiffRow[] =
    viewMode === "changes"
      ? props.diff.changes.map((change) => ({
          ...change,
          changed: true
        }))
      : (Object.keys(
          planFieldLabels
        ) as Array<keyof TeachingPlan>).map((field) => {
          const change = changedByField.get(field);
          return change
            ? { ...change, changed: true }
            : {
                field,
                kind: "modified",
                before: props.baseline[field],
                after: props.proposed[field],
                reason: "此字段在当前建议中没有变化。",
                evidenceRefs: [],
                teacherSelection: "pending",
                changed: false
              };
        });
  const groups = diffGroups
    .map((group) => ({
      ...group,
      rows: rows.filter((row) => group.fields.includes(row.field))
    }))
    .filter((group) => group.rows.length > 0);

  return (
    <section
      className="typed-diff"
      data-testid="teaching-plan-diff"
      data-view-mode={viewMode}
    >
      <div className="section-heading">
        <div>
          <Text className="section-kicker">STRUCTURED DIFF</Text>
          <Title level={3}>教学计划变更审阅</Title>
          <Text type="secondary">
            父版本{" "}
            {props.parentRevisionNumber
              ? `v${props.parentRevisionNumber}`
              : "当前版本"}{" "}
            → 建议草稿{" "}
            {props.draftRevisionNumber
              ? `v${props.draftRevisionNumber}`
              : "下一版本"}
          </Text>
        </div>
        <Space wrap>
          <Tag>{props.diff.changes.length} 项变更</Tag>
          {props.teacherSelection ? (
            <Tag color="processing">
              教师最终选择：
              {props.teacherSelection === "accepted"
                ? "整项接受"
                : "修改后接受"}
            </Tag>
          ) : (
            <Tag>教师最终选择：待处置</Tag>
          )}
        </Space>
      </div>
      <div
        className="diff-view-toggle"
        role="group"
        aria-label="Diff 查看范围"
      >
        <button
          type="button"
          aria-pressed={viewMode === "changes"}
          onClick={() => setViewMode("changes")}
          data-testid="diff-view-changes"
        >
          只看变更
        </button>
        <button
          type="button"
          aria-pressed={viewMode === "all"}
          onClick={() => setViewMode("all")}
          data-testid="diff-view-all"
        >
          查看全部字段
        </button>
      </div>
      <Collapse
        className="diff-sections"
        defaultActiveKey={groups[0]?.key ? [groups[0].key] : []}
        items={groups.map((group) => ({
          key: group.key,
          label: (
            <span className="diff-section-label">
              <strong>{group.label}</strong>
              <small>
                {group.rows.filter((row) => row.changed).length}{" "}
                项变更
              </small>
            </span>
          ),
          children: (
            <div className="diff-list">
              {group.rows.map((change) => (
                <DiffRow key={change.field} change={change} />
              ))}
            </div>
          )
        }))}
      />
    </section>
  );
}

type DisplayDiffRow = TeachingPlanDiffChange & {
  changed: boolean;
};

const diffGroups: Array<{
  key: string;
  label: string;
  fields: Array<keyof TeachingPlan>;
}> = [
  {
    key: "intent",
    label: "目标与重点",
    fields: ["objective", "lessonFocus"]
  },
  {
    key: "lesson",
    label: "课堂过程",
    fields: [
      "openingActivity",
      "teacherQuestions",
      "studentActivity"
    ]
  },
  {
    key: "support",
    label: "支持、检查与后续",
    fields: [
      "supportStrategy",
      "independentCheck",
      "followUp"
    ]
  },
  {
    key: "evidence",
    label: "证据引用",
    fields: ["evidenceRefs"]
  }
];

function DiffRow({ change }: { change: DisplayDiffRow }) {
  const evidenceRefs = Array.from(new Set(change.evidenceRefs));
  return (
    <article
      className={`diff-row diff-row--${change.kind}`}
      data-testid={`diff-field-${change.field}`}
    >
      <div className="diff-row__meta">
        <Text strong>{planFieldLabels[change.field]}</Text>
        <Tag color={change.changed ? "blue" : "default"}>
          {change.changed ? "已变更" : "未变更"}
        </Tag>
      </div>
      <div className="diff-columns">
        <div className="diff-before">
          <Text type="secondary">修改前</Text>
          <Paragraph>{valueText(change.before)}</Paragraph>
        </div>
        <div className="diff-after">
          <Text type="secondary">建议后</Text>
          <Paragraph>{valueText(change.after)}</Paragraph>
        </div>
      </div>
      <div className="diff-reason">
        <Text strong>原因：</Text>
        <Text>{change.reason}</Text>
      </div>
      {evidenceRefs.length ? (
        <div className="diff-evidence">
          {evidenceRefs.map((reference) => (
            <Tag key={reference} title={reference}>
              {evidenceLabel(reference)}
            </Tag>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function evidenceLabel(reference: string): string {
  if (reference.includes("observation")) {
    return `直接观察 · ${reference.split(":").at(-1)}`;
  }
  if (reference.includes("claim")) {
    return `待复核解释 · ${reference.split(":").at(-1)}`;
  }
  return "证据引用";
}
