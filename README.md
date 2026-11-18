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

- 설정: `wrangler.jsonc` (정적 사이트, 이름 `dsrwiki` → 임시 주소 `https://dsrwiki.s97716.workers.dev`)
- 주소 규칙: `public/_redirects` (예전 .html 주소 → 확장자 없는 주소로 301)
- 캐시: `public/_headers`
- 관리자 저장 API: `worker/` (기존 Netlify 함수를 옮긴 것, 주소 `/api/<이름>`)
  - R2 는 바인딩 `MEDIA` 로 접근 (`wrangler.jsonc` 의 `bucket_name` = media.dsrwiki.com 버킷 이름)
  - 비밀값 `COUPON_ADMIN_PASSWORD`, `SUPABASE_SECRET_KEY` 는 Cloudflare 대시보드에 직접 넣음 (코드에 넣지 않음)
  - 임시 주소(*.workers.dev)는 `/robots.txt` 로 검색 엔진 수집을 막음
- GitHub 저장소를 Cloudflare 에 연결해 두면 커밋할 때마다 자동 배포됩니다
  (빌드 명령 `npm run build`, 배포 명령 `npx wrangler deploy`, Node 버전은 `.node-version`)

## 폴더

- `src/pages/` — 페이지 (`digimon.astro` → `/digimon`)
- `src/layouts/` — 모든 페이지가 같이 쓰는 틀 (메뉴, 폰트, 메타 태그)
- `worker/` — 관리자 저장 API (Cloudflare Worker)
- `public/` — 그대로 복사되는 파일 (이미지, 기존 CSS/JS). 기존 위키에서 git 에 올라가 있던 파일을 복사해 왔습니다.

## 진행 단계

0. 뼈대 ✔
1. 공통 레이아웃 (메뉴, 페이지 전환) ✔
2. 페이지 옮기기 (12개 전부) ✔
3. 관리자 기능 + 저장 API (기존 Netlify 함수 → Cloudflare Workers) ✔ (버킷 이름·비밀값 설정 필요)
4. 기존 사이트와 같은지 확인
5. dsrwiki.com 연결 전환 (기존 Netlify 사이트는 되돌리기용으로 유지)

## 관리자 기능 로컬 시험

진짜 데이터를 건드리지 않도록 로컬의 가짜 R2 에 공개 데이터 사본을 넣고 시험합니다.

1. `.dev.vars` 에 시험용 값: `COUPON_ADMIN_PASSWORD=test-pass`, `SUPABASE_SECRET_KEY=아무 값`
2. 데이터 사본 넣기 (파일마다): `npx wrangler r2 object put <버킷 이름>/data/csv/digimon.json --file digimon.json --local`
3. `npm run cf:dev` 후 `http://localhost:8787/digimon#admin` 에서 test-pass 로 로그인
   (메인 페이지 쿠폰·레이드·이벤트는 Supabase 를 쓰므로 로컬에서는 저장 안 됨)

## 페이지를 옮기는 방식

- 기존 `xxx.html` 의 본문 → `src/pages/xxx.astro`, 기존 `app/xxx.js` → `src/scripts/xxx.js`
- JS 는 파일 전체를 `init(signal, onReady)` 안에 넣어 (한 페이지의 여러 파일은 하나로 이어 붙임), 그 페이지에 들어올 때마다 처음 상태로 다시 시작합니다
  (`src/scripts/page.js` 의 `onPage`). 페이지를 떠날 때 `signal` 이 abort 되므로
  document/window 이벤트는 `{ signal }` 로 걸면 자동으로 풀립니다.
- CSS 는 `src/styles/` 에 있고, 각 페이지 맨 위에서 예전 `<link>` 순서 그대로 import 합니다.
  빌드할 때 압축되어 페이지 HTML 안에 `<style>` 로 들어갑니다 (`astro.config.mjs` 의 `inlineStylesheets`).
  CSS 파일을 따로 기다리지 않고, 페이지를 옮길 때 CSS 순서가 섞이지 않습니다.
  상단 메뉴는 shadow DOM 이라 따로: `nav-menu.css` 는 메뉴 안에만 들어감 (`Nav.astro`),
  계산기의 메뉴 보정 `pages/calculator/nav.css` 는 계산기 JS 가 메뉴 안에 넣음.
- 메인 페이지 JS 는 기능별로 `src/scripts/home/` 에 나뉘어 있음 (서버 시각·Supabase·쿠폰·오늘의 장소/환율·캘린더·레이드 타이머).
  `src/scripts/index.js` 는 이것들을 실행 순서대로 모아서 넘기기만 함
- 여러 페이지가 같이 쓰는 것은 `src/scripts/page.js`: `getDigimonData()` (digimon.json 을 한 번 받아 10분 동안 같이 씀),
  `initAdminLoader()` (#admin 이나 로그인 상태일 때 `public/app/*-admin.js` 를 불러옴)
- `public/app/` 에는 관리자 도구 5개(`admin-core`, `digimon-admin`, `detector-admin`, `evolution-admin`, `site-admin`)만 남아 있음.
  예전 페이지 스크립트 복사본은 지웠음 (실제 코드는 `src/scripts/`)
- 고정 데이터는 `src/data/` (예: 가챠 연출용 아이템 등급·아이콘 `gacha-presentation-assets.json`)
- 아이콘은 `src/styles/icons.css` (쓰는 11개만 SVG). 새 아이콘은 그 파일 설명대로 한 줄 추가
- `tools/port-page.mjs` 는 위 변환을 해 주는 1회용 도구입니다 (기존 위키가 `E:/wiki/dsr/frontend` 에 있을 때).
