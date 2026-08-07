-- Siembra censo_registros (Importaciones Excel) desde censo nominal.
-- Solo centros sin filas import_excel. Identidad SAIME/Nexus ya validada
-- en el alta nominal → inserta con verificado_nexus=true para que el bot
-- SAIME no las reprocese. SIIPOL queda pendiente.
--
-- Gotcha: CREATE OR REPLACE resetea EXECUTE a PUBLIC → revoke/grant al final.

create or replace function public.censo_sembrar_desde_nominal(
  p_centro_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text := (select public.mi_rol());
  v_insertados int := 0;
  v_omitidos_sin_cedula int := 0;
  v_omitidos_ya_staging int := 0;
  v_marcados_cache int := 0;
  v_marcados_nominal int := 0;
  v_centros int := 0;
begin
  if v_rol not in ('admin', 'analista_sae') then
    raise exception 'Acceso denegado: solo admin o analista_sae';
  end if;

  -- Siembra puede tocar ~1k filas + join a nexus_consultas.
  perform set_config('statement_timeout', '120s', true);

  if p_centro_id is not null
     and not exists (
       select 1 from public.centros c
       where c.id = p_centro_id and not c.deleted
     ) then
    raise exception 'centro_id inválido: %', p_centro_id;
  end if;

  with excel_centros as (
    select distinct cr.centro_id
    from public.censo_registros cr
    where cr.origen = 'import_excel'
       or cr.funcionario_nombre = 'Importación planilla'
  ),
  candidatos as (
    select c.id as centro_id
    from public.centros c
    where not c.deleted
      and c.id <> 'centro-prueba'
      and coalesce((c.data->>'activo')::boolean, true)
      and not coalesce((c.data->>'es_prueba')::boolean, false)
      and c.id not in (select centro_id from excel_centros where centro_id is not null)
      and (p_centro_id is null or c.id = p_centro_id)
      and exists (
        select 1
        from public.alojamientos_refugiados a
        where a.centro_id = c.id
          and a.estado = 'activo'
      )
  ),
  base as (
    select
      a.centro_id,
      left(coalesce(nullif(trim(r.cedula), ''), nullif(trim(r.cedula_norm), ''), ''), 40) as documento,
      nullif(trim(r.cedula_norm), '') as documento_norm,
      case
        when coalesce(nullif(trim(r.tipo_doc), ''), '') in ('V', 'E', 'P')
          then trim(r.tipo_doc)
        else 'V'
      end as tipo_doc,
      r.fecha_nacimiento,
      r.sexo as sexo_ref,
      left(coalesce(nullif(trim(r.primer_nombre), ''), split_part(coalesce(r.nombres, ''), ' ', 1), ''), 80) as pn_ref,
      left(coalesce(nullif(trim(r.segundo_nombre), ''), ''), 80) as sn_ref,
      left(coalesce(nullif(trim(r.primer_apellido), ''), split_part(coalesce(r.apellidos, ''), ' ', 1), ''), 80) as pa_ref,
      left(coalesce(nullif(trim(r.segundo_apellido), ''), ''), 80) as sa_ref
    from candidatos cand
    join public.alojamientos_refugiados a
      on a.centro_id = cand.centro_id
     and a.estado = 'activo'
    join public.refugiados r on r.id = a.refugiado_id
  ),
  conteo_sin_cedula as (
    select count(*)::int as n
    from base
    where documento_norm is null
  ),
  con_cedula as (
    select distinct on (b.documento_norm)
      b.*
    from base b
    where b.documento_norm is not null
    order by b.documento_norm, b.centro_id
  ),
  ya as (
    select c.documento_norm
    from con_cedula c
    join public.censo_registros cr on cr.documento_norm = c.documento_norm
  ),
  conteo_ya as (
    select count(*)::int as n from ya
  ),
  pendientes as (
    select c.*
    from con_cedula c
    where not exists (select 1 from ya y where y.documento_norm = c.documento_norm)
  ),
  -- Cache Nexus solo para cédulas pendientes (no toda la tabla).
  nexus_hit as (
    select distinct on (p.documento_norm)
      p.documento_norm,
      n.data as nexus_data,
      n.actualizado_ts as nexus_ts
    from pendientes p
    join public.nexus_consultas n
      on n.letra = p.tipo_doc
     and n.cedula = p.documento_norm
    where n.data is not null
      and coalesce((n.data->>'ok')::boolean, true) is not false
    order by p.documento_norm, n.actualizado_ts desc nulls last
  ),
  a_insertar as (
    select
      p.centro_id,
      p.documento,
      p.documento_norm,
      p.tipo_doc,
      left(
        coalesce(
          nullif(trim(nh.nexus_data->>'primer_nombre'), ''),
          nullif(trim(p.pn_ref), ''),
          'SIN'
        ),
        80
      ) as primer_nombre,
      left(
        coalesce(
          nullif(trim(nh.nexus_data->>'segundo_nombre'), ''),
          nullif(trim(p.sn_ref), ''),
          ''
        ),
        80
      ) as segundo_nombre,
      left(
        coalesce(
          nullif(trim(nh.nexus_data->>'primer_apellido'), ''),
          nullif(trim(p.pa_ref), ''),
          'NOMBRE'
        ),
        80
      ) as primer_apellido,
      left(
        coalesce(
          nullif(trim(nh.nexus_data->>'segundo_apellido'), ''),
          nullif(trim(p.sa_ref), ''),
          ''
        ),
        80
      ) as segundo_apellido,
      case
        when (nh.nexus_data->>'edad') ~ '^[0-9]+$'
          and (nh.nexus_data->>'edad')::int between 0 and 120
          then (nh.nexus_data->>'edad')::int
        when jsonb_typeof(nh.nexus_data->'edad') = 'number'
          and (nh.nexus_data->>'edad')::int between 0 and 120
          then (nh.nexus_data->>'edad')::int
        when p.fecha_nacimiento is not null
          then greatest(0, least(120, date_part('year', age(current_date, p.fecha_nacimiento::date))::int))
        else null
      end as edad,
      case
        when upper(left(trim(coalesce(nh.nexus_data->>'sexo', '')), 1)) in ('M', 'H') then 'M'
        when upper(left(trim(coalesce(nh.nexus_data->>'sexo', '')), 1)) in ('F', 'W') then 'F'
        when lower(trim(coalesce(nh.nexus_data->>'sexo', ''))) like 'mascul%' then 'M'
        when lower(trim(coalesce(nh.nexus_data->>'sexo', ''))) like 'femen%' then 'F'
        when upper(left(trim(coalesce(p.sexo_ref, '')), 1)) in ('M', 'H') then 'M'
        when upper(left(trim(coalesce(p.sexo_ref, '')), 1)) in ('F', 'W') then 'F'
        when lower(trim(coalesce(p.sexo_ref, ''))) like 'mascul%' then 'M'
        when lower(trim(coalesce(p.sexo_ref, ''))) like 'femen%' then 'F'
        else null
      end as sexo,
      case
        when jsonb_typeof(nh.nexus_data->'telefonos') = 'array'
          and jsonb_array_length(nh.nexus_data->'telefonos') > 0
          then left(trim(nh.nexus_data->'telefonos'->>0), 40)
        else ''
      end as telefono,
      case when nh.nexus_data is not null then 'cache' else 'desde_nominal' end as nexus_fuente,
      coalesce(
        to_timestamp((nh.nexus_ts)::double precision / 1000.0),
        now()
      ) as nexus_en,
      (
        length(p.documento_norm) < 6
        or length(p.documento_norm) > 8
        or p.documento_norm ~ '^[0]+$'
      ) as documento_invalido
    from pendientes p
    left join nexus_hit nh on nh.documento_norm = p.documento_norm
  ),
  ins as (
    insert into public.censo_registros (
      centro_id,
      funcionario_jerarquia,
      funcionario_nombre,
      funcionario_institucion,
      funcionario_telefono,
      primer_nombre,
      segundo_nombre,
      primer_apellido,
      segundo_apellido,
      tipo_doc,
      documento,
      documento_norm,
      edad,
      sexo,
      telefono,
      origen,
      fuente_archivo,
      nombre_centro_raw,
      centro_match,
      procesado,
      verificado_nexus,
      verificado_nexus_en,
      verificado_nexus_fuente,
      documento_invalido,
      importado_en
    )
    select
      a.centro_id,
      '',
      'Desde censo nominal',
      '',
      '',
      a.primer_nombre,
      a.segundo_nombre,
      a.primer_apellido,
      a.segundo_apellido,
      a.tipo_doc,
      a.documento,
      a.documento_norm,
      a.edad,
      a.sexo,
      a.telefono,
      'import_excel',
      'desde_censo_nominal',
      '',
      'manual',
      true,
      true,
      a.nexus_en,
      a.nexus_fuente,
      a.documento_invalido,
      now()
    from a_insertar a
    returning
      id,
      verificado_nexus_fuente
  )
  select
    (select count(*)::int from candidatos),
    (select n from conteo_sin_cedula),
    (select n from conteo_ya),
    (select count(*)::int from ins),
    (select count(*)::int from ins where verificado_nexus_fuente = 'cache'),
    (select count(*)::int from ins where verificado_nexus_fuente = 'desde_nominal')
  into
    v_centros,
    v_omitidos_sin_cedula,
    v_omitidos_ya_staging,
    v_insertados,
    v_marcados_cache,
    v_marcados_nominal;

  return jsonb_build_object(
    'centros', v_centros,
    'insertados', v_insertados,
    'omitidos_sin_cedula', v_omitidos_sin_cedula,
    'omitidos_ya_en_staging', v_omitidos_ya_staging,
    'marcados_nexus_cache', v_marcados_cache,
    'marcados_nexus_nominal', v_marcados_nominal,
    'centro_filtro', p_centro_id
  );
end;
$$;

revoke all on function public.censo_sembrar_desde_nominal(text) from public, anon;
grant execute on function public.censo_sembrar_desde_nominal(text) to authenticated;

comment on function public.censo_sembrar_desde_nominal(text) is
  'Siembra censo_registros desde nominal (centros sin Excel). Marca verificado_nexus=true.';
