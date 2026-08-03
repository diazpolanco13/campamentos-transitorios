import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { SelectoresGeo } from "@/components/SelectoresGeo";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  normalizarUbicacionCentro,
  type UbicacionAdministrativa,
} from "@/domain/catalogosHumanitarios";
import type { CentroTransitorio } from "@/domain/centrosTransitorios";
import { MapaGeolocalizacionCentro } from "@/features/terreno/MapaGeolocalizacionCentro";

/** Ubicación administrativa + dirección, Maps y coordenadas del mapa. */
export interface UbicacionCentroEdit extends UbicacionAdministrativa {
  direccion: string;
  mapsUrl: string;
  geom: GeoJSON.Point | null;
}

interface Props {
  abierto: boolean;
  centro: CentroTransitorio;
  guardando?: boolean;
  error?: string | null;
  onCerrar: () => void;
  onGuardar: (ubicacion: UbicacionCentroEdit) => void;
}

function mismaGeom(a: GeoJSON.Point | null, b: GeoJSON.Point | null): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return (
    a.coordinates[0] === b.coordinates[0] && a.coordinates[1] === b.coordinates[1]
  );
}

function estadoInicial(centro: CentroTransitorio): UbicacionCentroEdit {
  return {
    ...normalizarUbicacionCentro(centro),
    direccion: (centro.direccion ?? "").trim(),
    mapsUrl: (centro.mapsUrl ?? "").trim(),
    geom: centro.geom ?? null,
  };
}

/** Diálogo para corregir ubicación administrativa, dirección, Maps y coordenadas. */
export function DialogoEdicionUbicacionCentro({
  abierto,
  centro,
  guardando = false,
  error = null,
  onCerrar,
  onGuardar,
}: Props) {
  const [ubicacion, setUbicacion] = useState<UbicacionCentroEdit>(() =>
    estadoInicial(centro),
  );

  useEffect(() => {
    if (!abierto) return;
    setUbicacion(estadoInicial(centro));
  }, [
    abierto,
    centro.id,
    centro.estado_federativo,
    centro.municipio,
    centro.parroquia,
    centro.direccion,
    centro.mapsUrl,
    centro.geom,
  ]);

  const inicial = estadoInicial(centro);
  const sinCambios =
    ubicacion.estado_federativo === inicial.estado_federativo &&
    ubicacion.municipio === inicial.municipio &&
    ubicacion.parroquia === inicial.parroquia &&
    ubicacion.direccion.trim() === inicial.direccion &&
    ubicacion.mapsUrl.trim() === inicial.mapsUrl &&
    mismaGeom(ubicacion.geom, inicial.geom);
  const incompleto =
    !ubicacion.estado_federativo.trim() ||
    !ubicacion.municipio.trim() ||
    !ubicacion.parroquia.trim();

  function confirmar() {
    if (incompleto || guardando || sinCambios) return;
    onGuardar({
      ...normalizarUbicacionCentro(ubicacion),
      direccion: ubicacion.direccion.trim(),
      mapsUrl: ubicacion.mapsUrl.trim(),
      geom: ubicacion.geom,
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={(open) => !open && !guardando && onCerrar()}>
      <DialogContent className="flex max-h-[min(92vh,44rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b border-border px-4 py-3 sm:px-6">
          <DialogTitle className="text-base">Editar ubicación</DialogTitle>
          <DialogDescription className="text-xs">
            {centro.nro != null ? `N.° ${centro.nro} · ` : ""}
            Parroquia, dirección, enlace de Maps y pin en el mapa.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
          <div>
            <Label className="mb-1.5 block">Ubicación administrativa</Label>
            <SelectoresGeo
              pais="Venezuela"
              estado={ubicacion.estado_federativo}
              municipio={ubicacion.municipio}
              parroquia={ubicacion.parroquia}
              onPaisChange={() => {}}
              onEstadoChange={(estado_federativo) =>
                setUbicacion((prev) => ({ ...prev, estado_federativo }))
              }
              onMunicipioChange={(municipio) =>
                setUbicacion((prev) => ({ ...prev, municipio }))
              }
              onParroquiaChange={(parroquia) =>
                setUbicacion((prev) => ({ ...prev, parroquia }))
              }
              disabled={guardando}
              mostrarPais={false}
              paisBloqueado
              soloEstadosMetropolitanos
            />
            {incompleto && (
              <p className="mt-1.5 text-[11px] text-destructive">
                Completa estado, municipio y parroquia.
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="ubi-direccion">Dirección</Label>
            <Textarea
              id="ubi-direccion"
              className="mt-1.5"
              rows={2}
              value={ubicacion.direccion}
              disabled={guardando}
              onChange={(e) =>
                setUbicacion((prev) => ({ ...prev, direccion: e.target.value }))
              }
              placeholder="Av. Intercomunal de El Valle, Caracas…"
            />
          </div>

          <div>
            <Label htmlFor="ubi-maps">Enlace de Google Maps (opcional)</Label>
            <Input
              id="ubi-maps"
              className="mt-1.5"
              type="url"
              value={ubicacion.mapsUrl}
              disabled={guardando}
              onChange={(e) =>
                setUbicacion((prev) => ({ ...prev, mapsUrl: e.target.value }))
              }
              placeholder="https://maps.app.goo.gl/…"
            />
          </div>

          <div>
            <Label className="mb-1.5 block">Ubicación en el mapa</Label>
            <p className="mb-2 text-xs text-muted-foreground">
              Sin coordenadas el campamento no aparece en el mapa de la red.
            </p>
            {abierto && (
              <MapaGeolocalizacionCentro
                altura="h-56 min-h-[14rem] sm:h-64"
                lat={ubicacion.geom?.coordinates[1] ?? null}
                lng={ubicacion.geom?.coordinates[0] ?? null}
                onChange={(lat, lng) =>
                  setUbicacion((prev) => ({
                    ...prev,
                    geom: { type: "Point", coordinates: [lng, lat] },
                  }))
                }
              />
            )}
          </div>

          {error && <p className="text-[11px] text-destructive">{error}</p>}
        </div>

        <DialogFooter className="shrink-0 border-t border-border px-4 py-3 sm:px-6">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={guardando}
            onClick={onCerrar}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            className="bg-teal-600 hover:bg-teal-500"
            disabled={guardando || incompleto || sinCambios}
            onClick={confirmar}
          >
            {guardando ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Guardando…
              </>
            ) : (
              "Guardar"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
