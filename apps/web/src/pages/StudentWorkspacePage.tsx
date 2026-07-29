import { useState } from "react";

import type { AppRoute } from "../route";
import type { StudentRecord } from "../teacher-portal-data";
import {
  ClassOverview,
  StudentDetail,
  StudentPriorityList
} from "../components/portal/StudentComponents";
import { PageHeader } from "../components/portal/PortalPrimitives";

export function StudentWorkspacePage(props: {
  navigate: (route: AppRoute) => void;
  onAction: (message: string) => void;
}) {
  const [selected, setSelected] = useState<StudentRecord | null>(null);
  const handleAction = (action: string) => {
    if (action.includes("Agent") || action.includes("深入分析")) {
      window.sessionStorage.setItem("agent-prefill", `${selected?.name ?? "班级"}：${action}`);
      props.navigate("/agent");
      return;
    }
    if (action === "查看分析依据") {
      props.navigate("/evidence");
      return;
    }
    props.onAction(`${action}：已创建演示草稿，不会直接形成正式教学决定。`);
  };
  return (
    <div className="portal-page students-page" data-testid="students-page">
      <PageHeader title="学生" subtitle="先看班级整体变化，再按需进入学生详情和分析依据" />
      <div className="students-workspace">
        <StudentPriorityList selectedId={selected?.id ?? null} onSelect={setSelected} />
        <section className="student-content">
          {selected ? (
            <StudentDetail student={selected} onAction={handleAction} />
          ) : (
            <ClassOverview onSelectStudent={setSelected} />
          )}
        </section>
      </div>
    </div>
  );
}
