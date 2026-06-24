-- ============================================================
--  TABI HELPER - Supabase schema (with Auth + RLS)
--  Supabase > SQL Editor 에 통째로 붙여넣고 RUN 하세요.
--  로그인한 사용자는 자기 데이터만 보고 수정할 수 있습니다.
-- ============================================================

-- 영수증/가계부
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  store text,
  purchase_date date,
  total numeric,
  currency text default 'JPY',
  category text,
  items jsonb default '[]'::jsonb,
  note text,
  image_url text
);

-- 일정표
create table if not exists itineraries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  title text not null,
  start_date date,
  end_date date
);

-- 일정 항목
create table if not exists itinerary_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  itinerary_id uuid references itineraries(id) on delete cascade,
  day_date date,
  time text,
  place text not null,
  address text,
  lat double precision,
  lng double precision,
  category text,
  note text,
  sort_order int default 0
);

-- 번역 기록
create table if not exists translations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  original text,
  translation text,
  explanation text,
  image_url text
);

-- 비서 대화 기록
create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  role text not null,
  content text not null
);

create index if not exists idx_items_itinerary on itinerary_items(itinerary_id);
create index if not exists idx_expenses_date on expenses(purchase_date);
create index if not exists idx_expenses_user on expenses(user_id);
create index if not exists idx_itineraries_user on itineraries(user_id);

-- ------------------------------------------------------------
--  RLS: 본인 데이터만 접근
-- ------------------------------------------------------------
alter table expenses        enable row level security;
alter table itineraries     enable row level security;
alter table itinerary_items enable row level security;
alter table translations    enable row level security;
alter table chat_messages   enable row level security;

-- 각 테이블 공통 정책 (본인 행만 select/insert/update/delete)
do $$
declare t text;
begin
  foreach t in array array['expenses','itineraries','itinerary_items','translations','chat_messages']
  loop
    execute format('drop policy if exists "own_select" on %I;', t);
    execute format('drop policy if exists "own_insert" on %I;', t);
    execute format('drop policy if exists "own_update" on %I;', t);
    execute format('drop policy if exists "own_delete" on %I;', t);
    execute format('create policy "own_select" on %I for select using (auth.uid() = user_id);', t);
    execute format('create policy "own_insert" on %I for insert with check (auth.uid() = user_id);', t);
    execute format('create policy "own_update" on %I for update using (auth.uid() = user_id);', t);
    execute format('create policy "own_delete" on %I for delete using (auth.uid() = user_id);', t);
  end loop;
end $$;

-- ------------------------------------------------------------
--  Storage: 사진 버킷 (사용자별 폴더로 분리)
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

drop policy if exists "photos read"   on storage.objects;
drop policy if exists "photos write"  on storage.objects;
drop policy if exists "photos delete" on storage.objects;

-- 읽기는 공개(공개 URL 사용), 쓰기/삭제는 본인 폴더(uid/...)만
create policy "photos read" on storage.objects
  for select using (bucket_id = 'photos');
create policy "photos write" on storage.objects
  for insert with check (
    bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "photos delete" on storage.objects
  for delete using (
    bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================
--  마이그레이션: 가계부 시간, 번역 소스 구분 컬럼 추가
--  (기존 테이블이 있어도 안전하게 재실행 가능)
-- ============================================================
alter table expenses add column if not exists purchase_time text;
alter table translations add column if not exists source text default 'photo';

-- ============================================================
--  마이그레이션 2: 비서 대화 세션 + 번역 변환본(덮어쓰기) 저장
-- ============================================================

-- 대화 세션(여러 개)
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  title text default '새 대화'
);

-- chat_messages 에 conversation_id 연결
alter table chat_messages add column if not exists conversation_id uuid references conversations(id) on delete cascade;
create index if not exists idx_chat_conversation on chat_messages(conversation_id);

-- 번역: 덮어쓰기(변환본) 이미지 URL 보관
alter table translations add column if not exists replaced_url text;

-- conversations RLS
alter table conversations enable row level security;
drop policy if exists "own_select" on conversations;
drop policy if exists "own_insert" on conversations;
drop policy if exists "own_update" on conversations;
drop policy if exists "own_delete" on conversations;
create policy "own_select" on conversations for select using (auth.uid() = user_id);
create policy "own_insert" on conversations for insert with check (auth.uid() = user_id);
create policy "own_update" on conversations for update using (auth.uid() = user_id);
create policy "own_delete" on conversations for delete using (auth.uid() = user_id);

-- ============================================================
--  마이그레이션 3: 일정 간 이동방법 캐시 (한번 조회하면 저장)
-- ============================================================
alter table itinerary_items add column if not exists transit_cache jsonb;

-- ============================================================
--  마이그레이션 4: 여행 공유 (공유 코드로 일정+영수증 조회)
-- ============================================================
-- 공유 토큰을 itineraries 에 부여
alter table itineraries add column if not exists share_code text unique;

-- 공유된 일정을 "코드를 아는 사람"이 읽을 수 있도록 별도 정책 추가
-- (기존 own_select 는 본인만; 아래는 share_code 가 있으면 누구나 select 허용)
drop policy if exists "shared_select" on itineraries;
create policy "shared_select" on itineraries
  for select using (share_code is not null);

-- 공유된 일정의 항목도 읽기 허용
drop policy if exists "shared_items_select" on itinerary_items;
create policy "shared_items_select" on itinerary_items
  for select using (
    exists (select 1 from itineraries i where i.id = itinerary_items.itinerary_id and i.share_code is not null)
  );

-- 공유 일정과 같은 기간/사용자의 영수증도 함께 보고 싶다면:
-- (여기서는 단순화를 위해 영수증은 공유하지 않음. 일정만 공유)
