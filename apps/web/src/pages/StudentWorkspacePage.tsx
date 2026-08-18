import { useEffect, useMemo, useState } from "react";

import type {
  ClassroomObservationRevision,
  CourseRunEnrollment,
  CourseRunView,
  LearnerRecentEvidence
} from "@edu-agent/contracts";
import { Alert, Button, Empty, Spin, Tag } from "antd";

import {
  loadClassroomObservations,
  loadCourseRunEnrollments,
  loadCourseRuns,
  loadCurriculumUnits,
  loadLearnerEvidence,
  loadLessons
} from "../api";
import { StatusPill } from "../components/portal/PortalPrimitives";
import { cleanDisplayText } from "../presentation";
import type { AppRoute } from "../route";

type StudentDetailTab = "assignments" | "evidence" | "observations";

const anonymizedLearnerNames = [
  "陈思远",
  "林雨桐",
  "周子涵",
  "赵文博",
  "苏安然",
  "吴嘉宁",
  "郑语辰",
  "许清越",
  "沈知夏",
  "何景明",
  "梁可欣",
  "唐宇轩"
] as const;

export function StudentWorkspacePage(props: {
  navigate: (route: AppRoute) => void;
  onAction: (message: string) => void;
}) {
  const [course, setCourse] = useState<CourseRunView | null>(null);
  const [enrollments, setEnrollments] = useState<CourseRunEnrollment[]>([]);
  const [selectedLearnerRef, setSelectedLearnerRef] = useState<string | null>(null);
  const [learnerView, setLearnerView] = useState<LearnerRecentEvidence | null>(null);
  const [lessonRefs, setLessonRefs] = useState<string[]>([]);
  const [classroomObservations, setClassroomObservations] = useState<ClassroomObservationRevision[]>([]);
  const [detailTab, setDetailTab] = useState<StudentDetailTab>("assignments");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const selectedEnrollment = useMemo(
    () => enrollments.find((item) => item.learnerRef === selectedLearnerRef) ?? null,
    [enrollments, selectedLearnerRef]
  );
  const selectedEnrollmentIndex = useMemo(
    () => enrollments.findIndex((item) => item.learnerRef === selectedLearnerRef),
    [enrollments, selectedLearnerRef]
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    void loadCourseRuns()
      .then(async (result) => {
        const current = result.items[0] ?? null;
        if (!active) return;
        setCourse(current);
        if (!current) return;
        const enrollmentResult = await loadCourseRunEnrollments(current.courseRunRef);
        if (!active) return;
        setEnrollments(enrollmentResult.items);
        const units = await loadCurriculumUnits(current.courseRunRef);
        const lessonResults = await Promise.all(units.items.map((unit) => loadLessons(unit.unitRef)));
        if (!active) return;
        setLessonRefs(lessonResults.flatMap((item) => item.items.map((lesson) => lesson.lessonRef)));
        setSelectedLearnerRef((existing) =>
          existing && enrollmentResult.items.some((item) => item.learnerRef === existing)
            ? existing
            : enrollmentResult.items[0]?.learnerRef ?? null
        );
      })
      .catch((caught) => {
        if (active) setError(errorMessage(caught));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!course || !selectedLearnerRef) {
      setLearnerView(null);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    void Promise.all([
      loadLearnerEvidence(course.courseRunRef, selectedLearnerRef),
      Promise.all(lessonRefs.map((lessonRef) => loadClassroomObservations({ lessonRef, learnerRef: selectedLearnerRef })))
    ])
      .then(([result, observations]) => {
        if (active) {
          setLearnerView(result);
          setClassroomObservations(observations.flatMap((item) => item.items).filter((item) => item.status === "confirmed"));
        }
      })
      .catch((caught) => {
        if (active) setError(errorMessage(caught));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [course, lessonRefs, selectedLearnerRef]);

  return (
    <div className="portal-page students-page" data-testid="students-page">
      {error ? (
        <Alert type="error" showIcon title="近期学习情况加载失败" description={error} closable onClose={() => setError(null)} />
      ) : null}
      <Spin spinning={loading}>
        {!course ? (
          <Empty description="当前没有可用课程" />
        ) : (
          <div className="students-workspace">
            <aside className="student-roster-panel">
              <h2>{studentCourseTitle(course.title)}</h2>
              <p>{enrollments.length} 人</p>
              <div className="student-roster-list" data-testid="real-student-list">
                {enrollments.map((enrollment, index) => {
                  const displayName = studentDisplayName(enrollment.displayName, index);
                  return (
                    <button
                      type="button"
                      key={enrollment.enrollmentRef}
                      className={enrollment.learnerRef === selectedLearnerRef ? "is-active" : ""}
                      onClick={() => {
                        setSelectedLearnerRef(enrollment.learnerRef);
                        setDetailTab("assignments");
                      }}
                      data-testid={`learner-${enrollment.learnerRef}`}
                    >
                      <span className="student-initial">{displayName.slice(0, 1)}</span>
                      <span><strong>{displayName}</strong></span>
                    </button>
                  );
                })}
              </div>
            </aside>

            <main className="student-detail" data-testid="learner-evidence-detail">
              {selectedEnrollment && learnerView ? (
                <>
                  <header className="student-detail__header">
                    <div>
                      <h2>{studentDisplayName(selectedEnrollment.displayName, Math.max(selectedEnrollmentIndex, 0))}</h2>
                    </div>
                    <div className="student-detail__actions">
                      {learnerView.recentAssignments.length + learnerView.evidence.length > 0 ? (
                        <div className="student-detail__metrics">
                          <span><strong>{learnerView.recentAssignments.length}</strong>近期作业</span>
                          <span><strong>{learnerView.evidence.length}</strong>确认记录</span>
                        </div>
                      ) : null}
                      {learnerView.recentAssignments.length > 0 ? (
                        <Button className="student-primary-action" type="primary" onClick={() => props.navigate("/assignments")}>作业与批改</Button>
                      ) : null}
                    </div>
                  </header>

                  {learnerView.needsTeacherReview.length > 0 ? (
                    <section className="student-attention-panel">
                      <span>需要老师查看</span>
                      <strong>{cleanDisplayText(learnerView.needsTeacherReview[0] ?? "")}</strong>
                      {learnerView.needsTeacherReview.length > 1 ? <small>另有 {learnerView.needsTeacherReview.length - 1} 项</small> : null}
                    </section>
                  ) : null}

                  <nav className="student-detail-tabs" aria-label="学生详情">
                    {([
                      ["assignments", "近期作业"],
                      ["evidence", "学习证据"],
                      ["observations", "课堂观察"]
                    ] as const).map(([value, label]) => (
                      <button type="button" key={value} className={detailTab === value ? "is-active" : ""} aria-pressed={detailTab === value} onClick={() => setDetailTab(value)}>{label}</button>
                    ))}
                  </nav>

                  {detailTab === "assignments" ? (
                    <section className="student-evidence-list" data-testid="learner-recent-assignments">
                      <header><h3>近期作业</h3></header>
                      {learnerView.recentAssignments.length > 0 ? learnerView.recentAssignments.map((submission) => (
                        <article key={`${submission.assignmentRef}:${submission.learnerRef}`}>
                          <div><strong>近期作业</strong></div>
                          {submission.submissionState !== "not_submitted" && submission.gradeStatus === "confirmed" ? <StatusPill tone="success">{submission.score ?? "—"} / {submission.maxScore ?? "—"}</StatusPill> : <StatusPill>{submission.submissionState === "not_submitted" ? "未完成" : "进行中"}</StatusPill>}
                        </article>
                      )) : (
                        <div className="student-empty-state">
                          <p>暂无近期作业</p>
                          <Button className="student-primary-action" type="primary" onClick={() => props.navigate("/assignments")}>打开作业与批改</Button>
                        </div>
                      )}
                    </section>
                  ) : null}

                  {detailTab === "evidence" ? (
                    <section className="student-evidence-list" data-testid="learner-confirmed-evidence">
                      <header><h3>学习证据</h3></header>
                      {learnerView.evidence.length > 0 ? learnerView.evidence.map((evidence) => (
                        <article key={evidence.observationRef}>
                          <div><strong>{evidence.outcome === "correct" ? "理解正确" : evidence.outcome === "partial" ? "部分理解" : "仍需关注"}</strong><small>已关联本课教学目标</small></div>
                          <Tag color={evidence.outcome === "correct" ? "success" : evidence.outcome === "partial" ? "warning" : "error"}>{evidence.awardedScore} / {evidence.maxScore}</Tag>
                        </article>
                      )) : <div className="student-empty-state"><p>暂无学习证据</p></div>}
                    </section>
                  ) : null}

                  {detailTab === "observations" ? (
                    <section className="student-evidence-list" data-testid="learner-classroom-observations">
                      <header><h3>课堂观察</h3></header>
                      {classroomObservations.length > 0 ? classroomObservations.map((observation) => (
                        <article key={observation.observationRevisionRef}>
                          <div><strong>{observationTypeLabel(observation.observationType)}</strong><small>{new Date(observation.observedAt).toLocaleString("zh-CN")}</small><p>{cleanDisplayText(observation.content)}</p></div>
                          <StatusPill tone="success">已完成</StatusPill>
                        </article>
                      )) : <div className="student-empty-state"><p>暂无课堂观察</p></div>}
                    </section>
                  ) : null}
                </>
              ) : (
                <Empty description="请选择一名学生" />
              )}
            </main>
          </div>
        )}
      </Spin>
    </div>
  );
}

function studentCourseTitle(title: string): string {
  return cleanDisplayText(title)
    .replace(/\s*[·・]\s*当前学期\s*$/u, "")
    .trim();
}

function studentDisplayName(name: string, index: number): string {
  const cleanName = cleanDisplayText(name);
  if (!/(匿名学习者|anonymous\s+learner)/iu.test(cleanName)) return cleanName;
  return anonymizedLearnerNames[index % anonymizedLearnerNames.length] ?? "陈思远";
}

function observationTypeLabel(type: string): string {
  return {
    learning_progress: "学习进展",
    misconception: "概念混淆",
    pacing: "课堂节奏",
    engagement: "课堂参与",
    activity_effectiveness: "活动效果",
    follow_up_need: "后续关注"
  }[type] ?? "课堂观察";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "未知错误";
}
