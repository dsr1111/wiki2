// DSR 위키 (Astro 버전) 설정
import { defineConfig } from 'astro/config';
import { readFile, writeFile } from 'node:fs/promises';
import darkTheme from './tools/dark-theme.mjs';

// 메인 페이지의 캘린더 라이브러리를 페이지를 받자마자 같이 받기 시작하게 함.
// 원래는 페이지 스크립트를 다 받고 실행한 뒤에야 받기 시작해서, 느린 회선에서는 글꼴 파일들과 대역폭을 나눠 쓰느라 늦게 떴음.
// 빌드가 끝난 뒤 index.html 의 페이지 스크립트가 import() 로 부르는 파일들을 찾아 <link rel="modulepreload"> 로 head 에 넣음.
const preloadPageImports = (pages) => ({
  name: 'preload-page-imports',
  hooks: {
    'astro:build:done': async ({ dir }) => {
      for (const page of pages) {
        const htmlUrl = new URL(`${page}.html`, dir);
        let html = await readFile(htmlUrl, 'utf8');
        const src = html.match(new RegExp(`src="(/_astro/${page}\\.astro_astro_type_script[^"]+)"`))?.[1];
        if (!src) continue;
        const js = await readFile(new URL(`.${src}`, dir), 'utf8');
        const files = [...js.matchAll(/import\(`\.\/([^`]+\.js)`\)/g)].map((m) => `/_astro/${m[1]}`);
        if (!files.length) continue;
        const links = files.map((f) => `<link rel="modulepreload" href="${f}">`).join('\n');
        html = html.replace('</head>', `${links}\n</head>`);
        await writeFile(htmlUrl, html);
      }
    },
  },
});

// 다크 모드 자동 변환에서 뺄 CSS: 직접 고친 파일, 원래부터 어두운 화면(코스튬 각인 창, 가챠 연출)
const SKIP_DARK = ['/src/styles/dark.css', '/pages/costume-slot/main.css', '/pages/gacha/presentation.css'];

export default defineConfig({
  integrations: [preloadPageImports(['index'])],
  site: 'https://dsrwiki.com',
  // 기존 주소(/digimon, /map …)를 그대로 쓰기 위해 digimon.html 형태로 만들고 끝 슬래시를 붙이지 않음
  // CSS 는 압축해서 페이지 HTML 안에 <style> 로 넣음: CSS 파일을 따로 기다리지 않고, 페이지를 옮길 때 CSS 순서도 섞이지 않음
  build: { format: 'file', inlineStylesheets: 'always' },
  trailingSlash: 'never',
  // 마우스를 올리면 다음 페이지를 미리 받아 둠 (기존 nav.js 의 미리 불러오기를 대체)
  prefetch: { prefetchAll: true, defaultStrategy: 'hover' },
  // 개발 서버 화면 아래의 Astro 도구 막대 끄기 (기존 사이트와 화면 비교할 때 방해됨)
  devToolbar: { enabled: false },
  // HTML 압축 끄기: 압축하면 태그 사이 공백이 사라져(예: '100 크라운 : [입력칸]') 기존 화면과 미세하게 달라짐
  compressHTML: false,
  // 다크 모드: src/styles 의 CSS 마다 색을 바꾼 다크 모드 규칙을 자동으로 덧붙임 (tools/dark-theme.mjs).
  // 메뉴(shadow DOM)는 ?raw 로 넣어서 여기 안 걸림 — 메뉴 색은 nav-menu.css 의 변수로 바꿈
  vite: {
    css: {
      postcss: {
        plugins: [darkTheme({ include: (file) => file.includes('/src/styles/') && !SKIP_DARK.some((f) => file.endsWith(f)) })],
      },
    },
  },
});
