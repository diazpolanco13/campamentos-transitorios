-- Aplica fichas válidas de nexus_consultas sobre censo_registros
-- pendientes (verificado_nexus = false). Actualiza identidad + marca Nexus.
-- No toca centro, flags de seguridad ni filas ya verificadas.

create or replace function public.censo_aplicar_nexus_cache()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text := (select public.mi_rol());
  v_actualizados int := 0;
begin
  if v_rol not in ('admin', 'analista_sae') then
    raise exception 'Acceso denegado: solo admin o analista_sae';
  end if;

  with aplicables as (
    select
      r.id,
      left(trim(coalesce(n.data->>'primer_nombre', r.primer_nombre)), 80) as primer_nombre,
      left(coalesce(trim(n.data->>'segundo_nombre'), ''), 80) as segundo_nombre,
      left(trim(coalesce(n.data->>'primer_apellido', r.primer_apellido)), 80) as primer_apellido,
      left(coalesce(trim(n.data->>'segundo_apellido'), ''), 80) as segundo_apellido,
      case
        when (n.data->>'edad') ~ '^[0-9]+$'
          and (n.data->>'edad')::int between 0 and 120
        then (n.data->>'edad')::int
        when jsonb_typeof(n.data->'edad') = 'number'
          and (n.data->>'edad')::int between 0 and 120
        then (n.data->>'edad')::int
        else r.edad
      end as edad,
      case
        when upper(left(trim(coalesce(n.data->>'sexo', '')), 1)) in ('M', 'H') then 'M'
        when upper(left(trim(coalesce(n.data->>'sexo', '')), 1)) in ('F', 'W') then 'F'
        when lower(trim(coalesce(n.data->>'sexo', ''))) like 'mascul%' then 'M'
        when lower(trim(coalesce(n.data->>'sexo', ''))) like 'femen%' then 'F'
        else r.sexo
      end as sexo,
      case
        when coalesce(trim(r.telefono), '') = ''
          and jsonb_typeof(n.data->'telefonos') = 'array'
          and jsonb_array_length(n.data->'telefonos') > 0
        then left(trim(n.data->'telefonos'->>0), 40)
        else r.telefono
      end as telefono,
      coalesce(
        r.verificado_nexus_en,
        to_timestamp((n.actualizado_ts)::double precision / 1000.0),
        now()
      ) as verificado_nexus_en
    from public.censo_registros r
    join public.nexus_consultas n
      on n.letra = r.tipo_doc
     and upper(regexp_replace(coalesce(n.cedula, ''), '[^A-Za-z0-9]', '', 'g'))
         = r.documento_norm
    where not r.verificado_nexus
      and r.tipo_doc in ('V', 'E')
      and nullif(trim(r.documento_norm), '') is not null
      and n.data is not null
      and coalesce((n.data->>'ok')::boolean, true) is not false
      and nullif(trim(coalesce(n.data->>'primer_nombre', '')), '') is not null
  ),
  upd as (
    update public.censo_registros r
    set
      primer_nombre = a.primer_nombre,
      segundo_nombre = a.segundo_nombre,
      primer_apellido = a.primer_apellido,
      segundo_apellido = a.segundo_apellido,
      edad = a.edad,
      sexo = a.sexo,
      telefono = a.telefono,
      verificado_nexus = true,
      verificado_nexus_en = a.verificado_nexus_en,
      verificado_nexus_fuente = case
        when coalesce(r.verificado_nexus_fuente, '') = '' then 'cache'
        else r.verificado_nexus_fuente
      end
    from aplicables a
    where r.id = a.id
    returning r.id
  )
  select count(*)::int into v_actualizados from upd;

  return jsonb_build_object('aplicados_cache', v_actualizados);
end;
$$;

revoke all on function public.censo_aplicar_nexus_cache() from public, anon;
grant execute on function public.censo_aplicar_nexus_cache() to authenticated;
