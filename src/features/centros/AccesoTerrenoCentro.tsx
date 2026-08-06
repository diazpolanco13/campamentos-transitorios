// Acceso de terreno del campamento: enlace con token secreto + QR para el
// personal que trabaja dentro del campamento (abre /terreno ya autorizado para
// ESTE campamento, sin usuario). Solo la ven admin/analista_sae: la RLS de
// `tokens_centros` oculta el token al resto de roles y la sección no se pinta.
// El QR se genera en el navegador (lib `qrcode`), sin servicios externos.

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Check, Download, Link2, QrCode as QrCodeIcon, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { telefonoInternacional } from "@/lib/contacto";
import { copiarTexto } from "@/lib/portapapeles";
import { enlaceTerreno } from "@/lib/tokenTerreno";
import { obtenerTokenActivoCentro } from "@/data/tokensCentros";
import {
  etiquetaAnalistaSae,
  useAnalistasSae,
  type AnalistaSae,
} from "@/data/useAnalistasSae";
import {
  metaCuerpoDe,
  metaUnidadSebinCentro,
  normalizarSupervision,
  ubicacionCentro,
  type CentroTransitorio,
} from "@/domain/centrosTransitorios";

type FeedbackCopia = "telegram" | "enlace" | null;

/** Teléfono Telegram en formato internacional (+58…). */
function telegramParaPortapapeles(raw: string | null | undefined): string | null {
  const limpio = raw?.trim();
  if (!limpio) return null;
  const intl = telefonoInternacional(limpio);
  return intl ? `+${intl}` : limpio;
}

/**
 * Texto listo para pegar en Telegram (negritas con **etiqueta**):
 * CAMPAMENTO, UBICACIÓN, GPS, RESPONSABLES y enlace de la plataforma.
 */
function textoPortapapelesTerreno(
  centro: CentroTransitorio,
  enlace: string,
  analistasSae: AnalistaSae[],
): string {
  const nombre =
    centro.nro != null ? `N.° ${centro.nro} · ${centro.nombre}` : centro.nombre;
  const ubicacion = ubicacionCentro(centro);
  const gps = (centro.mapsUrl ?? "").trim();
  const supervision = normalizarSupervision(centro.supervision);
  const cuerpo = metaCuerpoDe(centro.cuerpo);
  const unidad = metaUnidadSebinCentro(centro);

  const lineas: string[] = [`**CAMPAMENTO:** ${nombre}`];
  if (ubicacion) lineas.push(`**UBICACIÓN:** ${ubicacion}`);
  if (gps) lineas.push(`**GPS:** ${gps}`);

  lineas.push("**RESPONSABLES:**");
  if (cuerpo.clave !== "sin_asignar") {
    lineas.push(`**Cuerpo:** ${cuerpo.label}`);
  }
  if (unidad.clave !== "sin_asignar") {
    lineas.push(`**Unidad:** ${unidad.label}`);
  }

  const ids = supervision.analistas_sae;
  if (ids.length > 0) {
    const porId = new Map(analistasSae.map((a) => [a.user_id, a]));
    lineas.push("**Analistas:**");
    for (const id of ids) {
      const analista = porId.get(id);
      const etiqueta = analista
        ? etiquetaAnalistaSae(analista)
        : "Analista sin perfil";
      const telefono = telegramParaPortapapeles(analista?.telegram);
      lineas.push(
        telefono ? `· ${etiqueta} — ${telefono}` : `· ${etiqueta} — sin Telegram`,
      );
    }
  }

  lineas.push("**PLATAFORMA DE GESTIÓN DE CAMPAMENTOS DE LA SAE:**");
  lineas.push(enlace);
  return lineas.join("\n");
}

export function AccesoTerrenoCentro({ centro }: { centro: CentroTransitorio }) {
  const analistasSae = useAnalistasSae();
  const [enlace, setEnlace] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [copiado, setCopiado] = useState<FeedbackCopia>(null);

  const textoTelegram = useMemo(
    () => (enlace ? textoPortapapelesTerreno(centro, enlace, analistasSae) : ""),
    [analistasSae, centro, enlace],
  );

  useEffect(() => {
    let cancelado = false;
    setEnlace("");
    setQrDataUrl("");
    obtenerTokenActivoCentro(centro.id, "personal")
      .then(async (token) => {
        if (cancelado || !token) return;
        const url = enlaceTerreno(token);
        // 512px de ancho: nítido tanto en pantalla como impreso en una hoja.
        const dataUrl = await QRCode.toDataURL(url, { width: 512, margin: 1 });
        if (cancelado) return;
        setEnlace(url);
        setQrDataUrl(dataUrl);
      })
      .catch(() => {
        // Rol sin acceso a tokens (o error puntual): la sección no se muestra.
      });
    return () => {
      cancelado = true;
    };
  }, [centro.id]);

  if (!enlace) return null;

  async function marcarCopiado(cual: Exclude<FeedbackCopia, null>) {
    setCopiado(cual);
    window.setTimeout(() => setCopiado(null), 2000);
  }

  async function copiarParaTelegram() {
    if (!textoTelegram) return;
    if (await copiarTexto(textoTelegram)) await marcarCopiado("telegram");
  }

  async function copiarSoloEnlace() {
    if (await copiarTexto(enlace)) await marcarCopiado("enlace");
  }

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <QrCodeIcon className="size-3.5" aria-hidden="true" />
        Acceso de terreno
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {qrDataUrl && (
          <img
            src={qrDataUrl}
            alt={`QR de acceso de terreno de ${centro.nombre}`}
            className="size-28 shrink-0 rounded-md border bg-white p-1"
          />
        )}
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-xs leading-snug text-muted-foreground">
            Abre el portal de terreno (censo y reporte) autorizado solo para este campamento.
            Repártalo únicamente al personal del centro: quien tenga el enlace puede registrar y
            consultar su censo.
          </p>
          <p className="truncate rounded-md border bg-muted/40 px-2 py-1 font-mono text-[11px] text-muted-foreground">
            {enlace}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="default"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={copiarParaTelegram}
            >
              {copiado === "telegram" ? (
                <Check className="size-3.5" />
              ) : (
                <Send className="size-3.5" />
              )}
              {copiado === "telegram" ? "Copiado" : "Copiar para telegram"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={copiarSoloEnlace}
            >
              {copiado === "enlace" ? (
                <Check className="size-3.5" />
              ) : (
                <Link2 className="size-3.5" />
              )}
              {copiado === "enlace" ? "Copiado" : "Copiar enlace"}
            </Button>
            <Button asChild variant="secondary" size="sm" className="h-8 gap-1.5 text-xs">
              <a href={qrDataUrl} download={`qr-terreno-${centro.id}.png`}>
                <Download className="size-3.5" />
                Descargar QR
              </a>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
