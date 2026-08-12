-- =============================================================================
-- Proteger asignación operativa (cuerpo + supervision.*) — solo admin/analista_sae.
--
-- Operador/supervisor pueden UPDATE el blob del centro (ocupación, etc.) pero
-- no deben mover la unidad supervisora ni el cuerpo. El frontend deshabilita
-- Coordinación → Supervisión; este trigger cierra el hueco vía RPC upsert_centro.
--
-- Aplicar con MCP apply_migration (nombre: proteger_asignacion_operativa_centros).
-- =============================================================================

create or replace function public.proteger_asignacion_operativa_centros()
returns trigger
language plpgsql
security invoker
set search_path to ''
as $$
begin
  -- Sin JWT (SQL de servicio / migraciones): no aplicar el gate.
  if auth.uid() is null then
    return new;
  end if;

  if (select public.mi_rol()) in ('admin', 'analista_sae') then
    return new;
  end if;

  if (old.data->'supervision') is distinct from (new.data->'supervision')
     or coalesce(old.data->>'cuerpo', '') is distinct from coalesce(new.data->>'cuerpo', '')
  then
    raise exception
      'Solo admin y analistas pueden modificar la asignación operativa (cuerpo / unidad / revista / analistas)';
  end if;

  return new;
end;
$$;

drop trigger if exists centros_proteger_asignacion_operativa on public.centros;
create trigger centros_proteger_asignacion_operativa
  before update on public.centros
  for each row
  execute function public.proteger_asignacion_operativa_centros();
