// 기존 페이지(html + app/js)를 Astro 페이지 초안으로 옮기는 1회용 도구
//   node port-page.mjs <페이지> [js 파일들을 실행 순서대로 ...]
//   예) node port-page.mjs deck
//       node port-page.mjs calculator calculator-math calculator
// 여러 js 는 기존처럼 같은 범위를 쓰도록 하나로 이어 붙여 src/scripts/<페이지>.js 로 만듦
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const OLD = 'E:/wiki/dsr/frontend';
const NEW = 'E:/wiki/dsr-astro';
const [page, ...jsNames] = process.argv.slice(2);
const html = readFileSync(`${OLD}/${page}.html`, 'utf8').replace(/\r\n/g, '\n');
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1];
let body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/)[1];
const bodyTag = html.match(/<body([^>]*)>/)[1];
const bodyClass = bodyTag.match(/class="([^"]*)"/)?.[1];
const bodyStyle = bodyTag.match(/style="([^"]*)"/)?.[1];

const title0 = (head.match(/<title>([^<]*)<\/title>/)?.[1] || '').replace(/\s*\|\s*DSR WIKI\s*$/, '').trim();
const title = title0 === 'DSR WIKI' ? '' : title0;
const abs = (u) => (/^(https?:|\/|#|data:|mailto:)/.test(u) ? u : '/' + u);

// <head> 의 페이지별 CSS (공통 글꼴/아이콘/preload 는 Layout 이 넣음), 원래 순서 유지
const headLinks = [];
for (const m of head.matchAll(/<link\b[^>]*>/g)) {
  const tag = m[0];
  if (!/rel=["']stylesheet["']/.test(tag)) continue;
  const href = tag.match(/href=["']([^"']+)["']/)[1];
  if (/pretendard\.css|remixicon/.test(href)) continue;
  if (/styles1\.css/.test(href)) headLinks.push(`<link rel="stylesheet" href="/assets/css/styles1.css?p=${page}" />`);
  else headLinks.push(`<link rel="stylesheet" href="${abs(href)}" />`);
}
// <head> 의 외부 스크립트(CDN 라이브러리 등) — app/ 과 GA 는 제외
const headScripts = [];
for (const m of head.matchAll(/<script\b([^>]*)src=["']([^"']+)["']([^>]*)><\/script>/g)) {
  const src = m[2];
  if (/^app\/|googletagmanager/.test(src)) continue;
  headScripts.push(`<script is:inline src="${abs(src)}"${/defer/.test(m[0]) ? ' defer' : ''}></script>`);
}

// <body>: 메뉴/추천인 위젯/app 스크립트 제거, 상대 주소 → 절대 주소
body = body
  .replace(/\s*<custom-nav><\/custom-nav>/g, '')
  .replace(/\s*<referral-float><\/referral-float>/g, '')
  .replace(/\s*<script\b[^>]*src=["']app\/[^"']+["'][^>]*><\/script>/g, '')
  .replace(/\b(src|href)=(["'])(?!https?:|\/|#|data:|mailto:|javascript:)([^"']+)\2/g, (_, a, q, u) => `${a}=${q}/${u}${q}`)
  .replace(/<style>/g, '<style is:global>')
  .replace(/<script>/g, '<script is:inline>');
if (/[{}]/.test(body.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/g, ''))) console.warn('⚠ 본문에 { } 가 있음 — Astro 식으로 해석되므로 확인 필요');
body = body.replace(/^\n+|\s+$/g, '');

const jsFiles = (jsNames.length ? jsNames : [page]).map((n) => n.replace(/\.js$/, ''));

const astro = `---
// 기존 ${page}.html 을 옮긴 페이지
import Layout from '../layouts/Layout.astro';
---
<Layout${title ? ` title="${title}"` : ''}${bodyClass ? ` bodyClass="${bodyClass}"` : ''}${bodyStyle ? ` bodyStyle="${bodyStyle}"` : ''}>
  <Fragment slot="head">
    ${[...headLinks, ...headScripts].join('\n    ')}
  </Fragment>

${body.split('\n').map((l) => (l.trim() ? l : '')).join('\n')}

  <script>
    import { onPage } from '../scripts/page.js';
    import { init } from '../scripts/${page}.js';
    onPage('${page}', init);
  </script>
</Layout>
`;
writeFileSync(`${NEW}/src/pages/${page}.astro`, astro);

// JS: 파일 전체를 init(signal, onReady) 안으로 — 페이지에 들어올 때마다 새 상태로 시작
// (들여쓰기는 하지 않음: `...` 문자열 안의 공백까지 바뀌므로 원본 그대로 둠)
mkdirSync(`${NEW}/src/scripts`, { recursive: true });
const parts = [];
for (const n of jsFiles) {
  let js = readFileSync(`${OLD}/app/${n}.js`, 'utf8').replace(/\r\n/g, '\n');
  const domReady = (js.match(/document\.addEventListener\(\s*['"]DOMContentLoaded['"]\s*,/g) || []).length;
  js = js.replace(/document\.addEventListener\(\s*['"]DOMContentLoaded['"]\s*,\s*/g, 'onReady(');
  const loads = (js.match(/window\.addEventListener\(\s*['"]load['"]\s*,/g) || []).length;
  js = js.replace(/window\.addEventListener\(\s*['"]load['"]\s*,\s*/g, 'onReady(');
  const onloads = (js.match(/window\.onload\s*=/g) || []).length;
  const globals = [...js.matchAll(/\b(document|window)\.addEventListener\(\s*['"](\w+)/g)].map((m) => `${m[1]}:${m[2]}`);
  const timers = (js.match(/setInterval|requestAnimationFrame/g) || []).length;
  const winAssign = [...js.matchAll(/window\.(\w+)\s*=[^=]/g)].map((m) => m[1]);
  console.log(`${n}.js: DOMContentLoaded ${domReady}, load ${loads}, window.onload ${onloads}(직접 고칠 것), 전역 이벤트 [${globals}], 타이머 ${timers}, window.X= [${winAssign}]`);
  parts.push(`// ===== 기존 app/${n}.js =====\n${js.replace(/\s+$/, '')}`);
}
const out = `// 기존 ${jsFiles.map((n) => 'app/' + n + '.js').join(', ')} 를 옮긴 것
// 파일 전체를 init() 안에 넣어, 이 페이지에 들어올 때마다 처음 상태로 다시 시작합니다.
// (여러 파일은 기존처럼 같은 범위를 쓰도록 실행 순서대로 이어 붙임)
// onReady: 기존 DOMContentLoaded / load 자리 — 원래처럼 나머지 코드가 다 실행된 뒤에 돔
// signal: 페이지를 떠날 때 abort 됨 — document/window 이벤트나 타이머 정리에 사용
export function init(signal, onReady) {
${parts.join('\n\n')}
}
`;
writeFileSync(`${NEW}/src/scripts/${page}.js`, out);
console.log(`✔ ${page}.astro  title="${title}"  css=${headLinks.length} cdn=${headScripts.length}`);
