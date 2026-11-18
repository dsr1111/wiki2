# DSR WIKI — Astro 버전

기존 위키(`E:\wiki\dsr`)의 디자인과 기능을 그대로 옮기는 새 프로젝트입니다.
데이터는 기존과 같이 `media.dsrwiki.com` 에서 읽으므로 두 사이트가 같은 내용을 보여줍니다.

## 실행

```bash
npm install
npm run dev      # 개발 서버 (http://localhost:4321)
npm run build    # dist/ 에 배포용 파일 생성
npm run cf:dev   # 빌드 후 Cloudflare 와 같은 환경으로 실행 (http://localhost:8787)
npm run deploy   # 빌드 후 Cloudflare 에 바로 배포 (처음 한 번 npx wrangler login 필요)
```

## 배포 (Cloudflare Workers)

- 설정: `wrangler.jsonc` (정적 사이트, 이름 `dsr-wiki` → 임시 주소 `https://dsr-wiki.<계정>.workers.dev`)
- 주소 규칙: `public/_redirects` (예전 .html 주소 → 확장자 없는 주소로 301)
- 캐시: `public/_headers`
- GitHub 저장소를 Cloudflare 에 연결해 두면 커밋할 때마다 자동 배포됩니다
  (빌드 명령 `npm run build`, 배포 명령 `npx wrangler deploy`, Node 버전은 `.node-version`)

## 폴더

- `src/pages/` — 페이지 (`digimon.astro` → `/digimon`)
- `src/layouts/` — 모든 페이지가 같이 쓰는 틀 (메뉴, 폰트, 메타 태그)
- `public/` — 그대로 복사되는 파일 (이미지, 기존 CSS/JS). 기존 위키에서 git 에 올라가 있던 파일을 복사해 왔습니다.

## 진행 단계

0. 뼈대 ✔
1. 공통 레이아웃 (메뉴, 페이지 전환) ✔
2. 페이지 옮기기 (12개 전부) ✔
3. 관리자 기능 + 저장 API (기존 Netlify 함수 → Cloudflare Workers)
4. 기존 사이트와 같은지 확인
5. dsrwiki.com 연결 전환 (기존 Netlify 사이트는 되돌리기용으로 유지)

## 페이지를 옮기는 방식

- 기존 `xxx.html` 의 본문 → `src/pages/xxx.astro`, 기존 `app/xxx.js` → `src/scripts/xxx.js`
- JS 는 파일 전체를 `init(signal, onReady)` 안에 넣어 (한 페이지의 여러 파일은 하나로 이어 붙임), 그 페이지에 들어올 때마다 처음 상태로 다시 시작합니다
  (`src/scripts/page.js` 의 `onPage`). 페이지를 떠날 때 `signal` 이 abort 되므로
  document/window 이벤트는 `{ signal }` 로 걸면 자동으로 풀립니다.
- 공통 CSS `styles1.css` 는 페이지마다 원래 순서대로 `?p=페이지` 를 붙여 넣습니다 (Layout.astro 주석 참고).
- `tools/port-page.mjs` 는 위 변환을 해 주는 1회용 도구입니다 (기존 위키가 `E:/wiki/dsr/frontend` 에 있을 때).
