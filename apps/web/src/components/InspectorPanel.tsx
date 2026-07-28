import type {
  CreateTeacherCopilotTaskResult,
  TeacherWorkspace
} from "@edu-agent/contracts";
import { Descriptions, Drawer, Space, Tag, Typography } from "antd";

import { SemanticTag } from "./SemanticTag";

const { Paragraph, Text, Title } = Typography;

export function InspectorPanel(props: {
  open: boolean;
  onClose: () => void;
  workspace: TeacherWorkspace;
  task: CreateTeacherCopilotTaskResult | null;
}) {
  const observation = props.workspace.evidence.observations[0];
  const unknowns = Array.from(
    new Set(
      props.workspace.evidence.observations.flatMap(
        (item) => item.unknowns
      )
    )
  );

  return (
    <Drawer
      title="依据与边界"
      size={440}
      open={props.open}
      onClose={props.onClose}
      placement="right"
    >
      <Space orientation="vertical" size={22} className="full-width">
        <section>
          <Space wrap>
            <SemanticTag kind="mock" />
            <SemanticTag kind="fact">合成数据</SemanticTag>
          </Space>
          <Title level={5}>本页为什么显示这些内容</Title>
          <Paragraph>
            当前视图只读取八年级 3
            班合成 CourseRun、明确对齐的学习目标、可追溯 Evidence
            及其候选 Claim。没有读取其他学校或真实学生数据。
          </Paragraph>
        </section>

        <Descriptions
          title="数据来源"
          column={1}
          size="small"
          bordered
          items={[
            {
              key: "course",
              label: "CourseRun",
              children: props.workspace.courseRun.courseRunRef
            },
            {
              key: "objective",
              label: "LearningObjective",
              children:
                props.workspace.learningObjective.objectiveRef
            },
            {
              key: "source",
              label: "示例 Evidence 来源",
              children: observation?.sourceRef ?? "暂无"
            },
            {
              key: "assistance",
              label: "Assistance",
              children: observation
                ? `${observation.assistance.level}；答案释放：${
                    observation.assistance.answerReleased
                      ? "是"
                      : "否"
                  }`
                : "暂无"
            }
          ]}
        />

        <section>
          <Title level={5}>当前未知项</Title>
          <ul className="inspector-list">
            {unknowns.map((unknown) => (
              <li key={unknown}>{unknown}</li>
            ))}
          </ul>
        </section>

        <Descriptions
          title="授权与用途"
          column={1}
          size="small"
          bordered
          items={[
            {
              key: "actor",
              label: "当前身份",
              children: props.workspace.identity.teacherName
            },
            {
              key: "purpose",
              label: "允许用途",
              children: "调整明天课堂（仅生成 Proposal）"
            },
            {
              key: "decision",
              label: "AuthorizationDecision",
              children:
                props.task?.authorizationDecisionRef ??
                "尚未创建任务"
            },
            {
              key: "model",
              label: "模型来源",
              children: (
                <Space>
                  <Tag color="purple">MockModelProvider</Tag>
                  <Text>无外部网络</Text>
                </Space>
              )
            },
            {
              key: "version",
              label: "运行版本",
              children:
                props.task?.contractRef ??
                "Gate 2 synthetic workspace@1"
            }
          ]}
        />
      </Space>
    </Drawer>
  );
}
