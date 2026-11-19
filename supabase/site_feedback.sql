-- DSR 위키 전용 Supabase 프로젝트에서 한 번 실행하세요. (Dashboard → SQL Editor에 붙여넣고 Run)
-- 사이트 피드백 (메뉴의 "피드백" 버튼 → 모달). 관리자만 메인 페이지 관리자 창(#admin)에서 봅니다.
-- 읽기·쓰기 모두 Worker(/api/feedback, secret 키)만 함 — 방문자(anon)는 이 테이블에 직접 접근할 수 없습니다.
-- 첨부 이미지는 R2 비공개 버킷 dsrwiki-feedback 에 저장하고, 여기에는 위치(key)만 적습니다.
begin;

create table if not exists public.site_feedback (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('bug', 'idea', 'etc')),   -- 오류 제보 / 건의 / 기타
  message text not null check (char_length(message) between 2 and 2000),
  contact text check (contact is null or char_length(contact) <= 100), -- 선택 (디스코드 아이디 등)
  page text check (page is null or char_length(page) <= 300),          -- 보낸 페이지 주소
  images jsonb not null default '[]'::jsonb check (jsonb_typeof(images) = 'array'),
  ip_hash text,                                                        -- 연속 전송 막기용 (IP 원문은 저장 안 함)
  user_agent text check (user_agent is null or char_length(user_agent) <= 300),
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists site_feedback_created_at_idx on public.site_feedback (created_at desc);
create index if not exists site_feedback_ip_idx on public.site_feedback (ip_hash, created_at desc);

alter table public.site_feedback enable row level security;
-- 정책을 두지 않음 = anon/authenticated 는 읽기·쓰기 모두 불가 (secret 키는 RLS 를 무시하므로 Worker 는 가능)
revoke all on public.site_feedback from anon, authenticated;

commit;
