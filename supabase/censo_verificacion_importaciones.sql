-- Dashboard de verificación de Importaciones Excel (origen=import_excel).
-- Una fila por campamento (incl. sin importaciones = ceros).
-- Incluye estatus_instalacion para etiquetar/filtrar «no instalados».

drop function if exists public.censo_verificacion_por_centro();

create or replace function public.censo_verificacion_por_centro()
returns table (
  centro_id text,
  centro_nro integer,
  centro_nombre text,
  estatus_instalacion text,
  censadas bigint,
  menores bigint,
  adultos bigint,
  nexus bigint,
  siipol bigint,
  ambos bigint,
  solo_nexus bigint,
  solo_siipol bigint,
  verificadas bigint,
  faltan bigint,
  solicitadas bigint,
  con_registro bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rol text := (select public.mi_rol());
  v_centros text[] := (select public.mis_centros());
begin
  if v_rol not in ('admin', 'analista_sae', 'autoridad', 'censo_rapido', 'supervisor') then
    raise exception 'Acceso denegado';
  end if;

  return query
  select
    c.id as centro_id,
    nullif(trim(c.data->>'nro'), '')::integer as centro_nro,
    coalesce(nullif(trim(c.data->>'nombre'), ''), c.id)::text as centro_nombre,
    nullif(trim(c.data->'censo_oficial'->>'estatus_instalacion'), '')::text
      as estatus_instalacion,
    coalesce(agg.censadas, 0::bigint) as censadas,
    coalesce(agg.menores, 0::bigint) as menores,
    coalesce(agg.adultos, 0::bigint) as adultos,
    coalesce(agg.nexus, 0::bigint) as nexus,
    coalesce(agg.siipol, 0::bigint) as siipol,
    coalesce(agg.ambos, 0::bigint) as ambos,
    coalesce(agg.solo_nexus, 0::bigint) as solo_nexus,
    coalesce(agg.solo_siipol, 0::bigint) as solo_siipol,
    coalesce(agg.verificadas, 0::bigint) as verificadas,
    coalesce(agg.faltan, 0::bigint) as faltan,
    coalesce(agg.solicitadas, 0::bigint) as solicitadas,
    coalesce(agg.con_registro, 0::bigint) as con_registro
  from public.centros c
  left join lateral (
    select
      count(*)::bigint as censadas,
      count(*) filter (
        where r.edad is not null and r.edad < 18
      )::bigint as menores,
      count(*) filter (
        where r.edad is null or r.edad >= 18
      )::bigint as adultos,
      count(*) filter (
        where (r.edad is null or r.edad >= 18) and r.verificado_nexus
      )::bigint as nexus,
      count(*) filter (
        where (r.edad is null or r.edad >= 18) and r.verificado_siipol
      )::bigint as siipol,
      count(*) filter (
        where (r.edad is null or r.edad >= 18)
          and r.verificado_nexus
          and r.verificado_siipol
      )::bigint as ambos,
      count(*) filter (
        where (r.edad is null or r.edad >= 18)
          and r.verificado_nexus
          and not r.verificado_siipol
      )::bigint as solo_nexus,
      count(*) filter (
        where (r.edad is null or r.edad >= 18)
          and r.verificado_siipol
          and not r.verificado_nexus
      )::bigint as solo_siipol,
      count(*) filter (
        where (r.edad is null or r.edad >= 18)
          and (r.verificado_nexus or r.verificado_siipol)
      )::bigint as verificadas,
      count(*) filter (
        where (r.edad is null or r.edad >= 18)
          and not r.verificado_nexus
          and not r.verificado_siipol
      )::bigint as faltan,
      count(*) filter (where r.solicitado)::bigint as solicitadas,
      count(*) filter (where r.registro_policial)::bigint as con_registro
    from public.censo_registros r
    where r.centro_id = c.id
      and r.origen = 'import_excel'
  ) agg on true
  where not c.deleted
    and c.id <> 'centro-prueba'
    and coalesce((c.data->>'es_prueba')::boolean, false) = false
    and (v_rol <> 'supervisor' or c.id = any (v_centros))
  order by
    centro_nro nulls last,
    lower(coalesce(nullif(trim(c.data->>'nombre'), ''), c.id));
end;
$$;

revoke all on function public.censo_verificacion_por_centro() from public, anon;
grant execute on function public.censo_verificacion_por_centro() to authenticated;
