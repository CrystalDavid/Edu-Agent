const OUTLINE = "#29353a";
const WINDOW = "#b8c8d0";

export function LoginCampusDrawing() {
  return (
    <>
      <defs>
        <linearGradient id="login-campus-roof" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#c8d2d8" />
          <stop offset="0.58" stopColor="#aebdc7" />
          <stop offset="1" stopColor="#8f9faa" />
        </linearGradient>
        <linearGradient id="login-campus-wall" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#fffef3" />
          <stop offset="1" stopColor="#eeeade" />
        </linearGradient>
        <linearGradient id="login-campus-accent" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#f1deda" />
          <stop offset="1" stopColor="#d8c4c1" />
        </linearGradient>
        <filter id="login-campus-shadow" x="-10%" y="-10%" width="120%" height="130%">
          <feDropShadow dx="0" dy="5" stdDeviation="5" floodColor="#52666d" floodOpacity="0.13" />
        </filter>

        <g id="login-campus-window-narrow">
          <path d="M1 48V13C1 5.7 5.2 1 10 1s9 4.7 9 12v35Z" fill={WINDOW} />
          <path d="M1 48V13C1 5.7 5.2 1 10 1s9 4.7 9 12v35Z" fill="none" />
          <path d="M10 2v46M2 16h16M2 31h16" />
        </g>
        <g id="login-campus-window-wide">
          <path d="M1 52V16C1 6.5 7.3 1 15 1s14 5.5 14 15v36Z" fill={WINDOW} />
          <path d="M1 52V16C1 6.5 7.3 1 15 1s14 5.5 14 15v36Z" fill="none" />
          <path d="M15 2v50M2 17h26M2 34h26M8 10v42M22 10v42" />
        </g>
        <g id="login-campus-window-square">
          <rect x="1" y="1" width="18" height="36" rx="1.5" fill={WINDOW} />
          <rect x="1" y="1" width="18" height="36" rx="1.5" fill="none" />
          <path d="M10 2v35M2 19h16" />
        </g>
        <g id="login-campus-window-square-wide">
          <rect x="1" y="1" width="29" height="37" rx="1.5" fill={WINDOW} />
          <rect x="1" y="1" width="29" height="37" rx="1.5" fill="none" />
          <path d="M15 2v35M2 19h27M8 2v35M22 2v35" />
        </g>
        <g id="login-campus-window-basement">
          <rect x="1" y="1" width="14" height="31" rx="1.5" fill="#becdd3" />
          <rect x="1" y="1" width="14" height="31" rx="1.5" fill="none" />
          <path d="M8 2v29" />
        </g>

        <g id="login-campus-left-wing">
          <path d="M128 339h117l10 30H127Z" fill="url(#login-campus-roof)" />
          <path d="M137 367h105v142H137Z" fill="url(#login-campus-accent)" />
          <path d="M138 442h103M138 507h103" />
          <path d="M140 369h10v138h-10ZM173 369h9v138h-9ZM207 369h9v138h-9ZM232 369h9v138h-9Z" fill="#f4dfda" />

          <path d="M4 361 68 320l70 41Z" fill="url(#login-campus-wall)" />
          <path d="M15 357 68 329l56 28Z" />
          <circle cx="68" cy="344" r="7.2" fill={WINDOW} />
          <path d="M5 360h134v14H5Z" fill="url(#login-campus-wall)" />
          <path d="M9 374h125v135H9Z" fill="url(#login-campus-wall)" />
          <path d="M11 443h121M11 507h121" />
          <path d="M12 376h12v131H12ZM119 376h12v131h-12Z" fill="#f6f2e5" />
          <path d="M42 376h7v131h-7ZM91 376h7v131h-7Z" fill="url(#login-campus-accent)" strokeWidth="1.7" />

          <g strokeWidth="2.25">
            <use href="#login-campus-window-narrow" transform="translate(27 384)" />
            <use href="#login-campus-window-wide" transform="translate(53 380)" />
            <use href="#login-campus-window-narrow" transform="translate(101 384)" />
            <use href="#login-campus-window-square" transform="translate(27 460)" />
            <use href="#login-campus-window-square-wide" transform="translate(53 459)" />
            <use href="#login-campus-window-square" transform="translate(101 460)" />

            <use href="#login-campus-window-narrow" transform="translate(145 384)" />
            <use href="#login-campus-window-narrow" transform="translate(178 384)" />
            <use href="#login-campus-window-narrow" transform="translate(211 384)" />
            <use href="#login-campus-window-square" transform="translate(145 460)" />
            <use href="#login-campus-window-square" transform="translate(178 460)" />
            <use href="#login-campus-window-square" transform="translate(211 460)" />
          </g>
        </g>

        <g id="login-campus-side-tower">
          <path d="M242 298h38v46h-38Z" fill="url(#login-campus-wall)" />
          <path d="M247 342v-28c0-7 5-11 14-11s14 4 14 11v28" fill={WINDOW} />
          <path d="M261 304v38" />
          <path d="M239 292h44v9h-44Z" fill="url(#login-campus-wall)" />
          <path d="M245 290c1-13 7-22 16-22s15 9 16 22Z" fill="url(#login-campus-roof)" />
          <path d="M250 288c1-9 5-16 11-19M261 269v19M272 288c-1-9-5-16-11-19" />
          <path d="M261 248v17M257 262h8" />
          <circle cx="261" cy="266" r="2.4" fill={OUTLINE} />
          <path d="M238 342h46v10h-46Z" fill="url(#login-campus-wall)" />
        </g>
      </defs>

      <g
        className="login-campus-drawing"
        filter="url(#login-campus-shadow)"
        fill="none"
        stroke={OUTLINE}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3"
      >
        <ellipse cx="355" cy="560" rx="345" ry="7" fill="#65767b" opacity="0.12" stroke="none" />

        <use href="#login-campus-left-wing" />
        <use href="#login-campus-left-wing" transform="translate(710 0) scale(-1 1)" />
        <path d="M470 341h112l-67 27h-53Z" fill="#7f919e" opacity="0.42" stroke="none" />

        <path d="M5 507h700v48H5Z" fill="url(#login-campus-wall)" />
        <path d="M5 507h700v8H5Z" fill="#e5d6ca" />
        <g strokeWidth="2.25">
          {[26, 62, 100, 146, 179, 212].map((x) => (
            <use key={`left-basement-${x}`} href="#login-campus-window-basement" transform={`translate(${x} 519)`} />
          ))}
          {[26, 62, 100, 146, 179, 212].map((x) => (
            <use key={`right-basement-${x}`} href="#login-campus-window-basement" transform={`translate(${710 - x - 16} 519)`} />
          ))}
        </g>

        <path d="M239 321h232v191H239Z" fill="url(#login-campus-wall)" />
        <path d="M241 371h228M241 442h228M241 508h228" />
        <path d="M243 333h38v175h-38ZM429 333h38v175h-38Z" fill="#f7f3e6" />
        <path d="M243 508h41v47h-41ZM426 508h41v47h-41Z" fill="url(#login-campus-wall)" />

        <g strokeWidth="2.2">
          <circle cx="261" cy="383" r="7" fill={WINDOW} />
          <use href="#login-campus-window-narrow" transform="translate(252 400)" />
          <use href="#login-campus-window-square" transform="translate(252 461)" />
          <circle cx="449" cy="383" r="7" fill={WINDOW} />
          <use href="#login-campus-window-narrow" transform="translate(440 400)" />
          <use href="#login-campus-window-square" transform="translate(440 461)" />
        </g>

        <use href="#login-campus-side-tower" />
        <use href="#login-campus-side-tower" transform="translate(710 0) scale(-1 1)" />

        <path d="M355 92v11" />
        <circle cx="355" cy="105" r="3" fill="#f6f2e6" />
        <path d="M346 120c0-9 4-14 9-14s9 5 9 14Z" fill="url(#login-campus-wall)" />
        <path d="M349 118c1-5 3-8 6-9M355 108v10M361 118c-1-5-3-8-6-9" strokeWidth="2" />
        <path d="M343 120h24v7h-24Z" fill="url(#login-campus-wall)" />
        <path d="M346 127h18l2 26h-22Z" fill="url(#login-campus-wall)" />
        <path d="M350 129v23M355 128v24M360 129v23" strokeWidth="2" />
        <path d="M342 152h26v8h-26Z" fill="url(#login-campus-wall)" />

        <path d="M293 219c2-36 28-62 62-62s60 26 62 62Z" fill="url(#login-campus-roof)" />
        <path d="M305 217c2-32 20-55 50-60M321 218c1-33 12-57 34-61M339 219c0-35 6-58 16-62M355 157v62M371 219c0-35-6-58-16-62M389 218c-1-33-12-57-34-61M405 217c-2-32-20-55-50-60" />
        <path d="M355 157c29 4 49 27 57 60h-18c-5-30-18-52-39-60Z" fill="#8799a6" opacity="0.23" stroke="none" />
        <path d="M290 217h130v10H290Z" fill="url(#login-campus-wall)" />
        <path d="M287 227h136v24H287Z" fill="#e9e6dc" />
        <path d="M290 228c7-5 123-5 130 0" />

        <g fill="#aebfc7" strokeWidth="1.9">
          {[295, 308, 321, 334, 348, 363, 377, 390, 403].map((x, index) => (
            <path
              key={`arcade-window-${x}`}
              d={`M${x} 248v-${index === 4 ? 14 : index === 3 || index === 5 ? 13 : 12}c0-4 2-7 5-7s5 3 5 7v${index === 4 ? 14 : index === 3 || index === 5 ? 13 : 12}Z`}
            />
          ))}
        </g>
        <path d="M283 250h144v12H283Z" fill="url(#login-campus-wall)" />
        <path d="M289 262h132v46H289Z" fill="#e8e6dc" />
        <g fill="#adbec7" strokeWidth="2">
          {[295, 313, 331, 349, 367, 385, 403].map((x) => (
            <path key={`drum-window-${x}`} d={`M${x} 306v-33c0-6 4-10 8-10s8 4 8 10v33Z`} />
          ))}
        </g>
        <path d="M280 306h150v12H280Z" fill="url(#login-campus-wall)" />
        <path d="M286 318h138v13H286Z" fill="#f4f0e5" />

        <path d="M273 350 355 296l82 54Z" fill="url(#login-campus-wall)" />
        <path d="m287 343 68-36 68 36Z" />
        <circle cx="355" cy="327" r="10" fill={WINDOW} />
        <path d="M272 349h166v13H272Z" fill="url(#login-campus-wall)" />
        <path d="M280 362h150v148H280Z" fill="url(#login-campus-accent)" />

        <g strokeWidth="2.4">
          <use href="#login-campus-window-narrow" transform="translate(300 376) scale(.94 1.34)" />
          <use href="#login-campus-window-narrow" transform="translate(346 376) scale(.94 1.34)" />
          <use href="#login-campus-window-narrow" transform="translate(392 376) scale(.94 1.34)" />
        </g>
        <path d="M299 508v-31c0-9 6-15 12-15s12 6 12 15v31ZM343 508v-34c0-10 6-16 12-16s12 6 12 16v34ZM387 508v-31c0-9 6-15 12-15s12 6 12 15v31Z" fill="#9fb4bf" strokeWidth="2.5" />
        <path d="M311 463v45M355 459v49M399 463v45" strokeWidth="1.8" />

        <g fill="url(#login-campus-wall)">
          <path d="M279 357h17v153h-17Z" />
          <path d="M323 357h17v153h-17Z" />
          <path d="M370 357h17v153h-17Z" />
          <path d="M414 357h17v153h-17Z" />
        </g>
        <g fill="#f3efe4">
          <path d="M276 356h23v9h-23ZM276 501h23v10h-23Z" />
          <path d="M320 356h23v9h-23ZM320 501h23v10h-23Z" />
          <path d="M367 356h23v9h-23ZM367 501h23v10h-23Z" />
          <path d="M411 356h23v9h-23ZM411 501h23v10h-23Z" />
        </g>
        <path d="M271 510h168v10H271Z" fill="url(#login-campus-wall)" />

        <path d="M285 519h140l7 7H278Z" fill="#eeebe2" />
        <path d="M278 526h154l7 7H271Z" fill="#f7f3e8" />
        <path d="M271 533h168l7 7H264Z" fill="#ece9df" />
        <path d="M264 540h182l8 8H256Z" fill="#f6f2e7" />
        <path d="M256 548h198l10 9H246Z" fill="#e9e6dc" />

        <path d="M5 555h700" strokeWidth="4" />
        <path d="M17 561h676" stroke="#879294" strokeWidth="2" opacity="0.55" />
      </g>
    </>
  );
}
