-- RPC for viewport-bounded POI fetching used by mobile map rendering.
-- Signature intentionally matches client call:
--   public.get_pois_in_bbox(min_lat, max_lat, min_lng, max_lng)

create or replace function public.get_pois_in_bbox(
  min_lat double precision,
  max_lat double precision,
  min_lng double precision,
  max_lng double precision
)
returns table (
  id text,
  title text,
  landmark_type text,
  category text,
  latitude double precision,
  longitude double precision
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  return query
  select
    coalesce(to_jsonb(e)->>'id', md5(st_astext(e.geom))) as id,
    coalesce(
      to_jsonb(e)->>'title',
      to_jsonb(e)->>'name',
      'Point of Interest'
    ) as title,
    coalesce(
      to_jsonb(e)->>'landmark_type',
      to_jsonb(e)->>'kind',
      to_jsonb(e)->>'category',
      'unknown'
    ) as landmark_type,
    coalesce(
      to_jsonb(e)->>'category',
      to_jsonb(e)->>'main_category'
    ) as category,
    st_y(e.geom) as latitude,
    st_x(e.geom) as longitude
  from public.establishments e
  where e.geom is not null
    and e.geom && st_makeenvelope(min_lng, min_lat, max_lng, max_lat, 4326)
    and st_intersects(e.geom, st_makeenvelope(min_lng, min_lat, max_lng, max_lat, 4326))
  order by st_y(e.geom), st_x(e.geom)
  limit 2000;
end;
$$;

grant execute on function public.get_pois_in_bbox(double precision, double precision, double precision, double precision)
to anon, authenticated;

-- Refresh PostgREST schema cache so RPC changes are visible immediately.
do $$
begin
  perform pg_notify('pgrst', 'reload schema');
exception
  when others then
    null;
end;
$$;
