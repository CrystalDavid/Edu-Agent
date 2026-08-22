import type { ReactNode } from "react";

import { teacherStatusLabel, teacherStatusTone } from "../../presentation";
import { WorkspaceIcon, type WorkspaceIconName } from "../WorkspaceIcon";

export function PageHeader(props: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="portal-page-header">
      <div>
        {props.eyebrow ? <span>{props.eyebrow}</span> : null}
        <h1>{props.title}</h1>
        {props.subtitle ? <p>{props.subtitle}</p> : null}
      </div>
      {props.actions ? (
        <div className="portal-page-header__actions">{props.actions}</div>
      ) : null}
    </header>
  );
}

export function PageLayout(props: {
  children: ReactNode;
  secondary?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`portal-page-layout${props.className ? ` ${props.className}` : ""}`}>
      <main className="portal-page-main-content">{props.children}</main>
      {props.secondary ? (
        <aside className="portal-secondary-panel">{props.secondary}</aside>
      ) : null}
    </div>
  );
}

export function ContentSection(props: {
  title?: string;
  description?: string;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <section
      className={`content-section${props.className ? ` ${props.className}` : ""}`}
      data-testid={props.testId}
    >
      {props.title || props.description || props.eyebrow || props.action ? (
        <header className="content-section__header">
          <div>
            {props.eyebrow ? <span>{props.eyebrow}</span> : null}
            {props.title ? <h2>{props.title}</h2> : null}
            {props.description ? <p>{props.description}</p> : null}
          </div>
          {props.action ? <div>{props.action}</div> : null}
        </header>
      ) : null}
      <div className="content-section__body">{props.children}</div>
    </section>
  );
}

export function DecisionPanel(props: {
  eyebrow?: string;
  title: string;
  description?: string;
  meta?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <section
      className={`decision-panel${props.className ? ` ${props.className}` : ""}`}
      data-testid={props.testId}
    >
      <div className="decision-panel__copy">
        {props.eyebrow ? <span>{props.eyebrow}</span> : null}
        <h2>{props.title}</h2>
        {props.description ? <p>{props.description}</p> : null}
        {props.meta ? <div className="decision-panel__meta">{props.meta}</div> : null}
        {props.children}
      </div>
      {props.action ? <div className="decision-panel__action">{props.action}</div> : null}
    </section>
  );
}

export function ModuleCard(props: {
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <section
      className={`module-card${props.className ? ` ${props.className}` : ""}`}
      data-testid={props.testId}
    >
      {props.title || props.action ? (
        <header className="module-card__header">
          <div>
            {props.title ? <h2>{props.title}</h2> : null}
            {props.description ? <p>{props.description}</p> : null}
          </div>
          {props.action}
        </header>
      ) : null}
      <div className="module-card__content">{props.children}</div>
    </section>
  );
}

export function QuickAction(props: {
  icon: WorkspaceIconName;
  label: string;
  description?: string;
  onClick: () => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  return (
    <button
      type="button"
      className="portal-quick-action"
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.disabled ? props.disabledReason : undefined}
    >
      <span className="portal-quick-action__icon">
        <WorkspaceIcon name={props.icon} />
      </span>
      <span>
        <strong>{props.label}</strong>
        {props.description ? <small>{props.description}</small> : null}
      </span>
      {props.disabled ? <small>暂未开放</small> : <WorkspaceIcon name="arrowRight" />}
    </button>
  );
}

export function MetricCard(props: {
  label: string;
  value: string | number;
  note?: string;
  tone?: "neutral" | "attention";
}) {
  return (
    <article
      className={`portal-metric${props.tone === "attention" ? " portal-metric--attention" : ""}`}
    >
      <span>{props.label}</span>
      <strong>{props.value}</strong>
      {props.note ? <small>{props.note}</small> : null}
    </article>
  );
}

export function StatusPill(props: {
  children: ReactNode;
  tone?: "neutral" | "blue" | "warning" | "success" | "danger";
}) {
  const normalizedText = typeof props.children === "string"
    ? normalizeVisibleStatus(props.children)
    : props.children;
  const normalizedTone = props.tone ?? (
    typeof props.children === "string"
      ? statusToneClass(props.children)
      : "neutral"
  );
  return (
    <span className={`status-pill status-pill--${normalizedTone}`}>
      {normalizedText}
    </span>
  );
}

function normalizeVisibleStatus(value: string): string {
  if (!looksLikeStatus(value)) return value;
  if (["未完成", "进行中", "已完成"].includes(value)) return value;
  const normalized = value.trim().toLowerCase().replaceAll(" ", "_");
  return teacherStatusLabel(normalized);
}

function statusToneClass(value: string): "neutral" | "danger" | "warning" | "success" {
  if (!looksLikeStatus(value)) return "neutral";
  const normalized = value.trim().toLowerCase().replaceAll(" ", "_");
  const tone = teacherStatusTone(normalized);
  if (tone === "complete") return "success";
  if (tone === "incomplete") return "danger";
  return "warning";
}

function looksLikeStatus(value: string): boolean {
  return /(未完成|进行中|已完成|待|草稿|准备|审核|采用|确认|生成|发布|开始|取消|失败|超时|重试|available|active|approved|completed|confirmed|draft|failed|missing|pending|planned|published|ready|running|succeeded|waiting)/iu.test(value);
}

export function ChartCard(props: {
  title: string;
  caption?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`chart-card${props.className ? ` ${props.className}` : ""}`}>
      <header>
        <h3>{props.title}</h3>
        {props.caption ? <span>{props.caption}</span> : null}
      </header>
      <div className="chart-card__body">{props.children}</div>
    </section>
  );
}

export function BarChart(props: {
  items: Array<{ label: string; value: number }>;
  suffix?: string;
}) {
  const max = Math.max(...props.items.map((item) => item.value), 1);
  return (
    <div className="bar-chart" role="img" aria-label="柱状数据图">
      {props.items.map((item) => (
        <div className="bar-chart__row" key={item.label}>
          <span>{item.label}</span>
          <div>
            <i style={{ width: `${(item.value / max) * 100}%` }} />
          </div>
          <strong>
            {item.value}
            {props.suffix ?? "%"}
          </strong>
        </div>
      ))}
    </div>
  );
}

export function MiniLineChart(props: {
  values: number[];
  label: string;
}) {
  const max = Math.max(...props.values, 1);
  const min = Math.min(...props.values, 0);
  const range = Math.max(max - min, 1);
  const points = props.values
    .map((value, index) => {
      const x = props.values.length === 1 ? 50 : (index / (props.values.length - 1)) * 100;
      const y = 90 - ((value - min) / range) * 70;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <div className="mini-line-chart" role="img" aria-label={props.label}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 90H100" />
        <path d="M0 55H100" />
        <polyline points={points} />
      </svg>
      <div>
        {props.values.map((value, index) => (
          <span key={`${value}:${index}`}>{value}</span>
        ))}
      </div>
    </div>
  );
}

export function DonutChart(props: {
  value: number;
  label: string;
  suffix?: string;
}) {
  return (
    <div
      className="donut-chart"
      style={{ "--donut-value": `${Math.max(0, Math.min(props.value, 100)) * 3.6}deg` } as React.CSSProperties}
      role="img"
      aria-label={`${props.label} ${props.value}${props.suffix ?? "%"}`}
    >
      <div>
        <strong>{props.value}{props.suffix ?? "%"}</strong>
        <span>{props.label}</span>
      </div>
    </div>
  );
}

export function EmptyNotice(props: {
  title: string;
  description: string;
}) {
  return (
    <div className="portal-empty">
      <WorkspaceIcon name="document" />
      <strong>{props.title}</strong>
      <p>{props.description}</p>
    </div>
  );
}
