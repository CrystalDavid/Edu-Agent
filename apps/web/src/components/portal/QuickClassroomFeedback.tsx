import { useEffect, useState, type ReactNode } from "react";

import type {
  ClassroomFeedbackObservationCandidate,
  ClassroomFeedbackRunView,
  QuickClassroomSection
} from "@edu-agent/contracts";
import {
  Alert,
  Button,
  Checkbox,
  Input,
  Segmented,
  Typography
} from "antd";

import {
  generateClassroomFeedback,
  loadLatestClassroomFeedback
} from "../../api";
import { cleanDisplayText } from "../../presentation";
import { StatusPill } from "./PortalPrimitives";

const { Paragraph, Text } = Typography;

type Mode = "generate" | "draft" | "confirmed";

const sectionOptions: Array<{
  label: string;
  value: QuickClassroomSection;
}> = [
  { label: "导入", value: "opening" },
  { label: "讲解", value: "explanation" },
  { label: "活动", value: "activity" },
  { label: "练习", value: "practice" },
  { label: "总结", value: "summary" }
];

export function QuickClassroomFeedback(props: {
  courseRunRef: string;
  lessonRef: string;
  approvedTeachingPlanRevisionRef: string;
  mode: Mode;
  onGenerated: (message: string) => void;
  onRefresh: () => Promise<void>;
  onUseCandidate?: (
    candidate: ClassroomFeedbackObservationCandidate
  ) => void;
}) {
  const [overall, setOverall] = useState<
    "as_planned" | "adjusted" | "incomplete"
  >("as_planned");
  const [pace, setPace] = useState<"on_pace" | "slower" | "faster">(
    "on_pace"
  );
  const [studentResponse, setStudentResponse] = useState<
    "attained" | "partial_difficulty" | "needs_review"
  >("attained");
  const [abnormalSections, setAbnormalSections] = useState<
    QuickClassroomSection[]
  >([]);
  const [note, setNote] = useState("");
  const [latest, setLatest] = useState<ClassroomFeedbackRunView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadLatestClassroomFeedback(props.lessonRef)
      .then((result) => {
        if (!cancelled) setLatest(result.item);
      })
      .catch((caught: unknown) => {
        if (!cancelled && props.mode !== "generate") {
          setError(errorMessage(caught));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [props.lessonRef, props.mode]);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const result = await generateClassroomFeedback({
        courseRunRef: props.courseRunRef,
        lessonRef: props.lessonRef,
        expectedApprovedTeachingPlanRevisionRef:
          props.approvedTeachingPlanRevisionRef,
        overall,
        pace,
        studentResponse,
        abnormalSections,
        note: note.trim() || null,
        purpose: "lesson-delivery.quick-feedback.generate",
        idempotencyKey: `ui:classroom-feedback:${crypto.randomUUID()}`
      });
      setLatest(result);
      props.onGenerated(
        "课堂反馈已整理为草稿；只有教师确认后才会成为正式课堂记录"
      );
      await props.onRefresh();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  const currentLatest =
    latest?.teachingPlanRevisionRef ===
    props.approvedTeachingPlanRevisionRef
      ? latest
      : null;

  if (props.mode === "generate") {
    return (
      <div
        className="quick-classroom-feedback"
        data-testid="quick-classroom-feedback"
      >
        <div className="quick-classroom-feedback__intro">
          <Text strong>课堂记录</Text>
        </div>

        {error ? (
          <Alert
            type="error"
            showIcon
            title="课堂反馈整理失败"
            description={error}
          />
        ) : null}

        <div className="quick-classroom-feedback__primary-questions">
          <FeedbackQuestion label="完成情况">
            <Segmented
              data-testid="classroom-feedback-overall"
              block
              value={overall}
              onChange={(value) => setOverall(value as typeof overall)}
              options={[
                { label: "按计划", value: "as_planned" },
                { label: "有调整", value: "adjusted" },
                { label: "未完成", value: "incomplete" }
              ]}
            />
          </FeedbackQuestion>

          <FeedbackQuestion label="课堂节奏">
            <Segmented
              data-testid="classroom-feedback-pace"
              block
              value={pace}
              onChange={(value) => setPace(value as typeof pace)}
              options={[
                { label: "正常", value: "on_pace" },
                { label: "偏慢", value: "slower" },
                { label: "偏快", value: "faster" }
              ]}
            />
          </FeedbackQuestion>

          <FeedbackQuestion label="学生反应">
            <Segmented
              data-testid="classroom-feedback-student-response"
              block
              value={studentResponse}
              onChange={(value) =>
                setStudentResponse(value as typeof studentResponse)
              }
              options={[
                { label: "达成", value: "attained" },
                { label: "有困难", value: "partial_difficulty" },
                { label: "需复习", value: "needs_review" }
              ]}
            />
          </FeedbackQuestion>
        </div>

        <details className="quick-classroom-feedback__more">
          <summary>补充情况（可选）</summary>
          <FeedbackQuestion label="调整环节">
            <Checkbox.Group
              data-testid="classroom-feedback-abnormal-sections"
              className="quick-classroom-feedback__sections"
              value={abnormalSections}
              options={sectionOptions}
              onChange={(values) =>
                setAbnormalSections(values as QuickClassroomSection[])
              }
            />
          </FeedbackQuestion>

          <FeedbackQuestion label="补充说明">
            <Input.TextArea
              data-testid="classroom-feedback-note"
              aria-label="课堂反馈补充"
              value={note}
              autoSize={{ minRows: 1, maxRows: 5 }}
              maxLength={500}
              placeholder="例如：例题二比预期多用了 8 分钟"
              onChange={(event) => setNote(event.target.value)}
            />
          </FeedbackQuestion>
        </details>

        <div className="quick-classroom-feedback__actions">
          <Button
            type="primary"
            loading={loading}
            onClick={() => void submit()}
            data-testid="generate-classroom-feedback"
          >
            生成课堂记录
          </Button>
        </div>
      </div>
    );
  }

  if (!currentLatest) return null;

  return (
    <div
      className="classroom-feedback-result"
      data-testid="classroom-feedback-result"
    >
      {error ? <Alert type="warning" showIcon title={error} /> : null}
      <div className="classroom-feedback-result__header">
        <div>
          <Text strong>课堂记录</Text>
          <Paragraph>{cleanDisplayText(currentLatest.deliverySummary)}</Paragraph>
        </div>
        <StatusPill tone={props.mode === "confirmed" ? "success" : "warning"}>
          {props.mode === "confirmed" ? "已完成" : "进行中"}
        </StatusPill>
      </div>

      {currentLatest.observationCandidates.length > 0 ? (
        <div className="classroom-feedback-candidates">
          <Text strong>课堂观察</Text>
          {currentLatest.observationCandidates.map((candidate) => (
            <div key={candidate.candidateId}>
              <span>{cleanDisplayText(candidate.content)}</span>
              {props.mode === "confirmed" && props.onUseCandidate ? (
                <Button
                  size="small"
                  onClick={() => props.onUseCandidate?.(candidate)}
                  data-testid="use-observation-candidate"
                >
                  添加
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

    </div>
  );
}

function FeedbackQuestion(props: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="quick-classroom-feedback__question">
      <label>{props.label}</label>
      {props.hint ? <small>{props.hint}</small> : null}
      {props.children}
    </div>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "未知错误";
}
