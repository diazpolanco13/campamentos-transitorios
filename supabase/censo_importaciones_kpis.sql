-- KPIs agregados para la vista Importaciones Excel (red).
-- Parte = último snapshot por campamento (misma regla que tablero Campamentos).
-- Identidad es partición exhaustiva de importados Excel (suma = importados_excel).
-- Verificables = toda persona Excel con cédula válida (adultos + menores).

drop function if exists public.censo_importaciones_kpis();

create function public.censo_importaciones_kpis()
returns table (
  parte_ultimo bigint,
  importados_excel bigint,
  total_registros bigint,
  campamentos_con_import bigint,
  ceduladas_verificables bigint,
  menores_no_cedulados bigint,
  menores_con_cedula bigint,
  adultos_sin_cedula bigint,
  cedulas_invalidas bigint,
  personas_verificables bigint,
  siipol_verificados bigint,
  siipol_pendientes bigint,
  saime_verificados bigint,
  saime_pendientes bigint,
  solicitados bigint,
  con_registro_policial bigint
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_rol text := (select public.mi_rol());
  v_centros text[] := (select public.mis_centros());
begin
  if v_rol not in ('admin', 'analista_sae', 'autoridad', 'censo_rapido', 'supervisor') then
    raise exception 'Acceso denegado';
  end if;

  return query
  with centros_alcance as (
    select c.id
    from public.centros c
    where not c.deleted
      and c.id <> 'centro-prueba'
      and coalesce((c.data->>'es_prueba')::boolean, false) = false
      and (v_rol <> 'supervisor' or c.id = any (v_centros))
  ),
  partes as (
    select distinct on (o.centro_id)
      o.centro_id,
      o.total_afectados
    from public.ocupaciones_centros o
    join centros_alcance ca on ca.id = o.centro_id
    order by o.centro_id, o.dia desc, coalesce(o.updated_at, 0) desc
  ),
  todos as (
    select r.*
    from public.censo_registros r
    join centros_alcance ca on ca.id = r.centro_id
  ),
  excel as (
    select
      t.*,
      coalesce(nullif(trim(t.documento_norm), ''), '') <> '' as tiene_doc,
      coalesce(t.documento_invalido, false) as inv,
      (t.edad is not null and t.edad < 18) as es_menor,
      (
        coalesce(nullif(trim(t.documento_norm), ''), '') <> ''
        and not coalesce(t.documento_invalido, false)
      ) as es_verificable
    from todos t
    where t.origen = 'import_excel'
       or t.funcionario_nombre = 'Importación planilla'
  )
  select
    coalesce((select sum(p.total_afectados)::bigint from partes p), 0::bigint),
    count(*)::bigint,
    (select count(*)::bigint from todos),
    count(distinct excel.centro_id)::bigint,
    -- Partición Identidad (mutuamente excluyente, suma = importados_excel):
    count(*) filter (
      where not excel.es_menor and excel.tiene_doc and not excel.inv
    )::bigint,
    count(*) filter (
      where excel.es_menor and not excel.tiene_doc
    )::bigint,
    count(*) filter (
      where excel.es_menor and excel.tiene_doc and not excel.inv
    )::bigint,
    count(*) filter (
      where not excel.es_menor and not excel.tiene_doc
    )::bigint,
    count(*) filter (
      where excel.tiene_doc and excel.inv
    )::bigint,
    -- Universo verificación = adultos cedulados + menores cedulados
    count(*) filter (where excel.es_verificable)::bigint,
    count(*) filter (
      where excel.es_verificable and excel.verificado_siipol
    )::bigint,
    count(*) filter (
      where excel.es_verificable and not excel.verificado_siipol
    )::bigint,
    count(*) filter (
      where excel.es_verificable and excel.verificado_nexus
    )::bigint,
    count(*) filter (
      where excel.es_verificable and not excel.verificado_nexus
    )::bigint,
    count(*) filter (where excel.solicitado)::bigint,
    count(*) filter (where excel.registro_policial)::bigint
  from excel;
end;
$function$;

revoke all on function public.censo_importaciones_kpis() from public, anon;
grant execute on function public.censo_importaciones_kpis() to authenticated;
