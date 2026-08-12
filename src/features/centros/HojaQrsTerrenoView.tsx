// Hoja imprimible de QRs de denuncias (/qrs-terreno, solo admin/analista_sae):
// una página por campamento con el QR público (carteleras). Cutover §7: el QR
// personal de terreno ya no se genera ni imprime.

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Loader2, Printer } from "lucide-react";
import type { Sesion } from "@/data/authSupabase";
import { listarTokensTerrenoActivos } from "@/data/tokensCentros";
import { useSupabaseQuery } from "@/data/useSupabaseQuery";
import { desenvolver, type FilaSync } from "@/data/desenvolver";
import type { CentroTransitorio } from "@/domain/centrosTransitorios";
import { centrosDeProduccion } from "@/domain/centrosTransitorios";
import { puedeImprimirQrsTerreno } from "@/domain/permisos";
import { Button } from "@/components/ui/button";
import { enlaceDenuncia } from "@/lib/tokenTerreno";

interface Props {
  sesion: Sesion;
}

export function HojaQrsTerrenoView({ sesion }: Props) {
  type CentroFila = CentroTransitorio & { deleted: boolean };
  const filasCentros = useSupabaseQuery<CentroFila, FilaSync<CentroTransitorio>>("centros", {
    transform: desenvolver as (raw: FilaSync<CentroTransitorio>) => CentroFila,
    clientFilter: (c) => !c.deleted,
  });
  const centros = useMemo(
    () =>
      centrosDeProduccion([...filasCentros]).sort(
        (a, b) => (a.nro ?? 0) - (b.nro ?? 0),
      ),
    [filasCentros],
  );

  const [qrs, setQrs] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState("");
  const [generando, setGenerando] = useState(true);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const tokens = await listarTokensTerrenoActivos();
        const mapa = new Map<string, string>();
        for (const t of tokens) {
          if (t.tipo !== "publico") continue;
          const dataUrl = await QRCode.toDataURL(enlaceDenuncia(t.token), {
            width: 512,
            margin: 1,
          });
          if (cancelado) return;
          mapa.set(t.centro_id, dataUrl);
        }
        if (!cancelado) setQrs(mapa);
      } catch (err) {
        if (!cancelado)
          setError(err instanceof Error ? err.message : "No se pudieron cargar los tokens");
      } finally {
        if (!cancelado) setGenerando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  if (!puedeImprimirQrsTerreno(sesion.user)) {
    return (
      <p className="p-6 text-sm text-muted-foreground">
        Esta vista es solo para administración y análisis.
      </p>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .hoja-qrs-imprimible, .hoja-qrs-imprimible * { visibility: visible; }
          .hoja-qrs-imprimible { position: absolute; inset: 0; width: 100%; }
          .hoja-qrs-pagina { page-break-after: always; border: none !important; }
        }
      `}</style>

      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold">Hoja de QRs de denuncias</h1>
          <p className="text-xs text-muted-foreground">
            Una página por campamento con el QR público de denuncias (péguelo en carteleras,
            comedores y baños). El acceso del personal es solo con usuario y contraseña.
          </p>
        </div>
        <Button type="button" onClick={() => window.print()} disabled={generando || centros.length === 0}>
          <Printer className="size-4" />
          Imprimir ({centros.length})
        </Button>
      </div>

      {error && <p className="text-sm text-destructive print:hidden">{error}</p>}
      {generando && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground print:hidden">
          <Loader2 className="size-4 animate-spin" /> Generando códigos…
        </p>
      )}

      <div className="hoja-qrs-imprimible space-y-6 bg-white text-black">
        {centros.map((c) => {
          const qr = qrs.get(c.id);
          if (!qr) return null;
          return (
            <section
              key={c.id}
              className="hoja-qrs-pagina space-y-5 rounded-lg border border-neutral-300 bg-white p-6"
            >
              <header className="space-y-0.5 text-center">
                <p className="text-xs uppercase tracking-widest text-neutral-500">
                  Campamento Transitorio N.º {c.nro}
                </p>
                <h2 className="text-xl font-bold leading-tight">{c.nombre}</h2>
                {c.parroquia && <p className="text-sm text-neutral-600">{c.parroquia}</p>}
              </header>

              <div className="mx-auto max-w-sm space-y-2 rounded-lg border-2 border-neutral-800 p-4 text-center">
                <p className="text-sm font-bold uppercase tracking-wide">
                  Denuncias y sugerencias
                </p>
                <img
                  src={qr}
                  alt={`QR de denuncias de ${c.nombre}`}
                  className="mx-auto w-full max-w-56"
                />
                <p className="text-xs leading-snug text-neutral-600">
                  Para los damnificados: escanee y reporte de forma <strong>anónima</strong>{" "}
                  cualquier problema con la comida, dotaciones, trato o seguridad. Péguelo en
                  carteleras y zonas comunes.
                </p>
              </div>

              <p className="text-center text-[10px] text-neutral-500">
                Red de Campamentos Transitorios — Caracas · {c.id}
              </p>
            </section>
          );
        })}
      </div>
    </div>
  );
}
