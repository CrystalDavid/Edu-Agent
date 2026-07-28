import type { TeacherWorkspace } from "@edu-agent/contracts";
import {
  Button,
  Card,
  Col,
  Progress,
  Row,
  Space,
  Statistic,
  Tag,
  Typography
} from "antd";

import { EvidencePanel } from "../components/EvidencePanel";
import { SemanticTag } from "../components/SemanticTag";
import type { AppRoute } from "../route";

const { Paragraph, Text, Title } = Typography;

export function DashboardPage(props: {
  workspace: TeacherWorkspace;
  navigate: (route: AppRoute) => void;
  openInspector: () => void;
}) {
  const pending = props.workspace.pendingSuggestions.filter(
    (item) => item.status === "pending"
  ).length;

  return (
    <div className="page-stack">
      <section className="workspace-hero">
        <div>
          <Space wrap>
            <span className="today-marker">今日工作台</span>
            <SemanticTag kind="fact">CourseRun</SemanticTag>
          </Space>
          <Title>
            明天的课，先解决“斜率”为什么改变图像
          </Title>
          <Paragraph>
            系统整理了近期合成作答中的两类证据，但没有替你作出教学决定。
            你可以查看依据，再决定是否启动课堂调整任务。
          </Paragraph>
          <Space wrap>
            <Button
              type="primary"
              size="large"
              onClick={() => props.navigate("/copilot")}
            >
              打开 Teacher Copilot
            </Button>
            <Button size="large" onClick={props.openInspector}>
              查看数据依据
            </Button>
          </Space>
        </div>
        <div className="hero-signal" aria-label="当前教学信号">
          <span className="hero-signal__label">当前信号</span>
          <strong>解释证据不足</strong>
          <span>不是能力定论</span>
        </div>
      </section>

      <Row gutter={[18, 18]}>
        <Col xs={24} xl={15}>
          <Card className="workspace-card" variant="borderless">
            <div className="section-heading">
              <div>
                <Text className="section-kicker">CURRENT CONTEXT</Text>
                <Title level={3}>课程与教学改进目标</Title>
              </div>
              <Button
                type="link"
                onClick={() => props.navigate("/goals")}
              >
                查看 Goal
              </Button>
            </div>
            <div className="context-grid">
              <div>
                <Text type="secondary">CourseRun</Text>
                <Title level={4}>
                  {props.workspace.courseRun.className} ·{" "}
                  {props.workspace.courseRun.subject}
                </Title>
                <Paragraph>
                  {props.workspace.learningObjective.title}
                </Paragraph>
              </div>
              <div className="goal-block">
                <SemanticTag kind="fact">长期 Goal</SemanticTag>
                <Title level={4}>{props.workspace.goal.title}</Title>
                <Progress
                  percent={42}
                  showInfo={false}
                  strokeColor="#177a6b"
                  railColor="#e8ecea"
                />
                <Text type="secondary">
                  进度仅表示当前证据覆盖，不代表学生能力完成度
                </Text>
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={24} xl={9}>
          <Card className="workspace-card signal-card" variant="borderless">
            <Text className="section-kicker">AT A GLANCE</Text>
            <Row gutter={[12, 20]}>
              <Col span={12}>
                <Statistic
                  title="EvidenceObservation"
                  value={props.workspace.evidence.observations.length}
                />
              </Col>
              <Col span={12}>
                <Statistic
                  title="候选 EvidenceClaim"
                  value={props.workspace.evidence.claims.length}
                />
              </Col>
              <Col span={12}>
                <Statistic title="待处置建议" value={pending} />
              </Col>
              <Col span={12}>
                <Statistic
                  title="TeachingPlan Revision"
                  value={
                    props.workspace.latestTeachingPlan.revisionNumber
                  }
                  prefix="v"
                />
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>

      <Row gutter={[18, 18]}>
        <Col xs={24} xl={15}>
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
                查看全部证据
              </Button>
            </div>
            <EvidencePanel
              evidence={props.workspace.evidence}
              compact
            />
          </Card>
        </Col>
        <Col xs={24} xl={9}>
          <Card className="workspace-card plan-preview" variant="borderless">
            <div className="section-heading">
              <div>
                <Text className="section-kicker">TEACHING PLAN</Text>
                <Title level={3}>最近版本</Title>
              </div>
              <Tag>{props.workspace.latestTeachingPlan.state}</Tag>
            </div>
            <SemanticTag kind="artifact">TeachingPlan</SemanticTag>
            <Title level={4}>
              {props.workspace.latestTeachingPlan.title}
            </Title>
            <Paragraph ellipsis={{ rows: 4 }}>
              {props.workspace.latestTeachingPlan.content.lessonFocus}
              {"；"}
              {
                props.workspace.latestTeachingPlan.content
                  .independentCheck
              }
            </Paragraph>
            <Button
              block
              onClick={() => props.navigate("/teaching-plan")}
            >
              查看 Revision
            </Button>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
