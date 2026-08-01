import { LogoCuerpo } from "@/components/LogoCuerpo";
import { useMemo } from "react";
import { Building2, Camera, CircleGauge, Home, Navigation, Users } from "lucide-react";
import {
  LOGO_SEBIN,
  metaUnidadSebinCentro,
  normalizarCentro,
  poblacionCentro,
  ubicacionCentro,
  type CentroTransitorio,
} from "@/domain/centrosTransitorios";
import { analisisCentro, COLOR_SEMAFORO } from "@/domain/capacidadCentros";
import { contrasteDesdeProgreso } from "@/domain/censoNominalRed";
import {
  alojamientosActivos,
  contarFamiliasActivas,
  progresoCensoNominal,
} from "@/domain/refugiados";
import { useAlojamientosCentro } from "@/data/useAlojamientosCentro";
import { BarraCensoVsParteMini } from "@/features/censo/ContrasteCensoParte";
import { BarraReporteDiarioMini } from "./BarraReporteDiarioMini";
import { AlertasCriticasMapa } from "./AlertasCriticasMapa";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  centro: CentroTransitorio;
  className?: string;
  /** Indica si el panel DetalleCentro está abierto (estado "presionado" del botón). */
  detalleAbierto?: boolean;
  /** Alternar (abrir/cerrar) el panel de detalle completo del centro. */
  onToggleDetalle?: () => void;
  /** Navegación SPA (popup MapLibre está fuera del Router). */
  onNavegar?: (ruta: string) => void;
}

/**
 * Construye la URL de navegación GPS hacia el centro según el dispositivo.
 *
 * - iOS: Apple Maps (`maps.apple.com`) — iOS no soporta el esquema `geo:`.
 * - Android: esquema `geo:` (abre Google Maps / app de mapas por defecto).
 * - Desktop: Google Maps `https://www.google.com/maps/dir/...`.
 *
 * Devuelve `null` si el centro no tiene coordenadas (`geom`); el botón que la
 * usa se deshabilita en ese caso.
 *
 * Nota: se detecta móvil por `userAgent` (no por `maxTouchPoints`/`ontouchstart`),
 * porque muchos laptops modernos con pantalla táctil reportan `maxTouchPoints >
 * 0` y romperían la detección intentando `geo:` en desktop (donde no se maneja).
 */
function urlNavegacion(centro: CentroTransitorio): string | null {
  if (!centro.geom) return null;
  // GeoJSON.Point = [lng, lat].
  const [lng, lat] = centro.geom.coordinates as [number, number];
  const etiqueta = encodeURIComponent(centro.nombre);
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  if (/iphone|ipad|ipod/i.test(ua)) {
    return `https://maps.apple.com/?daddr=${lat},${lng}&q=${etiqueta}`;
  }
  if (/android/i.test(ua)) {
    return `geo:${lat},${lng}?q=${lat},${lng}(${etiqueta})`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

function fmtKpi(n: number | null): string {
  if (n == null) return "—";
  return n.toLocaleString("es");
}

/** Ficha básica de un centro transitorio: cuerpo asignado, ubicación y estado. */
export function InfoCentro({
  centro,
  className,
  detalleAbierto,
  onToggleDetalle,
  onNavegar,
}: Props) {
  const metaUnidad = metaUnidadSebinCentro(centro);
  const analisis = analisisCentro(centro);
  const centroNormalizado = normalizarCentro(centro);
  const damnificados = poblacionCentro(centroNormalizado);
  const familias = centroNormalizado.familias_ocupadas;
  const cuposDisponibles = analisis.cupoDisponible;
  const colorSemaforo = COLOR_SEMAFORO[analisis.semaforo];
  const tieneCoord = !!centro.geom;
  const url = urlNavegacion(centro);
  const ubicacion = ubicacionCentro(centro);
  const fotoUrl = centroNormalizado.foto_url;
  const { alojamientos, cargando: cargandoCenso } = useAlojamientosCentro({
    centroId: centro.id,
    estado: "activo",
  });
  const progresoCenso = useMemo(() => {
    const activos = alojamientosActivos(alojamientos);
    return progresoCensoNominal(
      { refugiados: damnificados, familias },
      {
        refugiados: activos.length,
        familias: contarFamiliasActivas(activos),
      },
    );
  }, [alojamientos, damnificados, familias]);
  const contrasteCenso = contrasteDesdeProgreso(progresoCenso);
  const kpis = [
    {
      etiqueta: "Capacidad Instalada",
      valor: fmtKpi(analisis.capacidadInstalada),
      icono: <Building2 className="size-3.5 shrink-0 text-primary" />,
      colorValor: undefined as string | undefined,
    },
    {
      etiqueta: "Cupos Disponibles",
      valor:
        cuposDisponibles == null
          ? "—"
          : `${cuposDisponibles > 0 ? "+" : ""}${cuposDisponibles.toLocaleString("es")}`,
      icono: <CircleGauge className="size-3.5 shrink-0 text-primary" />,
      colorValor: cuposDisponibles == null ? undefined : colorSemaforo,
    },
    {
      etiqueta: "Damnificados",
      valor: damnificados.toLocaleString("es"),
      icono: <Users className="size-3.5 shrink-0 text-primary" />,
      colorValor: undefined as string | undefined,
    },
    {
      etiqueta: "Familias",
      valor: familias.toLocaleString("es"),
      icono: <Home className="size-3.5 shrink-0 text-primary" />,
      colorValor: undefined as string | undefined,
    },
  ];

  return (
    <div className={cn("min-w-[240px] max-w-[300px] space-y-2 text-left", className)}>
      <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-stretch gap-2.5">
        <div
          className="relative h-full min-h-[4.5rem] overflow-hidden rounded-lg border border-border bg-muted/20"
          title={fotoUrl ? "Foto del campamento" : "Sin foto del campamento"}
        >
          {fotoUrl ? (
            <img
              src={fotoUrl}
              alt=""
              className="absolute inset-0 size-full object-cover"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div className="flex h-full min-h-[4.5rem] items-center justify-center">
              <Camera className="size-7 text-muted-foreground/45" strokeWidth={1.5} />
            </div>
          )}
        </div>

        <div className="flex min-h-[4.5rem] min-w-0 flex-col justify-between gap-1.5 self-stretch py-0.5">
          <span
            className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 bg-white"
            style={{ borderColor: metaUnidad.color }}
            title={`SEBIN · ${metaUnidad.label}`}
            aria-label={`SEBIN · ${metaUnidad.label}`}
          >
            <LogoCuerpo src={LOGO_SEBIN} priority="high" />
          </span>

          <p className="text-sm font-semibold leading-snug break-words text-foreground">
            {centro.nombre}
          </p>

          {metaUnidad.clave !== "sin_asignar" && (
            <p className="shrink-0 text-[10px] font-medium leading-snug text-foreground/90">
              {metaUnidad.label}
            </p>
          )}

          {centroNormalizado.supervision.supervisor_sebin.trim() ? (
            <p className="shrink-0 text-[10px] leading-snug text-muted-foreground">
              <span className="text-muted-foreground/80">Revista: </span>
              <span className="font-medium text-foreground/90">
                {centroNormalizado.supervision.supervisor_sebin.trim()}
              </span>
            </p>
          ) : null}

          {ubicacion ? (
            <p className="shrink-0 text-[10px] leading-snug break-words text-muted-foreground">
              {ubicacion}
            </p>
          ) : (
            <p className="shrink-0 text-[10px] italic leading-snug text-muted-foreground/70">
              Ubicación no registrada
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5 border-t border-border pt-2">
        {kpis.map((kpi) => (
          <div
            key={kpi.etiqueta}
            className="flex min-w-0 items-center gap-1.5 rounded-lg border border-border/70 bg-muted/25 px-2 py-1.5"
          >
            {kpi.icono}
            <div className="min-w-0 leading-tight">
              <p
                className="text-sm font-semibold tabular-nums text-foreground"
                style={kpi.colorValor ? { color: kpi.colorValor } : undefined}
              >
                {kpi.valor}
              </p>
              <p className="truncate text-[10px] text-muted-foreground">{kpi.etiqueta}</p>
            </div>
          </div>
        ))}
      </div>

      <BarraCensoVsParteMini
        registrados={progresoCenso.registradosRefugiados}
        meta={progresoCenso.metaRefugiados}
        contraste={contrasteCenso}
        cargando={cargandoCenso}
        className="pt-0.5"
      />

      <BarraReporteDiarioMini centroId={centro.id} className="border-t border-border/60 pt-2" />

      <AlertasCriticasMapa centroId={centro.id} onNavegar={onNavegar} />

      <div className="flex gap-2 pt-1">
        <Button asChild variant="outline" size="sm" className="flex-1">
          <a
            href={url ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(ev) => ev.stopPropagation()}
            aria-disabled={!tieneCoord}
            tabIndex={tieneCoord ? undefined : -1}
            title={tieneCoord ? "Abrir navegación" : "Sin coordenadas"}
            className={cn(!tieneCoord && "pointer-events-none opacity-50")}
          >
            <Navigation className="size-3.5" />
            Ir
          </a>
        </Button>
        {onToggleDetalle && (
          <Button
            type="button"
            variant={detalleAbierto ? "default" : "outline"}
            size="sm"
            className="flex-1"
            aria-pressed={detalleAbierto ? true : undefined}
            onClick={(ev) => {
              ev.stopPropagation();
              onToggleDetalle();
            }}
          >
            detalles
          </Button>
        )}
      </div>
    </div>
  );
}
