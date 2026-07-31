import type {
  CreateTeacherCopilotTaskResult,
  TeacherWorkspace
} from "@edu-agent/contracts";
import {
  Alert,
  Collapse,
  Descriptions,
  Drawer,
  Typography
} from "antd";

import { cleanDisplayText, shortReference } from "../presentation";

const { Paragraph, Title } = Typography;

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
      title="帮助与使用边界"
      size={440}
      open={props.open}
      onClose={props.onClose}
      placement="right"
    >
      <div className="inspector-content">
        <Alert
          type="info"
          showIcon
          title="当前使用示例数据"
          description="当前只允许合成演示数据；生成服务由服务端配置，所有建议仍仅用于本地产品演示并须由教师审阅。"
        />

        <section>
          <Title level={5}>为什么显示这些内容</Title>
          <Paragraph>
            当前视图只读取八年级 3 班、明确对齐的学习目标以及允许用于课堂调整的学习证据。
          </Paragraph>
        </section>

        <Descriptions
          title="本次使用的数据"
          column={1}
          size="small"
          items={[
            {
              key: "course",
              label: "当前课程",
              children: cleanDisplayText(
                props.workspace.courseRun.className
              )
            },
            {
              key: "objective",
              label: "教学目标",
              children: props.workspace.learningObjective.title
            },
            {
              key: "source",
              label: "示例来源",
              children: observation
                ? shortReference(observation.sourceRef)
                : "暂无"
            },
            {
              key: "assistance",
              label: "辅助情况",
              children: observation?.assistance.description ?? "暂无"
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
          title="教师控制"
          column={1}
          size="small"
          items={[
            {
              key: "actor",
              label: "当前教师",
              children: cleanDisplayText(
                props.workspace.identity.teacherName
              )
            },
            {
              key: "purpose",
              label: "允许用途",
              children: "调整明天课堂并生成可审查的建议草稿"
            },
            {
              key: "boundary",
              label: "系统边界",
              children: "不能自动发布，也不能把建议写成已实施事实"
            }
          ]}
        />

        <Collapse
          className="technical-disclosure"
          items={[
            {
              key: "technical",
              label: "查看技术详情",
              children: (
                <dl className="detail-list">
                  <div>
                    <dt>CourseRun</dt>
                    <dd>{props.workspace.courseRun.courseRunRef}</dd>
                  </div>
                  <div>
                    <dt>LearningObjective</dt>
                    <dd>
                      {props.workspace.learningObjective.objectiveRef}
                    </dd>
                  </div>
                  <div>
                    <dt>AuthorizationDecision</dt>
                    <dd>
                      {props.task?.authorizationDecisionRef ??
                        "尚未创建任务"}
                    </dd>
                  </div>
                  <div>
                    <dt>Contract</dt>
                    <dd>{props.task?.contractRef ?? "尚未创建任务"}</dd>
                  </div>
                </dl>
              )
            }
          ]}
        />
      </div>
    </Drawer>
  );
}
