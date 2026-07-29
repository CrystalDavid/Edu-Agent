import { WorkspaceIcon } from "../components/WorkspaceIcon";
import { todaySchedule } from "../demo-read-model";
import type { AppRoute } from "../route";

export function SchedulePage(props: {
  navigate: (route: AppRoute) => void;
}) {
  return (
    <div className="task-page">
      <header className="task-page__header">
        <div>
          <h1>日程</h1>
          <p>今天 · 3 节课、1 次备课、1 次批改、1 场会议</p>
        </div>
        <button
          type="button"
          className="primary-action"
          onClick={() => props.navigate("/")}
        >
          返回工作台
        </button>
      </header>

      <div className="page-grid page-grid--schedule">
        <section className="plain-panel" aria-labelledby="schedule-day">
          <div className="section-heading">
            <h2 id="schedule-day">今天</h2>
          </div>
          <div className="day-timeline">
            {todaySchedule.map((item) => (
              <article key={`${item.time}:${item.title}`}>
                <time>{item.time}</time>
                <span className="timeline-dot" aria-hidden="true" />
                <div>
                  <small>{item.kind}</small>
                  <p>{item.title}</p>
                </div>
                {item.kind === "备课" ? (
                  <button
                    type="button"
                    onClick={() => props.navigate("/files")}
                  >
                    打开材料
                  </button>
                ) : null}
              </article>
            ))}
          </div>
        </section>

        <aside className="plain-panel schedule-todos">
          <div className="section-heading">
            <h2>待办</h2>
          </div>
          <label>
            <input type="checkbox" />
            <span>
              完成一次函数课件
              <small>今天 17:30</small>
            </span>
          </label>
          <label>
            <input type="checkbox" />
            <span>
              核对 4 名未交作业学生
              <small>今天 18:00</small>
            </span>
          </label>
          <label>
            <input type="checkbox" />
            <span>
              准备明日课堂追问
              <small>明天上课前</small>
            </span>
          </label>
          <p className="read-only-note">
            当前为演示日程；勾选状态仅在本页临时保留。
          </p>
        </aside>
      </div>
    </div>
  );
}
