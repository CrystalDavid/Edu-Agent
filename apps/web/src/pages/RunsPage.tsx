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
  Spin,
  Table,
  Tag,
  Timeline,
  Typography
} from "antd";

import { loadRunExplanation } from "../api";

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
          <span className="page-icon page-icon--green" aria-hidden="true">◷</span>
          <div>
            <Title>运行记录</Title>
            <Paragraph>
              先用教师能理解的语言说明建议如何形成，技术引用按需展开。
            </Paragraph>
          </div>
        </div>
        {explanation ? <Tag color="processing">运行完成</Tag> : null}
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
                  <Text className="section-kicker">过程说明</Text>
                  <Title level={2}>本次建议如何形成</Title>
                </div>
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
              <Text className="section-kicker">运行摘要</Text>
              <Title level={3}>本次边界</Title>
              <dl className="summary-list">
                <div>
                  <dt>助手</dt>
                  <dd>本地演示助手</dd>
                </div>
                <div>
                  <dt>外部网络</dt>
                  <dd>未使用</dd>
                </div>
                <div>
                  <dt>模型费用</dt>
                  <dd>0 元</dd>
                </div>
                <div>
                  <dt>结果上限</dt>
                  <dd>建议草稿或待审核版本</dd>
                </div>
              </dl>
              <div className="run-boundary-note">
                不展示隐藏思维链、密钥、数据库连接或内部堆栈。
              </div>
            </Card>

            <Card
              className="workspace-card run-details-card"
              variant="borderless"
            >
              <Collapse
                className="technical-disclosure"
                items={[
                  {
                    key: "technical",
                    label: "查看可审计技术详情",
                    children: (
                      <TechnicalDetails explanation={explanation} />
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

function TechnicalDetails({
  explanation
}: {
  explanation: RunExplanation;
}) {
  return (
    <div className="technical-stack">
      <Alert
        type="info"
        showIcon
        title="以下是开发者与审计人员使用的技术引用"
        description="仅展示运行标识、版本和审计事件，不展示隐藏推理过程。"
      />
      <Collapse
        ghost
        items={[
          {
            key: "runs",
            label: "执行绑定",
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
                    children: explanation.taskRun.taskRunRef
                  },
                  {
                    key: "agent-run",
                    label: "AgentRun",
                    children: explanation.agentRun.agentRunRef
                  },
                  {
                    key: "provider",
                    label: "Provider",
                    children: explanation.agentRun.modelProfile
                  }
                ]}
              />
            )
          },
          {
            key: "contract",
            label: "固定契约与使用的数据",
            children: (
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
                    key: "prompt",
                    label: "PromptBundle",
                    children: explanation.contract.promptVersionRef
                  },
                  {
                    key: "context",
                    label: "ContextManifest",
                    children:
                      explanation.contextManifest.contextManifestRef
                  },
                  {
                    key: "unknowns",
                    label: "未知项",
                    children:
                      explanation.contextManifest.unknowns.join("；")
                  }
                ]}
              />
            )
          },
          {
            key: "governance",
            label: "权限检查与后台处理",
            children: (
              <>
                <Descriptions
                  column={1}
                  size="small"
                  items={[
                    {
                      key: "decision",
                      label: "AuthorizationDecision",
                      children: explanation.authorization.decisionRef
                    },
                    {
                      key: "purpose",
                      label: "Purpose",
                      children: explanation.authorization.purpose
                    },
                    {
                      key: "effect",
                      label: "Effect",
                      children: <Tag color="processing">allow</Tag>
                    }
                  ]}
                />
                <Table
                  rowKey={(row) => `${row.owner}:${row.eventName}`}
                  size="small"
                  pagination={false}
                  dataSource={explanation.outbox}
                  columns={[
                    { title: "Owner", dataIndex: "owner" },
                    { title: "Outbox event", dataIndex: "eventName" },
                    { title: "状态", dataIndex: "status" },
                    { title: "尝试", dataIndex: "attemptCount" }
                  ]}
                />
                <Timeline
                  items={explanation.auditTimeline.map((audit) => ({
                    color: "blue",
                    content: (
                      <div>
                        <Text strong>{audit.action}</Text>
                        <Paragraph type="secondary">
                          {audit.recordType} ·{" "}
                          {new Date(audit.occurredAt).toLocaleString(
                            "zh-CN"
                          )}
                        </Paragraph>
                      </div>
                    )
                  }))}
                />
              </>
            )
          }
        ]}
      />
    </div>
  );
}

function teacherTimeline(explanation: RunExplanation) {
  return [
    {
      title: "读取学习证据",
      description: `读取 ${explanation.contextManifest.evidenceRefs.length} 条允许范围内的证据，并保留未知项。`,
      color: "blue"
    },
    {
      title: "完成权限检查",
      description: "按“调整明天课堂”的用途检查当前教师是否可以使用这些数据。",
      color: "blue"
    },
    {
      title: "创建教学任务",
      description: "任务只服务于本次建议，不会变成长期自主进程。",
      color: "blue"
    },
    {
      title: "生成建议草稿",
      description: "本地演示助手生成两种课堂策略，没有连接外部模型。",
      color: "blue"
    },
    {
      title: explanation.disposition
        ? "教师处理建议"
        : "等待教师处理",
      description: explanation.disposition
        ? "已记录教师的接受、修改、拒绝或延后选择；这不表示课堂已经实施。"
        : "当前尚未形成外部承诺或正式教学决定。",
      color: explanation.disposition ? "blue" : "gray"
    },
    {
      title: explanation.disposition
        ? "保存教学计划版本"
        : "保留建议与操作记录",
      description: explanation.disposition
        ? "如有修改，仅创建待审核版本，不会自动发布。"
        : "建议、后台处理和操作记录保持可追溯。",
      color: explanation.disposition ? "blue" : "gray"
    }
  ];
}
