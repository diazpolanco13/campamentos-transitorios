// Estado del sistema (/estado): salud de la plataforma vs los servicios
// externos de la institución, con histórico de incidentes (cuándo, por qué y
// cuántos minutos). Acceso: admin, analista_sae y autoridad (la RLS de
// `incidentes_servicios` devuelve vacío al resto). Se actualiza en vivo
// (Realtime) — cuando un servicio cae, la sala lo ve antes de que lleguen las quejas.

import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import {
  Activity,
  CheckCircle2,
  ClipboardCopy,
  Database,
  Globe,
  MonitorSmartphone,
  Server,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import type { Sesion } from "@/data/authSupabase";
import { useIncidentesServicios } from "@/data/useIncidentesServicios";
import { useSupabaseConectado } from "@/data/useSupabaseConectado";
import {
  duracionIncidenteMs,
  formatoDuracion,
  formatoFechaHora,
  formatoHora,
  CATALOGO_SERVICIOS,
  infoServicio,
  parteTelegramIncidente,
  resumenVentanaServicio,
  segmentosContinuidad,
  type IncidenteServicio,
  type InfoServicio,
  type ResumenVentanaServicio,
  type SegmentoContinuidad,
} from "@/domain/estadoServicios";
import { puedeVerEstadoSistema } from "@/domain/permisos";
import { copiarTexto } from "@/lib/portapapeles";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { VistaPagina } from "@/components/VistaPagina";
import { LoadingList } from "@/components/skeletons";
import { cn } from "@/lib/utils";

const DIAS_HISTORIAL = 90;
const DIAS_RESUMEN = 30;
/** Barra de continuidad: 24 h en tramos de 30 min. */
const HORAS_BARRA = 24;
const SEGMENTOS_BARRA = 48;

interface Props {
  sesion: Sesion;
}

function PuntoEstado({ ok }: { ok: boolean }) {
  return (
    <span
      className={cn(
        "inline-block size-2.5 shrink-0 animate-pulse rounded-full",
        ok
          ? "bg-emerald-500 shadow-[0_0_0_3px] shadow-emerald-500/25"
          : "bg-destructive shadow-[0_0_0_3px] shadow-destructive/25",
      )}
      aria-hidden
    />
  );
}

/**
 * Barra de continuidad de las últimas 24 h (estilo status page): un tramo por
 * cada media hora; verde = operativo, ámbar = falla parcial, rojo = caído.
 */
function BarraContinuidad({ segmentos }: { segmentos: SegmentoContinuidad[] }) {
  return (
    <div className="space-y-1">
      <div className="flex h-8 items-stretch gap-px" role="img" aria-label="Continuidad del servicio en las últimas 24 horas">
        {segmentos.map((s, i) => (
          <div
            key={s.desde}
            title={`${formatoHora(s.desde)} – ${formatoHora(s.hasta)} · ${
              s.estado === "ok"
                ? "Operativo"
                : s.estado === "caido"
                  ? "Caído"
                  : `Falla parcial (${formatoDuracion(s.caidoMs)})`
            }`}
            className={cn(
              "min-w-0 flex-1 animate-pulse rounded-[2px] transition-colors",
              s.estado === "ok" && "bg-emerald-500/80 hover:bg-emerald-400",
              s.estado === "parcial" && "bg-amber-500 hover:bg-amber-400",
              s.estado === "caido" && "bg-destructive hover:bg-destructive/80",
            )}
            // Latido escalonado: la onda recorre la barra como un monitor vivo.
            style={{ animationDelay: `${i * 70}ms`, animationDuration: "2.6s" }}
          />
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground/80">
        <span>Hace 24 h</span>
        <span>Ahora</span>
      </div>
    </div>
  );
}

function iconoServicio(id: string) {
  switch (id) {
    case "pwa":
      return MonitorSmartphone;
    case "supabase":
      return Database;
    case "cap":
      return ShieldCheck;
    case "gateway":
      return Server;
    default:
      return Globe;
  }
}

function ExtraDisponibilidad({
  resumen,
}: {
  resumen: ResumenVentanaServicio;
}) {
  return (
    <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 border-t border-border pt-2 text-xs text-muted-foreground">
      <span>
        Disponibilidad {DIAS_RESUMEN} días:{" "}
        <span className="font-medium text-foreground">
          {resumen.uptimePct.toLocaleString("es", {
            maximumFractionDigits: 2,
          })}
          %
        </span>
      </span>
      <span>
        Incidentes:{" "}
        <span className="font-medium text-foreground">{resumen.incidentes}</span>
      </span>
      <span>
        Tiempo caído:{" "}
        <span className="font-medium text-foreground">
          {resumen.caidoMs > 0 ? formatoDuracion(resumen.caidoMs) : "0 min"}
        </span>
      </span>
    </div>
  );
}

function TarjetaServicio({
  icono: Icono,
  nombre,
  descripcion,
  ok,
  estadoTexto,
  segmentos,
  extra,
}: {
  icono: typeof Activity;
  nombre: string;
  descripcion: string;
  ok: boolean;
  estadoTexto: string;
  segmentos: SegmentoContinuidad[];
  extra?: React.ReactNode;
}) {
  return (
    <Card className={cn("py-5", !ok && "border-destructive/40 bg-destructive/5")}>
      <CardContent className="flex flex-col gap-3 px-5">
        <div className="flex items-center gap-2.5">
          <Icono className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {nombre}
          </span>
          <PuntoEstado ok={ok} />
        </div>
        <p className="text-xs leading-snug text-muted-foreground">{descripcion}</p>
        <BarraContinuidad segmentos={segmentos} />
        <p
          className={cn(
            "text-xs font-medium",
            ok ? "text-emerald-600 dark:text-emerald-400" : "text-destructive",
          )}
        >
          {estadoTexto}
        </p>
        {extra}
      </CardContent>
    </Card>
  );
}

function FilaIncidente({
  incidente,
  ahora,
}: {
  incidente: IncidenteServicio;
  ahora: number;
}) {
  const [copiado, setCopiado] = useState(false);
  const info = infoServicio(incidente.servicio);
  const enCurso = incidente.estado === "abierto";
  const dur = formatoDuracion(duracionIncidenteMs(incidente, ahora));

  async function copiarParte() {
    const ok = await copiarTexto(parteTelegramIncidente(incidente, ahora));
    if (!ok) return;
    setCopiado(true);
    window.setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border px-3 py-2.5",
        enCurso ? "border-destructive/40 bg-destructive/5" : "border-border",
      )}
    >
      {enCurso ? (
        <TriangleAlert className="size-4 shrink-0 text-destructive" aria-hidden />
      ) : (
        <CheckCircle2
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-snug">
          {incidente.causa ?? `Falla de ${info.nombre}`}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatoFechaHora(incidente.inicio_ts)}
          {incidente.fin_ts ? ` → ${formatoFechaHora(incidente.fin_ts)}` : ""}
          {" · "}
          <Badge
            variant="outline"
            className={cn(
              "px-1.5 py-0 align-middle text-[11px]",
              incidente.tipo === "externo"
                ? "border-amber-600/40 text-amber-600 dark:text-amber-400"
                : "border-sky-600/40 text-sky-600 dark:text-sky-400",
            )}
          >
            {incidente.tipo === "externo" ? "Servicio externo" : "Plataforma"}
          </Badge>
        </p>
      </div>
      <Badge
        variant={enCurso ? "destructive" : "secondary"}
        className={cn(enCurso && "animate-pulse")}
      >
        {enCurso ? `En curso · ${dur}` : dur}
      </Badge>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 px-2 text-xs"
        onClick={() => void copiarParte()}
      >
        <ClipboardCopy className="size-3.5" aria-hidden />
        {copiado ? "Copiado" : "Copiar parte"}
      </Button>
    </li>
  );
}

export function EstadoSistemaView({ sesion }: Props) {
  const puedeVer = puedeVerEstadoSistema(sesion.user.rol);
  const { datos: incidentes, cargando } = useIncidentesServicios(DIAS_HISTORIAL);
  const conectado = useSupabaseConectado();
  const [ahora, setAhora] = useState(() => Date.now());

  // Duraciones "en curso" y uptime avanzan solos, minuto a minuto.
  useEffect(() => {
    const id = window.setInterval(() => setAhora(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const abiertosPorServicio = useMemo(() => {
    const mapa = new Map<string, IncidenteServicio>();
    for (const inc of incidentes) {
      if (inc.estado === "abierto" && !mapa.has(inc.servicio)) {
        mapa.set(inc.servicio, inc);
      }
    }
    return mapa;
  }, [incidentes]);

  const barraDe = useMemo(() => {
    const cache = new Map<string, ReturnType<typeof segmentosContinuidad>>();
    return (servicio: string) => {
      let seg = cache.get(servicio);
      if (!seg) {
        seg = segmentosContinuidad(
          incidentes,
          servicio,
          HORAS_BARRA,
          SEGMENTOS_BARRA,
          ahora,
        );
        cache.set(servicio, seg);
      }
      return seg;
    };
  }, [incidentes, ahora]);

  function textoEstado(
    info: InfoServicio,
    abierto: IncidenteServicio | undefined,
  ): string {
    if (abierto) {
      return `Caído desde ${formatoFechaHora(abierto.inicio_ts)} (${formatoDuracion(
        duracionIncidenteMs(abierto, ahora),
      )}). ${abierto.causa ?? ""}`;
    }
    if (info.id === "supabase" && !conectado) {
      return "Reconectando… (sin conexión en vivo en este dispositivo)";
    }
    return "Operativo — el vigilante lo verifica cada 3 minutos por HTTPS.";
  }

  function tarjetaDe(info: InfoServicio) {
    const abierto = abiertosPorServicio.get(info.id);
    const ok = info.id === "supabase" ? !abierto && conectado : !abierto;
    return (
      <TarjetaServicio
        key={info.id}
        icono={iconoServicio(info.id)}
        nombre={info.nombre}
        descripcion={info.descripcion}
        ok={ok}
        estadoTexto={textoEstado(info, abierto)}
        segmentos={barraDe(info.id)}
        extra={
          <ExtraDisponibilidad
            resumen={resumenVentanaServicio(
              incidentes,
              info.id,
              DIAS_RESUMEN,
              ahora,
            )}
          />
        }
      />
    );
  }

  if (!puedeVer) return <Navigate to="/" replace />;

  return (
    <VistaPagina
      icono={Activity}
      titulo="Estado del sistema"
      descripcion="Salud de la plataforma y de los servicios externos: qué falló, cuándo y cuánto duró."
      cuerpoClassName="p-4 lg:p-6"
    >
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-7">
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Nuestra plataforma
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {CATALOGO_SERVICIOS.filter((s) => s.tipo === "plataforma").map(
              tarjetaDe,
            )}
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Servicios externos (institución)
          </h2>
          {CATALOGO_SERVICIOS.filter((s) => s.tipo === "externo").map(tarjetaDe)}
        </section>

        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Historial de incidentes ({DIAS_HISTORIAL} días)
          </h2>
          {cargando ? (
            <LoadingList count={4} />
          ) : incidentes.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
              <CheckCircle2
                className="mx-auto mb-2 size-6 text-emerald-500"
                aria-hidden
              />
              <p className="text-sm font-medium">Sin incidentes registrados</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Ningún servicio monitoreado ha fallado en los últimos{" "}
                {DIAS_HISTORIAL} días.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {incidentes.map((inc) => (
                <FilaIncidente key={inc.id} incidente={inc} ahora={ahora} />
              ))}
            </ul>
          )}
          <p className="text-xs leading-snug text-muted-foreground">
            El vigilante del VPS (systemd, no Dokploy) sondea cada 3 minutos el
            HTTPS público de PWA, Supabase, Cap, gateway/fotos y el API
            institucional Nexus. Avisa por Telegram y escribe aquí en cada
            transición. "Copiar parte" genera el descargo para el grupo de
            enlaces.
          </p>
        </section>
      </div>
    </VistaPagina>
  );
}
