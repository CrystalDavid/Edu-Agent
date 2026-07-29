import type { TeacherWorkspace } from "@edu-agent/contracts";
import { Alert, Tag, Typography } from "antd";

import { EvidencePanel } from "../components/EvidencePanel";

const { Paragraph, Title } = Typography;

export function EvidencePage(props: {
  workspace: TeacherWorkspace;
}) {
  return (
    <div className="page-stack evidence-page">
      <header className="page-header">
        <div>
          <span className="page-icon page-icon--orange" aria-hidden="true">▤</span>
          <div>
            <Title>学习证据</Title>
            <Paragraph>
              先看学生在具体任务中的表现，再区分观察、解释与未知项。
            </Paragraph>
          </div>
        </div>
        <Tag>{props.workspace.evidence.observations.length} 条直接观察</Tag>
      </header>

      <Alert
        showIcon
        type="warning"
        title="待复核解释不是学生标签"
        description="页面不显示伪精确掌握概率；所有解释都保留来源、时效和未知项。"
      />

      <EvidencePanel evidence={props.workspace.evidence} />
    </div>
  );
}
