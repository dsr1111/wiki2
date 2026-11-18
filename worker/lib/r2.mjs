// Cloudflare R2 접근 — 예전(Netlify)에는 S3 API + 접근 키로 서명했지만, 이제 Worker 의 R2 바인딩을 씁니다.
// 접근 키가 필요 없고(비밀값 줄어듦) 같은 Cloudflare 안이라 빠릅니다.
// 바인딩 이름: MEDIA (wrangler.jsonc 의 r2_buckets) — media.dsrwiki.com 이 연결된 버킷
//
// 함수들(digimon-admin 등)이 쓰던 모양 그대로 둠: getText / exists / put(ifMatch) / copy
import { env } from 'cloudflare:workers';

/** 바인딩이 있으면 설정, 없으면 null (함수들이 "서버 설정이 안 됨" 오류를 보여줌) */
export function r2Env() {
  return env.MEDIA ? { bucket: env.MEDIA } : null;
}

/** W/"abc" → "abc" (예전 코드와 같은 이름 유지) */
export function strongEtag(etag) {
  return etag ? etag.replace(/^W\//i, '') : etag;
}

/** '"abc"' → 'abc' (바인딩의 onlyIf 는 따옴표 없는 값을 받음) */
const bareEtag = (etag) => String(etag).replace(/^W\//i, '').replace(/^"|"$/g, '');

export function createR2(cfg) {
  const bucket = cfg.bucket;
  return {
    /** { status, etag, text } — 없으면 status 404. etag 는 '"..."' 모양 (예전과 같음) */
    async getText(key) {
      const obj = await bucket.get(key);
      if (!obj) return { status: 404, etag: null, text: null };
      return { status: 200, etag: obj.httpEtag, text: await obj.text() };
    },
    /** 존재 여부 */
    async exists(key) {
      return (await bucket.head(key)) !== null;
    },
    /** 업로드. ifMatch 를 주면 그 ETag 일 때만 덮어씀 (아니면 status 412 오류) */
    async put(key, body, contentType, { ifMatch } = {}) {
      const options = { httpMetadata: { contentType } };
      if (ifMatch) options.onlyIf = { etagMatches: bareEtag(ifMatch) };
      const obj = await bucket.put(key, body, options);
      if (!obj) {
        // onlyIf 조건이 맞지 않으면 바인딩은 null 을 돌려줌 = 다른 저장이 먼저 끼어듦
        const err = new Error(`R2 PUT ${key} 412: 저장 사이에 파일이 바뀜`);
        err.status = 412;
        throw err;
      }
      return { etag: obj.httpEtag };
    },
    /** 버킷 안에서 복사 (백업 / 이름 변경 시 이미지 이동). 바인딩에는 복사가 없어 읽어서 다시 씀 */
    async copy(fromKey, toKey) {
      const obj = await bucket.get(fromKey);
      if (!obj) throw new Error(`R2 COPY ${fromKey} -> ${toKey} 404`);
      await bucket.put(toKey, obj.body, { httpMetadata: obj.httpMetadata, customMetadata: obj.customMetadata });
    },
  };
}
