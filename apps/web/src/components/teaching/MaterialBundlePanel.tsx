import { useMemo } from "react";

import type {
  MaterialBundleItem,
  MaterialBundleProjection,
  MaterialKind
} from "@edu-agent/contracts";
import { Button, Tag } from "antd";

import { WorkspaceIcon } from "../WorkspaceIcon";

const statusPresentation: Record<
  MaterialBundleItem["status"],
  { label: string; color: string }
> = {
  missing: { label: "准备中", color: "default" },
  outdated: { label: "待更新", color: "default" },
  draft: { label: "待验收", color: "warning" },
  adopted: { label: "已验收", color: "success" }
};

export function MaterialBundlePanel(props: {
  bundle: MaterialBundleProjection;
  loading: boolean;
  kinds?: readonly MaterialKind[];
  title?: string;
  testId?: string;
  generateTestId?: string;
  hideGenerationAction?: boolean;
  onGenerate: (kinds: MaterialKind[], adjustment: string | null) => void;
  onAdopt: (item: MaterialBundleItem) => void;
  onPreview: (item: MaterialBundleItem) => void;
  onDownload: (item: MaterialBundleItem) => void;
  onOpenFiles: () => void;
}) {
  const items = useMemo(
    () => props.kinds
      ? props.bundle.items.filter((item) => props.kinds?.includes(item.kind))
      : props.bundle.items,
    [props.bundle.items, props.kinds]
  );
  const adoptedCount = items.filter((item) => item.status === "adopted").length;
  const generationKinds = useMemo(
    () => items
      .filter((item) => item.status === "missing" || item.status === "outdated")
      .map((item) => item.kind),
    [items]
  );
  const blocked = props.bundle.status === "blocked_no_approved_plan";

  return (
    <section
      className="material-bundle-panel"
      id={props.testId === "material-bundle-panel" ? "material-bundle" : undefined}
      data-testid={props.testId ?? "material-bundle-panel"}
    >
      <header className="material-bundle-panel__header">
        <h3>{props.title ?? "教学资源"}</h3>
        <span className="material-bundle-panel__count">
          {items.length} 项文件{adoptedCount > 0 ? ` · ${adoptedCount} 项已验收` : ""}
        </span>
      </header>

      <div className="material-bundle-list">
        {items.map((item) => {
          const presentation = statusPresentation[item.status];
          return (
            <article
              key={item.kind}
              className={`material-bundle-item is-${item.status}`}
              data-testid={`material-item-${item.kind}`}
            >
              <div className="material-bundle-item__icon">
                <WorkspaceIcon name={iconName(item.kind)} variant="filled" />
              </div>
              <div className="material-bundle-item__body">
                <strong>{item.label}</strong>
                <small>{materialFileMeta(item)}</small>
              </div>
              <Tag color={presentation.color}>{presentation.label}</Tag>
              <div className="material-bundle-item__actions">
                <Button
                  type="text"
                  disabled={!item.assetRef}
                  onClick={() => props.onPreview(item)}
                >
                  查看与调整
                </Button>
                {item.status === "draft" ? (
                  <Button
                    loading={props.loading}
                    onClick={() => props.onAdopt(item)}
                    data-testid={`adopt-material-${item.kind}`}
                  >
                    验收
                  </Button>
                ) : null}
                {item.assetRef ? (
                  <Button type="text" onClick={() => props.onDownload(item)}>
                    下载
                  </Button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>

      {!props.hideGenerationAction && !blocked && generationKinds.length > 0 ? (
        <details className="material-bundle-more material-bundle-overflow">
          <summary aria-label="材料其他操作" title="材料其他操作"><WorkspaceIcon name="more" /></summary>
          <div>
            <Button
              loading={props.loading}
              onClick={() => props.onGenerate(generationKinds, null)}
              data-testid={props.generateTestId ?? "generate-material-bundle"}
            >
              准备缺少的材料
            </Button>
          </div>
        </details>
      ) : null}
    </section>
  );
}

function iconName(kind: MaterialKind) {
  return {
    lesson_plan: "document",
    slide_outline: "slides",
    exercise_set: "assignment",
    board_design: "edit",
    differentiated_support: "students"
  }[kind] as Parameters<typeof WorkspaceIcon>[0]["name"];
}

function materialFileMeta(item: MaterialBundleItem): string {
  if (!item.assetRef) return "文件尚未生成";
  const version = item.versionNumber ? `第 ${item.versionNumber} 版` : "当前版本";
  if (!item.updatedAt) return version;
  const date = new Date(item.updatedAt);
  if (Number.isNaN(date.getTime())) return version;
  const updated = new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
  return `${version} · ${updated}`;
}
