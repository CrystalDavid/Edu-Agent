import { Avatar } from "antd";

import { cleanDisplayText } from "../../presentation";

export function TeacherAvatar(props: {
  displayName: string;
  size?: number;
  className?: string;
}) {
  const displayName = cleanDisplayText(props.displayName) || "教师";
  const imageSource = displayName === "林老师"
    ? "/images/teacher-lin-avatar.png"
    : undefined;

  return (
    <Avatar
      size={props.size ?? 40}
      className={props.className ?? "teacher-avatar"}
      {...(imageSource ? { src: imageSource } : {})}
    >
      {displayName.slice(0, 1)}
    </Avatar>
  );
}
