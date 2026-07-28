import { useEffect, useState } from "react";

import type {
  CreateTeacherCopilotTaskResult,
  TeacherWorkspace
} from "@edu-agent/contracts";
import {
  Alert,
  Button,
  Card,
  Space,
  Spin,
  Tag,
  Typography
} from "antd";

import { loadTeachingPlanRevision } from "../api";
import {
  TeachingPlanDiffView,
  TeachingPlanView
} from "../components/TeachingPlanView";

const { Paragraph, Text, Title } = Typography;

export function TeachingPlanPage(props: {
  workspace: TeacherWorkspace;
  task: CreateTeacherCopilotTaskResult | null;
}) {
  const [revision, setRevision] = useState(
    props.workspace.latestTeachingPlan
  );
  const [loadingPrevious, setLoadingPrevious] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRevision(props.workspace.latestTeachingPlan);
  }, [props.workspace.latestTeachingPlan]);

  const selectedStrategyId =
    props.workspace.latestTeachingPlan.selectedStrategyId ??
    props.task?.strategies[0]?.strategyId;
  const selectedDiff =
    props.task && selectedStrategyId
      ? props.task.diffsByStrategy[selectedStrategyId]
      : undefined;

  async function showPrevious() {
    if (!revision.parentRevisionRef) return;
    setLoadingPrevious(true);
    setError(null);
    try {
      setRevision(
        await loadTeachingPlanRevision(revision.parentRevisionRef)
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "加载前一版本失败"
      );
    } finally {
      setLoadingPrevious(false);
    }
  }

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <Text className="section-kicker">VERSIONED ARTIFACT</Text>
          <Title>TeachingPlan</Title>
          <Paragraph>
            正文只存在于 Artifact 模块。每次教师保存都会创建新的不可变
            Revision；本轮只允许 draft → in_review，不自动发布。
          </Paragraph>
        </div>
        <Space wrap>
          <Tag>Artifact owner</Tag>
          <Tag color="processing">{revision.state}</Tag>
        </Space>
      </header>

      <Alert
        type="info"
        showIcon
        title="发布边界"
        description="页面没有“自动发布”路径。accepted 也只会形成 in_review Revision。"
      />

      {error ? (
        <Alert type="error" showIcon title={error} />
      ) : null}

      <Spin spinning={loadingPrevious}>
        <TeachingPlanView
          revision={revision}
          onPrevious={showPrevious}
        />
      </Spin>

      {revision.revisionRef !==
      props.workspace.latestTeachingPlan.revisionRef ? (
        <Card className="workspace-card revision-return" variant="borderless">
          <div>
            <Title level={4}>你正在查看历史 Revision</Title>
            <Paragraph>
              历史版本保持不变；返回最近版本不会修改任何数据。
            </Paragraph>
          </div>
          <Button
            type="primary"
            onClick={() =>
              setRevision(props.workspace.latestTeachingPlan)
            }
          >
            返回最近版本
          </Button>
        </Card>
      ) : null}

      {selectedDiff ? (
        <TeachingPlanDiffView
          diff={selectedDiff}
          teacherSelection={
            props.workspace.latestTeachingPlan.teacherSelection
          }
        />
      ) : (
        <Card className="workspace-card" variant="borderless">
          <Title level={4}>尚无 Teacher Copilot Diff</Title>
          <Paragraph>
            启动课堂调整任务后，这里会显示字段级新增、删除、修改原因和
            Evidence 引用。
          </Paragraph>
        </Card>
      )}
    </div>
  );
}
