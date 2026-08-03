import { useEffect, useMemo, useState } from "react";

import type {
  ClassroomObservationRevision,
  CourseRunEnrollment,
  CourseRunView,
  LearnerRecentEvidence
} from "@edu-agent/contracts";
import { Alert, Button, Card, Empty, Space, Spin, Tag, Typography } from "antd";

import {
  loadCourseRunEnrollments,
  loadCourseRuns,
  loadClassroomObservations,
  loadCurriculumUnits,
  loadLessons,
  loadLearnerEvidence
} from "../api";
import { PageHeader } from "../components/portal/PortalPrimitives";
import { cleanDisplayText } from "../presentation";
import type { AppRoute } from "../route";

const { Paragraph, Text, Title } = Typography;

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const selectedEnrollment = useMemo(
    () => enrollments.find((item) => item.learnerRef === selectedLearnerRef) ?? null,
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
      <PageHeader
        title="学生"
        subtitle="查看当前课程名单、近期提交与教师已确认的学习证据"
        actions={<Button onClick={() => props.navigate("/assignments")}>进入作业与批改</Button>}
      />
      {error ? (
        <Alert
          type="error"
          showIcon
          title="学生近期学习情况加载失败"
          description={error}
          closable
          onClose={() => setError(null)}
        />
      ) : null}
      <Spin spinning={loading}>
        {!course ? (
          <Empty description="当前没有可用课程" />
        ) : (
          <div className="students-workspace">
            <Card className="workspace-card" variant="borderless">
              <Text className="section-kicker">{cleanDisplayText(course.title)}</Text>
              <Title level={3}>当前课程学生</Title>
              <Paragraph type="secondary">
                {enrollments.length} 名当前课程学生；“未交”表示没有收到提交，不按 0 分处理。
              </Paragraph>
              <div className="course-list" data-testid="real-student-list">
                {enrollments.map((enrollment) => (
                  <button
                    type="button"
                    key={enrollment.enrollmentRef}
                    className={enrollment.learnerRef === selectedLearnerRef ? "is-active" : ""}
                    onClick={() => setSelectedLearnerRef(enrollment.learnerRef)}
                    data-testid={`learner-${enrollment.learnerRef}`}
                  >
                    <strong>{cleanDisplayText(enrollment.displayName)}</strong>
                    <small>当前课程成员</small>
                  </button>
                ))}
              </div>
            </Card>

            <Card className="workspace-card" variant="borderless" data-testid="learner-evidence-detail">
              {selectedEnrollment && learnerView ? (
                <>
                  <Text className="section-kicker">近期、可追溯、非长期结论</Text>
                  <Title level={2}>{cleanDisplayText(selectedEnrollment.displayName)}</Title>
                  <Space wrap>
                    <Tag>{learnerView.recentAssignments.length} 条近期作业状态</Tag>
                    <Tag color="processing">{learnerView.evidence.length} 条已确认学习证据</Tag>
                  </Space>

                  <section>
                    <Title level={4}>需要教师查看</Title>
                    {learnerView.needsTeacherReview.length > 0 ? (
                      learnerView.needsTeacherReview.map((item) => (
                        <Alert key={item} type="warning" showIcon title={cleanDisplayText(item)} />
                      ))
                    ) : (
                      <Paragraph type="secondary">当前没有由近期作业触发的复核事项。</Paragraph>
                    )}
                  </section>

                  <section data-testid="learner-recent-assignments">
                    <Title level={4}>近期作业与提交</Title>
                    {learnerView.recentAssignments.length > 0 ? (
                      <Space orientation="vertical" size="small">
                        {learnerView.recentAssignments.map((submission) => (
                          <Card key={`${submission.assignmentRef}:${submission.learnerRef}`} size="small">
                            <strong>{submission.submissionState === "not_submitted" ? "本次作业尚未提交" : "已提交"}</strong>
                            <Paragraph type="secondary">
                              {submission.submissionState === "not_submitted"
                                ? "没有提交记录，因此不显示 0 分。"
                                : submission.gradeStatus === "confirmed"
                                  ? `教师已确认：${submission.score ?? "—"} / ${submission.maxScore ?? "—"}`
                                  : "当前需要教师批改或确认。"}
                            </Paragraph>
                          </Card>
                        ))}
                      </Space>
                    ) : (
                      <Paragraph type="secondary">当前尚无已发布作业或提交记录。</Paragraph>
                    )}
                  </section>

                  <section data-testid="learner-confirmed-evidence">
                    <Title level={4}>教师已确认的学习证据</Title>
                    {learnerView.evidence.length > 0 ? (
                      <Space orientation="vertical" size="small">
                        {learnerView.evidence.map((evidence) => (
                          <Card key={evidence.observationRef} size="small">
                            <Space wrap>
                              <Tag color={evidence.outcome === "correct" ? "success" : evidence.outcome === "partial" ? "warning" : "error"}>
                                {evidence.outcome === "correct" ? "正确" : evidence.outcome === "partial" ? "部分正确" : "错误"}
                              </Tag>
                              <Text>{evidence.awardedScore} / {evidence.maxScore}</Text>
                              <Text type="secondary">已关联教学目标</Text>
                            </Space>
                            <Paragraph type="secondary">
                              来源：作业 → 提交 → 逐题作答 → 教师批改；{evidence.isCurrent ? "当前版本" : "历史版本"}
                            </Paragraph>
                          </Card>
                        ))}
                      </Space>
                    ) : (
                      <Paragraph type="secondary">尚无教师确认后形成的学习证据。</Paragraph>
                    )}
                  </section>

                  <section data-testid="learner-classroom-observations">
                    <Title level={4}>教师确认的课堂观察</Title>
                    <Paragraph type="secondary">仅显示明确作用于当前学生的课堂观察；班级观察与作业证据不会在这里混为个人结论。</Paragraph>
                    {classroomObservations.length > 0 ? (
                      <Space orientation="vertical" size="small">
                        {classroomObservations.map((observation) => (
                          <Card key={observation.observationRevisionRef} size="small">
                            <Space wrap><Tag color="success">教师已确认</Tag><Tag>{observationTypeLabel(observation.observationType)}</Tag></Space>
                            <Paragraph>{cleanDisplayText(observation.content)}</Paragraph>
                            <Text type="secondary">来源：课堂观察 · {new Date(observation.observedAt).toLocaleString("zh-CN")}</Text>
                          </Card>
                        ))}
                      </Space>
                    ) : (
                      <Paragraph type="secondary">当前没有教师确认且明确作用于该学生的课堂观察。</Paragraph>
                    )}
                  </section>
                </>
              ) : (
                <Empty description="请选择一名学生" />
              )}
            </Card>
          </div>
        )}
      </Spin>
    </div>
  );
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
