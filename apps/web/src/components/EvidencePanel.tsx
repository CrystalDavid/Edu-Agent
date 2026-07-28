import type { TeacherWorkspace } from "@edu-agent/contracts";
import { Collapse, Empty, Space, Tag, Typography } from "antd";

import { SemanticTag } from "./SemanticTag";

const { Paragraph, Text } = Typography;

export function EvidencePanel(props: {
  evidence: TeacherWorkspace["evidence"];
  compact?: boolean;
}) {
  const observations = props.compact
    ? props.evidence.observations.slice(0, 2)
    : props.evidence.observations;
  const claims = props.compact
    ? props.evidence.claims.slice(0, 2)
    : props.evidence.claims;

  if (observations.length === 0 && claims.length === 0) {
    return <Empty description="暂无学习证据" />;
  }

  return (
    <div className="evidence-stack">
      {observations.map((observation) => (
        <article
          className="semantic-card semantic-card--observation"
          key={observation.observationRef}
          data-testid="evidence-observation"
        >
          <div className="semantic-card__header">
            <Space wrap>
              <SemanticTag kind="observation" />
              <Tag>{observation.learnerLabel}</Tag>
              <Text type="secondary">
                {new Date(observation.observedAt).toLocaleString(
                  "zh-CN"
                )}
              </Text>
            </Space>
          </div>
          <Paragraph>{observation.summary}</Paragraph>
          <Collapse
            ghost
            size="small"
            items={[
              {
                key: "source",
                label: "查看来源、Assistance 与未知项",
                children: (
                  <div className="evidence-detail">
                    <dl>
                      <div>
                        <dt>来源</dt>
                        <dd>{observation.sourceRef}</dd>
                      </div>
                      <div>
                        <dt>观察类型</dt>
                        <dd>{observation.observationType}</dd>
                      </div>
                      <div>
                        <dt>Assistance</dt>
                        <dd>
                          {observation.assistance.level} ·{" "}
                          {observation.assistance.description}
                        </dd>
                      </div>
                      <div>
                        <dt>答案释放</dt>
                        <dd>
                          {observation.assistance.answerReleased
                            ? "是"
                            : "否"}
                        </dd>
                      </div>
                    </dl>
                    <Text strong>仍未知</Text>
                    <ul>
                      {observation.unknowns.map((unknown) => (
                        <li key={unknown}>{unknown}</li>
                      ))}
                    </ul>
                  </div>
                )
              }
            ]}
          />
        </article>
      ))}

      {claims.map((claim) => (
        <article
          className="semantic-card semantic-card--claim"
          key={claim.claimRef}
          data-testid="evidence-claim"
        >
          <div className="semantic-card__header">
            <Space wrap>
              <SemanticTag kind="claim" />
              <Tag color="gold">
                {claim.status === "candidate"
                  ? "待教师复核"
                  : claim.status}
              </Tag>
            </Space>
          </div>
          <Paragraph>{claim.summary}</Paragraph>
          <div className="claim-explanation">
            <Text strong>把握说明：</Text>
            <Text>{claim.confidenceExplanation}</Text>
          </div>
          <Text type="secondary">
            支持观察：{claim.supportingObservationRefs.join("、")}
          </Text>
        </article>
      ))}

      <article className="semantic-card semantic-card--estimate">
        <Space wrap>
          <SemanticTag kind="estimate" />
          <Tag>未计算</Tag>
        </Space>
        <Paragraph className="semantic-card__note">
          {props.evidence.estimateExplanation}
        </Paragraph>
      </article>
    </div>
  );
}
