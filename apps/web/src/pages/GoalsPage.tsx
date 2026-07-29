import type { TeacherWorkspace } from "@edu-agent/contracts";
import {
  Card,
  Collapse,
  Progress,
  Steps,
  Tag,
  Typography
} from "antd";

import { designTokens } from "../design-tokens";

const { Paragraph, Text, Title } = Typography;

export function GoalsPage(props: {
  workspace: TeacherWorkspace;
}) {
  return (
    <div className="page-stack goals-page">
      <header className="page-header">
        <div>
          <span className="page-icon page-icon--blue" aria-hidden="true">◎</span>
          <div>
            <Title>教学目标</Title>
            <Paragraph>
              围绕多次课堂观察持续改进，不用一次结果定义学生。
            </Paragraph>
          </div>
        </div>
        <Tag color="processing">持续进行</Tag>
      </header>

      <section className="goal-hero dashboard-card">
        <div>
          <Text type="secondary">当前改进方向</Text>
          <Title level={2}>{props.workspace.goal.title}</Title>
          <Paragraph>
            {props.workspace.teachingImprovementCase.title}
          </Paragraph>
        </div>
        <div className="goal-coverage">
          <strong>2 / 5</strong>
          <span>成功标准已有证据支持</span>
          <Progress
            percent={42}
            showInfo={false}
            strokeColor={designTokens.colorBrand}
          />
          <small>覆盖度不等同于学生掌握度</small>
        </div>
      </section>

      <div className="goal-layout">
        <Card className="workspace-card" variant="borderless">
          <div className="section-heading">
            <div>
              <span className="section-kicker">成功标准</span>
              <Title level={3}>我们希望看到什么</Title>
            </div>
          </div>
          <ul className="criteria-list">
            {props.workspace.goal.successCriteria.map((criterion) => (
              <li key={criterion}>{criterion}</li>
            ))}
          </ul>
        </Card>

        <Card className="workspace-card" variant="borderless">
          <div className="section-heading">
            <div>
              <span className="section-kicker">连续工作</span>
              <Title level={3}>从观察到复评</Title>
            </div>
          </div>
          <Steps
            orientation="vertical"
            current={1}
            items={[
              {
                title: "收集直接观察",
                content: "记录学生在具体任务中的实际表现"
              },
              {
                title: "形成待复核解释",
                content: "区分已有证据、未知项和辅助条件"
              },
              {
                title: "试用课堂策略",
                content: "由教师判断并调整建议草稿"
              },
              {
                title: "采集后续证据",
                content: "在新情境中重新检查，而不是固化结论"
              }
            ]}
          />
        </Card>
      </div>

      <Collapse
        className="technical-disclosure"
        items={[
          {
            key: "references",
            label: "查看技术引用",
            children: (
              <dl className="detail-list">
                <div>
                  <dt>改进事项引用</dt>
                  <dd>{props.workspace.teachingImprovementCase.caseRef}</dd>
                </div>
                <div>
                  <dt>教学目标引用</dt>
                  <dd>{props.workspace.goal.goalRef}</dd>
                </div>
              </dl>
            )
          }
        ]}
      />
    </div>
  );
}
