// 다크 모드 색을 자동으로 만들어 주는 PostCSS 플러그인 (astro.config.mjs 에서 씀)
//
// 기존 CSS 는 그대로 두고, 색이 들어간 규칙마다 다크 모드용 규칙을 하나씩 뒤에 붙임:
//   .card { background: #fff; color: #333 }
//   → :root[data-theme="dark"] .card { background: <어두운 색>; color: <밝은 색> }
// 그래서 라이트 모드 화면은 바뀌지 않음. 다크 모드 색은 원래 색의 밝기를 속성 종류에 따라 바꿔서 만듦:
//   - 배경: 밝은 배경 → 어두운 배경 (흰색 카드는 페이지 배경보다 조금 밝게 남겨 카드 구분이 유지되게)
//   - 글자: 어두운 글자 → 밝은 글자
//   - 테두리: 밝은 선 → 어두운 선
//   - 진한 색(파란 버튼 등)과 흰 글자는 대부분 그대로
// 자동으로 안 맞는 곳은 src/styles/dark.css 에 직접 고쳐 둠 (이 파일이 만든 규칙보다 뒤에 들어감).
// 페이지 CSS 가 @import 하는 파일까지 합쳐진 뒤에 실행됨 (Vite 가 @import 를 먼저 펼침).

export const DARK = ':root[data-theme="dark"]';

/* ---------- 색 변환 (sRGB ↔ OKLab) ---------- */
const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function rgbToOklab([r, g, b]) {
  [r, g, b] = [r, g, b].map((v) => toLin(v / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToRgb([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((v) => Math.round(Math.min(1, Math.max(0, toSrgb(Math.max(0, v)))) * 255));
}

// 밝기 L 을 표(점들) 사이에서 직선으로 이어서 바꿈
function lerpTable(points, x) {
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x0, y0] = points[i - 1];
    if (x <= x1) return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
  }
  return points[points.length - 1][1];
}

// 배경: 흰색(1.0)은 카드 색, 아주 옅은 회색(페이지 배경)은 그보다 어둡게, 회색 칩·hover 는 카드보다 밝게
const BG_NEUTRAL = [
  [0.45, 0.4], [0.7, 0.34], [0.85, 0.3], [0.92, 0.27], [0.955, 0.235],
  [0.975, 0.2], [0.99, 0.215], [1.0, 0.235],
];

const TINT_HUE = (265 * Math.PI) / 180;

/** 한 색을 속성 종류(kind)에 맞게 다크 모드 색으로 바꿈. 그대로 둘 색이면 null */
function mapColor(rgb, kind) {
  const [L, a, b] = rgbToOklab(rgb);
  const C = Math.hypot(a, b);
  const neutral = C < 0.018; // 아주 옅은 하늘색·분홍(스킬 종류 칸 등)도 색으로 남게 낮게 잡음
  let L2 = L;
  let C2 = C;

  if (kind === 'bg') {
    if (neutral) {
      if (L < 0.45) return null; // 어두운 배경(검은 반투명 막, 남색 머리줄)은 그대로
      L2 = lerpTable(BG_NEUTRAL, L);
      C2 = Math.min(C, 0.015);
    } else if (L > 0.88) { // 옅은 색 배경(연파랑 칩 등) → 어둡고 살짝 물든 배경
      L2 = 0.3;
      C2 = Math.min(C * 1.6, 0.05);
    } else if (L > 0.72) {
      L2 = L - 0.25;
    } else return null; // 진한 색 배경(버튼 등)은 그대로
  } else if (kind === 'text') {
    if (neutral) {
      if (L >= 0.62) return null; // 흰 글자, 옅은 회색 글자는 그대로
      L2 = 0.95 - L * 0.38;
    } else {
      if (L >= 0.68) return null;
      L2 = 0.76;
      C2 = Math.min(C, 0.16);
    }
  } else if (kind === 'border') {
    if (neutral) {
      if (L > 0.6) L2 = 0.28 + (1 - L) * 0.5;
      else return null; // 어두운 선은 그대로 (말풍선 꼬리처럼 어두운 배경과 같은 색인 경우가 많음)
    } else if (L > 0.85) {
      L2 = 0.4;
      C2 = Math.min(C, 0.08);
    } else return null;
  } else if (kind === 'shadow') {
    if (L < 0.8) return null; // 보통 그림자(검정 반투명)는 그대로
    return mapColor(rgb, 'bg');
  } else return null;

  // 회색은 메뉴 남색과 어울리게 아주 살짝 푸른 기를 넣음
  if (neutral) {
    const t = kind === 'text' ? 0.006 : 0.012;
    return oklabToRgb([L2, t * Math.cos(TINT_HUE), t * Math.sin(TINT_HUE)]);
  }
  const k = C > 0 ? C2 / C : 0;
  return oklabToRgb([L2, a * k, b * k]);
}

/* ---------- CSS 값 안의 색 찾기 ---------- */
const NAMED = {
  white: [255, 255, 255], black: [0, 0, 0], gray: [128, 128, 128], grey: [128, 128, 128],
  silver: [192, 192, 192], lightgray: [211, 211, 211], lightgrey: [211, 211, 211],
  whitesmoke: [245, 245, 245], gainsboro: [220, 220, 220], darkgray: [169, 169, 169],
  blue: [0, 0, 255], navy: [0, 0, 128], red: [255, 0, 0], green: [0, 128, 0],
};

const hex2 = (n) => n.toString(16).padStart(2, '0');
const COLOR_RE = new RegExp(
  [
    'url\\([^)]*\\)', // url(...) 는 건너뜀
    'var\\([^()]*(?:\\([^()]*\\)[^()]*)*\\)', // var(--x, fallback) 도 건너뜀 (fallback 은 안 바꿈)
    '#[0-9a-fA-F]{3,8}\\b',
    'rgba?\\(\\s*[\\d.]+%?\\s*[,\\s]\\s*[\\d.]+%?\\s*[,\\s]\\s*[\\d.]+%?\\s*(?:[,/]\\s*(?:var\\([^)]*\\)|[\\d.]+%?)\\s*)?\\)',
    'hsla?\\(\\s*[\\d.]+(?:deg)?\\s*[,\\s]\\s*[\\d.]+%\\s*[,\\s]\\s*[\\d.]+%\\s*(?:[,/]\\s*(?:var\\([^)]*\\)|[\\d.]+%?)\\s*)?\\)',
    `\\b(?:${Object.keys(NAMED).join('|')})\\b`,
  ].join('|'),
  'gi',
);

function parseColor(tok) {
  const t = tok.toLowerCase();
  if (NAMED[t]) return { rgb: NAMED[t], alpha: null };
  if (t[0] === '#') {
    let h = t.slice(1);
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    const rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    const alpha = h.length === 8 ? +(parseInt(h.slice(6), 16) / 255).toFixed(3) + '' : null;
    return { rgb, alpha };
  }
  const m = t.match(/^(rgba?|hsla?)\((.*)\)$/);
  if (!m) return null;
  // rgb(1, 2, 3, .5) / rgb(1 2 3 / .5) / rgb(1 2 3 / var(--tw-bg-opacity)) 모두 처리
  let parts;
  let a = null;
  // Tailwind: rgb(255 255 255/var(--tw-bg-opacity,1)) — var( ) 안의 쉼표는 구분자가 아님
  if (m[2].replace(/var\([^)]*\)/g, '').includes(',')) {
    parts = m[2].split(',').map((s) => s.trim());
    if (parts.length === 4) a = parts.pop();
  } else {
    const [main, alpha] = m[2].split('/');
    parts = main.trim().split(/\s+/);
    if (alpha != null) a = alpha.trim();
  }
  if (parts.length !== 3) return null;
  if (m[1].startsWith('rgb')) {
    const rgb = parts.map((p) => (p.endsWith('%') ? parseFloat(p) * 2.55 : parseFloat(p)));
    return { rgb, alpha: a };
  }
  const [h, s, l] = [parseFloat(parts[0]), parseFloat(parts[1]) / 100, parseFloat(parts[2]) / 100];
  const f = (n) => {
    const k = (n + h / 30) % 12;
    return 255 * (l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1)));
  };
  return { rgb: [f(0), f(8), f(4)], alpha: a };
}

function formatColor(rgb, alpha) {
  if (alpha == null) return '#' + rgb.map(hex2).join('');
  return `rgb(${rgb.join(' ')} / ${alpha})`;
}

/** 값 안의 색을 모두 바꿈. 바뀐 게 없으면 null */
export function mapValue(value, kind) {
  let changed = false;
  const out = value.replace(COLOR_RE, (tok) => {
    if (/^(url|var)\(/i.test(tok)) return tok;
    const c = parseColor(tok);
    if (!c) return tok;
    const m = mapColor(c.rgb, kind);
    if (!m) return tok;
    changed = true;
    return formatColor(m, c.alpha);
  });
  return changed ? out : null;
}

/* ---------- 속성 종류 ---------- */
// 색이 들어 있는 CSS 변수는 이름으로 종류를 정함 (여러 곳에서 배경/글자로 쓰여서 값만 보고는 모름)
const VAR_KIND = {
  '--background-color': 'bg', '--card-bg': 'bg', '--body-color': 'bg', '--fv-soft': 'bg', '--fv-on': 'bg',
  '--field': 'bg', '--page': 'bg', '--soft': 'bg', '--surface': 'bg',
  '--text-color': 'text', '--fv-ink': 'text', '--fv-muted': 'text', '--muted': 'text', '--text': 'text',
  '--border-color': 'border', '--fv-line': 'border', '--line': 'border',
};

function kindOf(prop) {
  const p = prop.toLowerCase();
  if (p.startsWith('--')) {
    if (VAR_KIND[p]) return VAR_KIND[p];
    if (p.startsWith('--tw-')) return null;
    if (/bg|background|surface|paper|page|card|field/.test(p)) return 'bg';
    if (/text|ink|muted|fg/.test(p)) return 'text';
    if (/line|border/.test(p)) return 'border';
    return null;
  }
  if (p === 'background' || p.startsWith('background-')) return 'bg';
  if (p === 'box-shadow' || p === 'text-shadow' || p === 'filter') return 'shadow';
  if (/^(border|outline|column-rule)/.test(p)) return 'border';
  if (/^(color|fill|stroke|caret-color|text-decoration|-webkit-text-fill-color|-webkit-text-stroke)/.test(p)) return 'text';
  return null;
}

/* ---------- 선택자 앞에 다크 모드 조건 붙이기 ---------- */
function darkSelector(sel) {
  const s = sel.trim();
  if (/^html(?![\w-])/i.test(s)) return s.replace(/^html/i, DARK);
  if (s.startsWith(':root')) return DARK + s.slice(5);
  if (s.startsWith('::')) return `${DARK}${s}, ${DARK} ${s}`;
  return `${DARK} ${s}`;
}

/** PostCSS 플러그인. include(file) 이 true 인 파일에만 적용 */
export default function darkTheme({ include = () => true } = {}) {
  return {
    postcssPlugin: 'dsr-dark-theme',
    OnceExit(root) {
      const file = root.source?.input?.file ?? '';
      if (!include(file.replace(/\\/g, '/'))) return;

      const dark = root.clone();
      // 다크 규칙에 필요 없는 것 빼기
      dark.walkAtRules((at) => {
        if (/^(-webkit-)?keyframes$|^font-face$|^import$|^charset$|^page$/i.test(at.name)) at.remove();
      });
      dark.walkComments((c) => c.remove());
      dark.walkRules((rule) => {
        if (rule.parent?.type === 'atrule' && /keyframes/i.test(rule.parent.name)) return;
        rule.walkDecls((d) => {
          const kind = kindOf(d.prop);
          const v = kind && mapValue(d.value, kind);
          if (v) d.value = v;
          else d.remove();
        });
        if (!rule.nodes.length) { rule.remove(); return; }
        rule.selectors = rule.selectors.map(darkSelector);
      });
      // 비어 버린 @media 등 정리 (안쪽부터)
      let removed = true;
      while (removed) {
        removed = false;
        dark.walkAtRules((at) => {
          if (at.nodes && !at.nodes.length) { at.remove(); removed = true; }
        });
      }
      if (dark.nodes.length) root.append(dark.nodes);
    },
  };
}
darkTheme.postcss = true;
