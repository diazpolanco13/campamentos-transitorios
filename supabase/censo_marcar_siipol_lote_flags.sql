-- Extiende censo_marcar_siipol_lote: además de verificado_siipol,
-- aplica flags de seguridad (monotónicos) y observaciones_seguridad
-- sin tocar identidad (nombres, cédula, centro, etc.).

create or replace function public.censo_marcar_siipol_lote(
  p_filas jsonb,
  p_fuente text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text := (select public.mi_rol());
  v_fila jsonb;
  v_norm text;
  v_actualizados int := 0;
  v_sol_set int := 0;
  v_reg_set int := 0;
  v_obs_set int := 0;
  v_cantidad int;
  v_fuente text := left(coalesce(nullif(trim(p_fuente), ''), 'sin_nombre'), 240);
  v_solicitado boolean;
  v_registro boolean;
  v_deportado boolean;
  v_obs text;
  v_tipo text;
begin
  if v_rol not in ('admin', 'analista_sae') then
    raise exception 'Acceso denegado: solo admin o analista_sae pueden marcar SIIPOL';
  end if;

  if p_filas is null or jsonb_typeof(p_filas) <> 'array' then
    raise exception 'p_filas debe ser un arreglo JSON';
  end if;

  for v_fila in
    select value
    from jsonb_array_elements(p_filas)
    where lower(trim(coalesce(value->>'verificado_siipol', 'false')))
      in ('true', 't', '1', 'si', 'sí', 'yes', 'y')
  loop
    v_norm := nullif(
      upper(regexp_replace(coalesce(v_fila->>'documento', ''), '[^A-Za-z0-9]', '', 'g')),
      ''
    );
    v_solicitado := lower(trim(coalesce(v_fila->>'solicitado', 'false')))
      in ('true', 't', '1', 'si', 'sí', 'yes', 'y');
    v_registro := lower(trim(coalesce(v_fila->>'registro_policial', 'false')))
      in ('true', 't', '1', 'si', 'sí', 'yes', 'y');
    v_deportado := lower(trim(coalesce(v_fila->>'deportado', 'false')))
      in ('true', 't', '1', 'si', 'sí', 'yes', 'y');
    v_obs := nullif(trim(coalesce(v_fila->>'observaciones_seguridad', '')), '');
    v_tipo := nullif(trim(coalesce(v_fila->>'tipo_registro_policial', '')), '');

    if v_norm is not null then
      update public.censo_registros r
      set
        verificado_siipol = true,
        verificado_siipol_en = coalesce(r.verificado_siipol_en, now()),
        verificado_siipol_fuente = case
          when coalesce(r.verificado_siipol_fuente, '') = '' then v_fuente
          else r.verificado_siipol_fuente
        end,
        solicitado = coalesce(r.solicitado, false) or v_solicitado,
        registro_policial = coalesce(r.registro_policial, false) or v_registro,
        deportado = coalesce(r.deportado, false) or v_deportado,
        observaciones_seguridad = case
          when v_obs is not null then v_obs
          else r.observaciones_seguridad
        end,
        tipo_registro_policial = case
          when v_tipo is not null and coalesce(r.tipo_registro_policial, '') = '' then v_tipo
          else r.tipo_registro_policial
        end
      where r.documento_norm = v_norm;
    else
      update public.censo_registros r
      set
        verificado_siipol = true,
        verificado_siipol_en = coalesce(r.verificado_siipol_en, now()),
        verificado_siipol_fuente = case
          when coalesce(r.verificado_siipol_fuente, '') = '' then v_fuente
          else r.verificado_siipol_fuente
        end,
        solicitado = coalesce(r.solicitado, false) or v_solicitado,
        registro_policial = coalesce(r.registro_policial, false) or v_registro,
        deportado = coalesce(r.deportado, false) or v_deportado,
        observaciones_seguridad = case
          when v_obs is not null then v_obs
          else r.observaciones_seguridad
        end,
        tipo_registro_policial = case
          when v_tipo is not null and coalesce(r.tipo_registro_policial, '') = '' then v_tipo
          else r.tipo_registro_policial
        end
      where r.origen = 'import_excel'
        and r.fuente_archivo = v_fuente
        and r.centro_id = nullif(trim(v_fila->>'centro_id'), '')
        and lower(trim(r.primer_nombre)) =
          lower(trim(coalesce(v_fila->>'primer_nombre', '')))
        and lower(trim(r.segundo_nombre)) =
          lower(trim(coalesce(v_fila->>'segundo_nombre', '')))
        and lower(trim(r.primer_apellido)) =
          lower(trim(coalesce(v_fila->>'primer_apellido', '')))
        and lower(trim(r.segundo_apellido)) =
          lower(trim(coalesce(v_fila->>'segundo_apellido', '')));
    end if;

    get diagnostics v_cantidad = row_count;
    v_actualizados := v_actualizados + v_cantidad;
    if v_cantidad > 0 then
      if v_solicitado then
        v_sol_set := v_sol_set + v_cantidad;
      end if;
      if v_registro then
        v_reg_set := v_reg_set + v_cantidad;
      end if;
      if v_obs is not null then
        v_obs_set := v_obs_set + v_cantidad;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'marcados_siipol', v_actualizados,
    'flags_solicitado', v_sol_set,
    'flags_registro_policial', v_reg_set,
    'obs_actualizadas', v_obs_set
  );
end;
$$;

revoke all on function public.censo_marcar_siipol_lote(jsonb, text) from public, anon;
grant execute on function public.censo_marcar_siipol_lote(jsonb, text) to authenticated;
