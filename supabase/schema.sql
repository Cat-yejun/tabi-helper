-- ============================================================
--  TABI HELPER - Supabase schema
--  Supabase > SQL Editor 에 통째로 붙여넣고 RUN 하세요.
-- ============================================================

-- 영수증/가계부
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  store text,                       -- 가게 이름
  purchase_date date,               -- 구매 날짜
  total numeric,                    -- 합계
  currency text default 'JPY',      -- 통화
  category text,                    -- 식비/교통/쇼핑/관광/숙박/기타
  items jsonb default '[]'::jsonb,  -- [{name, price, qty}]
  note text,
  image_url text                    -- Supabase Storage 경로
);

-- 일정표 (여러 개 가능)
create table if not exists itineraries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  title text not null,
  start_date date,
  end_date date
);

-- 일정 항목 (스톱)
create table if not exists itinerary_items (
  id uuid primary key default gen_random_uuid(),
  itinerary_id uuid references itineraries(id) on delete cascade,
  day_date date,                    -- 어느 날
  time text,                        -- "10:30" 같은 표시용 시간
  place text not null,              -- 장소 이름
  address text,
  lat double precision,
  lng double precision,
  category text,                    -- 관광/식사/이동/숙박/쇼핑
  note text,
  sort_order int default 0
);

-- 번역 기록
create table if not exists translations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  original text,                    -- 원문(일본어 등)
  translation text,                 -- 한국어 번역
  explanation text,                 -- 설명
  image_url text
);

-- 비서 대화 기록
create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  role text not null,               -- 'user' | 'assistant'
  content text not null
);

-- 인덱스
create index if not exists idx_items_itinerary on itinerary_items(itinerary_id);
create index if not exists idx_expenses_date on expenses(purchase_date);

-- ------------------------------------------------------------
--  RLS: 개인용 단일 사용자 앱이라 비활성화(누구나 anon 키로 접근).
--  공개 배포한다면 Supabase Auth + 정책을 켜세요. README 참고.
-- ------------------------------------------------------------
alter table expenses        disable row level security;
alter table itineraries     disable row level security;
alter table itinerary_items disable row level security;
alter table translations    disable row level security;
alter table chat_messages   disable row level security;

-- 영수증/번역 이미지 저장용 Storage 버킷
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

-- 버킷에 누구나 업로드/읽기 (개인용 가정)
create policy "photos public read"  on storage.objects for select using (bucket_id = 'photos');
create policy "photos public write" on storage.objects for insert with check (bucket_id = 'photos');
