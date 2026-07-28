import type { TeacherWorkspace } from "@edu-agent/contracts";
import { Button, Card, Space, Tag, Typography } from "antd";

import { SemanticTag } from "../components/SemanticTag";
import type { AppRoute } from "../route";

const { Paragraph, Text, Title } = Typography;

export function DashboardPage(props: {
  workspace: TeacherWorkspace;
  navigate: (route: AppRoute) => void;
  openInspector: () => void;
}) {
  const observation = props.workspace.evidence.observations[0];
  const claim = props.workspace.evidence.claims[0];
  const pending = props.workspace.pendingSuggestions.filter(
    (item) => item.status === "pending"
  ).length;

  return (
    <div className="page-stack dashboard-page">
      <section className="focus-card">
        <div className="focus-card__body">
          <Space wrap size={8}>
            <Text className="section-kicker">明日教学焦点</Text>
            <SemanticTag kind="fact">当前 CourseRun</SemanticTag>
          </Space>
          <Title>
            明天的课，先解决“斜率”为什么改变图像
          </Title>
          <Paragraph>
            两条直接观察提示：学生可能会判断结果，却仍把截距位置当成斜率大小依据。
            这只是待复核解释，不是能力定论。
          </Paragraph>
          <Space wrap>
            <Button
              type="primary"
              onClick={() => props.navigate("/copilot")}
            >
              打开教师助手
            </Button>
            <Button onClick={() => props.navigate("/evidence")}>
              查看学习证据
            </Button>
            <Button type="text" onClick={props.openInspector}>
              为什么显示这些内容
            </Button>
          </Space>
        </div>
        <aside className="focus-card__signal" aria-label="当前证据缺口">
          <span>当前主要证据缺口</span>
          <strong>缺少新情境中的独立解释</strong>
          <small>需要课堂复评，不自动生成学生状态结论</small>
        </aside>
      </section>

      <section aria-labelledby="today-heading">
        <div className="section-heading">
          <div>
            <Text className="section-kicker">TODAY</Text>
            <Title id="today-heading" level={2}>
              今天需要处理
            </Title>
          </div>
        </div>
        <div className="attention-grid">
          <button
            type="button"
            onClick={() => props.navigate("/evidence")}
          >
            <span className="attention-grid__count">
              {props.workspace.evidence.claims.length}
            </span>
            <strong>待复核解释</strong>
            <small>候选 EvidenceClaim</small>
          </button>
          <button
            type="button"
            onClick={() => props.navigate("/copilot")}
          >
            <span className="attention-grid__count">{pending}</span>
            <strong>待处理建议</strong>
            <small>Proposal only</small>
          </button>
          <button
            type="button"
            onClick={() => props.navigate("/teaching-plan")}
          >
            <span className="attention-grid__count">
              {props.workspace.latestTeachingPlan.state ===
              "in_review"
                ? 1
                : 0}
            </span>
            <strong>待审教学计划</strong>
            <small>TeachingPlan Revision</small>
          </button>
          <button
            type="button"
            onClick={() => props.navigate("/goals")}
          >
            <span className="attention-grid__count">1</span>
            <strong>即将复评的目标</strong>
            <small>教师教学改进 Goal</small>
          </button>
        </div>
      </section>

      <div className="dashboard-grid dashboard-grid--context">
        <Card className="workspace-card" variant="borderless">
          <div className="section-heading">
            <div>
              <Text className="section-kicker">COURSE & GOAL</Text>
              <Title level={3}>当前课程与教学目标</Title>
            </div>
            <Button
              type="link"
              onClick={() => props.navigate("/goals")}
            >
              查看详情
            </Button>
          </div>
          <div className="course-goal-grid">
            <article>
              <Text type="secondary">当前课程</Text>
              <Title level={4}>
                {props.workspace.courseRun.className} ·{" "}
                {props.workspace.courseRun.subject}
              </Title>
              <Paragraph>
                {props.workspace.learningObjective.title}
              </Paragraph>
            </article>
            <article>
              <SemanticTag kind="fact">教师个人 Goal</SemanticTag>
              <Title level={4}>{props.workspace.goal.title}</Title>
              <Paragraph>
                目前已有方向判断与解释缺口证据；仍需收集不提供答案时的迁移解释。
              </Paragraph>
              <Tag>证据覆盖：部分</Tag>
              <Text type="secondary">
                不表示学生“完成”或“已掌握”
              </Text>
            </article>
          </div>
        </Card>

        <Card className="workspace-card plan-preview" variant="borderless">
          <div className="section-heading">
            <div>
              <Text className="section-kicker">TEACHING PLAN</Text>
              <Title level={3}>最近教学计划</Title>
            </div>
            <Tag>{props.workspace.latestTeachingPlan.state}</Tag>
          </div>
          <div className="revision-summary">
            <span>
              Revision{" "}
              {props.workspace.latestTeachingPlan.revisionNumber}
            </span>
            <strong>
              {props.workspace.latestTeachingPlan.title}
            </strong>
            <p>
              {
                props.workspace.latestTeachingPlan.content
                  .lessonFocus
              }
            </p>
          </div>
          <Button
            block
            onClick={() => props.navigate("/teaching-plan")}
          >
            查看版本与 Diff
          </Button>
        </Card>
      </div>

      <Card className="workspace-card" variant="borderless">
        <div className="section-heading">
          <div>
            <Text className="section-kicker">LEARNING EVIDENCE</Text>
            <Title level={3}>学习证据摘要</Title>
          </div>
          <Button
            type="link"
            onClick={() => props.navigate("/evidence")}
          >
            查看全部
          </Button>
        </div>
        <div className="evidence-summary-grid">
          <article>
            <SemanticTag kind="observation">直接观察</SemanticTag>
            <p>{observation?.summary ?? "暂无直接观察"}</p>
            <small>
              Assistance：{observation?.assistance.description ?? "无"}
            </small>
          </article>
          <article>
            <SemanticTag kind="claim">待复核解释</SemanticTag>
            <p>{claim?.summary ?? "暂无候选解释"}</p>
            <small>需要教师结合课堂观察复核</small>
          </article>
          <article>
            <SemanticTag kind="estimate">证据缺口</SemanticTag>
            <p>
              {observation?.unknowns[0] ??
                "尚未获得独立表现证据"}
            </p>
            <small>不计算 LearnerStateEstimate</small>
          </article>
          <article>
            <SemanticTag kind="fact">表现条件</SemanticTag>
            <p>
              现有样本包含受助表现；独立迁移表现仍需下一轮采集。
            </p>
            <small>用条件描述，不给学生贴标签</small>
          </article>
        </div>
      </Card>
    </div>
  );
}
