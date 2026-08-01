-- Fix: censo_importar_lote convertía jefe_documento '' → NULL,
-- pero la columna es NOT NULL DEFAULT ''. Rompía inserts sin núcleo familiar.

create or replace function public.censo_importar_lote(
  p_filas jsonb,
  p_meta jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_rol text := (select public.mi_rol());
  v_fila jsonb;
  v_centro_id text;
  v_norm text;
  v_tipo_doc text;
  v_documento text;
  v_sexo text;
  v_edad int;
  v_existente record;
  v_id uuid;
  v_hay_existente boolean;
  v_insertados int := 0;
  v_actualizados int := 0;
  v_omitidos int := 0;
  v_errores jsonb := '[]'::jsonb;
  v_fuente text := left(coalesce(nullif(trim(p_meta->>'fuente_archivo'), ''), 'sin_nombre'), 240);
  v_idx int := 0;
  v_hist jsonb;
  v_nombre_raw text;
  v_match text;
  v_registro_policial boolean;
  v_solicitado boolean;
  v_firmo_contra_presidente boolean;
  v_deportado boolean;
  v_tipo_registro_policial text;
  v_observaciones_seguridad text;
  v_verificado_nexus boolean;
  v_nexus_fuente text;
  v_jefe_tipo_doc text;
  v_jefe_documento text;
  v_parentesco_jefe text;
begin
  if v_rol not in ('admin', 'analista_sae') then
    raise exception 'Acceso denegado: solo admin o analista_sae pueden importar Excel';
  end if;
  if p_filas is null or jsonb_typeof(p_filas) <> 'array' then
    raise exception 'p_filas debe ser un arreglo JSON';
  end if;
  for v_fila in select * from jsonb_array_elements(p_filas)
  loop
    v_idx := v_idx + 1;
    begin
      v_centro_id := nullif(trim(v_fila->>'centro_id'), '');
      if v_centro_id is null or not exists (select 1 from public.centros c where c.id = v_centro_id and not c.deleted) then
        v_omitidos := v_omitidos + 1;
        v_errores := v_errores || jsonb_build_array(jsonb_build_object('fila', v_idx, 'error', 'centro_id inválido', 'centro_id', v_fila->>'centro_id'));
        continue;
      end if;
      if coalesce(trim(v_fila->>'primer_nombre'), '') = '' or coalesce(trim(v_fila->>'primer_apellido'), '') = '' then
        v_omitidos := v_omitidos + 1;
        v_errores := v_errores || jsonb_build_array(jsonb_build_object('fila', v_idx, 'error', 'falta nombre o apellido'));
        continue;
      end if;
      v_documento := left(coalesce(trim(v_fila->>'documento'), ''), 40);
      v_tipo_doc := nullif(trim(coalesce(v_fila->>'tipo_doc', '')), '');
      if v_tipo_doc is not null and v_tipo_doc not in ('V', 'E', 'P') then v_tipo_doc := null; end if;
      v_norm := nullif(upper(regexp_replace(v_documento, '[^A-Za-z0-9]', '', 'g')), '');
      v_sexo := nullif(trim(coalesce(v_fila->>'sexo', '')), '');
      if v_sexo is not null and v_sexo not in ('M', 'F', 'O') then v_sexo := null; end if;
      v_edad := nullif(trim(coalesce(v_fila->>'edad', '')), '')::int;
      v_nombre_raw := left(coalesce(trim(v_fila->>'nombre_centro_raw'), ''), 200);
      v_match := coalesce(nullif(trim(v_fila->>'centro_match'), ''), 'manual');
      if v_match not in ('exacto', 'alias', 'fuzzy', 'manual', 'forzado') then v_match := 'manual'; end if;
      v_registro_policial := lower(trim(coalesce(v_fila->>'registro_policial', 'false'))) in ('true', 't', '1', 'si', 'sí', 'yes', 'y');
      v_solicitado := lower(trim(coalesce(v_fila->>'solicitado', 'false'))) in ('true', 't', '1', 'si', 'sí', 'yes', 'y');
      v_firmo_contra_presidente := lower(trim(coalesce(v_fila->>'firmo_contra_presidente', 'false'))) in ('true', 't', '1', 'si', 'sí', 'yes', 'y');
      v_deportado := lower(trim(coalesce(v_fila->>'deportado', 'false'))) in ('true', 't', '1', 'si', 'sí', 'yes', 'y');
      v_tipo_registro_policial := left(coalesce(trim(v_fila->>'tipo_registro_policial'), ''), 160);
      v_observaciones_seguridad := left(coalesce(trim(v_fila->>'observaciones_seguridad'), ''), 500);
      v_verificado_nexus := lower(trim(coalesce(v_fila->>'verificado_nexus', 'false'))) in ('true', 't', '1', 'si', 'sí', 'yes', 'y');
      v_nexus_fuente := left(coalesce(nullif(trim(v_fila->>'verificado_nexus_fuente'), ''), case when v_verificado_nexus then 'nexus' else '' end), 80);
      v_jefe_tipo_doc := nullif(trim(coalesce(v_fila->>'jefe_tipo_doc', '')), '');
      if v_jefe_tipo_doc is not null and v_jefe_tipo_doc not in ('V', 'E', 'P') then v_jefe_tipo_doc := null; end if;
      -- Vacío = '' (NOT NULL). No convertir a NULL.
      v_jefe_documento := left(coalesce(trim(v_fila->>'jefe_documento'), ''), 40);
      if v_jefe_documento = '' then
        v_jefe_tipo_doc := null;
      end if;
      v_parentesco_jefe := left(coalesce(trim(v_fila->>'parentesco_jefe'), ''), 60);
      v_hay_existente := false;
      if v_norm is not null then
        select r.id, r.centro_id, r.procesado, r.historial_centros, r.nombre_centro_raw, r.fuente_archivo, r.importado_en, r.verificado_nexus, r.verificado_nexus_en, r.verificado_nexus_fuente
          into v_existente from public.censo_registros r where r.documento_norm = v_norm limit 1;
        v_hay_existente := found;
      end if;
      if v_hay_existente then
        v_hist := coalesce(v_existente.historial_centros, '[]'::jsonb);
        if v_existente.centro_id is distinct from v_centro_id then
          v_hist := v_hist || jsonb_build_array(jsonb_build_object('centro_id', v_existente.centro_id, 'nombre_centro_raw', coalesce(v_existente.nombre_centro_raw, ''), 'fuente_archivo', coalesce(v_existente.fuente_archivo, ''), 'importado_en', v_existente.importado_en, 'reemplazado_en', now()));
        end if;
        if v_existente.procesado then
          update public.censo_registros r set
            centro_id = v_centro_id, origen = 'import_excel', fuente_archivo = v_fuente, importado_en = now(),
            nombre_centro_raw = v_nombre_raw, centro_match = v_match, historial_centros = v_hist,
            registro_policial = r.registro_policial or v_registro_policial,
            solicitado = r.solicitado or v_solicitado,
            firmo_contra_presidente = r.firmo_contra_presidente or v_firmo_contra_presidente,
            deportado = r.deportado or v_deportado,
            tipo_registro_policial = case when coalesce(v_tipo_registro_policial, '') <> '' then v_tipo_registro_policial else r.tipo_registro_policial end,
            observaciones_seguridad = case when coalesce(v_observaciones_seguridad, '') <> '' then v_observaciones_seguridad else r.observaciones_seguridad end,
            verificacion_seguridad_en = now(),
            verificado_nexus = r.verificado_nexus or v_verificado_nexus,
            verificado_nexus_en = case when r.verificado_nexus then r.verificado_nexus_en when v_verificado_nexus then now() else r.verificado_nexus_en end,
            verificado_nexus_fuente = case when coalesce(r.verificado_nexus_fuente, '') <> '' then r.verificado_nexus_fuente when v_verificado_nexus then v_nexus_fuente else r.verificado_nexus_fuente end,
            jefe_tipo_doc = coalesce(v_jefe_tipo_doc, r.jefe_tipo_doc),
            jefe_documento = case when v_jefe_documento <> '' then v_jefe_documento else r.jefe_documento end,
            parentesco_jefe = case when coalesce(v_parentesco_jefe, '') <> '' then v_parentesco_jefe else r.parentesco_jefe end
          where r.id = v_existente.id;
        else
          update public.censo_registros r set
            centro_id = v_centro_id,
            primer_nombre = left(trim(v_fila->>'primer_nombre'), 80),
            segundo_nombre = left(coalesce(trim(v_fila->>'segundo_nombre'), ''), 80),
            primer_apellido = left(trim(v_fila->>'primer_apellido'), 80),
            segundo_apellido = left(coalesce(trim(v_fila->>'segundo_apellido'), ''), 80),
            edad = v_edad, tipo_doc = v_tipo_doc, documento = v_documento, documento_norm = v_norm, sexo = v_sexo,
            telefono = left(coalesce(trim(v_fila->>'telefono'), ''), 40),
            embarazada = coalesce((v_fila->>'embarazada')::boolean, false) and v_sexo = 'F',
            discapacidad = coalesce((v_fila->>'discapacidad')::boolean, false),
            discapacidad_detalle = left(coalesce(trim(v_fila->>'discapacidad_detalle'), ''), 200),
            enfermedad = coalesce((v_fila->>'enfermedad')::boolean, false),
            enfermedad_detalle = left(coalesce(trim(v_fila->>'enfermedad_detalle'), ''), 200),
            pais = left(coalesce(nullif(trim(v_fila->>'pais'), ''), 'Venezuela'), 80),
            estado_federativo = left(coalesce(trim(v_fila->>'estado_federativo'), ''), 80),
            municipio = left(coalesce(trim(v_fila->>'municipio'), ''), 120),
            parroquia = left(coalesce(trim(v_fila->>'parroquia'), ''), 120),
            calle = left(coalesce(trim(v_fila->>'calle'), ''), 200),
            casa_edificio = left(coalesce(trim(v_fila->>'casa_edificio'), ''), 120),
            funcionario_jerarquia = 'Sistema', funcionario_nombre = 'Importación planilla', funcionario_institucion = 'Refugios Transitorios',
            origen = 'import_excel', fuente_archivo = v_fuente, importado_en = now(),
            nombre_centro_raw = v_nombre_raw, centro_match = v_match, historial_centros = v_hist,
            registro_policial = r.registro_policial or v_registro_policial,
            solicitado = r.solicitado or v_solicitado,
            firmo_contra_presidente = r.firmo_contra_presidente or v_firmo_contra_presidente,
            deportado = r.deportado or v_deportado,
            tipo_registro_policial = case when coalesce(v_tipo_registro_policial, '') <> '' then v_tipo_registro_policial else r.tipo_registro_policial end,
            observaciones_seguridad = case when coalesce(v_observaciones_seguridad, '') <> '' then v_observaciones_seguridad else r.observaciones_seguridad end,
            verificacion_seguridad_en = now(),
            verificado_nexus = r.verificado_nexus or v_verificado_nexus,
            verificado_nexus_en = case when r.verificado_nexus then r.verificado_nexus_en when v_verificado_nexus then now() else r.verificado_nexus_en end,
            verificado_nexus_fuente = case when coalesce(r.verificado_nexus_fuente, '') <> '' then r.verificado_nexus_fuente when v_verificado_nexus then v_nexus_fuente else r.verificado_nexus_fuente end,
            jefe_tipo_doc = v_jefe_tipo_doc, jefe_documento = v_jefe_documento, parentesco_jefe = v_parentesco_jefe
          where r.id = v_existente.id;
        end if;
        v_actualizados := v_actualizados + 1;
      else
        insert into public.censo_registros (
          centro_id, funcionario_jerarquia, funcionario_nombre, funcionario_institucion, funcionario_telefono,
          primer_nombre, segundo_nombre, primer_apellido, segundo_apellido,
          edad, tipo_doc, documento, documento_norm, sexo, telefono, embarazada, discapacidad, discapacidad_detalle,
          enfermedad, enfermedad_detalle, pais, estado_federativo, municipio, parroquia, calle, casa_edificio,
          origen, fuente_archivo, importado_en, nombre_centro_raw, centro_match,
          registro_policial, solicitado, firmo_contra_presidente, deportado,
          tipo_registro_policial, observaciones_seguridad, verificacion_seguridad_en,
          verificado_nexus, verificado_nexus_en, verificado_nexus_fuente,
          jefe_tipo_doc, jefe_documento, parentesco_jefe
        ) values (
          v_centro_id, 'Sistema', 'Importación planilla', 'Refugios Transitorios', '',
          left(trim(v_fila->>'primer_nombre'), 80), left(coalesce(trim(v_fila->>'segundo_nombre'), ''), 80),
          left(trim(v_fila->>'primer_apellido'), 80), left(coalesce(trim(v_fila->>'segundo_apellido'), ''), 80),
          v_edad, v_tipo_doc, v_documento, v_norm, v_sexo, left(coalesce(trim(v_fila->>'telefono'), ''), 40),
          coalesce((v_fila->>'embarazada')::boolean, false) and v_sexo = 'F',
          coalesce((v_fila->>'discapacidad')::boolean, false), left(coalesce(trim(v_fila->>'discapacidad_detalle'), ''), 200),
          coalesce((v_fila->>'enfermedad')::boolean, false), left(coalesce(trim(v_fila->>'enfermedad_detalle'), ''), 200),
          left(coalesce(nullif(trim(v_fila->>'pais'), ''), 'Venezuela'), 80),
          left(coalesce(trim(v_fila->>'estado_federativo'), ''), 80), left(coalesce(trim(v_fila->>'municipio'), ''), 120),
          left(coalesce(trim(v_fila->>'parroquia'), ''), 120), left(coalesce(trim(v_fila->>'calle'), ''), 200),
          left(coalesce(trim(v_fila->>'casa_edificio'), ''), 120),
          'import_excel', v_fuente, now(), v_nombre_raw, v_match,
          v_registro_policial, v_solicitado, v_firmo_contra_presidente, v_deportado,
          v_tipo_registro_policial, v_observaciones_seguridad, now(),
          v_verificado_nexus, case when v_verificado_nexus then now() else null end,
          case when v_verificado_nexus then v_nexus_fuente else '' end,
          v_jefe_tipo_doc, v_jefe_documento, v_parentesco_jefe
        ) returning id into v_id;
        v_insertados := v_insertados + 1;
      end if;
    exception when others then
      v_omitidos := v_omitidos + 1;
      v_errores := v_errores || jsonb_build_array(jsonb_build_object('fila', v_idx, 'error', SQLERRM, 'documento', v_fila->>'documento'));
    end;
  end loop;
  return jsonb_build_object('insertados', v_insertados, 'actualizados', v_actualizados, 'omitidos', v_omitidos, 'fuente_archivo', v_fuente, 'errores', v_errores);
end;
$function$;

revoke all on function public.censo_importar_lote(jsonb, jsonb) from public, anon;
grant execute on function public.censo_importar_lote(jsonb, jsonb) to authenticated;
