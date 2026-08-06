import { useMemo, useState } from "react";

import type {
  MaterialBundleItem,
  MaterialBundleProjection,
  MaterialKind
} from "@edu-agent/contracts";
import { Button, Input, Modal, Progress, Tag, Typography } from "antd";

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
  const [adjusting, setAdjusting] = useState<MaterialKind | null>(null);
  const [adjustment, setAdjustment] = useState("");
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
          <Title level={3}>方案批准后，材料由系统先准备</Title>
          <Paragraph type="secondary">
            {blocked
              ? "本课还没有已批准的教学计划，材料生成入口保持关闭。"
              : `全部材料绑定 TeachingPlan Revision ${props.bundle.approvedTeachingPlanRevisionNumber}；草稿需由教师预览并采用。`}
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
                  {item.assetRef ? (
                    <>
                      <Button size="small" onClick={() => props.onPreview(item)}>
                        预览
                      </Button>
                      <Button size="small" onClick={() => props.onDownload(item)}>
                        下载
                      </Button>
                    </>
                  ) : null}
                  {!blocked ? (
                    <Button
                      size="small"
                      disabled={props.loading}
                      onClick={() => {
                        setAdjusting(item.kind);
                        setAdjustment("");
                      }}
                    >
                      {item.status === "missing" ? "生成" : "调整并重生成"}
                    </Button>
                  ) : null}
                  {item.status === "draft" ? (
                    <Button
                      size="small"
                      type="primary"
                      loading={props.loading}
                      onClick={() => props.onAdopt(item)}
                      data-testid={`adopt-material-${item.kind}`}
                    >
                      采用
                    </Button>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <footer className="material-bundle-panel__footer">
        <Button onClick={props.onOpenFiles}>在文件中查看版本历史</Button>
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

      <Modal
        open={adjusting !== null}
        title={
          adjusting
            ? `调整${props.bundle.items.find((item) => item.kind === adjusting)?.label ?? "材料"}`
            : "调整材料"
        }
        okText="重新生成此项"
        cancelText="取消"
        okButtonProps={{ disabled: adjustment.trim().length === 0 }}
        confirmLoading={props.loading}
        onCancel={() => setAdjusting(null)}
        onOk={() => {
          if (!adjusting || !adjustment.trim()) return;
          props.onGenerate([adjusting], adjustment.trim());
          setAdjusting(null);
        }}
      >
        <Paragraph type="secondary">
          只更新这一项并创建新的 FileVersion，其余材料和历史版本保持不变。
        </Paragraph>
        <Input.TextArea
          value={adjustment}
          onChange={(event) => setAdjustment(event.target.value)}
          rows={4}
          maxLength={500}
          placeholder="例如：第二题简单一点；板书减少一些内容；增加课堂互动。"
          data-testid="material-adjustment-input"
        />
      </Modal>
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
