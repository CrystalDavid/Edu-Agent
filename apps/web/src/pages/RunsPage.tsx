import { useEffect, useState } from "react";

import type {
  CreateTeacherCopilotTaskResult,
  RunExplanation,
  TeacherWorkspace
} from "@edu-agent/contracts";
import {
  Alert,
  Card,
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
    <div className="page-stack">
      <header className="page-header">
        <div>
          <Text className="section-kicker">EXPLAINABLE RUNTIME</Text>
          <Title>运行记录</Title>
          <Paragraph>
            这里展示可审计的输入依据、授权、版本和状态，不展示隐藏思维链、原始敏感
            Prompt、Secret 或数据库连接信息。
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
            <Empty description="先运行一次 Teacher Copilot，才能查看解释记录" />
          </Card>
        ) : (
          <div className="page-stack">
            <Card className="workspace-card" variant="borderless">
              <div className="section-heading">
                <div>
                  <Text className="section-kicker">RUN BINDING</Text>
                  <Title level={3}>TaskRun 与 AgentRun</Title>
                </div>
                <Tag color="green">completed</Tag>
              </div>
              <Descriptions
                bordered
                column={2}
                items={[
                  {
                    key: "task",
                    label: "Task",
                    children: explanation.task.taskRef
                  },
                  {
                    key: "task-run",
                    label: "TaskRun",
                    children: explanation.taskRun.taskRunRef
                  },
                  {
                    key: "agent-run",
                    label: "AgentRun",
                    children: explanation.agentRun.agentRunRef
                  },
                  {
                    key: "model",
                    label: "ModelProvider",
                    children: (
                      <Space>
                        <Tag color="purple">Mock</Tag>
                        <span>
                          {explanation.agentRun.modelProfile}
                        </span>
                      </Space>
                    )
                  }
                ]}
              />
            </Card>

            <div className="run-grid">
              <Card className="workspace-card" variant="borderless">
                <Text className="section-kicker">RESOLVED CONTRACT</Text>
                <Title level={3}>固定的互动契约</Title>
                <Descriptions
                  column={1}
                  size="small"
                  items={[
                    {
                      key: "contract",
                      label: "Contract",
                      children: explanation.contract.contractRef
                    },
                    {
                      key: "profile",
                      label: "Profile version",
                      children: `${explanation.contract.profileRef}@${explanation.contract.profileVersion}`
                    },
                    {
                      key: "policy",
                      label: "Policy",
                      children:
                        explanation.contract.policyVersionRef
                    },
                    {
                      key: "prompt",
                      label: "PromptBundle",
                      children:
                        explanation.contract.promptVersionRef
                    },
                    {
                      key: "evidence",
                      label: "Evidence rule",
                      children:
                        explanation.contract
                          .evidenceRuleVersionRef
                    },
                    {
                      key: "hash",
                      label: "Content hash",
                      children: explanation.contract.contentHash
                    }
                  ]}
                />
              </Card>

              <Card className="workspace-card" variant="borderless">
                <Text className="section-kicker">AUTHORIZATION</Text>
                <Title level={3}>当时授权与用途</Title>
                <Descriptions
                  column={1}
                  size="small"
                  items={[
                    {
                      key: "decision",
                      label: "Decision",
                      children:
                        explanation.authorization.decisionRef
                    },
                    {
                      key: "purpose",
                      label: "Purpose",
                      children: explanation.authorization.purpose
                    },
                    {
                      key: "action",
                      label: "Action",
                      children: explanation.authorization.action
                    },
                    {
                      key: "effect",
                      label: "Effect",
                      children: <Tag color="green">allow</Tag>
                    },
                    {
                      key: "policy",
                      label: "Policy version",
                      children:
                        explanation.authorization.policyVersion
                    }
                  ]}
                />
              </Card>
            </div>

            <Card className="workspace-card" variant="borderless">
              <Text className="section-kicker">CONTEXT MANIFEST</Text>
              <Title level={3}>加载了什么，没有什么</Title>
              <Descriptions
                column={1}
                bordered
                items={[
                  {
                    key: "context",
                    label: "ContextManifest",
                    children:
                      explanation.contextManifest.contextManifestRef
                  },
                  {
                    key: "resources",
                    label: "Resource refs",
                    children: explanation.contextManifest.resourceRefs.join(
                      " · "
                    )
                  },
                  {
                    key: "evidence",
                    label: "Evidence refs",
                    children: explanation.contextManifest.evidenceRefs.join(
                      " · "
                    )
                  },
                  {
                    key: "unknowns",
                    label: "未知项",
                    children: (
                      <ul className="compact-list">
                        {explanation.contextManifest.unknowns.map(
                          (unknown) => (
                            <li key={unknown}>{unknown}</li>
                          )
                        )}
                      </ul>
                    )
                  },
                  {
                    key: "mask",
                    label: "Field mask",
                    children:
                      explanation.contextManifest.fieldMask.join(" · ")
                  }
                ]}
              />
            </Card>

            <div className="run-grid">
              <Card className="workspace-card" variant="borderless">
                <Text className="section-kicker">MOCK EXECUTION</Text>
                <Title level={3}>模型与成本</Title>
                <Descriptions
                  column={1}
                  items={[
                    {
                      key: "execution",
                      label: "ModelExecution",
                      children:
                        explanation.modelExecution.executionRef
                    },
                    {
                      key: "bundle",
                      label: "PromptBundle",
                      children:
                        explanation.modelExecution.promptBundleRef
                    },
                    {
                      key: "network",
                      label: "外部网络",
                      children: <Tag>未使用</Tag>
                    },
                    {
                      key: "usage",
                      label: "Token/用量",
                      children:
                        explanation.modelExecution.usageLabel
                    },
                    {
                      key: "cost",
                      label: "成本",
                      children:
                        explanation.modelExecution.costLabel
                    }
                  ]}
                />
              </Card>

              <Card className="workspace-card" variant="borderless">
                <Text className="section-kicker">ARTIFACTS</Text>
                <Title level={3}>Revision 结果</Title>
                <Table
                  rowKey="revisionRef"
                  size="small"
                  pagination={false}
                  dataSource={explanation.artifactRevisions}
                  columns={[
                    {
                      title: "类型",
                      dataIndex: "artifactType"
                    },
                    {
                      title: "Revision",
                      dataIndex: "revisionNumber"
                    },
                    {
                      title: "状态",
                      dataIndex: "state",
                      render: (value: string) => <Tag>{value}</Tag>
                    }
                  ]}
                />
              </Card>
            </div>

            <Card className="workspace-card" variant="borderless">
              <Text className="section-kicker">OUTBOX</Text>
              <Title level={3}>异步交付状态</Title>
              <Table
                rowKey={(row) => `${row.owner}:${row.eventName}`}
                size="small"
                pagination={false}
                dataSource={explanation.outbox}
                columns={[
                  { title: "Owner", dataIndex: "owner" },
                  { title: "事件", dataIndex: "eventName" },
                  {
                    title: "状态",
                    dataIndex: "status",
                    render: (value: string) => <Tag>{value}</Tag>
                  },
                  {
                    title: "尝试次数",
                    dataIndex: "attemptCount"
                  },
                  {
                    title: "错误",
                    dataIndex: "lastError",
                    render: (value: string | null) => value ?? "—"
                  }
                ]}
              />
            </Card>

            <Card className="workspace-card" variant="borderless">
              <Text className="section-kicker">AUDIT TIMELINE</Text>
              <Title level={3}>面向用户的审计时间线</Title>
              <Timeline
                items={explanation.auditTimeline.map((audit) => ({
                  color: "green",
                  content: (
                    <div>
                      <Text strong>{audit.recordType}</Text>
                      <Paragraph type="secondary">
                        {audit.action} · {audit.purpose} ·{" "}
                        {new Date(audit.occurredAt).toLocaleString(
                          "zh-CN"
                        )}
                      </Paragraph>
                    </div>
                  )
                }))}
              />
            </Card>
          </div>
        )}
      </Spin>
    </div>
  );
}
