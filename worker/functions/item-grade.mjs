// 아이템 등급표 (관리자 전용) — 쿠폰 등록 때 아이템 이름으로 등급을 자동으로 채웁니다.
// 등급표는 비공개 버킷(FEEDBACK 바인딩)의 admin/item-grade.json 에 둡니다. { "정규화한 이름": 등급(1~5) }
import { env as workerEnv } from 'cloudflare:workers';
import { json, authEnv, verifyToken, sameSiteJson } from '../lib/admin-auth.mjs';

const KEY = 'admin/item-grade.json';

export default async (request) => {
  const auth = authEnv();
  if (!auth || !workerEnv.FEEDBACK) return json({ error: '서버 설정이 완료되지 않았습니다.' }, 500);
  if (!sameSiteJson(request)) return json({ error: '허용되지 않은 요청입니다.' }, 403);
  if (!verifyToken(auth, request.headers.get('authorization'))) {
    return json({ error: '관리자 로그인이 만료되었습니다. 다시 로그인해주세요.' }, 401);
  }
  if (request.method !== 'GET') return json({ error: '지원하지 않는 요청입니다.' }, 405);
  const obj = await workerEnv.FEEDBACK.get(KEY).catch(() => null);
  if (!obj) return json({ error: '등급표가 없습니다.' }, 404);
  return new Response(obj.body, {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-store' },
  });
};
