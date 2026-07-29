import type { TeacherWorkspace } from "@edu-agent/contracts";
import { Collapse, Empty, Tag } from "antd";

import {
  claimStateLabel,
  cleanDisplayText,
  formatDisplayDate,
  shortReference
} from "../presentation";

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

  const unknowns = Array.from(
    new Set(observations.flatMap((item) => item.unknowns))
  );

  return (
    <div className="evidence-sections">
      <section className="evidence-section" aria-labelledby="observations-heading">
        <div className="evidence-section__heading">
          <span className="evidence-section__icon evidence-section__icon--orange" aria-hidden="true">●</span>
          <div>
            <h2 id="observations-heading">直接观察</h2>
            <p>学生在具体任务中实际做了什么</p>
          </div>
          <span>{observations.length} 条</span>
        </div>
        <div className="evidence-records">
          {observations.map((observation) => (
            <article
              className="evidence-record"
              key={observation.observationRef}
              data-testid="evidence-observation"
            >
              <div className="evidence-record__student">
                <span>
                  {cleanDisplayText(observation.learnerLabel)
                    .replace("学生 ", "")
                    .slice(-2)}
                </span>
                <div>
                  <strong>{cleanDisplayText(observation.learnerLabel)}</strong>
                  <small>{formatDisplayDate(observation.observedAt)}</small>
                </div>
              </div>
              <div className="evidence-record__body">
                <span className="record-label">一次函数图像判断任务</span>
                <p>{cleanDisplayText(observation.summary)}</p>
              </div>
              <div className="evidence-record__status">
                <Tag>
                  {observation.assistance.answerReleased
                    ? "使用辅助"
                    : "未释放答案"}
                </Tag>
              </div>
              <Collapse
                ghost
                size="small"
                className="record-details"
                items={[
                  {
                    key: "details",
                    label: "查看来源与允许用途",
                    children: (
                      <dl className="detail-list">
                        <div>
                          <dt>数据来源</dt>
                          <dd>{shortReference(observation.sourceRef)}</dd>
                        </div>
                        <div>
                          <dt>辅助情况</dt>
                          <dd>
                            {cleanDisplayText(
                              observation.assistance.description
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt>关联目标</dt>
                          <dd>解释斜率与图像陡峭程度的关系</dd>
                        </div>
                        <div>
                          <dt>允许用途</dt>
                          <dd>课堂复评与教学建议；不得形成能力定论</dd>
                        </div>
                      </dl>
                    )
                  }
                ]}
              />
            </article>
          ))}
        </div>
      </section>

      <section className="evidence-section" aria-labelledby="claims-heading">
        <div className="evidence-section__heading">
          <span className="evidence-section__icon evidence-section__icon--purple" aria-hidden="true">◆</span>
          <div>
            <h2 id="claims-heading">待复核解释</h2>
            <p>基于观察形成、仍需教师判断的暂时理解</p>
          </div>
          <span>{claims.length} 条</span>
        </div>
        <div className="claim-grid">
          {claims.map((claim) => (
            <article
              className="claim-card"
              key={claim.claimRef}
              data-testid="evidence-claim"
            >
              <div>
                <Tag color="gold">{claimStateLabel(claim.status)}</Tag>
                <time>{formatDisplayDate(claim.validFrom)}</time>
              </div>
              <p>{cleanDisplayText(claim.summary)}</p>
              <small>
                {cleanDisplayText(claim.confidenceExplanation)}
              </small>
              <Collapse
                ghost
                size="small"
                className="record-details"
                items={[
                  {
                    key: "support",
                    label: "查看支持依据",
                    children: (
                      <ul className="compact-list">
                        {claim.supportingObservationRefs.map(
                          (reference) => (
                            <li key={reference}>
                              {shortReference(reference)}
                            </li>
                          )
                        )}
                      </ul>
                    )
                  }
                ]}
              />
            </article>
          ))}
        </div>
      </section>

      <div className="evidence-bottom-grid">
        <section className="evidence-section compact-evidence-section">
          <div className="evidence-section__heading">
            <span className="evidence-section__icon evidence-section__icon--blue" aria-hidden="true">?</span>
            <div>
              <h2>证据缺口</h2>
              <p>目前还不能回答的问题</p>
            </div>
          </div>
          <ul className="gap-list">
            {unknowns.map((unknown) => (
              <li key={unknown}>{cleanDisplayText(unknown)}</li>
            ))}
          </ul>
        </section>

        <section className="evidence-section compact-evidence-section">
          <div className="evidence-section__heading">
            <span className="evidence-section__icon evidence-section__icon--cyan" aria-hidden="true">↗</span>
            <div>
              <h2>辅助情况</h2>
              <p>区分受助表现和独立表现</p>
            </div>
          </div>
          <ul className="assistance-list">
            {observations.map((observation) => (
              <li key={observation.observationRef}>
                <strong>{cleanDisplayText(observation.learnerLabel)}</strong>
                <span>
                  {cleanDisplayText(
                    observation.assistance.description
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
