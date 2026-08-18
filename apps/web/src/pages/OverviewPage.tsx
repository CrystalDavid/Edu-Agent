import type { TeacherWorkspace } from "@edu-agent/contracts";

import { cleanDisplayText } from "../presentation";
import type { AppRoute } from "../route";

export function OverviewPage(props: {
  workspace: TeacherWorkspace;
  navigate: (route: AppRoute) => void;
  navigateLesson: (lessonRef: string) => void;
  navigateFiles: (context?: { assetRef?: string; lessonRef?: string }) => void;
  navigatePreparation: (
    taskRef: string,
    destination?: "/agent" | "/copilot" | "/teaching-plan" | "/runs"
  ) => void;
}) {
  const teacherName = cleanDisplayText(props.workspace.identity.teacherName);

  return (
    <div className="portal-page overview-page" data-testid="overview-page">
      <header className="overview-minimal-header">
        <h1>你好，{teacherName}</h1>
        <p>{formatToday()}</p>
      </header>
    </div>
  );
}

function formatToday(): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long"
  }).format(new Date());
}
