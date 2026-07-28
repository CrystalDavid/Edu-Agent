import { useEffect, useState } from "react";

import type {
  CreateTeacherCopilotTaskResult,
  RunExplanation,
  TeacherWorkspace
} from "@edu-agent/contracts";
import {
  Alert,
  Card,
  Collapse,
  Descriptions,
  Empty,
  Space,
  Spin,
  Table,
  Tag,
  Timeline,
  Typography
} from "antd";

import { loadRunExplanation } from "../api";
import { SemanticTag } from "../components/SemanticTag";

const { Paragraph, Text, Title } = Typography;

export function RunsPage(props: {
  workspace: TeacherWorkspace;
  task: CreateTeacherCopilotTaskResult | null;
}) {
  const latestTaskRef =
    props.task?.taskRef ??
    props.workspace.pendingSuggestions[0]?.taskRef ??
    null;
  const [explanation, setExplanation] =
    useState<RunExplanation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!latestTaskRef) {
      setExplanation(null);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    void loadRunExplanation(latestTaskRef)
      .then((result) => {
        if (active) setExplanation(result);
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(
            caught instanceof Error
              ? caught.message
              : "加载运行解释失败"
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [latestTaskRef]);

  return (
    <div className="page-stack runs-page">
      <header className="page-header page-header--compact">
        <div>
          <Text className="section-kicker">
            EXPLAINABLE RUNTIME
          </Text>
          <Title>运行记录</Title>
          <Paragraph>
            默认时间线使用教师可理解的语言；标识符、Contract、
            ContextManifest、Outbox 和 Audit 放在可展开的技术详情中。
          </Paragraph>
        </div>
        <Space wrap>
          <SemanticTag kind="mock" />
          <Tag>无外部网络</Tag>
        </Space>
      </header>

      {error ? (
        <Alert type="error" showIcon title={error} />
      ) : null}

      <Spin spinning={loading}>
        {!explanation ? (
          <Card className="workspace-card" variant="borderless">
            <Empty description="先运行一次教师助手，才能查看运行记录" />
          </Card>
        ) : (
          <div className="run-layout">
            <Card
              className="workspace-card run-timeline-card"
              variant="borderless"
            >
              <div className="section-heading">
                <div>
                  <Text className="section-kicker">
                    TEACHER-FACING TIMELINE
                  </Text>
                  <Title level={2}>本次建议如何形成</Title>
                </div>
                <Tag color="success">已完成</Tag>
              </div>
              <Timeline
                items={teacherTimeline(explanation).map((item) => ({
                  color: item.color,
                  content: (
                    <div className="teacher-timeline-item">
                      <Text strong>{item.title}</Text>
                      <Paragraph type="secondary">
                        {item.description}
                      </Paragraph>
                    </div>
                  )
                }))}
              />
            </Card>

            <Card
              className="workspace-card run-summary-card"
              variant="borderless"
            >
              <Text className="section-kicker">RUN SUMMARY</Text>
              <Title level={3}>安全摘要</Title>
              <dl className="summary-list">
                <div>
                  <dt>模型</dt>
                  <dd>MockModelProvider</dd>
                </div>
                <div>
                  <dt>外部网络</dt>
                  <dd>未使用</dd>
                </div>
                <div>
                  <dt>成本</dt>
                  <dd>{explanation.modelExecution.costLabel}</dd>
                </div>
                <div>
                  <dt>结果状态</dt>
                  <dd>Proposal / in_review 上限</dd>
                </div>
              </dl>
            </Card>

            <Card
              className="workspace-card run-details-card"
              variant="borderless"
            >
              <Text className="section-kicker">
                TECHNICAL DETAILS
              </Text>
              <Title level={3}>可审计技术详情</Title>
              <Paragraph type="secondary">
                不展示隐藏思维链、Secret、数据库连接信息、原始内部堆栈或敏感
                Prompt 正文。
              </Paragraph>
              <Collapse
                items={[
                  {
                    key: "runs",
                    label:
                      "执行绑定：QueryRun / TaskRun / AgentRun",
                    children: (
                      <Descriptions
                        column={1}
                        size="small"
                        items={[
                          {
                            key: "task",
                            label: "Task",
                            children: explanation.task.taskRef
                          },
                          {
                            key: "task-run",
                            label: "TaskRun",
                            children:
                              explanation.taskRun.taskRunRef
                          },
                          {
                            key: "agent-run",
                            label: "AgentRun",
                            children:
                              explanation.agentRun.agentRunRef
                          },
                          {
                            key: "provider",
                            label: "Provider",
                            children:
                              explanation.agentRun.modelProfile
                          }
                        ]}
                      />
                    )
                  },
                  {
                    key: "contract",
                    label:
                      "固定契约：Contract / PromptBundle / ContextManifest",
                    children: (
                      <Descriptions
                        column={1}
                        size="small"
                        items={[
                          {
                            key: "contract",
                            label: "Contract",
                            children:
                              explanation.contract.contractRef
                          },
                          {
                            key: "profile",
                            label: "Profile version",
                            children: `${explanation.contract.profileRef}@${explanation.contract.profileVersion}`
                          },
                          {
                            key: "prompt",
                            label: "PromptBundle",
                            children:
                              explanation.contract.promptVersionRef
                          },
                          {
                            key: "context",
                            label: "ContextManifest",
                            children:
                              explanation.contextManifest
                                .contextManifestRef
                          },
                          {
                            key: "unknowns",
                            label: "未知项",
                            children:
                              explanation.contextManifest.unknowns.join(
                                "；"
                              )
                          }
                        ]}
                      />
                    )
                  },
                  {
                    key: "authorization",
                    label:
                      "治理：AuthorizationDecision / Outbox / Audit",
                    children: (
                      <div className="technical-stack">
                        <Descriptions
                          column={1}
                          size="small"
                          items={[
                            {
                              key: "decision",
                              label: "AuthorizationDecision",
                              children:
                                explanation.authorization.decisionRef
                            },
                            {
                              key: "purpose",
                              label: "Purpose",
                              children:
                                explanation.authorization.purpose
                            },
                            {
                              key: "effect",
                              label: "Effect",
                              children: (
                                <Tag color="success">allow</Tag>
                              )
                            }
                          ]}
                        />
                        <Table
                          rowKey={(row) =>
                            `${row.owner}:${row.eventName}`
                          }
                          size="small"
                          pagination={false}
                          dataSource={explanation.outbox}
                          columns={[
                            {
                              title: "Owner",
                              dataIndex: "owner"
                            },
                            {
                              title: "Outbox event",
                              dataIndex: "eventName"
                            },
                            {
                              title: "状态",
                              dataIndex: "status"
                            },
                            {
                              title: "尝试",
                              dataIndex: "attemptCount"
                            }
                          ]}
                        />
                        <Timeline
                          items={explanation.auditTimeline.map(
                            (audit) => ({
                              color: "blue",
                              content: (
                                <div>
                                  <Text strong>
                                    {audit.action}
                                  </Text>
                                  <Paragraph type="secondary">
                                    {audit.recordType} ·{" "}
                                    {new Date(
                                      audit.occurredAt
                                    ).toLocaleString("zh-CN")}
                                  </Paragraph>
                                </div>
                              )
                            })
                          )}
                        />
                      </div>
                    )
                  }
                ]}
              />
            </Card>
          </div>
        )}
      </Spin>
    </div>
  );
}

function teacherTimeline(explanation: RunExplanation) {
  return [
    {
      title: "读取当前学习证据",
      description: `读取 ${explanation.contextManifest.evidenceRefs.length} 条允许范围内的证据引用，并保留未知项。`,
      color: "blue"
    },
    {
      title: "检查身份、用途与权限",
      description: "按“调整明天课堂”的用途完成当时授权检查。",
      color: "blue"
    },
    {
      title: "创建短生命周期任务",
      description:
        "TaskRun 与 AgentRun 绑定；没有创建长期自主 Agent。",
      color: "blue"
    },
    {
      title: "Mock 生成两种教学建议",
      description:
        "使用确定性 MockModelProvider；没有网络调用和模型费用。",
      color: "blue"
    },
    {
      title: "创建建议 Proposal",
      description:
        "建议与 TeachingPlan Diff 进入待教师处置状态。",
      color: "blue"
    },
    {
      title: explanation.disposition
        ? "记录教师处置"
        : "等待教师处置",
      description: explanation.disposition
        ? "已记录接受、修改、拒绝或延后；不等于课堂已经实施。"
        : "当前尚未形成外部承诺或正式教学决定。",
      color: explanation.disposition ? "green" : "gray"
    },
    {
      title: "保留版本与审计记录",
      description:
        "Artifact Revision、Outbox 与 Audit 可追溯；不会自动 published。",
      color: "gray"
    }
  ];
}
