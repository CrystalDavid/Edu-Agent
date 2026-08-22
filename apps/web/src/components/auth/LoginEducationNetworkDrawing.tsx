type NetworkRole = "teacher" | "student" | "parent";

function RoleGlyph(props: {
  role: NetworkRole;
  centerX: number;
  top: number;
  accent: string;
  soft: string;
}) {
  const { role, centerX: cx, top, accent, soft } = props;

  if (role === "teacher") {
    return (
      <g>
        <rect
          x={cx + 7}
          y={top + 15}
          width="29"
          height="24"
          rx="4"
          fill={soft}
          stroke={accent}
          strokeOpacity="0.22"
        />
        <path
          d={`M${cx + 21.5} ${top + 39}v7m-8 0h16`}
          fill="none"
          stroke={accent}
          strokeLinecap="round"
          strokeWidth="3"
        />
        <circle cx={cx - 10} cy={top + 12} r="13" fill={accent} />
        <path
          d={`M${cx - 32} ${top + 48}c1-15 9-23 22-23s21 8 22 23Z`}
          fill={accent}
        />
      </g>
    );
  }

  if (role === "student") {
    return (
      <g>
        <circle cx={cx - 10} cy={top + 12} r="13" fill={accent} />
        <path
          d={`M${cx - 31} ${top + 49}c1-15 8-24 21-24s20 9 21 24Z`}
          fill={accent}
        />
        <path
          d={`M${cx + 1} ${top + 31}q10-5 20 1v22q-10-6-20-1Zm0 0q-10-5-20 1v22q10-6 20-1Z`}
          fill={soft}
          stroke="#ffffff"
          strokeLinejoin="round"
          strokeWidth="2"
        />
        <path d={`M${cx + 1} ${top + 31}v22`} stroke={accent} strokeOpacity="0.4" strokeWidth="2" />
      </g>
    );
  }

  return (
    <g>
      <circle cx={cx - 10} cy={top + 12} r="13" fill={accent} />
      <path
        d={`M${cx - 32} ${top + 49}c1-15 9-24 22-24s21 9 22 24Z`}
        fill={accent}
      />
      <circle cx={cx + 19} cy={top + 23} r="9" fill={soft} />
      <path
        d={`M${cx + 4} ${top + 49}c1-11 6-17 15-17s14 6 15 17Z`}
        fill={soft}
      />
    </g>
  );
}

function RoleCard(props: {
  x: number;
  y: number;
  role: NetworkRole;
  title: string;
  description: string;
  accent: string;
  soft: string;
}) {
  const { x, y, role, title, description, accent, soft } = props;
  const centerX = x + 96;

  return (
    <g>
      <rect
        x={x}
        y={y}
        width="192"
        height="210"
        rx="19"
        fill="#ffffff"
        stroke="#e6edf7"
        strokeWidth="1.5"
        filter="url(#login-network-card-shadow)"
      />
      <RoleGlyph role={role} centerX={centerX} top={y + 28} accent={accent} soft={soft} />
      <text className="login-network-card-title" x={centerX} y={y + 119} textAnchor="middle">
        {title}
      </text>
      <text className="login-network-card-copy" x={centerX} y={y + 157} textAnchor="middle">
        {description}
      </text>
      <path
        d={`M${centerX - 15} ${y + 178}h30`}
        fill="none"
        stroke={accent}
        strokeLinecap="round"
        strokeWidth="4"
      />
    </g>
  );
}

const NETWORK_NODES = [
  [252, 560],
  [363, 378],
  [624, 378],
  [731, 560],
  [386, 790],
  [592, 790]
] as const;

export function LoginEducationNetworkDrawing() {
  return (
    <>
      <defs>
        <linearGradient id="login-network-bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#f8fbff" />
          <stop offset="0.56" stopColor="#f3f8ff" />
          <stop offset="1" stopColor="#edf5ff" />
        </linearGradient>
        <radialGradient id="login-network-light" cx="0" cy="0" r="1" gradientTransform="translate(508 548) rotate(90) scale(520 492)" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.98" />
          <stop offset="0.62" stopColor="#f5f9ff" stopOpacity="0.45" />
          <stop offset="1" stopColor="#e8f2ff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="login-network-logo-front" x1="54" x2="123" y1="54" y2="132" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#1f72ff" />
          <stop offset="1" stopColor="#0757ed" />
        </linearGradient>
        <linearGradient id="login-network-logo-back" x1="88" x2="148" y1="43" y2="118" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#76b5ff" />
          <stop offset="1" stopColor="#438ff4" />
        </linearGradient>
        <linearGradient id="login-network-center-front" x1="425" x2="522" y1="521" y2="642" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#98bdf8" />
          <stop offset="1" stopColor="#76a2ed" />
        </linearGradient>
        <linearGradient id="login-network-center-back" x1="466" x2="551" y1="497" y2="612" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#d3e3fc" />
          <stop offset="1" stopColor="#b8d1f6" />
        </linearGradient>
        <radialGradient id="login-network-floor" cx="0" cy="0" r="1" gradientTransform="translate(490 860) rotate(90) scale(48 294)" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#a9caf5" stopOpacity="0.34" />
          <stop offset="1" stopColor="#cfe1fa" stopOpacity="0" />
        </radialGradient>
        <filter id="login-network-card-shadow" x="-22%" y="-18%" width="144%" height="146%" colorInterpolationFilters="sRGB">
          <feDropShadow dx="0" dy="10" stdDeviation="13" floodColor="#597aa8" floodOpacity="0.13" />
        </filter>
        <filter id="login-network-logo-shadow" x="-35%" y="-30%" width="170%" height="170%" colorInterpolationFilters="sRGB">
          <feDropShadow dx="0" dy="11" stdDeviation="12" floodColor="#7195c7" floodOpacity="0.16" />
        </filter>
        <filter id="login-network-blur" x="-30%" y="-80%" width="160%" height="260%">
          <feGaussianBlur stdDeviation="13" />
        </filter>
      </defs>

      <rect width="1024" height="1152" fill="url(#login-network-bg)" />
      <rect width="1024" height="1152" fill="url(#login-network-light)" />

      <path
        d="M0 708c139 82 224 193 288 444H0Z"
        fill="#eaf3ff"
        fillOpacity="0.88"
      />
      <path
        d="M0 839c94 63 166 155 226 313H0Z"
        fill="#f2f7ff"
        fillOpacity="0.92"
      />

      <g filter="url(#login-network-logo-shadow)">
        <rect x="84" y="45" width="57" height="72" rx="14" fill="url(#login-network-logo-back)" transform="rotate(8 112.5 81)" />
        <rect x="60" y="58" width="55" height="71" rx="14" fill="url(#login-network-logo-front)" transform="rotate(2 87.5 93.5)" />
        <circle cx="131" cy="117" r="8" fill="#ff8a1c" stroke="#ffffff" strokeWidth="3" />
      </g>
      <text className="login-network-brand-title" x="168" y="88">教育智能工作台</text>
      <text className="login-network-brand-subtitle" x="168" y="128">Edu-Agent</text>

      <g fill="#d5e6ff" opacity="0.82">
        {Array.from({ length: 6 }, (_, row) =>
          Array.from({ length: 7 }, (_, column) => (
            <circle key={`${row}-${column}`} cx={53 + column * 19} cy={295 + row * 19} r="3.2" />
          ))
        )}
      </g>

      <g fill="none">
        <circle cx="491" cy="560" r="239" stroke="#a9ccff" strokeDasharray="8 8" strokeLinecap="round" strokeWidth="2.2" />
        <circle cx="491" cy="560" r="194" stroke="#dceaff" strokeWidth="2.2" />
        <circle cx="491" cy="560" r="151" stroke="#cfe1fb" strokeWidth="2" />
      </g>

      <g>
        {NETWORK_NODES.map(([cx, cy]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="5" fill="#ffffff" stroke="#9fc5fb" strokeWidth="2.3" />
        ))}
      </g>

      <ellipse cx="491" cy="861" rx="281" ry="42" fill="url(#login-network-floor)" filter="url(#login-network-blur)" />
      <ellipse cx="491" cy="858" rx="140" ry="19" fill="#b9d4f6" fillOpacity="0.18" />

      <g filter="url(#login-network-logo-shadow)">
        <rect x="461" y="507" width="79" height="104" rx="18" fill="url(#login-network-center-back)" transform="rotate(8 500.5 559)" />
        <rect x="436" y="530" width="76" height="104" rx="18" fill="url(#login-network-center-front)" transform="rotate(2 474 582)" />
        <circle cx="534" cy="614" r="11" fill="#ffbd6b" stroke="#ffffff" strokeWidth="3" />
      </g>

      <RoleCard
        x={395}
        y={261}
        role="teacher"
        title="教师端"
        description="课程与备课"
        accent="#2f75f5"
        soft="#a9c8fb"
      />
      <RoleCard
        x={166}
        y={575}
        role="student"
        title="学生端"
        description="学习任务"
        accent="#2bb7aa"
        soft="#91ddd4"
      />
      <RoleCard
        x={619}
        y={575}
        role="parent"
        title="家长端"
        description="成长反馈"
        accent="#735ee8"
        soft="#b7acf4"
      />

      <g className="login-network-caption" transform="translate(250 986)">
        <circle cx="10" cy="5" r="7" fill="none" stroke="#8297b6" strokeWidth="3" />
        <path d="M-2 27c1-10 5-15 12-15s11 5 12 15" fill="none" stroke="#8297b6" strokeLinecap="round" strokeWidth="3" />
        <circle cx="30" cy="10" r="6" fill="none" stroke="#8297b6" strokeWidth="3" />
        <path d="M21 29c1-8 4-12 9-12s9 4 10 12" fill="none" stroke="#8297b6" strokeLinecap="round" strokeWidth="3" />
        <text x="56" y="26">连接教师、学生与家长，让协同更清晰</text>
      </g>
    </>
  );
}
