import { FileText, Loader2 } from "lucide-react";
import { lazy, Suspense, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  obtenerAlertasVerificacionCenso,
  obtenerDelitosResumen,
  type DelitosResumen,
  type RegistroCensoRed,
  type VerificacionCensoCentro,
} from "@/data/reposCenso";
import type { TotalesVerificacionCenso } from "@/data/useCensoVerificacion";
import type {
  DatosReporteVerificacionCenso,
  PersonaAlertaVerificacion,
} from "./ReporteVerificacionCensoPdf";

const DescargaReporteVerificacionCenso = lazy(() =>
  import("./DescargaReporteVerificacionCenso").then((m) => ({
    default: m.DescargaReporteVerificacionCenso,
  })),
);

function clonarFilas(filas: VerificacionCensoCentro[]): VerificacionCensoCentro[] {
  return filas.map((f) => ({ ...f }));
}

function formatearDocumento(fila: RegistroCensoRed): string {
  if (!fila.documento?.trim()) return "—";
  const prefijo = fila.tipo_doc === "P" ? "PP " : `${fila.tipo_doc ?? "V"}-`;
  return `${prefijo}${fila.documento}`;
}

function nombreCompleto(fila: RegistroCensoRed): string {
  return [fila.primer_nombre, fila.segundo_nombre, fila.primer_apellido, fila.segundo_apellido]
    .filter(Boolean)
    .join(" ");
}

function mapearAlertas(filas: RegistroCensoRed[]): PersonaAlertaVerificacion[] {
  return filas.map((f) => ({
    id: String(f.id),
    centroId: f.centro_id,
    centroNombre: f.centro_nombre,
    nombre: nombreCompleto(f),
    documento: formatearDocumento(f),
    edad: f.edad,
    sexo: f.sexo,
    solicitado: Boolean(f.solicitado),
    registroPolicial: Boolean(f.registro_policial),
    tipoRegistroPolicial: f.tipo_registro_policial?.trim() || "",
    observacionesSeguridad: f.observaciones_seguridad?.trim() || "",
  }));
}

export function BotonReporteVerificacionCenso({
  filas,
  totales,
  cargando,
  generadoPor,
}: {
  filas: VerificacionCensoCentro[];
  totales: TotalesVerificacionCenso;
  cargando?: boolean;
  generadoPor?: string;
}) {
  const [solicitado, setSolicitado] = useState(false);
  const [cargandoAlertas, setCargandoAlertas] = useState(false);
  const [errorAlertas, setErrorAlertas] = useState<string | null>(null);
  const [fechaCorteTs, setFechaCorteTs] = useState(0);
  const [alertas, setAlertas] = useState<PersonaAlertaVerificacion[]>([]);
  const [delitos, setDelitos] = useState<DelitosResumen | null>(null);

  const datos = useMemo<DatosReporteVerificacionCenso>(
    () => ({
      filas: clonarFilas(filas),
      totales: { ...totales },
      alertas,
      delitos,
      fechaCorteTs: fechaCorteTs || Date.now(),
      generadoPor,
    }),
    [filas, totales, alertas, delitos, fechaCorteTs, generadoPor],
  );

  const bloqueado =
    Boolean(cargando) || cargandoAlertas || filas.length === 0;

  async function prepararPdf() {
    setErrorAlertas(null);
    setCargandoAlertas(true);
    setFechaCorteTs(Date.now());
    try {
      const [filasAlerta, resumenDelitos] = await Promise.all([
        obtenerAlertasVerificacionCenso(),
        obtenerDelitosResumen(),
      ]);
      setAlertas(mapearAlertas(filasAlerta));
      setDelitos(resumenDelitos);
      setSolicitado(true);
    } catch (err) {
      setErrorAlertas(
        err instanceof Error ? err.message : "No se pudieron cargar las alertas",
      );
    } finally {
      setCargandoAlertas(false);
    }
  }

  if (!solicitado) {
    return (
      <Button
        type="button"
        size="sm"
        variant="default"
        className="h-8 gap-1.5"
        disabled={bloqueado}
        title={
          errorAlertas
            ? errorAlertas
            : cargando
              ? "Espera a que termine de cargar la verificación"
              : "PDF institucional con fecha de corte y detalle de alertas"
        }
        onClick={() => {
          void prepararPdf();
        }}
      >
        {cargando || cargandoAlertas ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <FileText className="size-3.5" />
        )}
        {cargando
          ? "Cargando datos…"
          : cargandoAlertas
            ? "Cargando alertas…"
            : errorAlertas
              ? "Reintentar PDF"
              : "PDF verificación"}
      </Button>
    );
  }

  if (cargando) {
    return (
      <Button type="button" size="sm" variant="default" className="h-8 gap-1.5" disabled>
        <Loader2 className="size-3.5 animate-spin" />
        Esperando datos…
      </Button>
    );
  }

  return (
    <Suspense
      fallback={
        <Button type="button" size="sm" variant="default" className="h-8 gap-1.5" disabled>
          <Loader2 className="size-3.5 animate-spin" />
          Cargando PDF
        </Button>
      }
    >
      <DescargaReporteVerificacionCenso datos={datos} />
    </Suspense>
  );
}
