// schema.sql 점검 — 실제 Postgres(PGlite, 메모리)에 Supabase 흉내 환경을 만들고 권한·트리거·RLS를 확인합니다.
//   cd supabase/test && npm install && npm test
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const db = new PGlite();
const U1 = '11111111-1111-1111-1111-111111111111', U2 = '22222222-2222-2222-2222-222222222222', U3 = '33333333-3333-3333-3333-333333333333', U4 = '44444444-4444-4444-4444-444444444444', AD = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

// ── Supabase 흉내 ──
await db.exec(`
create role anon nologin; create role authenticated nologin;
create schema auth; create schema storage;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;
grant execute on function auth.jwt() to anon, authenticated;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid default gen_random_uuid() primary key, bucket_id text, name text, owner_id text);
alter table storage.objects enable row level security;
grant usage on schema public, auth, storage to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
insert into auth.users values ('${U1}','u1@x'),('${U2}','u2@x'),('${U3}','u3@x'),('${U4}','u4@x'),('${AD}','ad@x');
`);
const schema = await readFile(new URL('../schema.sql', import.meta.url), 'utf8');
await db.exec(schema);
await db.exec(schema);   // 두 번 실행해도 되는지
console.log('✓ schema 2회 실행');

async function as(uid, sql, params = []) {
  await db.exec(`reset role`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid || '']);
  await db.exec(`set role ${uid ? 'authenticated' : 'anon'}`);
  try { return (await db.query(sql, params)).rows; } finally { await db.exec('reset role'); }
}
async function fails(p, re) { try { await p; } catch (e) { if (re) assert.match(e.message, re); return e.message; } throw new Error('should have failed'); }
const ok = m => console.log('✓', m);

// 글쓰기
const [p1] = await as(U1, `insert into posts (category, title, body) values ('고민','첫 글','본문입니다 다섯자') returning id`);
const row = (await db.query(`select * from posts where id = $1`, [p1.id])).rows[0];
assert.equal(row.author_id, U1); assert.match(row.anon_name, /^\S+ \S+ \d{2}$/); assert.equal(row.status, 'published');
ok('글 작성: 작성자·익명 이름 서버가 지정 → ' + row.anon_name);
await fails(as(null, `insert into posts (category, title, body) values ('고민','익명','본문입니다')`), /permission denied|로그인/);
ok('비로그인 작성 차단');
await fails(as(U1, `insert into posts (category, title, body, status) values ('고민','x2','본문입니다')`.replace(', status', ', status').replace("'본문입니다')", "'본문입니다','hidden')")), /permission denied/);
await fails(as(U1, `insert into posts (category, title, body, author_id) values ('고민','x3','본문입니다','${U2}')`), /permission denied/);
ok('status·author_id 직접 지정 차단');

// 읽기: author_id 노출 금지
const pub = await as(null, `select id, title, anon_name from posts`);
assert.equal(pub.length, 1);
await fails(as(null, `select author_id from posts`), /permission denied/);
await fails(as(U2, `select * from posts`), /permission denied/);
ok('author_id는 누구도 API로 못 읽음(select * 포함)');

// 댓글
await as(U2, `insert into comments (target_type, target_id, body) values ('post', $1, '위로합니다')`, [p1.id]);
await as(U1, `insert into comments (target_type, target_id, body) values ('post', $1, '감사합니다')`, [p1.id]);
await as(U2, `insert into comments (target_type, target_id, body) values ('post', $1, '또 씁니다')`, [p1.id]);
const cm = await as(null, `select anon_name, is_op from comments order by id`);
assert.equal(cm[1].anon_name, '글쓴이'); assert.equal(cm[0].anon_name, cm[2].anon_name); assert.notEqual(cm[0].anon_name, row.anon_name === cm[0].anon_name ? 'x' : row.anon_name);
assert.equal((await as(null, `select comment_count from posts where id=$1`, [p1.id]))[0].comment_count, 3);
ok('댓글: 글쓴이 표시, 같은 사람 같은 이름, 댓글 수 자동');

// 공감
await as(U2, `insert into reactions (target_type, target_id) values ('post', $1)`, [p1.id]);
const dup = await fails(as(U2, `insert into reactions (target_type, target_id) values ('post', $1)`, [p1.id]));
assert.match(dup, /duplicate|unique/);
assert.equal((await as(null, `select like_count from posts where id=$1`, [p1.id]))[0].like_count, 1);
assert.equal((await as(U2, `select target_id from reactions where target_type='post' and target_id=$1`, [p1.id])).length, 1);
assert.equal((await as(U3, `select target_id from reactions`)).length, 0);
await as(U2, `delete from reactions where target_type='post' and target_id=$1`, [p1.id]);
assert.equal((await as(null, `select like_count from posts where id=$1`, [p1.id]))[0].like_count, 0);
ok('공감: 1인 1회, 취소, 남의 공감 안 보임');

// 교회 평가: 검수 전에는 본인·관리자만
const rv = `insert into reviews (church_name, region, role, period, r_pay, r_workload, r_contract, r_respect, r_leadership, r_growth, recommend, pros, cons, attested)
            values ('은혜 숲 교회','서울','교육전도사','3~5년 전',4,3,5,4,3,4,true,'좋았던 점 열 글자 이상','아쉬운 점 열 글자 이상', true) returning id`;
const [r1] = await as(U1, rv);
assert.equal((await as(U1, `select status, church_key from reviews`))[0].status, 'pending');
assert.equal((await as(U1, `select church_key from reviews`))[0].church_key, '은혜숲교회');
assert.equal((await as(U2, `select id from reviews`)).length, 0);
assert.equal((await as(null, `select id from reviews`)).length, 0);
assert.equal((await as(null, `select * from church_stats`)).length, 0);
ok('평가: 검수 대기 중엔 작성자만 보임, church_key 자동');

// 관리자
await fails(as(U1, `select moderate('review', $1, 'published')`, [r1.id]), /관리자/);
await fails(as(null, `select moderation_queue()`), /permission denied/);
await db.query(`insert into admins (user_id) values ($1)`, [AD]);
assert.equal((await as(AD, `select is_admin() as a`))[0].a, true);
const q1 = (await as(AD, `select moderation_queue() as q`))[0].q;
assert.equal(q1.pending.length, 1); assert.ok(!('author_id' in q1.pending[0]));
await as(AD, `select moderate('review', $1, 'published')`, [r1.id]);
const st = await as(null, `select * from church_stats`);
assert.equal(st.length, 1); assert.equal(st[0].n, 1); assert.equal(st[0].church_name, '은혜 숲 교회');
assert.equal((await db.query(`select count(*)::int n from moderation_log`)).rows[0].n, 1);
ok('관리자: 검수 대기 목록·승인·처리 기록, 요약 뷰 공개 → 평균 ' + st[0].overall);

// 신고 3건 → 자동 가림
for (const u of [U2, U3, U4]) await as(u, `insert into reports (target_type, target_id, reason) values ('post', $1, '욕설·비하')`, [p1.id]);
assert.equal((await db.query(`select status, report_count from posts where id=$1`, [p1.id])).rows[0].status, 'hidden');
assert.equal((await as(null, `select id from posts`)).length, 0);
assert.equal((await as(U1, `select id from posts`)).length, 1);     // 작성자는 자기 글이 가려진 걸 볼 수 있음
await fails(as(U2, `insert into reports (target_type, target_id, reason) values ('post', $1, '기타')`, [p1.id]), /duplicate|unique/);
const q2 = (await as(AD, `select moderation_queue() as q`))[0].q;
assert.equal(q2.flagged.length, 1); assert.ok(!('author_id' in q2.flagged[0].content));
await as(AD, `select moderate('post', $1, 'published')`, [p1.id]);
assert.equal((await as(null, `select id from posts`)).length, 1);
ok('신고 3건 자동 가림 → 관리자 복구, 중복 신고 차단');

// 본인 삭제
assert.equal((await as(U2, `select delete_own('post', $1) as r`, [p1.id]))[0].r, false);
const mine = await as(U1, `select * from my_items()`);
assert.ok(mine.some(m => m.target_type === 'post' && Number(m.target_id) === Number(p1.id)));
assert.equal((await as(U2, `select * from my_items()`)).filter(m => m.target_type === 'post').length, 0);
assert.equal((await as(U1, `select delete_own('post', $1) as r`, [p1.id]))[0].r, true);
assert.equal((await as(null, `select id from posts`)).length, 0);
ok('본인 글만 삭제, my_items는 본인 것만');

// 콘티: 가사 거절
await fails(as(U1, `insert into setlists (title, songs) values ('콘티 하나', '[{"title":"곡","lyrics":"가사"}]')`), /check/);
await as(U1, `insert into setlists (title, songs) values ('콘티 하나', '[{"title":"곡","key":"G"}]')`);
ok('콘티: 가사 포함 시 거절');

// 자료: 링크/파일 경로 검사
await fails(as(U1, `insert into resources (category, title, rights_confirmed) values ('설교','제목',true)`), /check/);
await fails(as(U1, `insert into resources (category, title, link_url, rights_confirmed) values ('설교','제목','javascript:alert(1)',true)`), /check/);
await fails(as(U1, `insert into resources (category, title, file_path, rights_confirmed) values ('설교','제목','../etc/passwd',true)`), /check/);
await as(U1, `insert into resources (category, title, link_url, tags, rights_confirmed) values ('설교','제목','https://drive.google.com/x', '{로마서}', true)`);
ok('자료: 링크·파일 경로 형식 검사');

// 익명 이용자는 파일 경로가 있는 자료를 못 올림(링크만)
await db.query(`select set_config('request.jwt.claims', '{"is_anonymous": true}', false)`);
await fails(as(U2, `insert into resources (category, title, file_path, file_name, rights_confirmed) values ('설교','파일','2026/10/0b6f0e4c-1b2a-4c3d-8e9f-0123456789ab.pdf','a.pdf',true)`), /링크/);
await as(U2, `insert into resources (category, title, link_url, rights_confirmed) values ('설교','링크 자료','https://drive.google.com/y', true)`);
await db.query(`select set_config('request.jwt.claims', '', false)`);
ok('익명 이용자: 파일 업로드 거절, 링크 공유는 허용');

// 도배 방지
for (let i = 0; i < 4; i++) await as(U3, `insert into posts (category, title, body) values ('자유', $1, '본문입니다')`, ['도배' + i]);
await as(U3, `insert into posts (category, title, body) values ('자유', '도배4', '본문입니다')`);
await fails(as(U3, `insert into posts (category, title, body) values ('자유', '도배5', '본문입니다')`), /도배/);
ok('도배 방지: 1분 5건 초과 차단');

// 숨김 글엔 댓글·공감 불가
await fails(as(U2, `insert into comments (target_type, target_id, body) values ('post', $1, 'x')`, [p1.id]), /찾을 수 없/);
await fails(as(U2, `insert into reactions (target_type, target_id) values ('post', $1)`, [p1.id]), /찾을 수 없/);
ok('삭제된 글엔 댓글·공감 불가');

// 내부 함수 직접 호출 금지
await fails(as(U1, `select refresh_counts('post', 1)`), /permission denied/);
await fails(as(U1, `select content_of('post', 1)`), /permission denied/);
ok('내부 함수 API 호출 차단');
console.log('\n모든 점검 통과');

// 교회 평가 신고는 구체적인 사유 20자 이상
{
  const [rv] = (await db.query(`select id from reviews where status = 'published' limit 1`)).rows;
  if (rv) {
    await fails(as(U4, `insert into reports (target_type, target_id, reason) values ('review', ${rv.id}, '허위 사실')`), /20자/);
    await fails(as(U4, `insert into reports (target_type, target_id, reason, detail) values ('review', ${rv.id}, '허위 사실', '사실 아님')`), /20자/);
    await as(U4, `insert into reports (target_type, target_id, reason, detail) values ('review', ${rv.id}, '허위 사실', '평가의 사례비 미지급 내용은 사실과 다르며 계약서대로 매월 지급했습니다')`);
    ok('교회 평가 신고: 사유 20자 미만 거절, 구체적 사유는 접수');
  } else console.log('· 공개 평가가 없어 신고 사유 점검 생략');
}

// 같은 접속 30분 제한은 교회 평가 신고에만 — 글·댓글은 제한 없음
{
  const hdr = ip => db.query(`select set_config('request.headers', $1, false)`, [JSON.stringify({ 'x-forwarded-for': ip + ', 10.0.0.1', 'user-agent': 'UA-test' })]);
  await db.exec(`reset role; update posts set created_at = created_at - interval '2 minutes'; update comments set created_at = created_at - interval '2 minutes'`);
  await hdr('9.9.9.9');
  const [a1] = await as(U3, `insert into posts (category, title, body) values ('고민','같은IP1','본문입니다 다섯자') returning id`);
  await as(U4, `insert into posts (category, title, body) values ('고민','같은IP2','본문입니다 다섯자')`);
  await as(U3, `insert into comments (target_type, target_id, body) values ('post', ${a1.id}, '댓글1')`);
  await as(U4, `insert into comments (target_type, target_id, body) values ('post', ${a1.id}, '댓글2')`);
  const rvs = (await db.query(`select id from reviews where status = 'published' order by id`)).rows;
  const why = '평가의 사례비 미지급 내용은 사실과 다르며 계약서대로 매월 지급했습니다';
  const reps = new Set((await db.query(`select target_id, reporter_id from reports where target_type='review'`)).rows.map(r => r.target_id + ':' + r.reporter_id));
  const pick = uid => rvs.find(r => !reps.has(r.id + ':' + uid));
  if (rvs.length) {
    await as(U2, `insert into reports (target_type, target_id, reason, detail) values ('review', ${pick(U2).id}, '허위 사실', '${why}')`);
    await fails(as(U3, `insert into reports (target_type, target_id, reason, detail) values ('review', ${pick(U3).id}, '허위 사실', '${why}')`), /30분/);
    await hdr('8.8.8.8');
    await as(U3, `insert into reports (target_type, target_id, reason, detail) values ('review', ${pick(U3).id}, '허위 사실', '${why}')`);
  }
  const g = (await db.query(`select bool_or(fp like '%9.9.9.9%') raw, count(*) filter (where tbl <> 'report_review')::int other from write_guard`)).rows[0];
  assert.equal(g.raw, false); assert.equal(g.other, 0);
  await fails(as(U3, `select * from write_guard`), /permission denied/);
  await db.query(`select set_config('request.headers', '', false)`);
  ok('같은 접속: 글·댓글은 제한 없음, 교회 평가 신고만 30분에 한 번, IP 원문 미저장·API로 못 읽음');
}


// 교회 평가: 신고가 쌓여도 자동으로 가리지 않음(운영자 검토), 운영자가 가리면 이유가 공개(내용은 비공개), 다시 공개하면 이유 지움
{
  await db.exec(`reset role; delete from reports where target_type = 'review'; delete from write_guard`);
  const [rv] = await as(U1, `insert into reviews (church_name, region, role, period, r_pay, r_workload, r_contract, r_respect, r_leadership, r_growth, recommend, pros, cons, attested)
    values ('투명교회','서울','부목사','최근 2년 이내',3,3,3,3,3,3,true,'좋았던 점 열 글자 이상','아쉬운 점 열 글자 이상',true) returning id, church_key`);
  await as(AD, `select moderate('review', $1, 'published')`, [rv.id]);
  const why = '평가의 사례비 미지급 내용은 사실과 다르며 계약서대로 매월 지급했습니다';
  for (const [i, u] of [U2, U3, U4].entries()) {
    await db.query(`select set_config('request.headers', $1, false)`, [JSON.stringify({ 'x-forwarded-for': `7.7.7.${i}`, 'user-agent': 'UA' })]);
    await as(u, `insert into reports (target_type, target_id, reason, detail) values ('review', ${rv.id}, '홍보성 평가 의심', '${why}')`);
  }
  await db.query(`select set_config('request.headers', '', false)`);
  await db.exec(`reset role`);
  let r = (await db.query(`select status, report_count from reviews where id = $1`, [rv.id])).rows[0];
  assert.equal(r.status, 'published'); assert.equal(r.report_count, 3);
  await as(AD, `select moderate('review', $1, 'hidden', '권리침해 신고가 접수되어 확인 중입니다')`, [rv.id]);
  const stub = await as(null, `select * from hidden_reviews($1)`, [rv.church_key]);
  assert.equal(stub.length, 1); assert.equal(stub[0].hidden_reason, '권리침해 신고가 접수되어 확인 중입니다'); assert.ok(!('pros' in stub[0]));
  assert.equal((await as(null, `select id from reviews where id = $1`, [rv.id])).length, 0);
  await as(AD, `select moderate('review', $1, 'published')`, [rv.id]);
  await db.exec(`reset role`);
  r = (await db.query(`select status, hidden_reason from reviews where id = $1`, [rv.id])).rows[0];
  assert.equal(r.status, 'published'); assert.equal(r.hidden_reason, null);
  assert.equal((await as(null, `select * from hidden_reviews($1)`, [rv.church_key])).length, 0);
  ok('교회 평가: 신고 3건에도 자동 가림 없음, 운영자 가림 이유만 공개, 다시 공개하면 이유 지움, 「홍보성 평가 의심」 사유');
}

// 교회 측 답변: 운영자만 게시, 누구나 읽음, 빈 글이면 지움
{
  const [rv] = (await db.query(`select id from reviews where church_name = '투명교회'`)).rows;
  await fails(as(U2, `select set_church_reply($1, '교회 측 답변입니다', '담임목사')`, [rv.id]), /관리자/);
  await fails(as(U2, `update reviews set church_reply = 'x' where id = $1`, [rv.id]), /permission denied/);
  await as(AD, `select set_church_reply($1, '말씀해 주신 부분을 무겁게 받습니다. 사례비는 이후 계약서대로 지급하고 있습니다.', '담임목사')`, [rv.id]);
  let [r] = await as(null, `select church_reply, church_reply_by, church_reply_at from reviews where id = $1`, [rv.id]);
  assert.match(r.church_reply, /무겁게/); assert.equal(r.church_reply_by, '담임목사'); assert.ok(r.church_reply_at);
  await as(AD, `select set_church_reply($1, '  ')`, [rv.id]);
  [r] = await as(null, `select church_reply, church_reply_by from reviews where id = $1`, [rv.id]);
  assert.equal(r.church_reply, null); assert.equal(r.church_reply_by, null);
  ok('교회 측 답변: 운영자만 게시·삭제, 공개 읽기, 이용자 직접 수정 불가');
}

// 운영자 계정이 쓴 글·댓글은 이름이 「운영자」, 일반 이용자는 익명 이름
{
  await db.exec(`reset role; delete from write_guard; update posts set created_at = created_at - interval '2 minutes'; update comments set created_at = created_at - interval '2 minutes'`);
  const [p] = await as(AD, `insert into posts (category, title, body) values ('자유','운영자 공지','운영자 공지 본문입니다') returning id, anon_name`);
  assert.equal(p.anon_name, '운영자');
  const [c1] = await as(AD, `insert into comments (target_type, target_id, body) values ('post', $1, '운영자 댓글') returning anon_name`, [p.id]);
  const [c2] = await as(U2, `insert into comments (target_type, target_id, body) values ('post', $1, '이용자 댓글') returning anon_name`, [p.id]);
  assert.equal(c1.anon_name, '운영자'); assert.notEqual(c2.anon_name, '운영자');
  ok('운영자 표시: 운영자 계정의 글·댓글은 「운영자」, 이용자는 익명 이름');
}
