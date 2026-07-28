import type { TeacherWorkspace } from "@edu-agent/contracts";
import {
  Card,
  Descriptions,
  Progress,
  Space,
  Steps,
  Tag,
  Typography
} from "antd";

import { SemanticTag } from "../components/SemanticTag";

const { Paragraph, Text, Title } = Typography;

export function GoalsPage(props: {
  workspace: TeacherWorkspace;
}) {
  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <Text className="section-kicker">TEACHING IMPROVEMENT</Text>
          <Title>教学改进 Goal</Title>
          <Paragraph>
            Goal 跨越多次 Task 持续存在；当前 Teacher Copilot
            任务只贡献一次可审查的课堂调整建议。
          </Paragraph>
        </div>
        <Space>
          <Tag color="green">active</Tag>
          <SemanticTag kind="fact">长期状态</SemanticTag>
        </Space>
      </header>

      <Card className="workspace-card" variant="borderless">
        <Descriptions
          column={1}
          size="middle"
          items={[
            {
              key: "case",
              label: "TeachingImprovementCase",
              children: props.workspace.teachingImprovementCase.title
            },
            {
              key: "case-ref",
              label: "Case ref",
              children:
                props.workspace.teachingImprovementCase.caseRef
            },
            {
              key: "goal",
              label: "Goal",
              children: props.workspace.goal.title
            },
            {
              key: "goal-ref",
              label: "Goal ref",
              children: props.workspace.goal.goalRef
            }
          ]}
        />
      </Card>

      <div className="goal-layout">
        <Card className="workspace-card" variant="borderless">
          <Text className="section-kicker">SUCCESS CRITERIA</Text>
          <Title level={3}>成功标准</Title>
          <ul className="criteria-list">
            {props.workspace.goal.successCriteria.map((criterion) => (
              <li key={criterion}>{criterion}</li>
            ))}
          </ul>
          <Progress
            percent={42}
            strokeColor="#177a6b"
            format={() => "证据覆盖 2 / 5"}
          />
          <Paragraph type="secondary">
            覆盖度不能直接优化为“越高越好”，也不等同于学生掌握度。
          </Paragraph>
        </Card>

        <Card className="workspace-card" variant="borderless">
          <Text className="section-kicker">CONTINUITY</Text>
          <Title level={3}>连续工作脉络</Title>
          <Steps
            orientation="vertical"
            current={1}
            items={[
              {
                title: "观察",
                content: "收集合成 Attempt 与 EvidenceObservation"
              },
              {
                title: "形成候选理解",
                content: "EvidenceClaim 等待教师复核"
              },
              {
                title: "试用课堂策略",
                content: "本轮仅生成 Proposal 与 TeachingPlan Diff"
              },
              {
                title: "收集后续证据",
                content: "尚未实施，不能写成教学事实"
              }
            ]}
          />
        </Card>
      </div>
    </div>
  );
}
