// Trabajo de terreno dentro del AppShell (`/campo/:tarea`).
//
// El operador con credencial propia trabaja en el AppShell: menú lateral y
// rutas SPA /campo/*. Reusa paneles de geolocalización, autoridades y
// capacidad. Cutover §7: sin portal QR.

import { useMemo, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { BedDouble, Landmark, MapPinned } from "lucide-react";
import type { Sesion } from "@/data/authSupabase";
import { useSupabaseQuery } from "@/data/useSupabaseQuery";
import { desenvolver, type FilaSync } from "@/data/desenvolver";
import type { CentroTransitorio } from "@/domain/centrosTransitorios";
import { tokenTerrenoActual } from "@/lib/tokenTerreno";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VistaPagina } from "@/components/VistaPagina";
import { EstadoVacio } from "@/components/skeletons";
import { etiquetaCentro } from "@/features/usuarios/TarjetaUsuario";
import { AutoridadesTerrenoPanel } from "./AutoridadesTerrenoPanel";
import { CapacidadTerrenoPanel } from "./CapacidadTerrenoPanel";
import { GeolocalizacionCentroPanel } from "./GeolocalizacionCentroPanel";

const TAREAS = {
  geolocalizar: {
    titulo: "Geolocalizar",
    icono: MapPinned,
    descripcion: "Ubique el campamento con el GPS del teléfono o el mapa",
    ancho: "max-w-3xl",
  },
  autoridades: {
    titulo: "Autoridades",
    icono: Landmark,
    descripcion: "Directorio de coordinación del campamento",
    ancho: "max-w-4xl",
  },
  capacidad: {
    titulo: "Capacidad",
    icono: BedDouble,
    descripcion: "Aforo y recursos Esfera del campamento",
    ancho: "max-w-4xl",
  },
} as const;

type Tarea = keyof typeof TAREAS;

export function CampoTareaView({ sesion }: { sesion: Sesion }) {
  const { tarea } = useParams<{ tarea: string }>();
  const info = TAREAS[tarea as Tarea] as (typeof TAREAS)[Tarea] | undefined;
  const asignados = useMemo(
    () => sesion.user.centros_asignados ?? [],
    [sesion.user.centros_asignados],
  );
  const [centroSel, setCentroSel] = useState<string>("");

  type CentroFila = CentroTransitorio & { deleted: boolean };
  const filasCentros = useSupabaseQuery<CentroFila, FilaSync<CentroTransitorio>>(
    "centros",
    {
      transform: desenvolver as (raw: FilaSync<CentroTransitorio>) => CentroFila,
      clientFilter: (c) => !c.deleted,
    },
  );
  const centros = useMemo(
    () =>
      filasCentros
        .filter((c) => asignados.includes(c.id))
        .sort((a, b) => (a.nro ?? 0) - (b.nro ?? 0)),
    [filasCentros, asignados],
  );

  if (!info) return <Navigate to="/centros/reportes" replace />;

  const centro = centros.find((c) => c.id === centroSel) ?? centros[0];
  // Con sesión por QR el token sigue disponible y los paneles lo usan para
  // re-asegurar la sesión; con login por contraseña va vacío y basta la sesión.
  const token = tokenTerrenoActual();

  return (
    <VistaPagina
      icono={info.icono}
      titulo={info.titulo}
      descripcion={info.descripcion}
      acciones={
        centros.length > 1 ? (
          <Select value={centro?.id ?? ""} onValueChange={setCentroSel}>
            <SelectTrigger className="w-56" aria-label="Campamento">
              <SelectValue placeholder="Campamento…" />
            </SelectTrigger>
            <SelectContent>
              {centros.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {etiquetaCentro(c, c.id)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : undefined
      }
      cuerpoClassName="p-4 lg:p-6"
    >
      {!centro ? (
        <EstadoVacio
          titulo="Sin campamento asignado"
          descripcion="Su cuenta no tiene campamentos asignados. Contacte a su supervisor."
        />
      ) : (
        <div className={`mx-auto w-full ${info.ancho}`} key={`${tarea}-${centro.id}`}>
          {tarea === "geolocalizar" ? (
            <GeolocalizacionCentroPanel
              centroId={centro.id}
              centroNombre={centro.nombre}
              token={token}
              onGuardado={() => {}}
            />
          ) : tarea === "autoridades" ? (
            <AutoridadesTerrenoPanel
              centroId={centro.id}
              centroNombre={centro.nombre}
              token={token}
            />
          ) : (
            <CapacidadTerrenoPanel
              centroId={centro.id}
              centroNombre={centro.nombre}
              token={token}
            />
          )}
        </div>
      )}
    </VistaPagina>
  );
}
