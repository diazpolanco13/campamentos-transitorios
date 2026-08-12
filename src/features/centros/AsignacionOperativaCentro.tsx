// Asignación operativa del campamento: cuerpo → unidad de supervisión → revista → analistas SAE.
// Fuente de verdad: `cuerpo` + `supervision.{unidad_sebin,supervisor_sebin,analistas_sae}`.

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useSesion } from "@/data/authSupabase";
import { esAnalistaDeCuerpo } from "@/domain/permisos";
import { guardarCentro } from "@/data/reposSupabase";
import {
  etiquetaAnalistaSae,
  useAnalistasSae,
} from "@/data/useAnalistasSae";
import { useSupervisoresSebin } from "@/data/useSupervisoresSebin";
import { useCatalogoCuerposActivos } from "@/data/useCuerposPoliciales";
import { useCatalogoUnidadesSebinActivas } from "@/data/useUnidadesSebin";
import {
  META_CUERPO,
  normalizarCentro,
  normalizarCuerpo,
  normalizarSupervision,
  normalizarUnidadSebin,
  type CentroTransitorio,
  type ClaveCuerpo,
  type ClaveUnidadSebin,
  type SupervisionCentro,
} from "@/domain/centrosTransitorios";
import { getClavesCuerpoConUnidadesActivas } from "@/domain/unidadesSebin";
import {
  SelectorAsignacionBusqueda,
  type GrupoAsignacion,
  type OpcionAsignacion,
} from "@/components/SelectorAsignacionBusqueda";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

function CampoCompacto({
  n,
  label,
  children,
  className,
}: {
  n: number;
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 space-y-1.5", className)}>
      <Label className="flex items-center gap-1.5 text-[11px] font-medium leading-none text-muted-foreground">
        <span
          className="flex size-4 shrink-0 items-center justify-center rounded bg-teal-950/70 text-[9px] font-semibold tabular-nums text-teal-300 ring-1 ring-teal-500/25"
          aria-hidden
        >
          {n}
        </span>
        {label}
      </Label>
      {children}
    </div>
  );
}

/** Campos controlados de asignación operativa (alta o edición embebida). */
export function AsignacionOperativaCampos({
  cuerpo,
  supervision,
  onCuerpoChange,
  onSupervisionChange,
  disabled,
}: {
  cuerpo: string;
  supervision: SupervisionCentro;
  onCuerpoChange: (cuerpo: string) => void;
  onSupervisionChange: (patch: Partial<SupervisionCentro>) => void;
  disabled?: boolean;
}) {
  const catalogoCuerpos = useCatalogoCuerposActivos();
  const todasUnidades = useCatalogoUnidadesSebinActivas();
  const sesion = useSesion();
  // El analista con ámbito de cuerpo solo asigna campamentos a su propio
  // cuerpo (la RLS `centros_insert` rechaza unidades de otros cuerpos).
  const cuerpoFijo =
    sesion && esAnalistaDeCuerpo(sesion.user)
      ? (sesion.user.cuerpo_asignado ?? null)
      : null;
  const claveCuerpo = normalizarCuerpo(cuerpo);
  const supervisionN = normalizarSupervision(supervision);
  const claveUnidad = normalizarUnidadSebin(supervisionN.unidad_sebin);
  const { supervisores, cargando: cargandoSupervisores } = useSupervisoresSebin();
  const analistasSae = useAnalistasSae();

  // Cuerpos con sub-unidades (sin hardcodear). Prioriza cuerpo del campamento.
  // Analista de cuerpo: solo el suyo.
  const cuerposConUnidades = useMemo(() => {
    const clavesConUnidades = new Set(getClavesCuerpoConUnidadesActivas());
    const base = catalogoCuerpos.filter(
      (c) => c.clave !== "sin_asignar" && clavesConUnidades.has(c.clave),
    );
    const filtrados = cuerpoFijo
      ? base.filter((c) => c.clave === cuerpoFijo)
      : base;
    return [...filtrados].sort((a, b) => {
      if (a.clave === claveCuerpo) return -1;
      if (b.clave === claveCuerpo) return 1;
      return (a.orden ?? 100) - (b.orden ?? 100);
    });
  }, [catalogoCuerpos, cuerpoFijo, claveCuerpo]);

  const opcionesCuerpo: OpcionAsignacion[] = useMemo(
    () =>
      catalogoCuerpos
        .filter((c) => c.clave !== "sin_asignar")
        .filter((c) => !cuerpoFijo || c.clave === cuerpoFijo)
        .map((c) => ({
          valor: c.clave,
          etiqueta: c.label,
        })),
    [catalogoCuerpos, cuerpoFijo],
  );

  // Autoasigna el cuerpo del analista en el alta (y corrige derivas: un
  // campamento suyo nunca puede quedar apuntando a otro cuerpo desde su
  // sesión). `onCuerpoChange` del form ya limpia la unidad al cambiar.
  const labelCuerpoFijo = cuerpoFijo
    ? (catalogoCuerpos.find((c) => c.clave === cuerpoFijo)?.label ?? null)
    : null;
  useEffect(() => {
    // Nunca autoasignar en solo lectura (p. ej. operador en Supervisión).
    if (disabled || !cuerpoFijo || !labelCuerpoFijo) return;
    if (claveCuerpo !== cuerpoFijo) onCuerpoChange(labelCuerpoFijo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, cuerpoFijo, labelCuerpoFijo, claveCuerpo]);

  // Un solo desplegable: grupos por cuerpo → sub-unidades (prioridad: asignado).
  const gruposUnidad: GrupoAsignacion[] = useMemo(() => {
    const aOpcion = (u: (typeof todasUnidades)[number]): OpcionAsignacion => ({
      valor: u.clave,
      etiqueta: u.label,
      indicador: (
        <span
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: u.color }}
          aria-hidden
        />
      ),
    });

    const grupos = cuerposConUnidades.map((c) => ({
      id: c.clave,
      etiqueta:
        c.clave === claveCuerpo ? `${c.label} (asignado)` : c.label,
      opciones: todasUnidades
        .filter(
          (u) =>
            u.clave !== "sin_asignar" &&
            u.cuerpoClave === c.clave,
        )
        .map(aOpcion),
    })).filter((g) => g.opciones.length > 0);

    // Unidad huérfana (cuerpo sin catálogo o inactivo): al final, visible.
    if (
      claveUnidad !== "sin_asignar" &&
      !grupos.some((g) => g.opciones.some((o) => o.valor === claveUnidad))
    ) {
      const meta = todasUnidades.find((u) => u.clave === claveUnidad);
      if (meta) {
        const labelCuerpo =
          catalogoCuerpos.find((c) => c.clave === meta.cuerpoClave)?.label ??
          meta.cuerpoClave ??
          "Otro";
        grupos.push({
          id: `actual-${meta.clave}`,
          etiqueta: `${labelCuerpo} (actual)`,
          opciones: [aOpcion(meta)],
        });
      }
    }

    return grupos;
  }, [
    cuerposConUnidades,
    todasUnidades,
    claveCuerpo,
    claveUnidad,
    catalogoCuerpos,
  ]);

  const opcionesSupervisor: OpcionAsignacion[] = useMemo(() => {
    const lista = supervisores.map((s) => ({
      valor: s.nombre,
      etiqueta: s.nombre,
    }));
    const actual = supervisionN.supervisor_sebin.trim();
    if (
      actual &&
      !lista.some((o) => o.valor === actual || o.etiqueta === actual)
    ) {
      lista.unshift({ valor: actual, etiqueta: `${actual} (actual)` });
    }
    return lista;
  }, [supervisores, supervisionN.supervisor_sebin]);

  const opcionesAnalistas: OpcionAsignacion[] = useMemo(
    () =>
      analistasSae.map((a) => ({
        valor: a.user_id,
        etiqueta: etiquetaAnalistaSae(a),
      })),
    [analistasSae],
  );

  const unidadValidaEnCatalogo = useMemo(() => {
    if (claveUnidad === "sin_asignar") return true;
    return todasUnidades.some((u) => u.clave === claveUnidad);
  }, [todasUnidades, claveUnidad]);

  return (
    <div className="rounded-lg border border-border bg-muted/15">
      <div className="flex items-baseline justify-between gap-2 border-b border-border/70 px-3 py-1.5">
        <p className="text-xs font-semibold text-foreground">Asignación operativa</p>
        <p className="truncate text-[10px] text-muted-foreground">
          Cuerpo → unidad → revista → analista
        </p>
      </div>

      <div className="grid gap-3 p-3 sm:grid-cols-2">
        <CampoCompacto n={1} label="Cuerpo policial">
          <SelectorAsignacionBusqueda
            modo="unico"
            opciones={opcionesCuerpo}
            seleccion={claveCuerpo === "sin_asignar" ? [] : [claveCuerpo]}
            disabled={disabled || Boolean(cuerpoFijo)}
            placeholder="Cuerpo"
            buscarPlaceholder="Buscar cuerpo…"
            onCambiar={(vals) => {
              if (disabled) return;
              const clave = (vals[0] ?? "sin_asignar") as ClaveCuerpo;
              const meta = META_CUERPO[clave];
              onCuerpoChange(clave === "sin_asignar" ? "" : meta?.label ?? "");
            }}
          />
        </CampoCompacto>

        <CampoCompacto n={2} label="Unidad de supervisión">
          <SelectorAsignacionBusqueda
            modo="unico"
            grupos={gruposUnidad}
            seleccion={
              claveUnidad === "sin_asignar" || !unidadValidaEnCatalogo
                ? []
                : [claveUnidad]
            }
            disabled={disabled || claveCuerpo === "sin_asignar"}
            placeholder={
              claveCuerpo === "sin_asignar" ? "Elegí cuerpo primero" : "Unidad"
            }
            buscarPlaceholder="Buscar unidad o cuerpo…"
            vacioMensaje="Sin unidades de supervisión en el catálogo."
            onCambiar={(vals) => {
              if (disabled) return;
              const clave = (vals[0] ?? "sin_asignar") as ClaveUnidadSebin;
              const meta = todasUnidades.find((u) => u.clave === clave);
              onSupervisionChange({ unidad_sebin: meta?.valorDb ?? "" });
            }}
          />
        </CampoCompacto>

        <CampoCompacto n={3} label="Funcionario SEBIN (revista)">
          <SelectorAsignacionBusqueda
            modo="unico"
            opciones={opcionesSupervisor}
            seleccion={
              supervisionN.supervisor_sebin.trim()
                ? [supervisionN.supervisor_sebin.trim()]
                : []
            }
            disabled={disabled || cargandoSupervisores}
            placeholder="Revista"
            buscarPlaceholder={
              cargandoSupervisores ? "Cargando…" : "Buscar funcionario…"
            }
            vacioMensaje="Sin supervisores."
            onCambiar={(vals) => {
              if (disabled) return;
              onSupervisionChange({ supervisor_sebin: vals[0] ?? "" });
            }}
          />
        </CampoCompacto>

        <CampoCompacto n={4} label="Analista">
          <SelectorAsignacionBusqueda
            modo="multiple"
            opciones={opcionesAnalistas}
            seleccion={supervisionN.analistas_sae}
            disabled={disabled}
            placeholder="Analistas"
            buscarPlaceholder="Buscar analista…"
            vacioMensaje="Sin analistas."
            mostrarChips
            onCambiar={(vals) => {
              if (disabled) return;
              onSupervisionChange({ analistas_sae: vals });
            }}
          />
        </CampoCompacto>
      </div>
    </div>
  );
}

/** Cuántos ítems de asignación operativa están rellenos (badge de pestaña). */
export function contarAsignacionOperativa(centro: CentroTransitorio): number {
  const s = normalizarSupervision(centro.supervision);
  let n = 0;
  if (normalizarCuerpo(centro.cuerpo ?? "") !== "sin_asignar") n += 1;
  if (s.unidad_sebin.trim()) n += 1;
  if (s.supervisor_sebin.trim()) n += 1;
  n += s.analistas_sae.length;
  return n;
}

interface PropsPanel {
  centro: CentroTransitorio;
  puedeEditar: boolean;
  onActualizado?: (centro: CentroTransitorio) => void;
}

/** Panel Coordinación → Supervisión: persiste al instante `cuerpo` + `supervision.*`. */
export function AsignacionOperativaCentro({
  centro,
  puedeEditar,
  onActualizado,
}: PropsPanel) {
  const [centroLocal, setCentroLocal] = useState(centro);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCentroLocal((prev) => {
      if (centro.id !== prev.id) return centro;
      if ((centro.updated_at ?? 0) >= (prev.updated_at ?? 0)) return centro;
      return prev;
    });
  }, [centro]);

  const c = normalizarCentro(centroLocal);
  const supervision = c.supervision;

  async function persistir(patch: {
    cuerpo?: string;
    supervision?: SupervisionCentro;
  }) {
    // Gate duro: sin permiso no se escribe (UI disabled + trigger DB).
    if (!puedeEditar) {
      setError(
        "Solo admin y analistas pueden modificar la asignación operativa.",
      );
      return;
    }
    setError(null);
    setGuardando(true);
    const siguiente: CentroTransitorio = {
      ...centroLocal,
      cuerpo: patch.cuerpo ?? centroLocal.cuerpo,
      supervision: patch.supervision ?? centroLocal.supervision,
      updated_at: Date.now(),
    };
    setCentroLocal(siguiente);
    try {
      await guardarCentro(siguiente);
      onActualizado?.(siguiente);
    } catch (err) {
      console.error("[AsignacionOperativaCentro] error guardando:", err);
      setCentroLocal(centro);
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo guardar la asignación operativa.",
      );
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <AsignacionOperativaCampos
        cuerpo={c.cuerpo ?? ""}
        supervision={supervision}
        disabled={!puedeEditar || guardando}
        onCuerpoChange={(cuerpo) => {
          if (!puedeEditar) return;
          void persistir({
            cuerpo,
            supervision: normalizarSupervision({
              ...supervision,
              unidad_sebin: "",
            }),
          });
        }}
        onSupervisionChange={(patch) => {
          if (!puedeEditar) return;
          void persistir({
            supervision: normalizarSupervision({ ...supervision, ...patch }),
          });
        }}
      />
      {guardando && (
        <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Loader2 className="size-2.5 animate-spin" />
          Guardando…
        </p>
      )}
      {error && <p className="text-[10px] text-destructive">{error}</p>}
    </div>
  );
}
