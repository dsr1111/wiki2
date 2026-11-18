// DSR 위키 (Astro 버전) 설정
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://dsrwiki.com',
  // 기존 주소(/digimon, /map …)를 그대로 쓰기 위해 digimon.html 형태로 만들고 끝 슬래시를 붙이지 않음
  build: { format: 'file' },
  trailingSlash: 'never',
  // 마우스를 올리면 다음 페이지를 미리 받아 둠 (기존 nav.js 의 미리 불러오기를 대체)
  prefetch: { prefetchAll: true, defaultStrategy: 'hover' },
  // 개발 서버 화면 아래의 Astro 도구 막대 끄기 (기존 사이트와 화면 비교할 때 방해됨)
  devToolbar: { enabled: false },
  // HTML 압축 끄기: 압축하면 태그 사이 공백이 사라져(예: '100 크라운 : [입력칸]') 기존 화면과 미세하게 달라짐
  compressHTML: false,
});
