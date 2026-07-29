export type WorkspaceIconName =
  | "workspace"
  | "schedule"
  | "course"
  | "students"
  | "assignment"
  | "files"
  | "settings"
  | "search"
  | "plus"
  | "bell"
  | "help"
  | "lesson"
  | "slides"
  | "insight"
  | "calendar"
  | "document"
  | "chevron"
  | "clock"
  | "check"
  | "warning";

const iconPaths: Record<WorkspaceIconName, string[]> = {
  workspace: [
    "M4 4h6v6H4z",
    "M14 4h6v6h-6z",
    "M4 14h6v6H4z",
    "M14 14h6v6h-6z"
  ],
  schedule: [
    "M4 5h16v15H4z",
    "M8 3v4",
    "M16 3v4",
    "M4 10h16"
  ],
  course: [
    "M4 5.5 12 3l8 2.5v13L12 21l-8-2.5z",
    "M12 3v18",
    "M7 9h2",
    "M15 9h2"
  ],
  students: [
    "M8.5 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
    "M15.8 10a2.4 2.4 0 1 0 0-4.8",
    "M3.5 20v-2.2c0-2.4 2.1-4.3 5-4.3s5 1.9 5 4.3V20",
    "M14 14c3.4 0 5.5 1.5 5.5 4V20"
  ],
  assignment: [
    "M7 4h10v3H7z",
    "M5 6h14v15H5z",
    "M8 11h8",
    "M8 15h5"
  ],
  files: [
    "M4 4h6l2 3h8v13H4z",
    "M8 12h8",
    "M8 16h5"
  ],
  settings: [
    "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z",
    "M19 14.5l1.5 1-2 3.5-1.8-.8a7.8 7.8 0 0 1-2.2 1.3L14.3 22h-4.6l-.2-2.5a7.8 7.8 0 0 1-2.2-1.3l-1.8.8-2-3.5 1.5-1a8 8 0 0 1 0-5l-1.5-1 2-3.5 1.8.8a7.8 7.8 0 0 1 2.2-1.3L9.7 2h4.6l.2 2.5a7.8 7.8 0 0 1 2.2 1.3l1.8-.8 2 3.5-1.5 1a8 8 0 0 1 0 5z"
  ],
  search: [
    "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z",
    "m16 16 4 4"
  ],
  plus: ["M12 5v14", "M5 12h14"],
  bell: [
    "M6 9a6 6 0 0 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9z",
    "M10 21h4"
  ],
  help: [
    "M9.5 9a2.6 2.6 0 1 1 3.4 2.5c-.9.3-1.4.9-1.4 1.8",
    "M11.5 17h.01",
    "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z"
  ],
  lesson: [
    "M5 4h14v16H5z",
    "M8 8h8",
    "M8 12h5",
    "M8 16h7"
  ],
  slides: [
    "M4 5h16v12H4z",
    "M9 21l3-4 3 4",
    "m9 13 2-3 2 2 2-4"
  ],
  insight: [
    "M4 18h16",
    "M6 15l4-4 3 2 5-6",
    "M18 7h-4",
    "M18 7v4"
  ],
  calendar: [
    "M4 5h16v15H4z",
    "M8 3v4",
    "M16 3v4",
    "M7 11h3",
    "M14 11h3",
    "M7 15h3"
  ],
  document: ["M6 3h9l3 3v15H6z", "M15 3v4h4", "M9 11h6", "M9 15h6"],
  chevron: ["m9 5 7 7-7 7"],
  clock: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M12 7v5l3 2"],
  check: ["m5 12 4 4L19 6"],
  warning: ["M12 3 2 8h-4z", "M12 15h.01", "M4 21h16L12 3z"]
};

export function WorkspaceIcon({
  name,
  className
}: {
  name: WorkspaceIconName;
  className?: string;
}) {
  return (
    <svg
      className={className ?? "workspace-icon"}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {iconPaths[name].map((path) => (
        <path d={path} key={path} />
      ))}
    </svg>
  );
}
