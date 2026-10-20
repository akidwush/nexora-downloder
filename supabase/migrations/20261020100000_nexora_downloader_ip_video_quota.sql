-- Apply to the chosen Supabase project via SQL Editor or migration runner.
-- The deployment must set SUPABASE_URL and SUPABASE_SECRET_KEY server-side.
create table if not exists public.nexora_downloader_ip_quota (
  ip_hash text primary key check (ip_hash ~ '^[0-9a-f]{64}$'),
  usage_times timestamptz[] not null default '{}'::timestamptz[],
  updated_at timestamptz not null default now()
);
comment on table public.nexora_downloader_ip_quota is 'Nexora Downloader rolling 4 video downloads per 24h. HMAC IP digests only; no raw IP.';
create index if not exists nexora_downloader_ip_quota_updated_at_idx
  on public.nexora_downloader_ip_quota(updated_at);
alter table public.nexora_downloader_ip_quota enable row level security;
revoke all on table public.nexora_downloader_ip_quota from public, anon, authenticated;
grant select,insert,update,delete on public.nexora_downloader_ip_quota to service_role;

create or replace function public.nexora_downloader_quota(p_ip_hash text, p_consume boolean default false)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $body$
declare
  v_now timestamptz := clock_timestamp();
  v_hits timestamptz[] := '{}'::timestamptz[];
  v_used int;
  v_allowed boolean;
  v_reset timestamptz;
begin
  if p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid quota key' using errcode='22023';
  end if;
  if p_consume then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_ip_hash, 61342));
  end if;
  select usage_times into v_hits
    from public.nexora_downloader_ip_quota
    where ip_hash=p_ip_hash;
  v_hits := coalesce(v_hits, '{}'::timestamptz[]);
  select coalesce(array_agg(hit order by hit), '{}'::timestamptz[])
    into v_hits from unnest(v_hits) as hit
    where hit > v_now - interval '24 hours';
  v_used := coalesce(array_length(v_hits,1),0);
  v_allowed := v_used < 4;
  if p_consume and v_allowed then
    v_hits := array_append(v_hits,v_now);
    v_used := v_used+1;
    insert into public.nexora_downloader_ip_quota(ip_hash,usage_times,updated_at)
      values(p_ip_hash,v_hits,v_now)
      on conflict(ip_hash) do update
      set usage_times=excluded.usage_times, updated_at=excluded.updated_at;
    if pg_catalog.random() < 0.005 then
      delete from public.nexora_downloader_ip_quota
        where updated_at < v_now - interval '48 hours';
    end if;
  end if;
  v_reset := case when v_used>0 then v_hits[1]+interval '24 hours' else null end;
  return jsonb_build_object('allowed',v_allowed,'limit',4,'used',v_used,
    'remaining',4-v_used,'resetAt',v_reset);
end
$body$;
revoke all on function public.nexora_downloader_quota(text,boolean)
  from public,anon,authenticated;
grant execute on function public.nexora_downloader_quota(text,boolean) to service_role;
