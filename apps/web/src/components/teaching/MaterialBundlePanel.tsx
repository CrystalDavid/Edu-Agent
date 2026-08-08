import { useMemo } from "react";

import type {
  MaterialBundleItem,
  MaterialBundleProjection,
  MaterialKind
} from "@edu-agent/contracts";
import { Button, Progress, Tag, Typography } from "antd";

import { WorkspaceIcon } from "../WorkspaceIcon";

const { Paragraph, Text, Title } = Typography;

const statusPresentation: Record<
  MaterialBundleItem["status"],
  { label: string; color: string }
> = {
  missing: { label: "待生成", color: "default" },
  outdated: { label: "需按新方案更新", color: "warning" },
  draft: { label: "待教师采用", color: "processing" },
  adopted: { label: "已采用", color: "success" }
};

export function MaterialBundlePanel(props: {
  bundle: MaterialBundleProjection;
  loading: boolean;
  onGenerate: (kinds: MaterialKind[], adjustment: string | null) => void;
  onAdopt: (item: MaterialBundleItem) => void;
  onPreview: (item: MaterialBundleItem) => void;
  onDownload: (item: MaterialBundleItem) => void;
  onOpenFiles: () => void;
}) {
  const adoptedCount = props.bundle.items.filter(
    (item) => item.status === "adopted"
  ).length;
  const generationKinds = useMemo(
    () =>
      props.bundle.items
        .filter((item) => item.status === "missing" || item.status === "outdated")
        .map((item) => item.kind),
    [props.bundle.items]
  );
  const blocked = props.bundle.status === "blocked_no_approved_plan";

  return (
    <section
      className="material-bundle-panel"
      id="material-bundle"
      data-testid="material-bundle-panel"
    >
      <header className="material-bundle-panel__header">
        <div>
          <Text className="section-kicker">本课材料包</Text>
          <Title level={3}>本课材料</Title>
          <Paragraph type="secondary">
            {blocked
              ? "本课还没有已批准的教学计划，材料生成入口保持关闭。"
              : `基于已批准教学方案第 ${props.bundle.approvedTeachingPlanRevisionNumber} 版生成。预览确认后即可上课使用。`}
          </Paragraph>
        </div>
        <div className="material-bundle-panel__progress">
          <Progress
            type="circle"
            size={68}
            percent={Math.round((adoptedCount / props.bundle.items.length) * 100)}
            format={() => `${adoptedCount}/5`}
          />
        </div>
      </header>

      <div className="material-bundle-grid">
        {props.bundle.items.map((item) => {
          const presentation = statusPresentation[item.status];
          return (
            <article
              key={item.kind}
              className={`material-bundle-item is-${item.status}`}
              data-testid={`material-item-${item.kind}`}
            >
              <div className="material-bundle-item__icon">
                <WorkspaceIcon name={iconName(item.kind)} />
              </div>
              <div className="material-bundle-item__body">
                <div className="material-bundle-item__title">
                  <strong>{item.label}</strong>
                  <Tag color={presentation.color}>{presentation.label}</Tag>
                </div>
                <small>
                  {item.versionNumber
                    ? `文件版本 ${item.versionNumber} · 来源 Revision ${item.sourceTeachingPlanRevisionRef ?? "未知"}`
                    : "尚未生成内容草稿"}
                </small>
                <div className="material-bundle-item__actions">
                  <Button
                    size="small"
                    disabled={!item.assetRef}
                    onClick={() => props.onPreview(item)}
                  >
                    预览
                  </Button>
                  <Button
                    size="small"
                    type={item.status === "draft" ? "primary" : "default"}
                    loading={props.loading && item.status === "draft"}
                    disabled={item.status !== "draft"}
                    onClick={() => props.onAdopt(item)}
                    data-testid={`adopt-material-${item.kind}`}
                  >
                    {item.status === "adopted" ? "已确认" : "确认"}
                  </Button>
                  <Button
                    size="small"
                    disabled={!item.assetRef}
                    onClick={() => props.onDownload(item)}
                  >
                    下载
                  </Button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <footer className="material-bundle-panel__footer">
        <Button onClick={props.onOpenFiles}>查看全部文件</Button>
        {!blocked && generationKinds.length > 0 ? (
          <Button
            type="primary"
            loading={props.loading}
            onClick={() => props.onGenerate(generationKinds, null)}
            data-testid="generate-material-bundle"
          >
            生成待补齐材料
          </Button>
        ) : null}
      </footer>

    </section>
  );
}

function iconName(kind: MaterialKind) {
  return {
    lesson_plan: "document",
    slide_outline: "course",
    exercise_set: "assignment",
    board_design: "edit",
    differentiated_support: "students"
  }[kind] as Parameters<typeof WorkspaceIcon>[0]["name"];
}
