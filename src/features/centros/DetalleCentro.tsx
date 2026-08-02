import { LogoCuerpo } from "@/components/LogoCuerpo";
import {
  BedDouble,
  ChevronDown,
  ClipboardList,
  Droplets,
  ExternalLink,
  Info,
  Landmark,
  Package,
  Pencil,
  Shirt,
  ShowerHead,
  Trash,
  Users,
} from "lucide-react";
import {
  ESTADOS_CENTRO,
  ESTATUS_INSTALACION_OFICIAL,
  metaCuerpoDe,
  metaUnidadSebinCentro,
  normalizarCentro,
  normalizarPersonal,
  poblacionCentro,
  totalJusticia,
  ubicacionCentro,
  type CentroTransitorio,
} from "@/domain/centrosTransitorios";
import {
  analisisCentro,
  COLOR_ESTADO_AGUA,
  COLOR_SEMAFORO,
  type AnalisisAgua,
  type ClaveRecurso,
  type RecursoAnalisis,
} from "@/domain/capacidadCentros";
import { CATEGORIAS_RESPONSABLE } from "@/domain/tipos";
import { AccionesContacto } from "@/components/AccionesContacto";
import { DemografiaResumen } from "@/features/tablero/DemografiaResumen";
import { PersonalResumen } from "@/features/censo/PersonalResumen";
import {
  GridServicios,
  TarjetaContacto,
  TarjetaSeguridad,
} from "@/features/centros/LevantamientoCentro";
import {
  AlertasDelDiaCentro,
  type VistaFichaCentro,
} from "@/features/centros/AlertasDelDiaCentro";
import { ListaRequerimientos } from "@/features/centros/RequerimientosCentro";
import { GraficoOcupacionCentro } from "@/features/centros/GraficoOcupacionCentro";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const ICONO_RECURSO: Record<ClaveRecurso, React.ReactNode> = {
  camas: <BedDouble className="size-3.5 text-primary" />,
  pocetas: <span className="text-sm leading-none">🚽</span>,
  duchas: <ShowerHead className="size-3.5 text-cyan-400" />,
  lavaderos: <Shirt className="size-3.5 text-violet-400" />,
  contenedores: <Trash className="size-3.5 text-lime-500" />,
};

/** Botón (i) que abre un popover explicando de dónde sale una cantidad. */
function InfoEstandar({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="text-muted-foreground/70 transition-colors hover:text-foreground"
          aria-label={`Cómo se calcula: ${titulo}`}
          onClick={(e) => e.stopPropagation()}
        >
          <Info className="size-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 gap-1 text-xs">
        <p className="font-semibold text-foreground">{titulo}</p>
        <p className="text-muted-foreground">{texto}</p>
      </PopoverContent>
    </Popover>
  );
}

interface Props {
  centro: CentroTransitorio;
  onEditar: () => void;
  /** Navegar a una sección de la ficha (tarjetas de alerta clicables). */
  onIrAPestana?: (vista: VistaFichaCentro) => void;
}

const ETIQUETA_SEMAFORO: Record<string, string> = {
  verde: "Con cupo",
  amarillo: "Casi lleno",
  rojo: "Saturado",
  sin_datos: "Sin datos de capacidad",
};

/** Número grande para lectura rápida en el panel del centro. */
function KpiGrande({
  etiqueta,
  valor,
  clase,
  anchoCompleto,
}: {
  etiqueta: string;
  valor: number;
  clase?: string;
  anchoCompleto?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-center",
        anchoCompleto && "col-span-full",
      )}
    >
      <div className={cn("text-2xl font-bold tabular-nums leading-none text-foreground", clase)}>
        {valor.toLocaleString("es")}
      </div>
      <div className="mt-1 text-[11px] font-medium text-muted-foreground">{etiqueta}</div>
    </div>
  );
}

/** Subtotal compacto (p. ej. médicos, justicia). */
function MiniKpi({ etiqueta, valor }: { etiqueta: string; valor: number }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-2 py-1.5 text-center">
      <div className="text-lg font-bold tabular-nums leading-none text-foreground">
        {valor.toLocaleString("es")}
      </div>
      <div className="mt-0.5 text-[10px] leading-tight text-muted-foreground">{etiqueta}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Secciones reutilizables de la ficha del centro. Cada una recibe el centro y
// deriva lo que necesita (normalizarCentro / analisisCentro son baratos). Las
// consumen tanto el panel lateral (`DetalleCentro`) como la vista completa
// (`FichaCentroView`), sin duplicar lógica.
// ---------------------------------------------------------------------------

interface SeccionProps {
  centro: CentroTransitorio;
}

/** Badges de estado del centro; cupo solo si hay datos de capacidad registrados. */
export function BadgesEstadoCentro({ centro }: SeccionProps) {
  const c = normalizarCentro(centro);
  const analisis = analisisCentro(centro);
  const estadoInfo = ESTADOS_CENTRO.find((e) => e.valor === c.estado);
  const estatusInfo = ESTATUS_INSTALACION_OFICIAL.find(
    (e) => e.valor === c.censo_oficial.estatus_instalacion,
  );
  const colorSemaforo = COLOR_SEMAFORO[analisis.semaforo];
  const mostrarCupo = analisis.semaforo !== "sin_datos";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {estadoInfo && (
        <Badge
          variant="outline"
          className="text-[10px]"
          style={{ borderColor: `${estadoInfo.color}66`, color: estadoInfo.color }}
        >
          {estadoInfo.label}
        </Badge>
      )}
      {estatusInfo && (
        <Badge variant="outline" className="border-teal-500/40 text-[10px] text-teal-400">
          {estatusInfo.label}
        </Badge>
      )}
      {mostrarCupo && (
        <Badge
          variant="outline"
          className="text-[10px]"
          style={{ borderColor: `${colorSemaforo}66`, color: colorSemaforo }}
        >
          {ETIQUETA_SEMAFORO[analisis.semaforo]}
        </Badge>
      )}
    </div>
  );
}

/** Foto del centro: llena su columna (cuadrado) sin estirarse a todo el ancho. */
export function SeccionFotoCentro({
  centro,
  className,
}: SeccionProps & { className?: string }) {
  const c = normalizarCentro(centro);
  return (
    <div
      className={cn(
        "aspect-square w-full overflow-hidden rounded-xl border border-border bg-muted/20",
        className,
      )}
    >
      {c.foto_url ? (
        <img
          src={c.foto_url}
          alt={centro.nombre}
          className="size-full object-cover"
        />
      ) : (
        <div className="flex size-full items-center justify-center px-2 text-center text-[10px] leading-tight text-muted-foreground sm:text-xs">
          Sin foto
        </div>
      )}
    </div>
  );
}

/** Identificación: fecha de levantamiento, cuerpo asignado, ubicación y Maps. */
export function SeccionIdentificacionCentro({
  centro,
  puedeEditar = false,
  onEditarUbicacion,
}: SeccionProps & {
  puedeEditar?: boolean;
  onEditarUbicacion?: () => void;
}) {
  const c = normalizarCentro(centro);
  const meta = metaCuerpoDe(centro.cuerpo);
  const metaUnidad = metaUnidadSebinCentro(centro);
  const ubicacion = ubicacionCentro(centro);
  return (
    <div className="space-y-2">
      {c.fecha_levantamiento && (
        <p className="text-[10px] text-muted-foreground">
          Levantamiento:{" "}
          {new Date(`${c.fecha_levantamiento}T12:00:00`).toLocaleDateString("es-VE", {
            day: "2-digit",
            month: "long",
            year: "numeric",
          })}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <div
          className="inline-flex items-center gap-2 rounded-full border py-0.5 pl-0.5 pr-2.5"
          style={{ borderColor: meta.color }}
        >
          <span className="flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white">
            {meta.logo ? (
              <LogoCuerpo src={meta.logo} />
            ) : (
              <span className="text-sm leading-none">{meta.icono}</span>
            )}
          </span>
          <span className="text-xs font-semibold text-foreground">{meta.label}</span>
        </div>
        {metaUnidad.clave !== "sin_asignar" && (
          <div
            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5"
            style={{ borderColor: metaUnidad.color }}
          >
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ background: metaUnidad.color }}
              aria-hidden
            />
            <span className="text-[11px] font-medium text-foreground">{metaUnidad.label}</span>
          </div>
        )}
        {c.supervision.supervisor_sebin.trim() && (
          <div className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-0.5">
            <span className="text-[11px] text-muted-foreground">Revista:</span>
            <span className="text-[11px] font-medium text-foreground">
              {c.supervision.supervisor_sebin.trim()}
            </span>
          </div>
        )}
        {c.supervision.analistas_sae.length > 0 && (
          <div className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 px-2.5 py-0.5">
            <span className="text-[11px] text-muted-foreground">Análisis:</span>
            <span className="text-[11px] font-medium text-foreground">
              {c.supervision.analistas_sae.length === 1
                ? "1 analista"
                : `${c.supervision.analistas_sae.length} analistas`}
            </span>
          </div>
        )}
      </div>
      <div className="space-y-0.5 text-xs text-muted-foreground">
        <div className="flex items-start gap-1">
          <p className="min-w-0 flex-1 uppercase tracking-wide text-orange-400/90">
            {ubicacion || "Sin ubicación administrativa"}
          </p>
          {puedeEditar && onEditarUbicacion && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
              title="Editar ubicación administrativa"
              aria-label="Editar ubicación administrativa"
              onClick={onEditarUbicacion}
            >
              <Pencil className="size-3.5" />
            </Button>
          )}
        </div>
        {centro.direccion && <p className="leading-snug">{centro.direccion}</p>}
        {c.censo_oficial.ministerio_ente.trim() && (
          <p>
            Ente:{" "}
            <span className="font-medium text-foreground">
              {c.censo_oficial.ministerio_ente.trim()}
            </span>
          </p>
        )}
        {(c.censo_oficial.capacidad_instalada != null ||
          c.censo_oficial.capacidad_maxima != null) && (
          <p>
            Aforo:{" "}
            {c.censo_oficial.capacidad_instalada != null ? (
              <span className="font-medium text-foreground">
                {c.censo_oficial.capacidad_instalada.toLocaleString("es")} instalada
              </span>
            ) : (
              <span className="text-muted-foreground">sin instalada</span>
            )}
            {c.censo_oficial.capacidad_maxima != null && (
              <>
                {" · "}
                <span className="font-medium text-foreground">
                  {c.censo_oficial.capacidad_maxima.toLocaleString("es")} máxima
                </span>
              </>
            )}
          </p>
        )}
      </div>
      {centro.mapsUrl && (
        <a
          href={centro.mapsUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Abrir en Google Maps
          <ExternalLink className="size-3" />
        </a>
      )}
    </div>
  );
}

/** II · Coordinación (político + ministerial). Nada si no hay contactos. */
export function SeccionCoordinacionCentro({ centro }: SeccionProps) {
  const c = normalizarCentro(centro);
  if (!c.coord_politico.nombre && !c.coord_ministerial.nombre) return null;
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
        <ClipboardList className="size-3.5" />
        Coordinación
      </p>
      <TarjetaContacto
        titulo="Coordinador político"
        contacto={c.coord_politico}
        icono={<Landmark className="size-3" />}
      />
      <TarjetaContacto titulo="Coordinador ministerial" contacto={c.coord_ministerial} />
    </div>
  );
}

/** III · Seguridad del centro. */
export function SeccionSeguridadCentro({ centro }: SeccionProps) {
  const c = normalizarCentro(centro);
  return <TarjetaSeguridad seguridad={c.seguridad} organismoCatalogo={centro.cuerpo} />;
}

/** V · Población — totales visibles, desglose demográfico desplegable. */
export function SeccionPoblacionCentro({
  centro,
  children,
}: SeccionProps & { children?: React.ReactNode }) {
  const c = normalizarCentro(centro);
  const analisis = analisisCentro(centro);
  const poblacion = poblacionCentro(centro);
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-xs font-semibold text-foreground">Población afectada</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <KpiGrande etiqueta="Damnificados" valor={poblacion} clase="text-sky-300" />
        <KpiGrande etiqueta="Familias" valor={analisis.familias} clase="text-orange-300" />
        <KpiGrande etiqueta="Mascotas" valor={c.ocupacion.mascotas} clase="text-amber-300" />
      </div>
      {c.censo_en_proceso && (
        <Badge
          variant="outline"
          className="mt-2 border-amber-500/40 text-[10px] text-amber-500"
        >
          Censo demográfico en proceso
        </Badge>
      )}
      <Collapsible className="mt-2">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="group flex w-full items-center justify-between rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted/40"
          >
            Ver desglose demográfico
            <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 space-y-2">
          {c.total_afectados > 0 && c.censo_en_proceso && (
            <p className="text-[11px] text-muted-foreground">
              Total preliminar: {c.total_afectados.toLocaleString("es")} afectados (desglose
              pendiente)
            </p>
          )}
          <DemografiaResumen vulnerables={c.ocupacion} mostrarEstructura />
        </CollapsibleContent>
      </Collapsible>
      {children}
    </div>
  );
}

/** Personal operativo — totales visibles, detalle por categoría desplegable. */
export function SeccionPersonalCentro({ centro }: SeccionProps) {
  const c = normalizarCentro(centro);
  const analisis = analisisCentro(centro);
  const personal = normalizarPersonal(c.personal);
  const justicia = totalJusticia(personal);
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-xs font-semibold text-foreground">Personal operativo</p>
      <div className="mt-2">
        <KpiGrande etiqueta="Total desplegado" valor={analisis.personal} anchoCompleto />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <MiniKpi etiqueta="Funcionarios" valor={personal.funcionarios} />
        <MiniKpi etiqueta="Trabajadores" valor={personal.trabajadores} />
        <MiniKpi etiqueta="Médicos" valor={personal.medicos} />
        <MiniKpi etiqueta="Psicólogos" valor={personal.psicologos} />
        <MiniKpi etiqueta="Justicia" valor={justicia} />
      </div>
      <Collapsible className="mt-2">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="group flex w-full items-center justify-between rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted/40"
          >
            Ver detalle por categoría
            <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2">
          <PersonalResumen personal={c.personal} mostrarEstructura />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

/**
 * Histórico de ocupación (serie diaria del centro).
 * `colapsable` (default): sección desplegable, como en el panel lateral.
 * Con `colapsable={false}` el gráfico va abierto de entrada (vista completa).
 */
export function SeccionHistoricoCentro({
  centro,
  colapsable = true,
}: SeccionProps & { colapsable?: boolean }) {
  if (!colapsable) {
    return (
      <div className="rounded-xl border border-border bg-card p-3">
        <p className="mb-3 text-xs font-semibold text-foreground">Histórico de ocupación</p>
        <GraficoOcupacionCentro centroId={centro.id} />
      </div>
    );
  }
  return (
    <Collapsible className="rounded-xl border border-border bg-card p-3">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="group flex w-full items-center justify-between rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted/40"
        >
          Histórico de ocupación
          <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3">
        <GraficoOcupacionCentro centroId={centro.id} />
      </CollapsibleContent>
    </Collapsible>
  );
}

/** Total logístico (agua, comida, baños). Nada si no hay personas. */
export function SeccionLogisticaCentro({ centro }: SeccionProps) {
  const analisis = analisisCentro(centro);
  if (analisis.refugiados <= 0 && analisis.personal <= 0) return null;
  return (
    <div className="rounded-xl border border-teal-500/30 bg-teal-500/10 px-4 py-3 text-center">
      <p className="text-[10px] font-medium uppercase tracking-wide text-teal-400/90">
        Logística · agua, comida, baños
      </p>
      <p className="mt-0.5 text-3xl font-bold tabular-nums text-foreground">
        {analisis.personasLogistica.toLocaleString("es")}
      </p>
      <p className="text-xs text-muted-foreground">
        {analisis.refugiados.toLocaleString("es")} damnificados
        {analisis.personal > 0 && (
          <> + {analisis.personal.toLocaleString("es")} personal</>
        )}
      </p>
    </div>
  );
}

/** Requerimientos logísticos del centro. Nada si no hay ítems con cantidad. */
export function SeccionRequerimientosCentro({ centro }: SeccionProps) {
  const c = normalizarCentro(centro);
  if (!c.requerimientos.some((r) => r.concepto.trim() && r.cantidad > 0)) return null;
  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-foreground">
        <Package className="size-3.5 text-amber-500" />
        Requerimientos
      </p>
      <ListaRequerimientos items={c.requerimientos} />
    </div>
  );
}

/** Capacidad vs. ocupación: cupo real, cuello de botella y barras Esfera. */
export function SeccionCapacidadCentro({
  centro,
  integrado = false,
}: SeccionProps & { integrado?: boolean }) {
  const analisis = analisisCentro(centro);
  const colorSemaforo = COLOR_SEMAFORO[analisis.semaforo];
  return (
    <div className={integrado ? "space-y-3" : "rounded-xl border border-border bg-card p-3"}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-foreground">
          {integrado ? "Recursos vs. población" : "Capacidad vs. ocupación"}
        </p>
        <span className="text-[11px] text-muted-foreground">
          {analisis.refugiados.toLocaleString("es")} damnificados
          {analisis.personal > 0 && (
            <> + {analisis.personal.toLocaleString("es")} personal</>
          )}
          {" · "}
          {analisis.personasLogistica.toLocaleString("es")} logística
        </span>
      </div>

      {!integrado && analisis.cupoDisponible != null ? (
        <div
          className="rounded-lg px-3 py-2 text-center"
          style={{ background: `${colorSemaforo}1a` }}
        >
          <div className="text-2xl font-bold" style={{ color: colorSemaforo }}>
            {analisis.cupoDisponible.toLocaleString("es")}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {analisis.cupoOficial != null
              ? "cupo disponible (capacidad instalada − damnificados)"
              : "personas más que puede recibir con seguridad (Esfera)"}
          </div>
          {analisis.capacidadInstalada != null && (
            <div className="mt-1 text-[11px] text-muted-foreground">
              Capacidad instalada:{" "}
              <span className="font-semibold text-foreground">
                {analisis.capacidadInstalada.toLocaleString("es")}
              </span>
              {analisis.capacidadMaxima != null &&
                analisis.capacidadMaxima !== analisis.capacidadInstalada && (
                  <>
                    {" "}
                    · máxima{" "}
                    <span className="font-semibold text-foreground">
                      {analisis.capacidadMaxima.toLocaleString("es")}
                    </span>
                  </>
                )}
            </div>
          )}
          {analisis.cupoOficial == null &&
            analisis.cuelloBotella &&
            analisis.cupoReal != null &&
            analisis.cupoReal >= 0 && (
              <div className="mt-1 text-[11px] text-muted-foreground">
                Recurso que fija el límite:{" "}
                <span className="font-semibold text-foreground">
                  {analisis.cuelloBotella.label}
                </span>{" "}
                <span className="text-muted-foreground">(lo primero que se agota)</span>
              </div>
            )}
        </div>
      ) : !integrado ? (
        <p className="text-[11px] text-muted-foreground">
          Aún no hay capacidad instalada ni recursos Esfera. Registra la capacidad instalada
          (censo oficial) o camas/pocetas/duchas.
        </p>
      ) : (
        analisis.cuelloBotella &&
        analisis.cupoReal != null && (
          <p className="text-[11px] text-muted-foreground">
            Cuello de botella Esfera:{" "}
            <span className="font-semibold text-foreground">
              {analisis.cuelloBotella.label}
            </span>
          </p>
        )
      )}

      <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Estándar Esfera (diagnóstico): hay · operativas · deberían. Toca el ⓘ para el estándar.
      </p>
      <div className="space-y-2">
        {analisis.recursos.map((r) => (
          <BarraRecurso
            key={r.clave}
            recurso={r}
            esLimite={analisis.cuelloBotella?.clave === r.clave}
          />
        ))}
        <TarjetaAgua agua={analisis.agua} />
      </div>
    </div>
  );
}

/** Responsables del centro con acciones de contacto. */
export function SeccionResponsablesCentro({ centro }: SeccionProps) {
  const c = normalizarCentro(centro);
  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-foreground">
        <Users className="size-3.5" />
        Responsables ({c.responsables.length})
      </p>
      {c.responsables.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sin responsables registrados.</p>
      ) : (
        <div className="space-y-2">
          {c.responsables.map((r) => {
            const cat = CATEGORIAS_RESPONSABLE.find((x) => x.valor === r.categoria);
            return (
              <div
                key={r.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {r.nombre || "Sin nombre"}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {r.funcion || cat?.label}
                  </p>
                </div>
                {r.telefono.trim() && <AccionesContacto telefono={r.telefono} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** IV · Servicios de salud y apoyo jurídico. */
export function SeccionServiciosCentro({ centro }: SeccionProps) {
  const c = normalizarCentro(centro);
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-xs font-semibold text-foreground">Servicios de salud</p>
      <div className="mt-2">
        <GridServicios servicios={c.servicios} />
      </div>
    </div>
  );
}

/**
 * Vista rápida del panel lateral del mapa: foto chica, cabecera, alertas del día,
 * franja compacta (cuerpo / unidad / ubicación) y CTA a la ficha completa.
 */
export function DetalleCentro({ centro, onEditar, onIrAPestana }: Props) {
  const meta = metaCuerpoDe(centro.cuerpo);
  const metaUnidad = metaUnidadSebinCentro(centro);
  const ubicacion = ubicacionCentro(centro);

  return (
    <div className="space-y-4">
      <SeccionFotoCentro
        centro={centro}
        className="-mx-3 -mt-3 mb-0 aspect-square w-[calc(100%+1.5rem)] max-w-none rounded-none border-x-0 border-t-0"
      />

      {/* Cabecera propia del panel (la vista completa tiene la suya) */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {centro.nro != null ? `Campamento N.° ${centro.nro} · ` : ""}
          {centro.grupo}
        </p>
        <h2 className="text-base font-bold leading-snug text-foreground">{centro.nombre}</h2>
        <BadgesEstadoCentro centro={centro} />
      </div>

      <AlertasDelDiaCentro centro={centro} onIrAPestana={onIrAPestana} />

      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="inline-flex items-center gap-2 rounded-full border py-0.5 pl-0.5 pr-2.5"
            style={{ borderColor: meta.color }}
          >
            <span className="flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white">
              {meta.logo ? (
                <LogoCuerpo src={meta.logo} />
              ) : (
                <span className="text-sm leading-none">{meta.icono}</span>
              )}
            </span>
            <span className="text-xs font-semibold text-foreground">{meta.label}</span>
          </div>
          {metaUnidad.clave !== "sin_asignar" && (
            <div
              className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5"
              style={{ borderColor: metaUnidad.color }}
            >
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ background: metaUnidad.color }}
                aria-hidden
              />
              <span className="text-[11px] font-medium text-foreground">
                {metaUnidad.label}
              </span>
            </div>
          )}
        </div>
        <p className="text-xs uppercase tracking-wide text-orange-400/90">
          {ubicacion || "Sin ubicación administrativa"}
        </p>
      </div>

      <Button className="w-full" onClick={onEditar}>
        <ExternalLink className="size-4" />
        Abrir ficha del campamento
      </Button>
    </div>
  );
}

const VERDE = "#22c55e";
const AMBAR = "#f59e0b";
const ROJO = "#ef4444";

function BarraRecurso({ recurso, esLimite }: { recurso: RecursoAnalisis; esLimite: boolean }) {
  const n = (x: number) => x.toLocaleString("es");
  // saldo > 0 → sobran; < 0 → faltan; 0 → justo.
  const saldo = recurso.operativas - recurso.requeridas;
  // Cobertura: MÁS es mejor. Verde ≥100%, ámbar ≥60%, rojo <60%.
  const color = recurso.cobertura >= 100 ? VERDE : recurso.cobertura >= 60 ? AMBAR : ROJO;
  const anchoBarra = Math.min(100, recurso.cobertura);

  let saldoTexto: string;
  let saldoColor: string;
  if (saldo > 0) {
    saldoTexto = `sobran ${n(saldo)} ${recurso.unidad}`;
    saldoColor = VERDE;
  } else if (saldo < 0) {
    saldoTexto = `faltan ${n(-saldo)} ${recurso.unidad}`;
    saldoColor = ROJO;
  } else {
    saldoTexto = "justo, sin margen";
    saldoColor = AMBAR;
  }

  return (
    <div className="rounded-lg border border-border px-2.5 py-1.5">
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="flex items-center gap-1.5 font-medium text-foreground">
          {ICONO_RECURSO[recurso.clave]}
          {recurso.label}
          <InfoEstandar titulo={`¿Cuántas ${recurso.unidad} deberían?`} texto={recurso.descripcionEstandar} />
          {esLimite && (
            <span className="rounded bg-muted px-1 py-px text-[9px] font-medium text-muted-foreground">
              fija el límite
            </span>
          )}
        </span>
        {recurso.medido ? (
          <span className="shrink-0 text-muted-foreground">
            <span className="font-semibold text-foreground">{n(recurso.instaladas)}</span> hay ·{" "}
            <span className="font-semibold text-foreground">{n(recurso.operativas)}</span> oper.
          </span>
        ) : (
          <span className="shrink-0 text-muted-foreground">sin datos</span>
        )}
      </div>

      {recurso.medido && !recurso.sinNecesidad && (
        <>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${anchoBarra}%`, background: color }}
            />
          </div>
          <div className="mt-0.5 flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground">
              deberían: {n(recurso.requeridas)} {recurso.unidad}
            </span>
            <span className="font-medium" style={{ color: saldoColor }}>
              {saldoTexto}
            </span>
          </div>
        </>
      )}

      {recurso.medido && recurso.sinNecesidad && (
        <div className="mt-0.5 text-right text-[10px] text-muted-foreground">
          sin población que atender
        </div>
      )}
    </div>
  );
}

const ETIQUETA_AGUA: Record<string, string> = {
  ok: "Suministro OK",
  atencion: "Vigilar",
  critico: "Atención urgente",
  sin_datos: "Sin datos",
};

/** Tarjeta de agua: no cuenta como "unidades" sino como autonomía + acción. */
function TarjetaAgua({ agua }: { agua: AnalisisAgua }) {
  const n = (x: number) => x.toLocaleString("es");
  const color = COLOR_ESTADO_AGUA[agua.estado];

  return (
    <div className="rounded-lg border border-border px-2.5 py-1.5">
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="flex items-center gap-1.5 font-medium text-foreground">
          <Droplets className="size-3.5 text-sky-400" />
          Agua potable
          <InfoEstandar titulo="Cómo se evalúa el agua" texto={agua.descripcionEstandar} />
        </span>
        {agua.medido ? (
          <span className="shrink-0 text-muted-foreground">
            tanque <span className="font-semibold text-foreground">{n(agua.litros)} L</span>
          </span>
        ) : (
          <span className="shrink-0 text-muted-foreground">sin datos</span>
        )}
      </div>

      {agua.medido && (
        <>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
            <span>
              consumo ~{n(agua.consumoDiaL)} L/día
              <span className="text-muted-foreground/70"> ({agua.litrosPersonaDia} L·pers.)</span>
            </span>
            {agua.autonomiaDias != null && (
              <span>
                autonomía:{" "}
                <span className="font-semibold" style={{ color }}>
                  {agua.autonomiaDias < 1
                    ? "< 1 día"
                    : `~${Math.floor(agua.autonomiaDias)} día${Math.floor(agua.autonomiaDias) === 1 ? "" : "s"}`}
                </span>
              </span>
            )}
            <Badge
              variant="outline"
              className="px-1 py-0 text-[9px]"
              style={{ borderColor: `${color}66`, color }}
            >
              {agua.operativa ? ETIQUETA_AGUA[agua.estado] : "Sin suministro"}
            </Badge>
          </div>
          <p
            className="mt-1 rounded-md px-2 py-1 text-[10px] leading-snug"
            style={{ background: `${color}14`, color }}
          >
            {agua.recomendacion}
          </p>
        </>
      )}

      {!agua.medido && (
        <p className="mt-0.5 text-[10px] text-muted-foreground">{agua.recomendacion}</p>
      )}
    </div>
  );
}
