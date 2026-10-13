-- 외부 예약: GitHub 예약 실행이 빠지므로(10/12~13 거의 0회) 서울 DB가 수집 워크플로를 깨운다.
--  - KST 06~23시 매시 17·47분에 workflow_dispatch(wake=true)를 부른다. 이번 시간대에 이미 모았으면 워크플로 guard가 10초 안에 건너뜀
--  - 토큰: 운영자가 발급한 이 저장소 전용 세분화 토큰(Actions: Read and write)을 Vault에 'gh_dispatch_token'으로 저장(Claude는 입력하지 않음)
--  - SQL Editor에 통째로 Run. 여러 번 실행해도 안전(같은 이름 작업을 덮어씀)
--  - 끄기: select cron.unschedule('dongyeok-wake');
--  - 기록: select * from cron.job_run_details order by start_time desc limit 10;  응답: select * from net._http_response order by created desc limit 5;
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.wake_fetch_jobs() returns bigint
language plpgsql security definer set search_path = '' as $$
declare tok text;
begin
  select decrypted_secret into tok from vault.decrypted_secrets where name = 'gh_dispatch_token';
  if tok is null then raise exception 'Vault에 gh_dispatch_token이 없음'; end if;
  return net.http_post(
    url := 'https://api.github.com/repos/hyotowork-create/dongyeok/actions/workflows/fetch-jobs.yml/dispatches',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || tok,
      'Accept', 'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28',
      'User-Agent', 'dongyeok-wake'),
    body := '{"ref":"main","inputs":{"wake":"true"}}'::jsonb);
end $$;
revoke all on function public.wake_fetch_jobs() from public, anon, authenticated;

select cron.schedule('dongyeok-wake', '17,47 21-23,0-14 * * *', 'select public.wake_fetch_jobs()');
