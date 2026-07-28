import type { TeacherWorkspace } from "@edu-agent/contracts";
import { Alert, Card, Space, Typography } from "antd";

import { EvidencePanel } from "../components/EvidencePanel";
import { SemanticTag } from "../components/SemanticTag";

const { Paragraph, Text, Title } = Typography;

export function EvidencePage(props: {
  workspace: TeacherWorkspace;
}) {
  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <Text className="section-kicker">PROVENANCE FIRST</Text>
          <Title>学习证据</Title>
          <Paragraph>
            Observation 是可追溯记录；Claim
            是基于记录形成的可撤销主张；本轮没有把它们提升为能力估计。
          </Paragraph>
        </div>
        <Space wrap>
          <SemanticTag kind="observation" />
          <SemanticTag kind="claim" />
          <SemanticTag kind="estimate" />
        </Space>
      </header>

      <Alert
        showIcon
        type="warning"
        title="不要把候选主张当成学生标签"
        description="页面刻意不显示伪精确掌握概率。每项主张都保留有效时间、证据来源与未知项。"
      />

      <Card className="workspace-card" variant="borderless">
        <EvidencePanel evidence={props.workspace.evidence} />
      </Card>
    </div>
  );
}
