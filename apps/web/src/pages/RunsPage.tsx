import { useEffect, useState } from "react";

import type {
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

import {
  loadRunExplanation,
  type RecoverableCopilotTask
} from "../api";
import { MemoryUseDisclosure } from "../components/memory/MemoryUseDisclosure";
import {
  lessonPlanProjectionStatusLabel,
  lessonPreparationStatusLabel,
  modelExecutionStatusLabel
} from "../presentation";

const { Paragraph, Text, Title } = Typography;
const activeModelStatuses = new Set([
  "queued",
  "running",
  "validating",
  "retryable_failed",
  "cancel_requested"
]);

export function RunsPage(props: {
  workspace: TeacherWorkspace;
  task: RecoverableCopilotTask | null;
  preparationTaskRef: string | null;
}) {
  const latestTaskRef =
    props.preparationTaskRef ??
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
    let timer: number | undefined;
    let firstLoad = true;
    setLoading(true);
    setError(null);
    const refresh = async () => {
      try {
        const result = await loadRunExplanation(latestTaskRef);
        if (!active) return;
        setExplanation(result);
        setError(null);
        if (activeModelStatuses.has(result.modelExecution.status)) {
          timer = window.setTimeout(refresh, 750);
        }
      } catch (caught) {
        if (!active) return;
        setError(
          caught instanceof Error
            ? caught.message
            : "加载运行解释失败"
        );
      } finally {
        if (active && firstLoad) {
          firstLoad = false;
          setLoading(false);
        }
      }
    };
    void refresh();
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
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
        {explanation ? (
          <Tag
            color={
              explanation.modelExecution.status === "succeeded"
                ? "success"
                : ["queued", "running", "validating", "retryable_failed"].includes(
                      explanation.modelExecution.status
                    )
                  ? "processing"
                  : "error"
            }
          >
            模型执行 · {modelExecutionStatusLabel(explanation.modelExecution.status)}
          </Tag>
        ) : null}
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
                  <dt>教师请求</dt>
                  <dd>{explanation.task.request.requestText}</dd>
                </div>
                <div>
                  <dt>助手</dt>
                  <dd>
                    {explanation.modelExecution.provider ===
                    "volcengine-ark"
                      ? `Volcengine Ark · ${explanation.modelExecution.modelDisplayName}`
                      : "离线助手"}
                  </dd>
                </div>
                <div>
                  <dt>外部网络</dt>
                  <dd>
                    {explanation.modelExecution.externalNetworkUsed
                      ? "已使用（受控服务端调用）"
                      : "未使用"}
                  </dd>
                </div>
                <div>
                  <dt>模型费用</dt>
                  <dd>{explanation.modelExecution.costLabel}</dd>
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

            <MemoryUseDisclosure
              memoryContext={explanation.memoryContext}
              variant="detailed"
            />

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
            key: "lesson-preparation",
            label: "备课任务与封存上下文",
            children: explanation.lessonPreparation ? (
              <Descriptions
                column={1}
                size="small"
                items={[
                  {
                    key: "lesson",
                    label: "课时",
                    children: `${explanation.lessonPreparation.lessonTitle} · ${explanation.lessonPreparation.lessonRef}`
                  },
                  {
                    key: "work-status",
                    label: "备课状态",
                    children: `${lessonPreparationStatusLabel(explanation.lessonPreparation.workStatus)} · 第 ${explanation.lessonPreparation.workVersion} 版`
                  },
                  {
                    key: "working-set",
                    label: "本次工作集",
                    children: `第 ${explanation.lessonPreparation.workingSet.version} 版 · ${explanation.lessonPreparation.workingSet.evidenceRefs.length} 条证据${explanation.lessonPreparation.workingSet.sourceTodoRef ? " · 已关联个人待办" : ""}${explanation.lessonPreparation.workingSet.sourceResourceRefs?.length ? ` · ${explanation.lessonPreparation.workingSet.sourceResourceRefs.length} 个明确关联资源` : ""}`
                  },
                  {
                    key: "authorized-plan",
                    label: "授权上下文方案",
                    children:
                      explanation.lessonPreparation
                        .authorizedContextPlan
                        ?.authorizedContextPlanRef ?? "未生成"
                  },
                  {
                    key: "plan-status",
                    label: "教案状态",
                    children:
                      explanation.lessonPreparation.planStatus
                        ? lessonPlanProjectionStatusLabel(
                            explanation.lessonPreparation.planStatus
                          )
                        : "无"
                  }
                ]}
              />
            ) : (
              <Text type="secondary">
                这是早期运行记录，尚未绑定课时备课任务。
              </Text>
            )
          },
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
                    label: "业务任务",
                    children: explanation.task.taskRef
                  },
                  {
                    key: "request",
                    label: "教师要求",
                    children:
                      explanation.task.request.requestText
                  },
                  {
                    key: "request-version",
                    label: "要求版本",
                    children:
                      explanation.task.request.requestVersion
                  },
                  {
                    key: "task-run",
                    label: "任务执行",
                    children: explanation.taskRun.taskRunRef
                  },
                  {
                    key: "agent-run",
                    label: "助手执行",
                    children: explanation.agentRun.agentRunRef
                  },
                  {
                    key: "provider",
                    label: "生成服务",
                    children: explanation.agentRun.modelProfile
                  }
                ]}
              />
            )
          },
          {
            key: "model-execution",
            label: "模型执行安全摘要",
            children: (
              <Descriptions
                column={1}
                size="small"
                items={[
                  {
                    key: "execution",
                    label: "模型执行",
                    children: explanation.modelExecution.executionRef
                  },
                  {
                    key: "provider",
                    label: "生成服务 / 模型",
                    children: `${
                      explanation.modelExecution.provider ===
                      "volcengine-ark"
                        ? "火山方舟"
                        : "内置助手"
                    } · ${explanation.modelExecution.modelDisplayName}`
                  },
                  {
                    key: "status",
                    label: "状态",
                    children: modelExecutionStatusLabel(explanation.modelExecution.status)
                  },
                  {
                    key: "prompt-bundle",
                    label: "提示词配置",
                    children: `${explanation.modelExecution.promptBundleRef}@${explanation.modelExecution.promptBundleVersion}`
                  },
                  {
                    key: "sealed-context",
                    label: "封存上下文",
                    children:
                      explanation.modelExecution.contextManifestRef ??
                      "未记录"
                  },
                  {
                    key: "usage",
                    label: "模型用量",
                    children: explanation.modelExecution.usageLabel
                  },
                  {
                    key: "latency",
                    label: "延迟",
                    children:
                      explanation.modelExecution.latencyMs === null
                        ? "未记录"
                        : `${explanation.modelExecution.latencyMs} ms`
                  },
                  {
                    key: "cost",
                    label: "估算费用",
                    children: explanation.modelExecution.costLabel
                  },
                  {
                    key: "attempt",
                    label: "尝试次数",
                    children: `${explanation.modelExecution.attemptCount}/${explanation.modelExecution.maxAttempts}`
                  },
                  {
                    key: "finish",
                    label: "完成原因",
                    children:
                      explanation.modelExecution.finishReason ?? "未记录"
                  },
                  {
                    key: "safe-error",
                    label: "安全错误分类",
                    children:
                      explanation.modelExecution.safeErrorCategory ??
                      "无"
                  },
                  {
                    key: "provider-request",
                    label: "服务请求标识",
                    children:
                      explanation.modelExecution
                        .providerRequestIdMasked ?? "未提供"
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
                    label: "输出契约",
                    children: explanation.contract.contractRef
                  },
                  {
                    key: "profile",
                    label: "助手配置版本",
                    children: `${explanation.contract.profileRef}@${explanation.contract.profileVersion}`
                  },
                  {
                    key: "prompt",
                    label: "提示词配置",
                    children: explanation.contract.promptVersionRef
                  },
                  {
                    key: "context",
                    label: "封存上下文",
                    children:
                      explanation.contextManifest.contextManifestRef
                  },
                  {
                    key: "authorized-context",
                    label: "授权上下文方案",
                    children:
                      explanation.contextManifest
                        .authorizedContextPlanRef ?? "早期运行记录"
                  },
                  {
                    key: "request-summary",
                    label: "教师要求摘要",
                    children:
                      explanation.contextManifest.requestSummary
                        .requestText
                  },
                  {
                    key: "evidence",
                    label: "证据引用",
                    children:
                      explanation.contextManifest.evidenceRefs.join(
                        "；"
                      )
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
      description:
        explanation.modelExecution.provider === "volcengine-ark"
          ? "豆包助手在业务事务外生成建议，经结构、证据与权限校验后才保存。"
          : "内置助手生成建议，没有发起外部模型请求。",
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
