import { Fragment, useMemo } from "react";
import { Link, matchPath, useSearchParams } from "react-router-dom";
import { useSupabaseQuery } from "@/data/useSupabaseQuery";
import { useSesion } from "@/data/authSupabase";
import { desenvolver, type FilaSync } from "@/data/desenvolver";
import type { CentroTransitorio } from "@/domain/centrosTransitorios";
import { esRolTerreno } from "@/domain/permisos";
import { usePathnameNavegacion } from "@/contexts/PathnameNavegacionContext";
import { migasPanDeRuta, type MigaPan } from "@/layouts/migasPan";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

function esMigaInicioApp(miga: MigaPan): boolean {
  return miga.to === "/centros/mapa" || miga.label === "Inicio";
}

function MigasPanLista({
  migas,
  compacto,
  inicioEsPortal,
}: {
  migas: MigaPan[];
  compacto?: boolean;
  /** Operador del QR: «Inicio» vuelve al portal /terreno, no al mapa. */
  inicioEsPortal?: boolean;
}) {
  if (migas.length === 0) return null;

  const migasVisibles =
    compacto && migas.length > 2 ? migas.slice(-2) : migas;

  return (
    <Breadcrumb>
      <BreadcrumbList className="flex-nowrap text-xs sm:text-sm">
        {migasVisibles.map((miga, i) => {
          const esUltima = i === migasVisibles.length - 1;
          const irPortal = Boolean(inicioEsPortal && esMigaInicioApp(miga) && miga.to);
          return (
            <Fragment key={`${miga.label}-${i}`}>
              {i > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem
                className={cn(
                  "min-w-0",
                  compacto ? "max-w-[7rem] sm:max-w-[14rem]" : "max-w-[9rem] sm:max-w-[14rem]",
                )}
              >
                {esUltima || !miga.to ? (
                  <BreadcrumbPage className="truncate font-medium">
                    {miga.label}
                  </BreadcrumbPage>
                ) : irPortal ? (
                  <BreadcrumbLink asChild>
                    <Link to="/centros/reportes" className="truncate">
                      {miga.label}
                    </Link>
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link to={miga.to} className="truncate">
                      {miga.label}
                    </Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

/** Migas de pan dinámicas según la ruta (optimista mientras carga el chunk). */
export function MigasPanNav() {
  const sesion = useSesion();
  const { pathname, search } = usePathnameNavegacion();
  const [searchParamsLive] = useSearchParams();
  const esMovil = useIsMobile();
  const searchParams = useMemo(() => {
    if (search) {
      return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    }
    return searchParamsLive;
  }, [search, searchParamsLive]);
  const modoReporte = searchParams.get("reportar") === "1";
  const inicioEsPortal = Boolean(sesion && esRolTerreno(sesion.user.rol));

  const matchCentro = matchPath("/centro/:id", pathname);
  const matchReportesCentro = matchPath("/centros/reportes/:centroId", pathname);
  const matchRegistroCentro =
    matchPath("/centros/registro/:centroId", pathname) ??
    matchPath("/centros/censo/:centroId", pathname) ??
    matchPath("/centros/censo-rapido/:centroId", pathname);
  const centroIdRaw =
    matchCentro?.params.id ??
    matchReportesCentro?.params.centroId ??
    matchRegistroCentro?.params.centroId;
  const centroId =
    centroIdRaw === "personas" || centroIdRaw === "verificacion"
      ? undefined
      : centroIdRaw;

  type CentroFila = CentroTransitorio & { deleted: boolean };
  const filasCentros = useSupabaseQuery<CentroFila, FilaSync<CentroTransitorio>>(
    "centros",
    {
      filter: (q) => q.eq("id", centroId ?? "__none__"),
      transform: desenvolver as (raw: FilaSync<CentroTransitorio>) => CentroFila,
      clientFilter: (c) => !c.deleted,
    },
  );

  const centro = useMemo(
    () => (centroId ? filasCentros.find((c) => c.id === centroId) : undefined),
    [filasCentros, centroId],
  );

  const migas = useMemo(() => {
    const base = migasPanDeRuta(pathname, searchParams, centro);
    if (!inicioEsPortal) return base;
    // El operador del QR no usa mapa/tablero: quita migas intermedias que
    // redirigirían a rutas bloqueadas y deja Inicio → campamento → sección.
    return base.filter(
      (m) =>
        m.label !== "Campamentos" &&
        !(m.label === "Partes del día" && Boolean(m.to)),
    );
  }, [pathname, searchParams, centro, inicioEsPortal]);

  return (
    <MigasPanLista
      migas={migas}
      compacto={esMovil && modoReporte}
      inicioEsPortal={inicioEsPortal}
    />
  );
}
