-- Clasificación de delitos desde observaciones_seguridad (Importaciones Excel).
-- Categoría primaria por severidad. sin_especificar = solo «no indica/especifica el delito».

create or replace function public.censo_norm_obs(p_obs text)
returns text
language sql
immutable
parallel safe
as $$
  select trim(both from regexp_replace(
    translate(
      lower(coalesce(p_obs, '')),
      'áéíóúüñàèìòùâêîôûäëïöü',
      'aeiouunaeiouaeiouaeiou'
    ),
    '[^a-z0-9]+',
    ' ',
    'g'
  ));
$$;

comment on function public.censo_norm_obs(text) is
  'Normaliza texto de obs seguridad para matching de delitos';

create or replace function public.censo_clasificar_delito(
  p_obs text,
  p_contexto text default 'registro'
)
returns text
language plpgsql
immutable
parallel safe
as $$
declare
  t text := public.censo_norm_obs(p_obs);
begin
  -- p_contexto reservado (misma taxonomía hoy para sol/reg).
  perform p_contexto;

  if t = '' then
    return 'sin_especificar';
  end if;

  -- Severidad: extraviada primero (incluye dual reg+extraviada).
  if t ~ 'extraviad|desaparecid' then
    return 'extraviada';
  end if;
  if t ~ 'homicidio' then
    return 'homicidio';
  end if;
  if t ~ 'violaci|abuso sexual|abusio sexual|actos? lasciv|seducci|abuso a (ni|adolec)|abuso sexual a' then
    return 'delitos_sexuales';
  end if;
  if t ~ 'secuestro' then
    return 'secuestro';
  end if;
  -- Drogas antes que comercio detente / «droga(s)» suelto.
  if t ~ 'estupefac|psicotr|trafico ilicito|posesion ilicita|trafico de drogas|[[:<:]]drogas?[[:>:]]|desvio de sustancias' then
    return 'drogas';
  end if;
  if t ~ 'comercio detente|detente sustancias' then
    return 'comercio_detente';
  end if;
  if t ~ 'violencia|violecia|trato cruel|maltrato|tortura|acoso|hostigamiento|omision de atencion' then
    return 'violencia';
  end if;
  if t ~ '[[:<:]]robo[[:>:]]|desvalijamiento' then
    return 'robo';
  end if;
  if t ~ 'hurto' then
    return 'hurto';
  end if;
  if t ~ 'lesion' then
    return 'lesiones';
  end if;
  if t ~ 'porte .{0,40}arma|ocultacion de arma|detencion u ocultacion de arma|[[:<:]]arma[[:>:]]' then
    return 'porte_armas';
  end if;
  if t ~ 'metales|piedras preciosas|materiales estrategico' then
    return 'metales_estrategicos';
  end if;
  if t ~ 'deserci' then
    return 'desercion';
  end if;
  if t ~ 'fuga de detenid' then
    return 'fuga_detenidos';
  end if;
  if t ~ 'apropiacion|aprovecha[[:space:]]*miento|aprovechamiento' then
    return 'aprovechamiento';
  end if;
  if t ~ 'estafa|falsedad|falsific|informes? falsos|certificados?[[:space:]]+medicos|fraudulent|falso testimonio|oferta enganosa|ilicitos cambiarios|obtencion fraudulent' then
    return 'estafa';
  end if;
  if t ~ 'resistencia|ultraje' then
    return 'resistencia';
  end if;
  if t ~ 'odio|convivencia pacifica|tolerancia' then
    return 'odio_convivencia';
  end if;
  if t ~ 'contraband' then
    return 'contrabando';
  end if;
  if t ~ 'informatic' then
    return 'delitos_informaticos';
  end if;
  -- Averiguación tipificada (no confundir con «sin indicar»).
  if t ~ 'averiguacion' and t !~ 'no indica|no especifica|no define|no menciona|no se especifica' then
    return 'averiguacion';
  end if;
  -- Otros tipificados raros conocidos.
  if t ~ 'aborto|placas|seriales|obstruccion|incendio|terrorismo|alteracion fraudulenta|encubrimiento|vinculado al caso|saqueo|usurpacion|boicot|instigacion|corrupcion|muerte a cabeza|extorsion' then
    return 'otros_especificos';
  end if;

  -- Única excepción genérica: declara que no indica/especifica el delito.
  if t ~ 'no indica( el)? delito'
     or t ~ 'no especifica( el)? delito'
     or t ~ 'no se especifica( el)? delito'
     or t ~ 'no define( el)? delito'
     or t ~ 'no menciona( el)? delito'
     or t ~ 'mas no se especifica'
     or t ~ 'mas no especifica'
     or t ~ 'mas no indica'
     or t ~ 'pero no se especifica'
     or t ~ 'pero no indica'
     or t ~ 'sin embargo,? no se especifica'
     or t ~ 'no especifica$'
     or t ~ 'no se especifica$'
     or t ~ 'no indica$'
     or t ~ 'no define$'
     or t ~ 'no menciona$'
     or t ~ 'por los delitos de$'
     or t ~ 'por el delito de$'
  then
    return 'sin_especificar';
  end if;

  -- Residuo tipificado no mapeado: nunca inflar sin_especificar.
  return 'otros_especificos';
end;
$$;


comment on function public.censo_clasificar_delito(text, text) is
  'Slug de delito primario desde obs seguridad; sin_especificar solo si no indica/especifica';

create or replace function public.censo_etiqueta_delito(p_slug text)
returns text
language sql
immutable
parallel safe
as $$
  select case coalesce(p_slug, '')
    when 'extraviada' then 'Personas desaparecidas / extraviadas'
    when 'homicidio' then 'Homicidio'
    when 'delitos_sexuales' then 'Delitos sexuales'
    when 'secuestro' then 'Secuestro'
    when 'drogas' then 'Drogas (tráfico / posesión)'
    when 'comercio_detente' then 'Comercio detente'
    when 'violencia' then 'Violencia (física, género, trato cruel)'
    when 'robo' then 'Robo'
    when 'hurto' then 'Hurto'
    when 'lesiones' then 'Lesiones personales'
    when 'porte_armas' then 'Porte de armas'
    when 'aprovechamiento' then 'Aprovechamiento / apropiación indebida'
    when 'estafa' then 'Estafa / falsificación'
    when 'resistencia' then 'Resistencia / ultraje a la autoridad'
    when 'desercion' then 'Deserción'
    when 'metales_estrategicos' then 'Tráfico de metales / materiales estratégicos'
    when 'fuga_detenidos' then 'Fuga de detenidos'
    when 'delitos_informaticos' then 'Delitos informáticos'
    when 'contrabando' then 'Contrabando'
    when 'odio_convivencia' then 'Odio / convivencia pacífica'
    when 'averiguacion' then 'Averiguación'
    when 'otros_especificos' then 'Otros delitos tipificados'
    when 'sin_especificar' then 'Sin indicar delito'
    else coalesce(nullif(trim(p_slug), ''), 'Sin indicar delito')
  end;
$$;

-- Columnas generadas: reclasifican al cambiar obs o flags.
alter table public.censo_registros
  drop column if exists categoria_delito_solicitado,
  drop column if exists categoria_delito_registro;

alter table public.censo_registros
  add column categoria_delito_solicitado text
    generated always as (
      case
        when solicitado then public.censo_clasificar_delito(observaciones_seguridad, 'solicitado')
        else null
      end
    ) stored,
  add column categoria_delito_registro text
    generated always as (
      case
        when registro_policial then public.censo_clasificar_delito(observaciones_seguridad, 'registro')
        else null
      end
    ) stored;

comment on column public.censo_registros.categoria_delito_solicitado is
  'Slug delito primario si solicitado; generado desde observaciones_seguridad';
comment on column public.censo_registros.categoria_delito_registro is
  'Slug delito primario si registro_policial; generado desde observaciones_seguridad';

create index if not exists censo_registros_cat_delito_sol_idx
  on public.censo_registros (categoria_delito_solicitado)
  where solicitado;
create index if not exists censo_registros_cat_delito_reg_idx
  on public.censo_registros (categoria_delito_registro)
  where registro_policial;

-- Resumen sala situacional (alcance = KPIs importaciones).
create or replace function public.censo_delitos_resumen()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rol text := (select public.mi_rol());
  v_centros text[] := (select public.mis_centros());
  v_orden text[] := array[
    'extraviada',
    'homicidio',
    'delitos_sexuales',
    'secuestro',
    'drogas',
    'comercio_detente',
    'violencia',
    'robo',
    'hurto',
    'lesiones',
    'porte_armas',
    'aprovechamiento',
    'estafa',
    'resistencia',
    'desercion',
    'metales_estrategicos',
    'fuga_detenidos',
    'delitos_informaticos',
    'contrabando',
    'odio_convivencia',
    'averiguacion',
    'otros_especificos',
    'sin_especificar'
  ];
begin
  if v_rol not in ('admin', 'analista_sae', 'autoridad', 'censo_rapido', 'supervisor') then
    raise exception 'Acceso denegado';
  end if;

  return (
    with centros_alcance as (
      select c.id
      from public.centros c
      where not c.deleted
        and c.id <> 'centro-prueba'
        and coalesce((c.data->>'es_prueba')::boolean, false) = false
        and (v_rol <> 'supervisor' or c.id = any (v_centros))
    ),
    base as (
      select r.*
      from public.censo_registros r
      join centros_alcance ca on ca.id = r.centro_id
      where r.origen = 'import_excel'
         or r.funcionario_nombre = 'Importación planilla'
    ),
    sol_agg as (
      select
        b.categoria_delito_solicitado as slug,
        count(*)::bigint as casos
      from base b
      where b.solicitado
      group by 1
    ),
    reg_agg as (
      select
        b.categoria_delito_registro as slug,
        count(*)::bigint as casos
      from base b
      where b.registro_policial
      group by 1
    ),
    sol_rows as (
      select
        o.slug,
        public.censo_etiqueta_delito(o.slug) as etiqueta,
        coalesce(s.casos, 0)::bigint as casos
      from unnest(v_orden) as o(slug)
      left join sol_agg s on s.slug = o.slug
      where coalesce(s.casos, 0) > 0
         or o.slug = 'sin_especificar'
    ),
    reg_rows as (
      select
        o.slug,
        public.censo_etiqueta_delito(o.slug) as etiqueta,
        coalesce(r.casos, 0)::bigint as casos
      from unnest(v_orden) as o(slug)
      left join reg_agg r on r.slug = o.slug
      where coalesce(r.casos, 0) > 0
         or o.slug = 'sin_especificar'
    )
    select jsonb_build_object(
      'solicitados',
      jsonb_build_object(
        'total', (select count(*)::bigint from base b where b.solicitado),
        'categorias', coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'slug', sol_rows.slug,
                'etiqueta', sol_rows.etiqueta,
                'casos', sol_rows.casos
              )
              order by array_position(v_orden, sol_rows.slug)
            )
            from sol_rows
            where sol_rows.casos > 0
          ),
          '[]'::jsonb
        )
      ),
      'registro_policial',
      jsonb_build_object(
        'total', (select count(*)::bigint from base b where b.registro_policial),
        'categorias', coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'slug', reg_rows.slug,
                'etiqueta', reg_rows.etiqueta,
                'casos', reg_rows.casos
              )
              order by array_position(v_orden, reg_rows.slug)
            )
            from reg_rows
            where reg_rows.casos > 0
          ),
          '[]'::jsonb
        )
      )
    )
  );
end;
$$;

revoke all on function public.censo_delitos_resumen() from public, anon;
grant execute on function public.censo_delitos_resumen() to authenticated;

revoke all on function public.censo_clasificar_delito(text, text) from public, anon;
grant execute on function public.censo_clasificar_delito(text, text) to authenticated;

revoke all on function public.censo_etiqueta_delito(text) from public, anon;
grant execute on function public.censo_etiqueta_delito(text) to authenticated;
