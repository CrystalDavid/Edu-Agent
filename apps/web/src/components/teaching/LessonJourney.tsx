import type {
  LessonJourneyProjection,
  LessonJourneyStage,
  LessonView
} from "@edu-agent/contracts";
import { Typography } from "antd";

import { WorkspaceIcon } from "../WorkspaceIcon";

const { Paragraph, Text, Title } = Typography;

const stageOrder: readonly LessonJourneyStage[] = [
  "understand",
  "plan",
  "materials",
  "deliver",
  "reflect",
  "improve"
];

const stageLabels: Record<LessonJourneyStage, string> = {
  understand: "看懂本课",
  plan: "定方案",
  materials: "备材料",
  deliver: "课堂反馈",
  reflect: "课后复盘",
  improve: "推动下一课"
};

const statusLabels: Record<LessonJourneyProjection["status"], string> = {
  ready: "未完成",
  in_progress: "进行中",
  waiting_for_agent: "进行中",
  waiting_for_teacher: "进行中",
  needs_attention: "未完成",
  completed: "已完成"
};

export function LessonContextHeader(props: {
  courseTitle: string;
  unitTitle: string | null;
  lesson: LessonView;
  journey: LessonJourneyProjection;
}) {
  return (
    <header className="lesson-context-header" data-testid="lesson-context-header">
      <div>
        <Title level={2}>{props.lesson.title}</Title>
        <Paragraph type="secondary">
          {props.courseTitle} · 第 {props.lesson.sequence} 课时 · {props.lesson.durationMinutes} 分钟
          {props.lesson.plannedAt
            ? ` · ${formatLessonTime(props.lesson.plannedAt)}`
            : ""}
        </Paragraph>
      </div>
    </header>
  );
}

export function LessonJourney(props: {
  journey: LessonJourneyProjection;
}) {
  const currentIndex = stageOrder.indexOf(props.journey.currentStage);
  const completedStageCount =
    currentIndex + (props.journey.status === "completed" ? 1 : 0);
  return (
    <section className="lesson-journey" data-testid="lesson-journey">
      <header>
        <div>
          <Text className="section-kicker">本课教学旅程</Text>
          <Title level={4}>系统准备，老师判断</Title>
        </div>
        <Text type="secondary">
          已完成 {Math.max(completedStageCount, 0)} / {stageOrder.length} 个阶段
        </Text>
      </header>
      <ol>
        {stageOrder.map((stage, index) => {
          const complete =
            index < currentIndex ||
            (index === currentIndex && props.journey.status === "completed");
          const current = index === currentIndex && !complete;
          return (
            <li
              key={stage}
              className={complete ? "is-complete" : current ? "is-current" : "is-upcoming"}
              aria-current={current ? "step" : undefined}
            >
              <span className="lesson-journey__marker">
                {complete ? <WorkspaceIcon name="check" /> : index + 1}
              </span>
              <span>
                <strong>{stageLabels[stage]}</strong>
                <small>
                  {current ? statusLabels[props.journey.status] : complete ? "已完成" : "尚未开始"}
                </small>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function formatLessonTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}
