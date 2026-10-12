-- ═══════════════════════════════════════════════════════════════════
-- 동역 · Supabase 데이터베이스 설정
-- 사용법: Supabase 대시보드 → SQL Editor → 이 파일 전체를 붙여 넣고 Run
-- 이용 방식: 이용자는 로그인 없이 Supabase 익명 로그인(무작위 식별값)으로 쓰고, 이메일 로그인은 운영자만 쓴다.
--          Authentication → Sign In / Providers → Allow anonymous sign-ins 를 켜야 한다.
--        (여러 번 실행해도 안전하게 짰습니다. 고친 뒤 다시 Run 하면 덮어씁니다.)
--
-- 설계 원칙
--  1) 작성자 식별값(author_id)은 화면(API)으로 절대 나가지 않는다 → 열 단위 권한으로 막음
--  2) 익명 이름은 서버가 정한다(같은 글 안에서만 같은 이름)
--  3) 교회 평가는 운영자 검수 후 공개, 신고 3건이면 자동 가림(임시조치)
--  4) 상태값·작성자·익명 이름 같은 민감한 값은 클라이언트가 보낼 수 없다(트리거가 강제)
-- ═══════════════════════════════════════════════════════════════════

-- ── 0. 관리자 ───────────────────────────────────────────────────────
create table if not exists public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  note       text,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- ── 1. 공통 함수 ───────────────────────────────────────────────────
-- 익명 이름: "고요한 올리브 07" (씨앗 = 작성자 + 글) — 사이트의 체험 모드와 같은 단어 목록
create or replace function public.anon_handle(seed text) returns text
language sql immutable as $$
  select (array['고요한','따뜻한','성실한','온유한','든든한','소박한','맑은','깊은','부지런한','너그러운','단단한','차분한'])[1 + (('x' || substr(md5(seed), 1, 2))::bit(8)::int % 12)]
      || ' ' || (array['올리브','무화과','겨자씨','등불','두루마리','항아리','종려','포도나무','샘물','반석','등잔','돌판'])[1 + (('x' || substr(md5(seed), 3, 2))::bit(8)::int % 12)]
      || ' ' || lpad(((('x' || substr(md5(seed), 5, 2))::bit(8)::int) % 100)::text, 2, '0');
$$;

-- 교회 이름 비교용 키(한글·영문·숫자만, 소문자) — 사이트의 churchKey()와 같음
create or replace function public.church_key(name text) returns text
language sql immutable as $$
  select lower(regexp_replace(coalesce(name, ''), '[^가-힣a-zA-Z0-9]', '', 'g'));
$$;

create or replace function public.target_table(t text) returns text
language sql immutable as $$
  select case t when 'review' then 'reviews' when 'post' then 'posts' when 'comment' then 'comments'
                when 'resource' then 'resources' when 'setlist' then 'setlists' end;
$$;

-- ── 2. 테이블 ──────────────────────────────────────────────────────
-- 2-1. 교회 평가
create table if not exists public.reviews (
  id            bigint generated always as identity primary key,
  author_id     uuid references auth.users(id) on delete set null,
  church_name   text not null check (char_length(church_name) between 2 and 60),
  church_key    text not null default '',
  region        text check (char_length(region) <= 30),
  denomination  text check (char_length(denomination) <= 30),
  role          text not null check (role in ('교육전도사','전임전도사','강도사','부목사','기타')),
  period        text not null check (period in ('최근 2년 이내','3~5년 전','6~10년 전','10년 이상 전')),
  r_pay         smallint not null check (r_pay between 1 and 5),
  r_workload    smallint not null check (r_workload between 1 and 5),
  r_contract    smallint not null check (r_contract between 1 and 5),
  r_respect     smallint not null check (r_respect between 1 and 5),
  r_leadership  smallint not null check (r_leadership between 1 and 5),
  r_growth      smallint not null check (r_growth between 1 and 5),
  recommend     boolean not null,
  pros          text not null check (char_length(pros) between 10 and 2000),
  cons          text not null check (char_length(cons) between 10 and 2000),
  advice        text check (char_length(advice) <= 1000),
  attested      boolean not null check (attested),
  status        text not null default 'pending' check (status in ('pending','published','hidden','removed','rejected')),
  report_count  int not null default 0,
  created_at    timestamptz not null default now(),
  moderated_at  timestamptz
);
create index if not exists reviews_church_idx on public.reviews (church_key, status);
create index if not exists reviews_status_idx on public.reviews (status, created_at desc);

-- 2-2. 대나무숲
create table if not exists public.posts (
  id            bigint generated always as identity primary key,
  author_id     uuid references auth.users(id) on delete set null,
  category      text not null check (category in ('고민','사역','관계','진로','자유')),
  title         text not null check (char_length(title) between 2 and 80),
  body          text not null check (char_length(body) between 5 and 5000),
  anon_name     text not null default '',
  like_count    int not null default 0,
  comment_count int not null default 0,
  report_count  int not null default 0,
  status        text not null default 'published' check (status in ('pending','published','hidden','removed','rejected')),
  created_at    timestamptz not null default now()
);
create index if not exists posts_list_idx on public.posts (status, created_at desc);
create index if not exists posts_cat_idx on public.posts (category, status, created_at desc);

-- 2-3. 자료실
create table if not exists public.resources (
  id               bigint generated always as identity primary key,
  author_id        uuid references auth.users(id) on delete set null,
  category         text not null check (category in ('설교','신학','교육','예배','행정','기타')),
  title            text not null check (char_length(title) between 2 and 100),
  description      text check (char_length(description) <= 2000),
  link_url         text check (link_url is null or (link_url ~* '^https?://' and char_length(link_url) <= 500)),
  file_path        text check (file_path is null or file_path ~ '^[0-9]{4}/[0-9]{2}/[0-9a-f-]{36}\.[a-z0-9]{2,5}$'),
  file_name        text check (char_length(file_name) <= 120),
  file_size        int check (file_size between 0 and 10485760),
  tags             text[] not null default '{}' check (cardinality(tags) <= 5),
  rights_confirmed boolean not null check (rights_confirmed),
  anon_name        text not null default '',
  like_count       int not null default 0,
  comment_count    int not null default 0,
  report_count     int not null default 0,
  status           text not null default 'published' check (status in ('pending','published','hidden','removed','rejected')),
  created_at       timestamptz not null default now(),
  check (link_url is not null or file_path is not null)
);
create index if not exists resources_list_idx on public.resources (status, created_at desc);

-- 2-4. 콘티 나눔 (가사는 저장할 수 없음 — lyrics 키가 있으면 거절)
create table if not exists public.setlists (
  id            bigint generated always as identity primary key,
  author_id     uuid references auth.users(id) on delete set null,
  title         text not null check (char_length(title) between 2 and 80),
  service_type  text check (char_length(service_type) <= 20),
  theme         text check (char_length(theme) <= 80),
  note          text check (char_length(note) <= 500),
  songs         jsonb not null check (jsonb_typeof(songs) = 'array' and jsonb_array_length(songs) between 1 and 30
                                      and pg_column_size(songs) < 20000 and not jsonb_path_exists(songs, '$[*].lyrics')),
  anon_name     text not null default '',
  like_count    int not null default 0,
  comment_count int not null default 0,
  report_count  int not null default 0,
  status        text not null default 'published' check (status in ('pending','published','hidden','removed','rejected')),
  created_at    timestamptz not null default now()
);
create index if not exists setlists_list_idx on public.setlists (status, created_at desc);

-- 2-5. 댓글(대나무숲 글·자료·콘티)
create table if not exists public.comments (
  id           bigint generated always as identity primary key,
  author_id    uuid references auth.users(id) on delete set null,
  target_type  text not null check (target_type in ('post','resource','setlist')),
  target_id    bigint not null,
  body         text not null check (char_length(body) between 1 and 1000),
  anon_name    text not null default '',
  is_op        boolean not null default false,
  report_count int not null default 0,
  status       text not null default 'published' check (status in ('pending','published','hidden','removed','rejected')),
  created_at   timestamptz not null default now()
);
create index if not exists comments_target_idx on public.comments (target_type, target_id, created_at);

-- 2-6. 공감
create table if not exists public.reactions (
  target_type text not null check (target_type in ('post','resource','setlist')),
  target_id   bigint not null,
  user_id     uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (target_type, target_id, user_id)
);

-- 2-7. 신고
create table if not exists public.reports (
  id          bigint generated always as identity primary key,
  target_type text not null check (target_type in ('review','post','comment','resource','setlist')),
  target_id   bigint not null,
  reporter_id uuid references auth.users(id) on delete set null,
  reason      text not null check (reason in ('명예훼손·권리침해','개인정보 노출','욕설·비하','허위 사실','광고·도배','기타')),
  detail      text check (char_length(detail) <= 500),
  resolved    boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (target_type, target_id, reporter_id)
);
create index if not exists reports_open_idx on public.reports (resolved, target_type, target_id);

-- 2-8. 운영 처리 기록(임시조치 대장) — 관리자도 API로는 못 읽고 대시보드에서만 봄
create table if not exists public.moderation_log (
  id          bigint generated always as identity primary key,
  admin_id    uuid,
  target_type text not null,
  target_id   bigint not null,
  new_status  text not null,
  created_at  timestamptz not null default now()
);

-- ── 3. 트리거 ──────────────────────────────────────────────────────
-- 3-1. 글 작성 전: 작성자·상태·익명 이름을 서버가 정하고, 도배를 막는다
create or replace function public.tg_content_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare recent int; t_author uuid; t_status text;
begin
  new.author_id := auth.uid();
  if new.author_id is null then raise exception '로그인이 필요합니다'; end if;
  execute format('select count(*) from public.%I where author_id = $1 and created_at > now() - interval ''1 minute''', tg_table_name)
    into recent using new.author_id;
  if recent >= 5 then raise exception '잠시 후 다시 시도해 주세요(도배 방지)'; end if;
  new.created_at := now();
  new.report_count := 0;
  if tg_table_name = 'reviews' then
    new.status := 'pending';
    new.church_key := public.church_key(new.church_name);
    new.moderated_at := null;
  elsif tg_table_name = 'comments' then
    execute format('select author_id, status from public.%I where id = $1', public.target_table(new.target_type))
      into t_author, t_status using new.target_id;
    if t_status is distinct from 'published' then raise exception '글을 찾을 수 없습니다'; end if;
    new.is_op := (t_author is not distinct from new.author_id);
    new.anon_name := case when new.is_op then '글쓴이'
                          else public.anon_handle(new.author_id::text || ':' || new.target_type || ':' || new.target_id) end;
    new.status := 'published';
  else  -- posts, resources, setlists
    -- 익명 이용자(로그인 없이 쓰는 사람)는 파일 대신 링크로만 자료를 올린다(불법 파일·용량 악용 방지)
    if tg_table_name = 'resources' then   -- (조건을 나눠야 함: posts·setlists에는 file_path 칸이 없음)
      if new.file_path is not null and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
        raise exception '파일은 링크(구글 드라이브 등)로 공유해 주세요';
      end if;
    end if;
    new.status := 'published';
    new.anon_name := public.anon_handle(new.author_id::text || ':' || tg_table_name || ':' || new.id);
    new.like_count := 0;
    new.comment_count := 0;
  end if;
  return new;
end $$;

drop trigger if exists before_insert on public.reviews;
create trigger before_insert before insert on public.reviews for each row execute function public.tg_content_before_insert();
drop trigger if exists before_insert on public.posts;
create trigger before_insert before insert on public.posts for each row execute function public.tg_content_before_insert();
drop trigger if exists before_insert on public.resources;
create trigger before_insert before insert on public.resources for each row execute function public.tg_content_before_insert();
drop trigger if exists before_insert on public.setlists;
create trigger before_insert before insert on public.setlists for each row execute function public.tg_content_before_insert();
drop trigger if exists before_insert on public.comments;
create trigger before_insert before insert on public.comments for each row execute function public.tg_content_before_insert();

-- 3-2. 공감·댓글 수 다시 세기
create or replace function public.refresh_counts(p_type text, p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_type in ('post','resource','setlist') then
    execute format('update public.%I set
        comment_count = (select count(*) from public.comments where target_type = $1 and target_id = $2 and status = ''published''),
        like_count    = (select count(*) from public.reactions where target_type = $1 and target_id = $2)
      where id = $2', public.target_table(p_type)) using p_type, p_id;
  end if;
end $$;

create or replace function public.tg_after_comment() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform public.refresh_counts(new.target_type, new.target_id); return null; end $$;
drop trigger if exists after_change on public.comments;
create trigger after_change after insert or update of status on public.comments for each row execute function public.tg_after_comment();

create or replace function public.tg_before_reaction() returns trigger
language plpgsql security definer set search_path = public as $$
declare t_status text;
begin
  new.user_id := auth.uid();
  if new.user_id is null then raise exception '로그인이 필요합니다'; end if;
  execute format('select status from public.%I where id = $1', public.target_table(new.target_type)) into t_status using new.target_id;
  if t_status is distinct from 'published' then raise exception '글을 찾을 수 없습니다'; end if;
  new.created_at := now();
  return new;
end $$;
drop trigger if exists before_insert on public.reactions;
create trigger before_insert before insert on public.reactions for each row execute function public.tg_before_reaction();

create or replace function public.tg_after_reaction() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then perform public.refresh_counts(old.target_type, old.target_id);
  else perform public.refresh_counts(new.target_type, new.target_id); end if;
  return null;
end $$;
drop trigger if exists after_change on public.reactions;
create trigger after_change after insert or delete on public.reactions for each row execute function public.tg_after_reaction();

-- 3-3. 신고: 서로 다른 이용자의 미처리 신고가 3건이면 자동으로 가림(임시조치) → 운영자가 확인
create or replace function public.tg_before_report() returns trigger
language plpgsql security definer set search_path = public as $$
declare t_status text;
begin
  new.reporter_id := auth.uid();
  if new.reporter_id is null then raise exception '로그인이 필요합니다'; end if;
  execute format('select status from public.%I where id = $1', public.target_table(new.target_type)) into t_status using new.target_id;
  if t_status is null or t_status = 'removed' then raise exception '글을 찾을 수 없습니다'; end if;
  new.resolved := false;
  new.created_at := now();
  return new;
end $$;
drop trigger if exists before_insert on public.reports;
create trigger before_insert before insert on public.reports for each row execute function public.tg_before_report();

create or replace function public.tg_after_report() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  select count(*) into n from public.reports where target_type = new.target_type and target_id = new.target_id and not resolved;
  execute format('update public.%I set report_count = $1, status = case when $1 >= 3 and status = ''published'' then ''hidden'' else status end where id = $2',
                 public.target_table(new.target_type)) using n, new.target_id;
  return null;
end $$;
drop trigger if exists after_insert on public.reports;
create trigger after_insert after insert on public.reports for each row execute function public.tg_after_report();

-- ── 4. 화면에서 부르는 함수(RPC) ───────────────────────────────────
-- 내가 쓴 글 목록(삭제 버튼 표시용) — 다른 사람의 것은 절대 돌려주지 않음
create or replace function public.my_items() returns table (target_type text, target_id bigint)
language sql stable security definer set search_path = public as $$
  select 'review'::text, id from public.reviews where author_id = auth.uid() and status <> 'removed'
  union all select 'post', id from public.posts where author_id = auth.uid() and status <> 'removed'
  union all select 'comment', id from public.comments where author_id = auth.uid() and status <> 'removed'
  union all select 'resource', id from public.resources where author_id = auth.uid() and status <> 'removed'
  union all select 'setlist', id from public.setlists where author_id = auth.uid() and status <> 'removed';
$$;

-- 본인 글 삭제(숨김 처리 — 신고·법적 요청 대응을 위해 행은 남김)
create or replace function public.delete_own(p_type text, p_id bigint) returns boolean
language plpgsql security definer set search_path = public as $$
declare tbl text := public.target_table(p_type); n int;
begin
  if auth.uid() is null or tbl is null then return false; end if;
  execute format('update public.%I set status = ''removed'' where id = $1 and author_id = $2 and status <> ''removed''', tbl)
    using p_id, auth.uid();
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- 신고 대상 내용(작성자 식별값 제외)
create or replace function public.content_of(p_type text, p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare j jsonb;
begin
  if public.target_table(p_type) is null then return null; end if;
  execute format('select to_jsonb(t) - ''author_id'' from public.%I t where id = $1', public.target_table(p_type)) into j using p_id;
  return j;
end $$;

-- 운영 화면: 검수 대기 평가 + 미처리 신고
create or replace function public.moderation_queue() returns json
language plpgsql stable security definer set search_path = public as $$
declare result json;
begin
  if not public.is_admin() then raise exception '관리자만 볼 수 있습니다'; end if;
  select json_build_object(
    'pending', coalesce((select json_agg(r order by r.created_at) from (
        select id, church_name, region, denomination, role, period, r_pay, r_workload, r_contract, r_respect, r_leadership, r_growth,
               recommend, pros, cons, advice, status, created_at
        from public.reviews where status = 'pending') r), '[]'::json),
    'flagged', coalesce((select json_agg(f order by f.last_at desc) from (
        select g.target_type, g.target_id, g.last_at, g.reports, public.content_of(g.target_type, g.target_id) as content
        from (select target_type, target_id, max(created_at) as last_at,
                     json_agg(json_build_object('reason', reason, 'detail', detail, 'at', created_at) order by created_at) as reports
              from public.reports where not resolved group by target_type, target_id) g) f), '[]'::json)
  ) into result;
  return result;
end $$;

-- 운영 처리: 공개 / 가림(임시조치) / 삭제·반려 — 처리 기록을 남김
create or replace function public.moderate(p_type text, p_id bigint, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare tbl text := public.target_table(p_type);
begin
  if not public.is_admin() then raise exception '관리자만 할 수 있습니다'; end if;
  if tbl is null then raise exception '잘못된 대상입니다'; end if;
  if p_status not in ('published','hidden','removed','rejected') then raise exception '잘못된 상태입니다'; end if;
  execute format('update public.%I set status = $1, report_count = 0 where id = $2', tbl) using p_status, p_id;
  if p_type = 'review' then update public.reviews set moderated_at = now() where id = p_id; end if;
  update public.reports set resolved = true where target_type = p_type and target_id = p_id;
  insert into public.moderation_log (admin_id, target_type, target_id, new_status) values (auth.uid(), p_type, p_id, p_status);
end $$;

-- 내부용 함수는 API로 직접 부를 수 없게
revoke execute on function public.refresh_counts(text, bigint) from public, anon, authenticated;
revoke execute on function public.content_of(text, bigint) from public, anon, authenticated;
revoke execute on function public.tg_content_before_insert() from public, anon, authenticated;
revoke execute on function public.tg_after_comment() from public, anon, authenticated;
revoke execute on function public.tg_before_reaction() from public, anon, authenticated;
revoke execute on function public.tg_after_reaction() from public, anon, authenticated;
revoke execute on function public.tg_before_report() from public, anon, authenticated;
revoke execute on function public.tg_after_report() from public, anon, authenticated;
revoke execute on function public.moderation_queue() from public, anon;
revoke execute on function public.moderate(text, bigint, text) from public, anon;
revoke execute on function public.delete_own(text, bigint) from public, anon;
revoke execute on function public.my_items() from public, anon;
grant execute on function public.moderation_queue(), public.moderate(text, bigint, text), public.delete_own(text, bigint), public.my_items() to authenticated;
grant execute on function public.is_admin() to anon, authenticated;

-- ── 5. 교회별 평가 요약(공개분만) ─────────────────────────────────
create or replace view public.church_stats with (security_invoker = true) as
select church_key,
       (array_agg(church_name order by created_at desc))[1] as church_name,
       (array_agg(region order by created_at desc) filter (where coalesce(region, '') <> ''))[1] as region,
       count(*)::int as n,
       round(avg((r_pay + r_workload + r_contract + r_respect + r_leadership + r_growth) / 6.0), 2)::float8 as overall,
       round(100.0 * avg(case when recommend then 1 else 0 end))::int as rec_pct,
       max(created_at) as last_at
from public.reviews
where status = 'published'
group by church_key;

-- ── 6. 권한: 열 단위로 꼭 필요한 것만 ─────────────────────────────
revoke all on public.reviews, public.posts, public.comments, public.resources, public.setlists,
              public.reactions, public.reports, public.moderation_log from anon, authenticated;

grant select (id, church_name, church_key, region, denomination, role, period, r_pay, r_workload, r_contract, r_respect,
              r_leadership, r_growth, recommend, pros, cons, advice, status, created_at) on public.reviews to anon, authenticated;
grant insert (church_name, region, denomination, role, period, r_pay, r_workload, r_contract, r_respect, r_leadership,
              r_growth, recommend, pros, cons, advice, attested) on public.reviews to authenticated;

grant select (id, category, title, body, anon_name, like_count, comment_count, status, created_at) on public.posts to anon, authenticated;
grant insert (category, title, body) on public.posts to authenticated;

grant select (id, category, title, description, link_url, file_path, file_name, file_size, tags, anon_name, like_count,
              comment_count, status, created_at) on public.resources to anon, authenticated;
grant insert (category, title, description, link_url, file_path, file_name, file_size, tags, rights_confirmed) on public.resources to authenticated;

grant select (id, title, service_type, theme, note, songs, anon_name, like_count, comment_count, status, created_at) on public.setlists to anon, authenticated;
grant insert (title, service_type, theme, note, songs) on public.setlists to authenticated;

grant select (id, target_type, target_id, body, anon_name, is_op, status, created_at) on public.comments to anon, authenticated;
grant insert (target_type, target_id, body) on public.comments to authenticated;

grant select (target_type, target_id, created_at) on public.reactions to authenticated;
grant insert (target_type, target_id) on public.reactions to authenticated;
grant delete on public.reactions to authenticated;

grant insert (target_type, target_id, reason, detail) on public.reports to authenticated;

grant select on public.church_stats to anon, authenticated;

-- ── 7. 행 단위 보안(RLS) ───────────────────────────────────────────
alter table public.reviews        enable row level security;
alter table public.posts          enable row level security;
alter table public.resources      enable row level security;
alter table public.setlists       enable row level security;
alter table public.comments       enable row level security;
alter table public.reactions      enable row level security;
alter table public.reports        enable row level security;
alter table public.moderation_log enable row level security;

do $$
declare t text;
begin
  foreach t in array array['reviews','posts','resources','setlists','comments'] loop
    execute format('drop policy if exists "read" on public.%I', t);
    execute format('create policy "read" on public.%I for select using (status = ''published'' or author_id = (select auth.uid()) or (select public.is_admin()))', t);
    execute format('drop policy if exists "write" on public.%I', t);
    execute format('create policy "write" on public.%I for insert to authenticated with check (author_id = (select auth.uid()))', t);
  end loop;
end $$;

drop policy if exists "own read" on public.reactions;
create policy "own read" on public.reactions for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "own write" on public.reactions;
create policy "own write" on public.reactions for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "own delete" on public.reactions;
create policy "own delete" on public.reactions for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists "write" on public.reports;
create policy "write" on public.reports for insert to authenticated with check (reporter_id = (select auth.uid()));

-- ── 8. 파일 저장소(자료실) ─────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('resources', 'resources', true, 10485760, array[
  'application/pdf', 'application/x-hwp', 'application/vnd.hancom.hwpx', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
                               allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "resources upload" on storage.objects;
create policy "resources upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'resources' and name ~ '^[0-9]{4}/[0-9]{2}/[0-9a-f-]{36}\.[a-z0-9]{2,5}$'
              and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);   -- 익명 이용자는 업로드 불가

-- ── 9. 관리자 지정(처음 한 번) ─────────────────────────────────────
-- 사이트에서 운영자 이메일로 한 번 로그인한 뒤, 아래 줄의 이메일을 바꿔 실행하세요.
-- insert into public.admins (user_id, note) select id, '운영자' from auth.users where email = 'you@example.com' on conflict do nothing;
