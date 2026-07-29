import type { TeacherWorkspace } from "@edu-agent/contracts";
import { Button, Tag } from "antd";

import {
  cleanDisplayText,
  formatDisplayDate,
  teachingPlanStateLabel
} from "../presentation";
import type { AppRoute } from "../route";

type QuickIconName =
  | "goal"
  | "evidence"
  | "copilot"
  | "plan"
  | "runs";

const quickLinks: Array<{
  label: string;
  route: AppRoute;
  icon: QuickIconName;
  tone: string;
}> = [
  {
    label: "教学目标",
    route: "/goals",
    icon: "goal",
    tone: "blue"
  },
  {
    label: "学习证据",
    route: "/evidence",
    icon: "evidence",
    tone: "orange"
  },
  {
    label: "教师助手",
    route: "/copilot",
    icon: "copilot",
    tone: "purple"
  },
  {
    label: "教学计划",
    route: "/teaching-plan",
    icon: "plan",
    tone: "cyan"
  },
  {
    label: "运行记录",
    route: "/runs",
    icon: "runs",
    tone: "green"
  }
];

function QuickIcon({ name }: { name: QuickIconName }) {
  const paths: Record<QuickIconName, string[]> = {
    goal: [
      "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
      "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z",
      "M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"
    ],
    evidence: ["M5 3h14v18H5z", "M8 8h8", "M8 12h8", "M8 16h5"],
    copilot: [
      "M7 7.5A5 5 0 0 1 17 7.5v3A5 5 0 0 1 12 15a5 5 0 0 1-5-4.5z",
      "M9 19h6",
      "M12 15v4",
      "M4 9h3",
      "M17 9h3"
    ],
    plan: ["M6 3h12v18H6z", "M9 8h6", "M9 12h6", "M9 16h4"],
    runs: ["M4 12a8 8 0 1 0 2.3-5.7L4 8.6", "M4 4v4.6h4.6", "M12 8v5l3 2"]
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name].map((path) => (
        <path d={path} key={path} />
      ))}
    </svg>
  );
}

export function DashboardPage(props: {
  workspace: TeacherWorkspace;
  navigate: (route: AppRoute) => void;
}) {
  const pending = props.workspace.pendingSuggestions.filter(
    (item) => item.status === "pending"
  ).length;
  const teacherName = cleanDisplayText(
    props.workspace.identity.teacherName
  );
  const className = cleanDisplayText(
    props.workspace.courseRun.className
  );
  const planState = teachingPlanStateLabel(
    props.workspace.latestTeachingPlan.state
  );
  const quickStatus: Record<QuickIconName, string> = {
    goal: "1 个目标待持续验证",
    evidence: `${props.workspace.evidence.observations.length} 条直接观察`,
    copilot: pending ? `${pending} 条建议待处理` : "可生成课堂策略",
    plan: `${planState} · 第 ${props.workspace.latestTeachingPlan.revisionNumber} 版`,
    runs: "查看最近一次过程"
  };

  return (
    <div className="dashboard-page">
      <header className="dashboard-greeting">
        <div>
          <h1>工作台</h1>
          <p>上午好，{teacherName}</p>
        </div>
        <span>{className} · {props.workspace.courseRun.subject}</span>
      </header>

      <section
        className="teaching-headline"
        aria-labelledby="headline-title"
      >
        <div className="teaching-headline__content">
          <span className="headline-label">明日教学重点</span>
          <h2 id="headline-title">
            先帮助学生理解“斜率为什么改变图像”
          </h2>
          <p>当前缺少新情境下的独立解释证据</p>
          <div className="headline-actions">
            <Button
              className="headline-primary"
              onClick={() => props.navigate("/copilot")}
            >
              打开教师助手
            </Button>
            <Button
              className="headline-secondary"
              onClick={() => props.navigate("/evidence")}
            >
              查看学习证据
            </Button>
          </div>
        </div>
        <div className="teaching-headline__visual" aria-hidden="true">
          <svg viewBox="0 0 270 150">
            <path className="visual-grid" d="M28 18v112M76 18v112M124 18v112M172 18v112M220 18v112M18 35h226M18 75h226M18 115h226" />
            <path className="visual-axis" d="M25 120h220M45 132V15" />
            <path className="visual-line visual-line--one" d="m48 108 174-72" />
            <path className="visual-line visual-line--two" d="m48 58 174 46" />
            <circle className="visual-point" cx="128" cy="75" r="5" />
          </svg>
        </div>
      </section>

      <section className="dashboard-section" aria-labelledby="quick-heading">
        <div className="dashboard-section__heading">
          <h2 id="quick-heading">我的常用</h2>
        </div>
        <div className="quick-grid">
          {quickLinks.map((item) => (
            <button
              type="button"
              className="quick-card"
              key={item.route}
              onClick={() => props.navigate(item.route)}
            >
              <span className={`quick-card__icon quick-card__icon--${item.tone}`}>
                <QuickIcon name={item.icon} />
              </span>
              <span className="quick-card__copy">
                <strong>{item.label}</strong>
                <small>{quickStatus[item.icon]}</small>
              </span>
              <span className="quick-card__arrow" aria-hidden="true">›</span>
            </button>
          ))}
        </div>
      </section>

      <section className="dashboard-section" aria-labelledby="todo-heading">
        <div className="dashboard-section__heading">
          <h2 id="todo-heading">今日待办</h2>
          <span>按需要处理，不代表学生完成度</span>
        </div>
        <div className="todo-grid">
          <TodoItem
            count={props.workspace.evidence.claims.length}
            label="待复核解释"
            tone="orange"
            onClick={() => props.navigate("/evidence")}
          />
          <TodoItem
            count={pending}
            label="待处理建议"
            tone="purple"
            onClick={() => props.navigate("/copilot")}
          />
          <TodoItem
            count={
              props.workspace.latestTeachingPlan.state === "in_review"
                ? 1
                : 0
            }
            label="待审教学计划"
            tone="cyan"
            onClick={() => props.navigate("/teaching-plan")}
          />
          <TodoItem
            count={1}
            label="即将复评目标"
            tone="blue"
            onClick={() => props.navigate("/goals")}
          />
        </div>
      </section>

      <section className="dashboard-section" aria-labelledby="insight-heading">
        <div className="dashboard-section__heading">
          <h2 id="insight-heading">教学洞察</h2>
          <button type="button" onClick={() => props.navigate("/evidence")}>
            查看全部
          </button>
        </div>
        <div className="insight-grid">
          <article className="dashboard-card evidence-overview">
            <div className="card-title-row">
              <div>
                <span className="card-eyebrow">学习证据</span>
                <h3>最近直接观察</h3>
              </div>
              <span className="compact-count">
                {props.workspace.evidence.observations.length} 条
              </span>
            </div>
            <div className="evidence-mini-list">
              {props.workspace.evidence.observations
                .slice(0, 2)
                .map((observation) => (
                  <button
                    type="button"
                    key={observation.observationRef}
                    onClick={() => props.navigate("/evidence")}
                  >
                    <span className="student-avatar">
                      {cleanDisplayText(observation.learnerLabel)
                        .replace("学生 ", "")
                        .slice(-2)}
                    </span>
                    <span className="evidence-mini-list__content">
                      <strong>
                        {cleanDisplayText(observation.learnerLabel)}
                      </strong>
                      <small>{observation.summary}</small>
                    </span>
                    <span className="evidence-mini-list__meta">
                      <Tag>
                        {observation.assistance.answerReleased
                          ? "使用辅助"
                          : "独立作答"}
                      </Tag>
                      <time>{formatDisplayDate(observation.observedAt)}</time>
                    </span>
                  </button>
                ))}
            </div>
          </article>

          <div className="insight-side">
            <article className="dashboard-card goal-overview">
              <div className="card-title-row">
                <div>
                  <span className="card-eyebrow">当前教学目标</span>
                  <h3>{props.workspace.goal.title}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => props.navigate("/goals")}
                >
                  查看
                </button>
              </div>
              <p>
                已有方向判断证据；仍需验证学生能否在新情境中独立解释。
              </p>
              <div className="coverage-note">
                <span aria-hidden="true" />
                证据覆盖部分条件，不代表已经掌握
              </div>
            </article>

            <article className="dashboard-card plan-overview">
              <div className="card-title-row">
                <div>
                  <span className="card-eyebrow">最近教学计划</span>
                  <h3>{props.workspace.latestTeachingPlan.title}</h3>
                </div>
                <Tag>{planState}</Tag>
              </div>
              <p>
                第 {props.workspace.latestTeachingPlan.revisionNumber} 版 ·{" "}
                {props.workspace.latestTeachingPlan.content.lessonFocus}
              </p>
              <button
                type="button"
                onClick={() => props.navigate("/teaching-plan")}
              >
                查看变更
              </button>
            </article>
          </div>
        </div>
      </section>

      <section className="dashboard-section recent-section" aria-labelledby="recent-heading">
        <div className="dashboard-section__heading">
          <h2 id="recent-heading">最近活动</h2>
        </div>
        <div className="dashboard-card recent-activity">
          <ActivityItem
            tone="purple"
            title="生成课堂调整建议"
            detail="教师助手准备了两种可比较策略"
            time="今天 09:20"
          />
          <ActivityItem
            tone="cyan"
            title="更新教学计划"
            detail={`保存为第 ${props.workspace.latestTeachingPlan.revisionNumber} 版${planState}`}
            time="昨天 16:45"
          />
          <ActivityItem
            tone="orange"
            title="复核学习证据"
            detail="保留两条解释等待课堂验证"
            time="昨天 15:30"
          />
          <ActivityItem
            tone="blue"
            title="查看运行记录"
            detail="确认建议来源与教师控制边界"
            time="昨天 15:28"
          />
        </div>
      </section>
    </div>
  );
}

function TodoItem(props: {
  count: number;
  label: string;
  tone: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="todo-card" onClick={props.onClick}>
      <span className={`todo-card__marker todo-card__marker--${props.tone}`} />
      <strong>{props.count}</strong>
      <span>{props.label}</span>
      <span aria-hidden="true">›</span>
    </button>
  );
}

function ActivityItem(props: {
  tone: string;
  title: string;
  detail: string;
  time: string;
}) {
  return (
    <article>
      <span className={`activity-dot activity-dot--${props.tone}`} />
      <div>
        <strong>{props.title}</strong>
        <small>{props.detail}</small>
      </div>
      <time>{props.time}</time>
    </article>
  );
}
