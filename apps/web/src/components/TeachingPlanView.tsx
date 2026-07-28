import type {
  TeachingPlan,
  TeachingPlanDiff,
  TeachingPlanDiffChange,
  TeacherWorkspace
} from "@edu-agent/contracts";
import {
  Button,
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
  teacherSelection?: "accepted" | "modified" | null;
}) {
  return (
    <section
      className="typed-diff"
      data-testid="teaching-plan-diff"
    >
      <div className="section-heading">
        <div>
          <Text className="section-kicker">STRUCTURED DIFF</Text>
          <Title level={3}>TeachingPlan 结构化变更</Title>
        </div>
        <Space wrap>
          <Tag>{props.diff.strategyId}</Tag>
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
      <div className="diff-list">
        {props.diff.changes.map((change) => (
          <article
            className={`diff-row diff-row--${change.kind}`}
            key={change.field}
          >
            <div className="diff-row__meta">
              <Text strong>{planFieldLabels[change.field]}</Text>
              <Tag
                color={
                  change.kind === "added"
                    ? "green"
                    : change.kind === "removed"
                      ? "red"
                      : "blue"
                }
              >
                {change.kind}
              </Tag>
            </div>
            <div className="diff-columns">
              <div className="diff-before">
                <Text type="secondary">原内容</Text>
                <Paragraph>{valueText(change.before)}</Paragraph>
              </div>
              <div className="diff-after">
                <Text type="secondary">建议内容</Text>
                <Paragraph>{valueText(change.after)}</Paragraph>
              </div>
            </div>
            <div className="diff-reason">
              <Text strong>修改原因：</Text>
              <Text>{change.reason}</Text>
            </div>
            <div className="diff-evidence">
              {change.evidenceRefs.map((ref) => (
                <Tag key={ref}>{ref}</Tag>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
