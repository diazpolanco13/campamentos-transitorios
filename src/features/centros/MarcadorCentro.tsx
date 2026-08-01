import { LogoCuerpo } from "@/components/LogoCuerpo";
import { BadgePruebaCentro } from "@/components/BadgePruebaCentro";
import { COLOR_MARCADOR_ATENUADO } from "@/domain/unidadesSebin";
import { TOTAL_FASES_REPORTE_DIA } from "@/data/useEstadoReporteHoy";
import { cn } from "@/lib/utils";

export type ModoMarcadorCentro = "logo" | "color";

interface Props {
  modo: ModoMarcadorCentro;
  /** Número de campamento (índice operativo). */
  nro: number;
  /** Nombre del centro (etiqueta en zoom cercano + tooltip). */
  nombre: string;
  icono: string;
  logo: string | null;
  color: string;
  seleccionado: boolean;
  /** Si false, el marcador se muestra gris (filtro por otra dirección). */
  resaltado?: boolean;
  mostrarParte: boolean;
  /** Etiqueta visible del nombre (escala < 25k). */
  mostrarNombre?: boolean;
  /** Damnificados alojados. */
  refugiados?: number;
  /** Personal operativo total desplegado en el centro. */
  personalTotal?: number;
  /** Color de alerta crítica (rojo). null = sin alerta → aro blanco / onda de la unidad. */
  semaforoColor?: string | null;
  /**
   * Fases del reporte diario abiertas/confirmadas hoy (0-6). Alimenta el aro
   * de la baliza en modo "color". No es "verificado": cada fase solo prueba
   * que el operador la guardó/confirmó, no que cambió un dato real.
   */
  fasesReporteHoy?: number;
  /**
   * Alerta crítica: novedad negativa hoy, denuncia abierta o caso de salud
   * activo. Pinta la base roja en modo "color".
   */
  alertaBase?: boolean;
  /** Etiquetas tipadas de la alerta (tooltip). Vacío/omitido → copy genérico. */
  alertaBaseEtiquetas?: string[];
  /** Campamento sandbox: muestra marca «Prueba». */
  esPrueba?: boolean;
  onClick: () => void;
}

function fmtCompacto(n: number): string {
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return n.toLocaleString("es");
}

function ParteNumerico({
  refugiados,
  compacto = false,
}: {
  refugiados: number;
  compacto?: boolean;
}) {
  return (
    <span
      className={cn(
        "whitespace-nowrap font-bold tabular-nums leading-none text-white",
        compacto ? "text-[10px]" : "text-[11px]",
      )}
    >
      {fmtCompacto(refugiados)}
    </span>
  );
}

/**
 * Color del estado del reporte diario — mismos 3 tonos y el mismo criterio
 * que la sala situacional (`ResumenPlegadoSala`: completos/parciales/sin
 * iniciar en verde/amarillo/rojo): 0 fases = sin iniciar, 1-5 = incompleto,
 * 6/6 = completo. Un solo criterio en toda la app, no dos convenciones.
 */
function colorEstadoReporte(fases: number): string {
  if (fases <= 0) return "#ef4444"; // rojo — sin iniciar
  if (fases >= TOTAL_FASES_REPORTE_DIA) return "#10b981"; // verde — completo
  return "#f59e0b"; // amarillo — incompleto
}

/** Color neutro de la base cuando no hay nada que atender (gris/blanco). */
const COLOR_BASE_NEUTRA = "#e5e7eb";
/** Color de la base cuando hay alerta crítica (novedad / denuncia / salud). */
const COLOR_BASE_ALERTA = "#ef4444";

/**
 * Baliza del campamento: núcleo en diamante con el N.°, envuelto en un aro
 * que mide el progreso del reporte diario (n/6 fases — ver `fasesReporteHoy`).
 * La base (haz + charco) es una señal aparte: neutra por defecto, roja si hay
 * novedad negativa hoy, denuncia abierta o caso de salud activo (`alertaBase`).
 */
function Baliza({
  nro,
  color,
  fasesReporteHoy,
  alertaBase,
  resaltado,
  seleccionado,
}: {
  nro: number;
  color: string;
  fasesReporteHoy: number;
  /** Alerta crítica (novedad / denuncia / salud). */
  alertaBase: boolean;
  resaltado: boolean;
  seleccionado: boolean;
}) {
  const pct = Math.max(0, Math.min(1, fasesReporteHoy / TOTAL_FASES_REPORTE_DIA)) * 100;
  const colorAro = colorEstadoReporte(fasesReporteHoy);
  const colorBase = alertaBase ? COLOR_BASE_ALERTA : COLOR_BASE_NEUTRA;
  return (
    <div className="relative flex flex-col items-center">
      <span
        className="relative flex size-[30px] shrink-0 items-center justify-center rounded-full"
        style={{
          background: resaltado
            ? `radial-gradient(closest-side, var(--background) 0 62%, transparent 63% 100%), conic-gradient(${colorAro} ${pct}%, rgba(255,255,255,0.14) 0)`
            : undefined,
        }}
      >
        <span
          className={cn(
            "relative flex size-[19px] items-center justify-center rounded-full shadow-md",
            seleccionado && resaltado && "ring-2 ring-white/90",
          )}
          style={{
            backgroundColor: color,
            boxShadow: resaltado
              ? `0 0 0 1.5px rgba(255,255,255,0.85), 0 0 10px -3px ${colorBase}`
              : "0 0 0 1.5px rgba(255,255,255,0.6)",
          }}
        >
          <span className="text-[9px] font-bold tabular-nums leading-none text-white">{nro}</span>
        </span>
      </span>
      {resaltado && (
        <>
          <span
            className="h-[9px] w-px opacity-80"
            style={{ background: `linear-gradient(180deg, transparent, ${colorBase} 85%)` }}
            aria-hidden="true"
          />
          <span
            className="marcador-latido-charco h-[6px] w-5 rounded-full opacity-75"
            style={{ backgroundColor: colorBase, filter: "blur(2px)" }}
            aria-hidden="true"
          />
        </>
      )}
    </div>
  );
}

/**
 * Etiqueta HUD del nombre: mono, mayúsculas trackeadas, acento teal — no un
 * chip genérico. Opacidad continua vía `--etiqueta-opacity` (CentrosMap.tsx):
 * aparece progresivamente con el zoom, en el mismo rango que los edificios 3D.
 */
function EtiquetaNombre({ nombre }: { nombre: string }) {
  return (
    <span
      className="mt-1 max-w-[9.5rem] truncate rounded-[3px] border border-primary/30 bg-background/90 px-1.5 py-0.5 text-center font-mono text-[9px] font-semibold uppercase leading-tight tracking-wide text-foreground shadow-[0_0_6px_-2px_var(--primary)] backdrop-blur-sm"
      style={{ opacity: "var(--etiqueta-opacity, 1)", transition: "opacity 150ms linear" }}
      title={nombre}
    >
      {nombre}
    </span>
  );
}

/** Marcador HTML del campamento: logo SEBIN o punto de color con latido. */
export function MarcadorCentro({
  modo,
  nro,
  nombre,
  icono,
  logo,
  color,
  seleccionado,
  resaltado = true,
  mostrarParte,
  mostrarNombre = false,
  refugiados = 0,
  personalTotal = 0,
  semaforoColor,
  fasesReporteHoy = 0,
  alertaBase = false,
  alertaBaseEtiquetas,
  esPrueba = false,
  onClick,
}: Props) {
  const colorMarcador = resaltado ? color : COLOR_MARCADOR_ATENUADO;
  const etiquetaReporteHoy =
    fasesReporteHoy <= 0
      ? "Reporte no iniciado"
      : fasesReporteHoy >= TOTAL_FASES_REPORTE_DIA
        ? "Reporte del día abierto (completo)"
        : `Reporte del día: ${fasesReporteHoy}/${TOTAL_FASES_REPORTE_DIA} fases`;
  const detalleAlerta =
    alertaBaseEtiquetas && alertaBaseEtiquetas.length > 0
      ? alertaBaseEtiquetas.join(" · ")
      : "Alerta crítica (novedad, denuncia o salud)";
  const titulo =
    `${esPrueba ? "[PRUEBA] " : ""}${nombre} · N.° ${nro} · ${refugiados.toLocaleString("es")} damnificados · ${personalTotal.toLocaleString("es")} personal operativo · ${etiquetaReporteHoy}` +
    (alertaBase ? ` · ${detalleAlerta}` : "");
  const verNombre = mostrarNombre && resaltado;

  const marcaPrueba = esPrueba ? (
    <span className="mt-0.5 block">
      <BadgePruebaCentro compacto />
    </span>
  ) : null;

  function manejarClick(ev: React.MouseEvent) {
    ev.stopPropagation();
    onClick();
  }

  if (modo === "color") {
    return (
      <div
        className={cn(
          "relative cursor-pointer select-none transition-all duration-300",
          seleccionado && resaltado && "scale-125",
          !resaltado && "scale-90 opacity-25",
        )}
        title={titulo}
        onClick={manejarClick}
      >
        <div className="relative flex flex-col items-center">
          <Baliza
            nro={nro}
            color={colorMarcador}
            fasesReporteHoy={fasesReporteHoy}
            alertaBase={alertaBase}
            resaltado={resaltado}
            seleccionado={seleccionado}
          />
          {verNombre && <EtiquetaNombre nombre={nombre} />}
          {mostrarParte && resaltado && (
            <span className="mt-1 rounded-md bg-background/90 px-1.5 py-0.5 shadow-md backdrop-blur-sm">
              <ParteNumerico refugiados={refugiados} compacto />
            </span>
          )}
          {marcaPrueba}
        </div>
      </div>
    );
  }

  /** Aro del logo: semáforo de ocupación si hay; si no, color de la unidad. */
  const colorAroLogo = resaltado && semaforoColor ? semaforoColor : colorMarcador;

  const iconoCuerpo = (
    <span className="relative flex size-7 shrink-0 items-center justify-center">
      <span
        className="flex size-7 items-center justify-center overflow-hidden rounded-full border-2 bg-white"
        style={{ borderColor: colorAroLogo }}
      >
        {logo ? (
          <LogoCuerpo src={logo} priority="high" />
        ) : (
          <span className="text-sm leading-none">{icono}</span>
        )}
      </span>
      <span
        className="absolute -bottom-1 left-1/2 flex h-3.5 min-w-3.5 -translate-x-1/2 items-center justify-center rounded-full border border-white px-0.5 shadow"
        style={{ backgroundColor: colorMarcador }}
        aria-hidden
      >
        <span className="text-[8px] font-bold tabular-nums leading-none text-white">{nro}</span>
      </span>
    </span>
  );

  if (!mostrarParte) {
    return (
      <div
        className={cn(
          "relative cursor-pointer select-none transition-all duration-300",
          seleccionado && resaltado && "scale-110",
          !resaltado && "scale-90 opacity-25 grayscale",
        )}
        title={titulo}
        onClick={manejarClick}
      >
        <div className="flex flex-col items-center">
          <div
            className={cn(
              "rounded-full border-2 bg-background/95 p-0.5 pb-1.5 shadow-lg",
              seleccionado && resaltado && "ring-2 ring-white/90",
            )}
            style={{ borderColor: colorAroLogo }}
          >
            {iconoCuerpo}
          </div>
          {verNombre && <EtiquetaNombre nombre={nombre} />}
          {marcaPrueba}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative cursor-pointer select-none transition-all duration-300",
        seleccionado && resaltado && "scale-110",
        !resaltado && "scale-90 opacity-25 grayscale",
      )}
      title={titulo}
      onClick={manejarClick}
    >
      <div className="flex flex-col items-center">
        <div
          className={cn(
            "flex items-center gap-1 rounded-full border-2 bg-background/95 py-0.5 pl-0.5 pr-2 pb-1.5 shadow-lg",
            seleccionado && resaltado && "ring-2 ring-white/90",
          )}
          style={{ borderColor: colorAroLogo }}
        >
          {iconoCuerpo}
          {resaltado && <ParteNumerico refugiados={refugiados} />}
        </div>
        {verNombre && <EtiquetaNombre nombre={nombre} />}
        {marcaPrueba}
      </div>
    </div>
  );
}
