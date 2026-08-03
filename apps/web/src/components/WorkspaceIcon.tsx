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
  | "warning"
  | "agent"
  | "more"
  | "close"
  | "upload"
  | "download"
  | "edit"
  | "trash"
  | "grid"
  | "list"
  | "filter"
  | "sort"
  | "message"
  | "attachment"
  | "send"
  | "user"
  | "lock"
  | "memory"
  | "automation"
  | "eye"
  | "reset"
  | "star"
  | "folder"
  | "chart"
  | "arrowLeft"
  | "arrowRight";

const iconPaths: Record<WorkspaceIconName, string[]> = {
  workspace: [
    "M4.5 4.5h6v6h-6z",
    "M13.5 4.5h6v6h-6z",
    "M4.5 13.5h6v6h-6z",
    "M13.5 13.5h6v6h-6z"
  ],
  schedule: [
    "M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V7A1.5 1.5 0 0 1 5 5.5z",
    "M8 3.5v4",
    "M16 3.5v4",
    "M3.5 10h17"
  ],
  course: [
    "M4 5.5c2.7-.9 5.4-.5 8 1.2v13c-2.6-1.7-5.3-2.1-8-1.2z",
    "M20 5.5c-2.7-.9-5.4-.5-8 1.2v13c2.6-1.7 5.3-2.1 8-1.2z"
  ],
  students: [
    "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
    "M16.5 10a2.5 2.5 0 1 0 0-5",
    "M3.5 20v-1.5c0-2.8 2.2-5 5.5-5s5.5 2.2 5.5 5V20",
    "M15.5 14.5c3 0 5 1.7 5 4.2V20"
  ],
  assignment: [
    "M7 4h10v3H7z",
    "M5 6h14v15H5z",
    "M8 11h8",
    "M8 15h5"
  ],
  files: [
    "M3.5 7.5A1.5 1.5 0 0 1 5 6h5l2 2h7A1.5 1.5 0 0 1 20.5 9.5v8A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z",
    "M3.5 10h17"
  ],
  settings: [
    "M4 7h10",
    "M18 7h2",
    "M14 7a2 2 0 1 0 4 0 2 2 0 0 0-4 0z",
    "M4 17h2",
    "M10 17h10",
    "M6 17a2 2 0 1 0 4 0 2 2 0 0 0-4 0z"
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
  warning: ["M12 3 2 8h-4z", "M12 15h.01", "M4 21h16L12 3z"],
  agent: [
    "M5 6.5h14A1.5 1.5 0 0 1 20.5 8v9A1.5 1.5 0 0 1 19 18.5h-7l-4.5 2v-2H5A1.5 1.5 0 0 1 3.5 17V8A1.5 1.5 0 0 1 5 6.5z",
    "M8 12h.01",
    "M12 12h.01",
    "M16 12h.01"
  ],
  more: ["M5 12h.01", "M12 12h.01", "M19 12h.01"],
  close: ["M6 6l12 12", "M18 6 6 18"],
  upload: ["M12 16V4", "m7 9 5-5 5 5", "M5 20h14"],
  download: ["M12 4v12", "m7 11 5 5 5-5", "M5 20h14"],
  edit: ["M4 20h4L19 9l-4-4L4 16z", "m13 4 4 4"],
  trash: ["M5 7h14", "M9 7V4h6v3", "M8 7l1 13h6l1-13"],
  grid: ["M4 4h6v6H4z", "M14 4h6v6h-6z", "M4 14h6v6H4z", "M14 14h6v6h-6z"],
  list: ["M8 6h12", "M8 12h12", "M8 18h12", "M4 6h.01", "M4 12h.01", "M4 18h.01"],
  filter: ["M4 5h16l-6 7v6l-4 2v-8z"],
  sort: ["M8 6h10", "M8 12h7", "M8 18h4", "m4 5-2 2-2-2", "M2 7v11"],
  message: ["M4 5h16v12H9l-5 4z"],
  attachment: ["m8 12 6-6a3 3 0 0 1 4 4l-7 7a5 5 0 0 1-7-7l7-7"],
  send: ["m3 11 18-8-8 18-2-7z", "m11 14 10-11"],
  user: ["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M4 21a8 8 0 0 1 16 0"],
  lock: ["M6 10h12v10H6z", "M8 10V7a4 4 0 0 1 8 0v3"],
  memory: ["M8 4h8a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4z", "M9 9h6", "M9 13h4"],
  automation: ["M12 3v4", "M12 17v4", "M3 12h4", "M17 12h4", "M7 7l3 3", "m17 7-3 3", "m7 17 3-3", "m17 17-3-3"],
  eye: ["M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"],
  reset: ["M4 7v5h5", "M5 12a7 7 0 1 0 2-5"],
  star: ["m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"],
  folder: ["M3 6h7l2 2h9v11H3z"],
  chart: ["M4 20V9", "M10 20V4", "M16 20v-7", "M22 20H2"],
  arrowLeft: ["m15 18-6-6 6-6"],
  arrowRight: ["m9 18 6-6-6-6"]
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
      strokeWidth="1.8"
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
