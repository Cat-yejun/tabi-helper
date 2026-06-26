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

-- ============================================================
--  마이그레이션 5: 팀 협업 (닉네임 멤버 추가, 일정+가계부 공유)
-- ============================================================

-- 1) 닉네임으로 사용자를 찾기 위한 공개 프로필 테이블
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  created_at timestamptz default now()
);
alter table profiles enable row level security;
-- 닉네임으로 검색해야 하므로 모든 로그인 사용자가 읽기 가능
drop policy if exists "profiles read" on profiles;
create policy "profiles read" on profiles for select using (true);
drop policy if exists "profiles upsert self" on profiles;
create policy "profiles upsert self" on profiles for insert with check (auth.uid() = id);
drop policy if exists "profiles update self" on profiles;
create policy "profiles update self" on profiles for update using (auth.uid() = id);

-- 가입 시 자동으로 프로필 생성 (username 은 user_metadata 에서)
-- username 이 이미 있으면 뒤에 짧은 suffix 를 붙여 유니크 보장
create or replace function public.handle_new_user()
returns trigger as $$
declare
  base_name text := coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1));
  final_name text := base_name;
  n int := 0;
begin
  while exists (select 1 from public.profiles where username = final_name) loop
    n := n + 1;
    final_name := base_name || n::text;
  end loop;
  insert into public.profiles (id, username)
  values (new.id, final_name)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 기존 사용자들 프로필 백필 (username 중복은 id 순서로 suffix 부여)
insert into public.profiles (id, username)
select u.id,
       case when rn = 1 then base_name else base_name || (rn - 1)::text end
from (
  select id,
         coalesce(raw_user_meta_data->>'username', split_part(email,'@',1)) as base_name,
         row_number() over (
           partition by coalesce(raw_user_meta_data->>'username', split_part(email,'@',1))
           order by created_at
         ) as rn
  from auth.users
) u
on conflict (id) do nothing;

-- 2) 여행 멤버십
create table if not exists trip_members (
  itinerary_id uuid references itineraries(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text default 'member', -- 'owner' | 'member'
  created_at timestamptz default now(),
  primary key (itinerary_id, user_id)
);
alter table trip_members enable row level security;

-- 내가 속한 여행의 멤버 목록은 읽기 가능
drop policy if exists "members read" on trip_members;
create policy "members read" on trip_members for select using (
  exists (select 1 from trip_members m2 where m2.itinerary_id = trip_members.itinerary_id and m2.user_id = auth.uid())
);
-- 멤버 추가/삭제는 소유자만
drop policy if exists "members manage by owner" on trip_members;
create policy "members manage by owner" on trip_members for all using (
  exists (select 1 from trip_members o where o.itinerary_id = trip_members.itinerary_id and o.user_id = auth.uid() and o.role = 'owner')
) with check (
  exists (select 1 from trip_members o where o.itinerary_id = trip_members.itinerary_id and o.user_id = auth.uid() and o.role = 'owner')
);

-- 3) 가계부를 여행에 연결 (선택적: null 이면 개인 가계부)
alter table expenses add column if not exists itinerary_id uuid references itineraries(id) on delete set null;

-- 4) 멤버십 기반으로 일정/항목/가계부 접근 정책 추가
-- 헬퍼: 특정 여행의 멤버인지
create or replace function public.is_trip_member(tid uuid)
returns boolean as $$
  select exists (select 1 from trip_members m where m.itinerary_id = tid and m.user_id = auth.uid());
$$ language sql security definer stable;

-- itineraries: 멤버면 보고/수정 가능 (소유 정책에 더해)
drop policy if exists "member_select" on itineraries;
create policy "member_select" on itineraries for select using (public.is_trip_member(id));
drop policy if exists "member_update" on itineraries;
create policy "member_update" on itineraries for update using (public.is_trip_member(id));

-- itinerary_items: 멤버면 모두 가능
drop policy if exists "member_items_all" on itinerary_items;
create policy "member_items_all" on itinerary_items for all
  using (public.is_trip_member(itinerary_id))
  with check (public.is_trip_member(itinerary_id));

-- expenses: 그 여행 멤버면 보고/추가 가능
drop policy if exists "member_expenses_all" on expenses;
create policy "member_expenses_all" on expenses for all
  using (itinerary_id is not null and public.is_trip_member(itinerary_id))
  with check (itinerary_id is null or public.is_trip_member(itinerary_id) or auth.uid() = user_id);

-- 5) 기존 일정들의 소유자를 trip_members 에 owner 로 백필
insert into trip_members (itinerary_id, user_id, role)
select id, user_id, 'owner' from itineraries
on conflict do nothing;

-- ============================================================
--  마이그레이션 6: 살 것 체크리스트
-- ============================================================
create table if not exists shopping_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  name text not null,
  note text,
  checked boolean default false,
  sort_order int default 0
);
alter table shopping_items enable row level security;
drop policy if exists "own_select" on shopping_items;
drop policy if exists "own_insert" on shopping_items;
drop policy if exists "own_update" on shopping_items;
drop policy if exists "own_delete" on shopping_items;
create policy "own_select" on shopping_items for select using (auth.uid() = user_id);
create policy "own_insert" on shopping_items for insert with check (auth.uid() = user_id);
create policy "own_update" on shopping_items for update using (auth.uid() = user_id);
create policy "own_delete" on shopping_items for delete using (auth.uid() = user_id);

-- ============================================================
--  마이그레이션 7: 살 것 체크리스트 - 가격/개수/종류
-- ============================================================
alter table shopping_items add column if not exists price numeric default 0;
alter table shopping_items add column if not exists qty int default 1;
alter table shopping_items add column if not exists category text default '기타';
