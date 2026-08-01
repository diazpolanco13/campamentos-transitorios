-- Marca cédulas con largo no consultable en Nexus (V/E típico: 6–8 dígitos).
alter table public.censo_registros
  add column if not exists documento_invalido boolean not null default false;

comment on column public.censo_registros.documento_invalido is
  'True si documento_norm tiene formato no consultable en Nexus (largo fuera de 6–8, o solo ceros)';

create index if not exists censo_registros_documento_invalido_idx
  on public.censo_registros (origen, documento_invalido)
  where documento_invalido;

-- Marca actuales: V/E con documento y largo inválido.
update public.censo_registros
set documento_invalido = true
where coalesce(nullif(trim(documento_norm), ''), '') <> ''
  and tipo_doc in ('V', 'E')
  and (
    length(documento_norm) < 6
    or length(documento_norm) > 8
    or documento_norm ~ '^[0]+$'
  );

-- Listado red: expone documento_invalido (misma firma de args; cambia RETURNS).
drop function if exists public.censo_listado_red_paginado(boolean, integer, integer, text, text, text, text, boolean, boolean, boolean);

create function public.censo_listado_red_paginado(
  p_verificado_siipol boolean,
  p_limit integer default 50,
  p_offset integer default 0,
  p_centro_id text default null,
  p_sexo text default null,
  p_busqueda text default null,
  p_orden text default 'reciente',
  p_solicitado boolean default null,
  p_registro_policial boolean default null,
  p_firmo boolean default null
)
returns table (
  id uuid,
  centro_id text,
  centro_nombre text,
  creado_en timestamptz,
  primer_nombre text,
  segundo_nombre text,
  primer_apellido text,
  segundo_apellido text,
  edad integer,
  tipo_doc text,
  documento text,
  sexo text,
  telefono text,
  embarazada boolean,
  embarazo_semanas integer,
  discapacidad boolean,
  discapacidad_detalle text,
  enfermedad boolean,
  enfermedad_detalle text,
  jefe_tipo_doc text,
  jefe_documento text,
  parentesco_jefe text,
  jefe_registro_id uuid,
  pais text,
  condicion_vivienda text,
  estado_federativo text,
  municipio text,
  parroquia text,
  calle text,
  casa_edificio text,
  origen text,
  fuente_archivo text,
  importado_en timestamptz,
  nombre_centro_raw text,
  centro_match text,
  registro_policial boolean,
  solicitado boolean,
  firmo_contra_presidente boolean,
  deportado boolean,
  tipo_registro_policial text,
  observaciones_seguridad text,
  verificacion_seguridad_en timestamptz,
  verificado_siipol boolean,
  verificado_siipol_en timestamptz,
  verificado_siipol_fuente text,
  verificado_nexus boolean,
  verificado_nexus_en timestamptz,
  verificado_nexus_fuente text,
  documento_invalido boolean
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_busqueda text := nullif(trim(coalesce(p_busqueda, '')), '');
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 1000);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_orden text := coalesce(nullif(trim(p_orden), ''), 'reciente');
  v_rol text := (select public.mi_rol());
  v_centros text[] := (select public.mis_centros());
begin
  if v_rol not in ('admin', 'analista_sae', 'autoridad', 'censo_rapido', 'supervisor') then
    raise exception 'Acceso denegado';
  end if;

  if v_rol = 'supervisor' then
    if p_centro_id is null or p_centro_id = '' or p_centro_id = 'todos' then
      null;
    elsif not (p_centro_id = any (v_centros)) then
      raise exception 'Acceso denegado';
    end if;
  end if;

  return query
  select
    r.id,
    r.centro_id,
    coalesce(nullif(trim(c.data->>'nombre'), ''), c.id),
    r.creado_en,
    r.primer_nombre,
    r.segundo_nombre,
    r.primer_apellido,
    r.segundo_apellido,
    r.edad,
    r.tipo_doc,
    r.documento,
    r.sexo,
    r.telefono,
    r.embarazada,
    r.embarazo_semanas,
    r.discapacidad,
    r.discapacidad_detalle,
    r.enfermedad,
    r.enfermedad_detalle,
    r.jefe_tipo_doc,
    r.jefe_documento,
    r.parentesco_jefe,
    r.jefe_registro_id,
    r.pais,
    r.condicion_vivienda,
    r.estado_federativo,
    r.municipio,
    r.parroquia,
    r.calle,
    r.casa_edificio,
    r.origen,
    r.fuente_archivo,
    r.importado_en,
    r.nombre_centro_raw,
    r.centro_match,
    r.registro_policial,
    r.solicitado,
    r.firmo_contra_presidente,
    r.deportado,
    r.tipo_registro_policial,
    r.observaciones_seguridad,
    r.verificacion_seguridad_en,
    r.verificado_siipol,
    r.verificado_siipol_en,
    r.verificado_siipol_fuente,
    r.verificado_nexus,
    r.verificado_nexus_en,
    r.verificado_nexus_fuente,
    r.documento_invalido
  from public.censo_registros r
  inner join public.centros c on c.id = r.centro_id and not c.deleted
  where
    (p_centro_id is null or p_centro_id = '' or p_centro_id = 'todos' or r.centro_id = p_centro_id)
    and (v_rol <> 'supervisor' or r.centro_id = any (v_centros))
    and (p_sexo is null or p_sexo = '' or p_sexo = 'todos' or r.sexo = p_sexo)
    and (p_solicitado is null or r.solicitado = p_solicitado)
    and (p_registro_policial is null or r.registro_policial = p_registro_policial)
    and (p_firmo is null or r.firmo_contra_presidente = p_firmo)
    and (p_verificado_siipol is null or r.verificado_siipol = p_verificado_siipol)
    and (
      v_busqueda is null
      or concat_ws(
        ' ',
        r.primer_nombre,
        r.segundo_nombre,
        r.primer_apellido,
        r.segundo_apellido,
        r.tipo_doc,
        r.documento,
        r.telefono,
        r.fuente_archivo,
        r.nombre_centro_raw,
        r.tipo_registro_policial,
        r.observaciones_seguridad,
        coalesce(nullif(trim(c.data->>'nombre'), ''), c.id)
      ) ilike '%' || v_busqueda || '%'
    )
  order by
    case when v_orden = 'nexus' then r.verificado_nexus end desc nulls last,
    case when v_orden = 'siipol' then r.verificado_siipol end desc nulls last,
    case when v_orden = 'solicitado' then r.solicitado end desc nulls last,
    case when v_orden = 'reg_policial' then r.registro_policial end desc nulls last,
    case when v_orden = 'referendum' then r.firmo_contra_presidente end desc nulls last,
    case when v_orden = 'con_cedula' then (nullif(trim(coalesce(r.documento, '')), '') is not null) end desc nulls last,
    case when v_orden = 'sin_cedula' then (nullif(trim(coalesce(r.documento, '')), '') is null) end desc nulls last,
    case when v_orden = 'campamento' then lower(coalesce(nullif(trim(c.data->>'nombre'), ''), c.id)) end asc nulls last,
    case when v_orden = 'nombre' then lower(concat_ws(' ', r.primer_apellido, r.primer_nombre, r.segundo_apellido)) end asc nulls last,
    case when v_orden = 'edad' then r.edad end desc nulls last,
    r.creado_en desc
  limit v_limit
  offset v_offset;
end;
$function$;

revoke all on function public.censo_listado_red_paginado(boolean, integer, integer, text, text, text, text, boolean, boolean, boolean) from public, anon;
grant execute on function public.censo_listado_red_paginado(boolean, integer, integer, text, text, text, text, boolean, boolean, boolean) to authenticated;
