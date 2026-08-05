import type {
  LessonJourneyProjection,
  LessonJourneyStage,
  LessonView
} from "@edu-agent/contracts";
import { Button, Tag, Typography } from "antd";

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
  ready: "可以开始",
  in_progress: "进行中",
  waiting_for_agent: "系统准备中",
  waiting_for_teacher: "等待老师判断",
  needs_attention: "需要处理",
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
        <Text className="section-kicker">
          {props.courseTitle}
          {props.unitTitle ? ` · ${props.unitTitle}` : ""}
        </Text>
        <Title level={2}>{props.lesson.title}</Title>
        <Paragraph type="secondary">
          第 {props.lesson.sequence} 课时 · {props.lesson.durationMinutes} 分钟
          {props.lesson.plannedAt
            ? ` · ${formatLessonTime(props.lesson.plannedAt)}`
            : ""}
        </Paragraph>
      </div>
      <Tag className={`journey-status-tag is-${props.journey.status}`}>
        {statusLabels[props.journey.status]}
      </Tag>
    </header>
  );
}

export function LessonNextBestActionCard(props: {
  journey: LessonJourneyProjection;
  loading?: boolean;
  onAction: () => void;
}) {
  return (
    <section
      className={`lesson-next-action is-${props.journey.status}`}
      data-testid="lesson-next-best-action"
    >
      <div className="lesson-next-action__icon" aria-hidden="true">
        <WorkspaceIcon
          name={props.journey.status === "needs_attention" ? "warning" : "insight"}
        />
      </div>
      <div className="lesson-next-action__copy">
        <Text className="section-kicker">现在需要老师决定</Text>
        <Title level={3}>{props.journey.nextBestAction.label}</Title>
        <Paragraph>{props.journey.nextBestAction.reason}</Paragraph>
        {props.journey.blockingReasons.length > 0 ? (
          <ul>
            {props.journey.blockingReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        ) : null}
      </div>
      <Button
        type="primary"
        size="large"
        loading={Boolean(props.loading)}
        onClick={props.onAction}
      >
        {props.journey.nextBestAction.label}
      </Button>
    </section>
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
