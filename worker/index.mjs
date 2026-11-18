// Cloudflare Worker 입구 — 정적 페이지는 Cloudflare 가 바로 보내고(이 코드를 거치지 않음),
// wrangler.jsonc 의 run_worker_first 에 적힌 주소만 여기로 옴:
//   /api/<이름>   관리자 저장 API (예전 Netlify 함수 /.netlify/functions/<이름> 을 그대로 옮김)
//   /robots.txt   임시 주소(*.workers.dev)는 검색 엔진에 안 나오게 막음. dsrwiki.com 은 기존 파일 그대로
import siteAdmin from './functions/site-admin.mjs';
import digimonAdmin from './functions/digimon-admin.mjs';
import detectorAdmin from './functions/detector-admin.mjs';
import evolutionAdmin from './functions/evolution-admin.mjs';
import itemImage from './functions/item-image.mjs';
import { json } from './lib/admin-auth.mjs';

const API = {
  'site-admin': siteAdmin,
  'digimon-admin': digimonAdmin,
  'detector-admin': detectorAdmin,
  'evolution-admin': evolutionAdmin,
  'item-image': itemImage,
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      const handler = Object.hasOwn(API, url.pathname.slice(5)) ? API[url.pathname.slice(5)] : null;
      if (!handler) return json({ error: '없는 주소입니다.' }, 404);
      try {
        return await handler(request);
      } catch (error) {
        console.error('API error:', url.pathname, error);
        return json({ error: '요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.' }, 500);
      }
    }

    if (url.pathname === '/robots.txt' && url.hostname.endsWith('.workers.dev')) {
      return new Response('User-agent: *\nDisallow: /\n', {
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Robots-Tag': 'noindex' },
      });
    }

    return env.ASSETS.fetch(request);
  },
};
