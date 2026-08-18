import { useState } from "react";

import { cleanDisplayText } from "../../presentation";

export function TeacherAvatar(props: {
  displayName: string;
  size?: number;
  className?: string;
}) {
  const displayName = cleanDisplayText(props.displayName) || "教师";
  const [imageFailed, setImageFailed] = useState(false);
  const baseUrl = import.meta.env.BASE_URL.endsWith("/")
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  const imageSource = `${baseUrl}images/teacher-lin-avatar-anime.png`;
  const size = props.size ?? 40;
  const className = ["teacher-avatar", props.className].filter(Boolean).join(" ");

  return (
    <span
      className={className}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${displayName}的头像`}
    >
      {imageFailed ? (
        <span className="teacher-avatar__fallback">{displayName.slice(0, 1)}</span>
      ) : (
        <img
          src={imageSource}
          alt=""
          onError={() => setImageFailed(true)}
        />
      )}
    </span>
  );
}
