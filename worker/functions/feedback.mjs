// 사이트 피드백 API — 메뉴의 "피드백" 모달이 보내고, 메인 페이지 관리자 창(#admin)이 읽음.
//
//   POST {category, message, contact?, page?, images?: [dataURL], website}   누구나 (피드백 보내기)
//   GET  ?list=1                                                             관리자: 목록 (최근 300개)
//   GET  ?image=<key>                                                        관리자: 첨부 이미지
//   POST {action: 'read', id, is_read}                                       관리자: 읽음 표시
//   POST {action: 'delete', id}                                              관리자: 삭제 (첨부 이미지도)
//
// 저장: Supabase site_feedback 테이블 (supabase/site_feedback.sql) + 첨부 이미지는 R2 비공개 버킷
// (wrangler.jsonc 의 FEEDBACK 바인딩, 버킷 dsrwiki-feedback). 버킷에 공개 도메인을 연결하지 말 것:
// 스크린샷에 개인정보가 있을 수 있어 관리자 로그인을 거쳐서만 보여 줌.
//
// 스팸 막기: 사람 눈에 안 보이는 칸(website)을 채우면 저장하지 않고 성공인 척함 /
// 같은 IP 는 10분에 3개, 하루 20개까지 (IP 는 해시로만 저장) / 글자 수·이미지 수·크기 제한
import { env as workerEnv } from 'cloudflare:workers';
import { createHash, randomUUID } from 'node:crypto';
import { json, authEnv, verifyToken, sameSiteJson } from '../lib/admin-auth.mjs';

const TABLE = 'site_feedback';
const COLUMNS = 'id,category,message,contact,page,images,is_read,created_at';
const CATEGORIES = ['bug', 'idea', 'etc'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY_RE = /^\d{4}\/\d{2}\/[0-9a-f-]{36}\.(webp|png|jpg)$/;
const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024; // 브라우저가 1600px webp 로 줄여 보내므로 보통 수백 KB
const MAX_BODY_BYTES = 7 * 1024 * 1024; // base64 는 원래보다 1/3 커짐
const LIMITS = [[10 * 60 * 1000, 3], [24 * 60 * 60 * 1000, 20]]; // [기간(ms), 최대 개수]

function cfg() {
  const auth = authEnv();
  const url = process.env.SUPABASE_URL;
  if (!auth || !url) return null;
  return { ...auth, url: url.replace(/\/+$/, '').replace(/\/rest\/v1$/, '') };
}

async function db(c, method, query, body) {
  const res = await fetch(`${c.url}/rest/v1/${TABLE}${query}`, {
    method,
    headers: {
      apikey: c.key,
      ...(c.key.startsWith('eyJ') ? { Authorization: `Bearer ${c.key}` } : {}),
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : [];
}

/** 비어 있으면 null, 너무 길면 undefined */
function optional(value, max) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') return undefined;
  const s = value.trim();
  if (!s) return null;
  return s.length <= max ? s : undefined;
}

/** data:image/...;base64,... → { bytes, ext, type } (내용의 앞부분으로 실제 형식 확인) */
function readImage(dataUrl) {
  if (typeof dataUrl !== 'string') return null;
  const m = /^data:image\/(webp|png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return null;
  const bytes = Buffer.from(m[2], 'base64');
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) return { tooBig: true };
  const head = bytes.subarray(0, 12);
  const isWebp = head.subarray(0, 4).toString('latin1') === 'RIFF' && head.subarray(8, 12).toString('latin1') === 'WEBP';
  const isPng = head[0] === 0x89 && head.subarray(1, 4).toString('latin1') === 'PNG';
  const isJpg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  if (isWebp) return { bytes, ext: 'webp', type: 'image/webp' };
  if (isPng) return { bytes, ext: 'png', type: 'image/png' };
  if (isJpg) return { bytes, ext: 'jpg', type: 'image/jpeg' };
  return null;
}

// ---------- 보내기 (누구나) ----------
async function submit(c, request, body) {
  // 봇: 숨은 칸을 채움 → 저장하지 않고 성공처럼 응답 (봇이 다른 방법을 찾지 않게)
  if (typeof body.website === 'string' && body.website.trim()) return json({ ok: true }, 201);

  const category = CATEGORIES.includes(body.category) ? body.category : null;
  if (!category) return json({ error: '종류를 선택해주세요.' }, 400);
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (message.length < 2 || message.length > 2000) return json({ error: '내용을 2~2000자로 입력해주세요.' }, 400);
  const contact = optional(body.contact, 100);
  if (contact === undefined) return json({ error: '연락처는 100자까지 입력할 수 있습니다.' }, 400);
  const page = optional(body.page, 300) ?? null;
  const userAgent = (request.headers.get('user-agent') || '').slice(0, 300) || null;

  const rawImages = Array.isArray(body.images) ? body.images : [];
  if (rawImages.length > MAX_IMAGES) return json({ error: `이미지는 ${MAX_IMAGES}장까지 첨부할 수 있습니다.` }, 400);
  const images = [];
  for (const raw of rawImages) {
    const img = readImage(raw);
    if (!img) return json({ error: '이미지 형식을 확인해주세요. (PNG, JPG, WEBP)' }, 400);
    if (img.tooBig) return json({ error: '이미지가 너무 큽니다.' }, 413);
    images.push(img);
  }
  const bucket = workerEnv.FEEDBACK;
  if (images.length && !bucket) return json({ error: '지금은 이미지를 첨부할 수 없습니다. 이미지 없이 보내주세요.' }, 503);

  // 연속 전송 막기: IP 는 해시로만 (secret 키를 섞어 원래 IP 를 거꾸로 알아낼 수 없게)
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const ipHash = createHash('sha256').update(`feedback:${c.key}:${ip}`).digest('hex').slice(0, 32);
  const since = new Date(Date.now() - LIMITS[LIMITS.length - 1][0]).toISOString();
  const recent = await db(c, 'GET', `?select=created_at&ip_hash=eq.${ipHash}&created_at=gte.${encodeURIComponent(since)}&order=created_at.desc&limit=50`);
  for (const [ms, max] of LIMITS) {
    const from = Date.now() - ms;
    if (recent.filter((r) => Date.parse(r.created_at) >= from).length >= max) {
      return json({ error: '피드백을 너무 자주 보냈습니다. 잠시 후 다시 시도해주세요.' }, 429);
    }
  }

  // 이미지 먼저 저장 → 글 저장. 글 저장이 실패하면 올린 이미지는 지움
  const now = new Date();
  const folder = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const keys = [];
  try {
    for (const img of images) {
      const key = `${folder}/${randomUUID()}.${img.ext}`;
      await bucket.put(key, img.bytes, { httpMetadata: { contentType: img.type } });
      keys.push(key);
    }
    await db(c, 'POST', '?select=id', { category, message, contact, page, images: keys, ip_hash: ipHash, user_agent: userAgent });
  } catch (error) {
    if (keys.length) await bucket.delete(keys).catch(() => {});
    throw error;
  }
  return json({ ok: true }, 201);
}

// ---------- 관리자 ----------
async function admin(c, request, body) {
  if (!verifyToken(c, request.headers.get('authorization'))) {
    return json({ error: '관리자 로그인이 만료되었습니다. 다시 로그인해주세요.' }, 401);
  }

  if (request.method === 'GET') {
    const params = new URL(request.url).searchParams;
    const key = params.get('image');
    if (key !== null) {
      if (!KEY_RE.test(key) || !workerEnv.FEEDBACK) return json({ error: '이미지를 찾을 수 없습니다.' }, 404);
      const obj = await workerEnv.FEEDBACK.get(key);
      if (!obj) return json({ error: '이미지를 찾을 수 없습니다.' }, 404);
      return new Response(obj.body, {
        headers: { 'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream', 'Cache-Control': 'private, max-age=3600' },
      });
    }
    const rows = await db(c, 'GET', `?select=${COLUMNS}&order=created_at.desc&limit=300`);
    return json({ rows });
  }

  const id = typeof body.id === 'string' && UUID_RE.test(body.id) ? body.id : null;
  if (!id) return json({ error: '항목 정보를 확인해주세요.' }, 400);

  if (body.action === 'read') {
    const rows = await db(c, 'PATCH', `?id=eq.${id}&select=${COLUMNS}`, { is_read: body.is_read !== false });
    if (!rows.length) return json({ error: '이미 삭제된 피드백입니다.' }, 404);
    return json({ row: rows[0] });
  }

  if (body.action === 'delete') {
    const rows = await db(c, 'DELETE', `?id=eq.${id}&select=images`);
    const keys = (rows[0]?.images || []).filter((k) => typeof k === 'string' && KEY_RE.test(k));
    if (keys.length && workerEnv.FEEDBACK) await workerEnv.FEEDBACK.delete(keys).catch((e) => console.warn('feedback image delete failed', e));
    return json({ ok: true });
  }

  return json({ error: '지원하지 않는 요청입니다.' }, 400);
}

export default async (request) => {
  const c = cfg();
  if (!c) return json({ error: '서버 설정이 완료되지 않았습니다.' }, 500);
  if (!sameSiteJson(request)) return json({ error: '허용되지 않은 요청입니다.' }, 403);
  if (request.method !== 'GET' && request.method !== 'POST') return json({ error: '지원하지 않는 요청입니다.' }, 405);

  let body = {};
  if (request.method === 'POST') {
    if (Number(request.headers.get('content-length') || 0) > MAX_BODY_BYTES) return json({ error: '첨부한 이미지가 너무 큽니다.' }, 413);
    try { body = await request.json(); } catch { return json({ error: '요청 형식을 확인해주세요.' }, 400); }
    if (!body || typeof body !== 'object') return json({ error: '요청 형식을 확인해주세요.' }, 400);
  }

  try {
    if (request.method === 'POST' && !body.action) return await submit(c, request, body);
    return await admin(c, request, body);
  } catch (error) {
    console.error('Feedback API failed:', error);
    return json({ error: '처리하지 못했습니다. 잠시 후 다시 시도해주세요.' }, 503);
  }
};
