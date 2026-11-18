// 메인 페이지: 위키 Supabase 읽기 (쿠폰 · 이벤트 캘린더 · 레이드 타이머 · 관리자 도구가 window.DSRSupabase 로 씀)
// 데이터는 위키 전용 Supabase에서 읽습니다.
// 아래 두 값은 Supabase Dashboard → Project Settings → API 에서 복사합니다.
// (Project URL, 그리고 publishable 키 또는 anon 키 — 공개용 읽기 키라 노출되어도 괜찮습니다)
// 비워두면 DB 대신 예전 JSON 파일을 보여줍니다. 쓰기는 /api/site-admin (관리자 로그인 필요)만 가능합니다.
export const SUPABASE_URL = "https://mkytwqzrznusjwmcgpgw.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_DTiYb2mYuQCeJalBTlT_aA_9aukhrHV";

/** 예전 JWT 형식 anon 키는 Authorization도 필요하고, 새 sb_publishable_ 키는 apikey만 보냅니다. */
export function supabaseHeaders(key) {
  return key.startsWith("eyJ") ? { apikey: key, Authorization: `Bearer ${key}` } : { apikey: key };
}

export function init() {
/** 공개 읽기 — 캘린더·레이드 타이머·관리자 도구에서도 사용합니다. query 예) "select=*&order=name.asc" */
window.DSRSupabase = {
  async select(table, query) {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error("Supabase 설정 없음");
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
      headers: supabaseHeaders(SUPABASE_ANON_KEY),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },
};
}
