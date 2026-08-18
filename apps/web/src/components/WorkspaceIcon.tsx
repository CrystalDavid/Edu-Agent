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
  | "chevronDown"
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
  | "voice"
  | "send"
  | "user"
  | "organization"
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
    "M4.25 10.25 12 4.5l7.75 5.75v7.15A2.6 2.6 0 0 1 17.15 20H6.85a2.6 2.6 0 0 1-2.6-2.6z",
    "M8.8 15.45c1.9 1.25 4.5 1.25 6.4 0"
  ],
  schedule: [
    "M5.25 5.75h13.5a2 2 0 0 1 2 2v10.5a2 2 0 0 1-2 2H5.25a2 2 0 0 1-2-2V7.75a2 2 0 0 1 2-2z",
    "M8 3.75v4",
    "M16 3.75v4",
    "M3.25 10.25h17.5"
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
    "M3.5 8A2 2 0 0 1 5.5 6h4.75l2 2h6.25a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z",
    "M3.5 10.25h17"
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
  chevronDown: ["m5 9 7 7 7-7"],
  clock: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M12 7v5l3 2"],
  check: ["m5 12 4 4L19 6"],
  warning: ["M12 3 2 8h-4z", "M12 15h.01", "M4 21h16L12 3z"],
  agent: [
    "M12 3.5c5.25 0 9 3.25 9 7.85 0 3.1-1.7 5.8-4.35 7.15l.45 2.45-3.05-1.55c-.65.15-1.35.25-2.05.25-5.25 0-9-3.3-9-8.3S6.75 3.5 12 3.5z",
    "M8.25 11.6h.01",
    "M12 11.6h.01",
    "M15.75 11.6h.01"
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
  voice: [
    "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z",
    "M5 11v1a7 7 0 0 0 14 0v-1",
    "M12 19v3",
    "M8.5 22h7"
  ],
  send: ["m3 11 18-8-8 18-2-7z", "m11 14 10-11"],
  user: ["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M4 21a8 8 0 0 1 16 0"],
  organization: ["M3 10h18", "M5 10v9", "M9.5 10v9", "M14.5 10v9", "M19 10v9", "M3 19h18", "m4 8 8-5 8 5"],
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

const sidebarIconPaths: Partial<Record<WorkspaceIconName, string[]>> = {
  workspace: [
    "M12 3.55c.51 0 1 .17 1.4.48l5.82 4.47c.65.5 1.03 1.28 1.03 2.1v6.35a3.5 3.5 0 0 1-3.5 3.5h-9.5a3.5 3.5 0 0 1-3.5-3.5V10.6c0-.82.38-1.6 1.03-2.1l5.82-4.47c.4-.31.89-.48 1.4-.48Z",
    "M8.45 15.75c2.02 1.28 5.08 1.28 7.1 0"
  ],
  schedule: [
    "M6.45 5.35h11.1a3 3 0 0 1 3 3v8.65a3 3 0 0 1-3 3H6.45a3 3 0 0 1-3-3V8.35a3 3 0 0 1 3-3Z",
    "M8 3.75v3.2",
    "M16 3.75v3.2",
    "M3.45 9.65h17.1"
  ],
  course: [
    "M4.75 5.7c2.4-.5 5.05.15 7.25 1.85v11.7c-2.2-1.7-4.85-2.35-7.25-1.85-.72.15-1.4-.4-1.4-1.14V7.1c0-.67.57-1.26 1.4-1.4Z",
    "M19.25 5.7c-2.4-.5-5.05.15-7.25 1.85v11.7c2.2-1.7 4.85-2.35 7.25-1.85.72.15 1.4-.4 1.4-1.14V7.1c0-.67-.57-1.26-1.4-1.4Z"
  ],
  students: [
    "M12 11.15a3.3 3.3 0 1 0 0-6.6 3.3 3.3 0 0 0 0 6.6Z",
    "M5.25 20v-1.15c0-3.25 2.7-5.45 6.75-5.45s6.75 2.2 6.75 5.45V20"
  ],
  user: [
    "M12 3.05a4.05 4.05 0 1 1 0 8.1 4.05 4.05 0 0 1 0-8.1Z",
    "M12 12.8c4.8 0 8.65 3.2 8.65 7.15 0 .67-.54 1.2-1.2 1.2H4.55c-.66 0-1.2-.53-1.2-1.2 0-3.95 3.85-7.15 8.65-7.15Z"
  ],
  organization: [
    "M11.08 2.72a1.75 1.75 0 0 1 1.84 0l8 4.95A1.75 1.75 0 0 1 20 10.9H4a1.75 1.75 0 0 1-.92-3.23l8-4.95ZM4.25 12h3.2v6.1h2.95V12h3.2v6.1h2.95V12h3.2v6.1h.55a1.45 1.45 0 0 1 0 2.9H3.7a1.45 1.45 0 0 1 0-2.9h.55V12Z"
  ],
  lock: [
    "M8.15 9V7.2a3.85 3.85 0 1 1 7.7 0V9h1.2a2.85 2.85 0 0 1 2.85 2.85v6.3A2.85 2.85 0 0 1 17.05 21H6.95a2.85 2.85 0 0 1-2.85-2.85v-6.3A2.85 2.85 0 0 1 6.95 9h1.2Zm2.4 0h2.9V7.2a1.45 1.45 0 1 0-2.9 0V9Zm1.45 4a1.35 1.35 0 0 0-.7 2.5v1.55a.7.7 0 0 0 1.4 0V15.5A1.35 1.35 0 0 0 12 13Z"
  ],
  files: [
    "M5.7 5.8h4.15c.7 0 1.36.28 1.85.77l1.25 1.23h5.35a2.45 2.45 0 0 1 2.45 2.45v6.8a2.9 2.9 0 0 1-2.9 2.9H6.15a2.9 2.9 0 0 1-2.9-2.9V8.25A2.45 2.45 0 0 1 5.7 5.8Z"
  ],
  agent: [
    "M10.1 3.5h2.3a8.1 8.1 0 0 1 8.1 8.1v.8a8.1 8.1 0 0 1-8.1 8.1H4.5a1 1 0 0 1-1-1v-7.9a8.1 8.1 0 0 1 6.6-7.96Z"
  ]
};

const sidebarFilledPaths: Partial<Record<WorkspaceIconName, string[]>> = {
  workspace: [
    "M4.15 12.1a1.35 1.35 0 0 1 1.35-1.35h1.8a1.35 1.35 0 0 1 1.35 1.35v6.05H4.15V12.1Z",
    "M9.75 6.15a1.35 1.35 0 0 1 1.35-1.35h1.8a1.35 1.35 0 0 1 1.35 1.35v12H9.75v-12Z",
    "M15.35 9.3a1.35 1.35 0 0 1 1.35-1.35h1.8a1.35 1.35 0 0 1 1.35 1.35v8.85h-4.5V9.3Z",
    "M3.4 19.2h17.2a1.1 1.1 0 0 1 0 2.2H3.4a1.1 1.1 0 0 1 0-2.2Z"
  ],
  schedule: [
    "M6.55 2.65h2.8a1.15 1.15 0 0 1 1.15 1.15v3.05H5.4V3.8a1.15 1.15 0 0 1 1.15-1.15Zm8.1 0h2.8A1.15 1.15 0 0 1 18.6 3.8v3.05h-5.1V3.8a1.15 1.15 0 0 1 1.15-1.15Z",
    "M5.25 5.45h13.5A3.25 3.25 0 0 1 22 8.7v8.95a3.7 3.7 0 0 1-3.7 3.7H5.7a3.7 3.7 0 0 1-3.7-3.7V8.7a3.25 3.25 0 0 1 3.25-3.25Zm1.35 5.1c-.66 0-1.2.54-1.2 1.2v4.95c0 .66.54 1.2 1.2 1.2h10.8c.66 0 1.2-.54 1.2-1.2v-4.95c0-.66-.54-1.2-1.2-1.2H6.6Z"
  ],
  course: [
    "M4.3 3.65c2.78-.12 5.55.92 7.7 2.88 2.15-1.96 4.92-3 7.7-2.88 1.13.05 2.05.98 2.05 2.12v10.28c0 1.08-.82 1.98-1.9 2.08-2.58.24-5.06 1.28-7.02 3.02a1.25 1.25 0 0 1-1.66 0c-1.96-1.74-4.44-2.78-7.02-3.02a2.09 2.09 0 0 1-1.9-2.08V5.77c0-1.14.92-2.07 2.05-2.12Zm1.35 3.02v7.83c1.86.25 3.62.82 5.15 1.7V8.38a9.42 9.42 0 0 0-5.15-1.71Zm12.7 0a9.42 9.42 0 0 0-5.15 1.71v7.82a14.65 14.65 0 0 1 5.15-1.7V6.67Z"
  ],
  students: [
    "M12 3.05a4.05 4.05 0 1 1 0 8.1 4.05 4.05 0 0 1 0-8.1Z",
    "M12 12.8c4.8 0 8.65 3.2 8.65 7.15 0 .67-.54 1.2-1.2 1.2H4.55c-.66 0-1.2-.53-1.2-1.2 0-3.95 3.85-7.15 8.65-7.15Z"
  ],
  files: [
    "M5.2 2.8h9.25l4.35 4.35v9.65a2.6 2.6 0 0 1-2.6 2.6h-11a2.6 2.6 0 0 1-2.6-2.6V5.4a2.6 2.6 0 0 1 2.6-2.6Zm8.2 2.35V8.2h3.05L13.4 5.15ZM6.2 11h8.8v2.05H6.2V11Zm0 3.75H15v2.05H6.2v-2.05Z"
  ],
  agent: [
    "M12 3.9c5.55 0 9.5 2.8 9.5 6.55S17.55 17 12 17c-1.05 0-2.05-.12-2.95-.34l-3.3 2.18c-.85.56-1.95-.18-1.74-1.18l.5-2.42a5.9 5.9 0 0 1-2.01-4.79C2.5 6.7 6.45 3.9 12 3.9ZM6.55 10.52a1.05 1.05 0 1 0 2.1 0 1.05 1.05 0 0 0-2.1 0Zm4.4 0a1.05 1.05 0 1 0 2.1 0 1.05 1.05 0 0 0-2.1 0Zm4.4 0a1.05 1.05 0 1 0 2.1 0 1.05 1.05 0 0 0-2.1 0Z"
  ],
  plus: [
    "M10.25 3.75a1.75 1.75 0 0 1 3.5 0v6.5h6.5a1.75 1.75 0 1 1 0 3.5h-6.5v6.5a1.75 1.75 0 1 1-3.5 0v-6.5h-6.5a1.75 1.75 0 1 1 0-3.5h6.5v-6.5Z"
  ],
  arrowLeft: [
    "M15.35 4.65a1.9 1.9 0 0 1 0 2.69L10.69 12l4.66 4.66a1.9 1.9 0 1 1-2.69 2.69l-6-6a1.9 1.9 0 0 1 0-2.69l6-6a1.9 1.9 0 0 1 2.69 0Z"
  ],
  arrowRight: [
    "M8.65 4.65a1.9 1.9 0 0 0 0 2.69L13.31 12l-4.66 4.66a1.9 1.9 0 1 0 2.69 2.69l6-6a1.9 1.9 0 0 0 0-2.69l-6-6a1.9 1.9 0 0 0-2.69 0Z"
  ],
  search: [
    "M10.6 2.4a8.2 8.2 0 1 0 4.94 14.74l4.22 4.22a1.55 1.55 0 0 0 2.2-2.2l-4.22-4.22A8.2 8.2 0 0 0 10.6 2.4Zm0 3a5.2 5.2 0 1 1 0 10.4 5.2 5.2 0 0 1 0-10.4Z"
  ],
  upload: [
    "M10.55 3.95a2.02 2.02 0 0 1 2.9 0l4.2 4.35a1.7 1.7 0 1 1-2.44 2.36l-1.46-1.52v6.46a1.75 1.75 0 1 1-3.5 0V9.14l-1.46 1.52A1.7 1.7 0 1 1 6.35 8.3l4.2-4.35ZM4 18.2a1.7 1.7 0 0 1 1.7-1.7h12.6a1.7 1.7 0 1 1 0 3.4H5.7A1.7 1.7 0 0 1 4 18.2Z"
  ],
  chevronDown: [
    "M5.25 8.45a1.45 1.45 0 0 1 2.05 0L12 13.15l4.7-4.7a1.45 1.45 0 1 1 2.05 2.05l-5.72 5.72a1.45 1.45 0 0 1-2.06 0L5.25 10.5a1.45 1.45 0 0 1 0-2.05Z"
  ],
  voice: [
    "M12 2.3a4 4 0 0 1 4 4v5.45a4 4 0 0 1-8 0V6.3a4 4 0 0 1 4-4Zm-7.25 8.4a1.35 1.35 0 0 1 1.35 1.35 5.9 5.9 0 1 0 11.8 0 1.35 1.35 0 1 1 2.7 0 8.61 8.61 0 0 1-7.15 8.48v1.12h2.25a1.35 1.35 0 1 1 0 2.7H8.3a1.35 1.35 0 1 1 0-2.7h2.45v-1.1a8.61 8.61 0 0 1-7.35-8.5 1.35 1.35 0 0 1 1.35-1.35Z"
  ],
  send: [
    "M10.45 19.15V8.92l-3.1 3.1a1.65 1.65 0 1 1-2.33-2.34l5.81-5.81a1.65 1.65 0 0 1 2.34 0l5.81 5.81a1.65 1.65 0 1 1-2.33 2.34l-3.1-3.1v10.23a1.55 1.55 0 1 1-3.1 0Z"
  ]
};

export function WorkspaceIcon({
  name,
  className,
  variant = "default"
}: {
  name: WorkspaceIconName;
  className?: string;
  variant?: "default" | "sidebar" | "filled" | "profile";
}) {
  if (variant === "filled" && name === "schedule") {
    return (
      <svg
        className={className ?? "workspace-icon"}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <rect x="2.45" y="5.25" width="19.1" height="15.7" rx="3.2" fill="currentColor" />
        <rect x="6.05" y="2.15" width="3.5" height="5.35" rx="1.15" fill="currentColor" />
        <rect x="14.45" y="2.15" width="3.5" height="5.35" rx="1.15" fill="currentColor" />
        <rect x="5.65" y="9.55" width="12.7" height="7.45" rx="1.15" fill="#fff" />
        <rect x="7.18" y="4.7" width="1.24" height="2.6" rx="0.62" fill="#fff" />
        <rect x="15.58" y="4.7" width="1.24" height="2.6" rx="0.62" fill="#fff" />
      </svg>
    );
  }

  if (variant === "profile") {
    const profileArtwork: Partial<Record<WorkspaceIconName, { base: string[]; detail: string[] }>> = {
      user: {
        base: [
          "M4.8 3.4h14.4A2.8 2.8 0 0 1 22 6.2v11.6a2.8 2.8 0 0 1-2.8 2.8H4.8A2.8 2.8 0 0 1 2 17.8V6.2a2.8 2.8 0 0 1 2.8-2.8Z"
        ],
        detail: [
          "M8.25 11.05a2.35 2.35 0 1 0 0-4.7 2.35 2.35 0 0 0 0 4.7Zm-3.35 5.4c.3-2.15 1.62-3.55 3.35-3.55s3.05 1.4 3.35 3.55H4.9Zm8.9-8.4h3.9v1.55h-3.9V8.05Zm0 3.25h3.9v1.55h-3.9V11.3Z"
        ]
      },
      organization: {
        base: [
          "M11.1 2.65a1.75 1.75 0 0 1 1.8 0l8.05 4.85A1.75 1.75 0 0 1 20.05 10H3.95a1.75 1.75 0 0 1-.9-2.5l8.05-4.85ZM4.1 11.25h15.8v7.1h.65a1.55 1.55 0 0 1 0 3.1H3.45a1.55 1.55 0 0 1 0-3.1h.65v-7.1Z"
        ],
        detail: [
          "M6.4 12.2h2.25v5.95H6.4V12.2Zm4.47 0h2.26v5.95h-2.26V12.2Zm4.48 0h2.25v5.95h-2.25V12.2Z"
        ]
      },
      agent: {
        base: [
          "M12 3.65c5.35 0 9.15 2.72 9.15 6.42 0 3.7-3.8 6.43-9.15 6.43-.93 0-1.82-.1-2.63-.28l-3.2 2.12c-.78.52-1.8-.17-1.6-1.09l.47-2.25a5.72 5.72 0 0 1-2.19-4.93c0-3.7 3.8-6.42 9.15-6.42Z"
        ],
        detail: [
          "M7.55 10.08a1.02 1.02 0 1 1 2.04 0 1.02 1.02 0 0 1-2.04 0Zm3.43 0a1.02 1.02 0 1 1 2.04 0 1.02 1.02 0 0 1-2.04 0Zm3.43 0a1.02 1.02 0 1 1 2.04 0 1.02 1.02 0 0 1-2.04 0Z"
        ]
      },
      lock: {
        base: [
          "M12 2.25 20.25 5v6.35c0 5.15-3.15 8.95-8.25 10.4-5.1-1.45-8.25-5.25-8.25-10.4V5L12 2.25Z"
        ],
        detail: [
          "M9.05 10.35V8.9a2.95 2.95 0 1 1 5.9 0v1.45h.7v5.55h-7.3v-5.55h.7Zm1.65 0h2.6V8.9a1.3 1.3 0 1 0-2.6 0v1.45Z"
        ]
      }
    };
    const artwork = profileArtwork[name];
    if (artwork) {
      return (
        <svg
          className={className ?? "workspace-icon"}
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          {artwork.base.map((path) => (
            <path d={path} fill="currentColor" fillRule="evenodd" clipRule="evenodd" key={path} />
          ))}
          {artwork.detail.map((path) => (
            <path d={path} fill="var(--profile-icon-detail, #f6f7f9)" fillRule="evenodd" clipRule="evenodd" key={path} />
          ))}
        </svg>
      );
    }
  }

  if (variant === "filled" && name === "course") {
    return (
      <svg
        className={className ?? "workspace-icon"}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M4.65 4.55c2.7-.18 5.35.72 7.35 2.55 2-1.83 4.65-2.73 7.35-2.55A2.85 2.85 0 0 1 22 7.4v9.35a2.65 2.65 0 0 1-2.75 2.65c-2.3-.08-4.55.7-6.25 2.15a1.55 1.55 0 0 1-2 0C9.3 20.1 7.05 19.32 4.75 19.4A2.65 2.65 0 0 1 2 16.75V7.4a2.85 2.85 0 0 1 2.65-2.85Z"
          fill="currentColor"
        />
        <path
          d="M5.35 7.15c2.15-.05 4.15.62 5.55 1.9v8.65c-1.55-.78-3.45-1.18-5.55-1.08V7.15Zm13.3 0c-2.15-.05-4.15.62-5.55 1.9v8.65c1.55-.78 3.45-1.18 5.55-1.08V7.15Z"
          fill="#fff"
          fillOpacity="0.68"
        />
        <path
          d="M12 7.55v11.8M5.65 15.1c2.05.04 3.85.54 5.35 1.5m7.35-1.5c-2.05.04-3.85.54-5.35 1.5"
          stroke="currentColor"
          strokeOpacity="0.52"
          strokeWidth="0.85"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (variant === "filled" && name === "folder") {
    return (
      <svg
        className={className ?? "workspace-icon"}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M4.85 4.35h5.05c.62 0 1.22.25 1.66.69l1.4 1.41h6.2A2.84 2.84 0 0 1 22 9.29v7.86A3.85 3.85 0 0 1 18.15 21H5.85A3.85 3.85 0 0 1 2 17.15V7.2a2.85 2.85 0 0 1 2.85-2.85Z"
          fill="currentColor"
        />
        <path
          d="M5.45 9.15h13.1"
          stroke="#fff"
          strokeOpacity="0.7"
          strokeWidth="1.45"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (variant === "filled") {
    const filledPaths = sidebarFilledPaths[name];
    if (filledPaths?.length) {
      return (
        <svg
          className={className ?? "workspace-icon"}
          viewBox="0 0 24 24"
          fill="currentColor"
          stroke="none"
          aria-hidden="true"
        >
          {filledPaths.map((path) => (
            <path d={path} fillRule="evenodd" clipRule="evenodd" key={path} />
          ))}
        </svg>
      );
    }

    // Not every workspace glyph has a dedicated silhouette yet. Keep those
    // glyphs visibly bold instead of returning an empty SVG for `filled`.
    return (
      <svg
        className={className ?? "workspace-icon"}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
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

  const paths = variant === "sidebar"
    ? sidebarIconPaths[name] ?? iconPaths[name]
    : iconPaths[name];

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
      {paths.map((path) => (
        <path d={path} key={path} />
      ))}
    </svg>
  );
}
