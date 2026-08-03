import { Link } from "react-router-dom";
import {
  Activity,
  ClipboardList,
  ContactRound,
  Home,
  IdCard,
  Landmark,
  LayoutGrid,
  MapPinned,
  MonitorPlay,
  Network,
  ScrollText,
  Settings,
  Shield,
  Siren,
  Trash2,
  Truck,
  UserRound,
  Users,
} from "lucide-react";
import type { Sesion } from "@/data/authSupabase";
import {
  puedeEditarCuentaPropia,
  puedeGestionarCatalogosOperativos,
  puedeGestionarOperadores,
  puedeGestionarUsuarios,
  puedeVerCensoRapidoRed,
  puedeVerEstadoSistema,
  puedeVerLogs,
  puedeVerPapeleraDenuncias,
  puedeVerPoblacionRed,
  puedeVerTraslados,
  esRolCensoRapido,
  esRolTerreno,
} from "@/domain/permisos";
import { useCasosSaludCentros } from "@/data/useCasosSaludCentros";
import { useIncidentesAbiertos } from "@/data/useIncidentesServicios";
import { totalCasosSaludActivosRed } from "@/domain/seguimientoReportes";
import { usePathnameNavegacion } from "@/contexts/PathnameNavegacionContext";
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { centroIdDePathname } from "@/features/centros/seccionesFichaCentro";
import { irAlPortalTerreno, tokenTerrenoActual } from "@/lib/tokenTerreno";
import { cn } from "@/lib/utils";

interface Props {
  sesion: Sesion;
}

type IconoMenu = typeof Siren;

function rutaActiva(pathname: string, ruta: string): boolean {
  if (ruta === "/") return pathname === ruta;
  return pathname === ruta || pathname.startsWith(`${ruta}/`);
}

function TextoMenu({ children }: { children: string }) {
  return <span className="group-data-[collapsible=icon]:hidden">{children}</span>;
}

function ItemMenu({
  to,
  icono: Icono,
  label,
  activo,
  badge,
  badgeClassName,
}: {
  to: string;
  icono: IconoMenu;
  label: string;
  activo: boolean;
  badge?: number;
  badgeClassName?: string;
}) {
  const { marcarNavegacion } = usePathnameNavegacion();
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={activo} tooltip={label}>
        <Link to={to} onClick={() => marcarNavegacion(to)}>
          <Icono />
          <TextoMenu>{label}</TextoMenu>
        </Link>
      </SidebarMenuButton>
      {badge != null && badge > 0 && (
        <SidebarMenuBadge className={badgeClassName}>{badge}</SidebarMenuBadge>
      )}
    </SidebarMenuItem>
  );
}

/** Ítem que sale del AppShell hacia el bootstrap ligero (/terreno, /censo). */
function ItemMenuPortal({
  icono: Icono,
  label,
  activo = false,
  onClick,
}: {
  icono: IconoMenu;
  label: string;
  activo?: boolean;
  onClick: () => void;
}) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        type="button"
        isActive={activo}
        tooltip={label}
        className="cursor-pointer"
        onClick={onClick}
      >
        <Icono />
        <TextoMenu>{label}</TextoMenu>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function ItemPreferenciasCuenta({
  pathname,
  visible,
}: {
  pathname: string;
  visible: boolean;
}) {
  if (!visible) return null;
  return (
    <ItemMenu
      to="/config/perfil"
      icono={Settings}
      label="Preferencias de cuenta"
      activo={rutaActiva(pathname, "/config/perfil")}
    />
  );
}

/** Menú reducido del operador del QR: mismas tareas del portal /terreno. */
function NavTerreno({ sesion }: Props) {
  const { pathname } = usePathnameNavegacion();
  const centroId =
    centroIdDePathname(pathname) ?? sesion.user.centros_asignados[0] ?? "";
  const rutaReporte = centroId
    ? `/centros/reportes/${encodeURIComponent(centroId)}?vista=reporte`
    : "/centros/reportes";
  const enReporte = rutaActiva(pathname, "/centros/reportes");
  const vePreferencias = puedeEditarCuentaPropia(sesion.user);
  // El portal /terreno solo tiene sentido con el token del QR a mano; el
  // operador con credencial propia trabaja en las vistas SPA /campo/*.
  const tokenQr = tokenTerrenoActual();

  function irCenso() {
    const params = new URLSearchParams();
    if (centroId) params.set("centro", centroId);
    if (tokenQr) params.set("t", tokenQr);
    const q = params.toString();
    window.location.assign(q ? `/registro?${q}` : "/registro");
  }

  return (
    <>
      <SidebarGroup>
        <SidebarGroupLabel>Trabajo en terreno</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {tokenQr && (
              <ItemMenuPortal
                icono={Home}
                label="Inicio"
                onClick={() => irAlPortalTerreno()}
              />
            )}
            <ItemMenu
              to={rutaReporte}
              icono={ClipboardList}
              label="Reporte"
              activo={enReporte}
            />
            <ItemMenu
              to="/campo/geolocalizar"
              icono={MapPinned}
              label="Geolocalizar"
              activo={pathname === "/campo/geolocalizar"}
            />
            <ItemMenu
              to="/campo/autoridades"
              icono={Landmark}
              label="Autoridades"
              activo={pathname === "/campo/autoridades"}
            />
            {/* Capacidad no va en el menú: ya vive en la pestaña
                Infraestructura de la ficha (con su botón de edición); la ruta
                /campo/capacidad sigue existiendo para el portal y deep links. */}
            <ItemMenuPortal icono={Users} label="Registro" onClick={irCenso} />
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      {vePreferencias && (
        <SidebarGroup>
          <SidebarGroupLabel>Cuenta</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <ItemPreferenciasCuenta pathname={pathname} visible />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      )}
    </>
  );
}

function NavContenido({ sesion }: Props) {
  const { pathname } = usePathnameNavegacion();
  const esCensoRapido = esRolCensoRapido(sesion.user.rol);
  const esTerreno = esRolTerreno(sesion.user.rol);
  const esAdmin = puedeGestionarUsuarios(sesion.user.rol);
  // Bandeja de operadores de terreno: admin/analista gestionan; supervisor ve
  // los de sus campamentos (solo lectura, plan migración operadores §4.3).
  const veBandejaTerreno = puedeGestionarOperadores(sesion.user.rol);
  const gestionaCatalogos = puedeGestionarCatalogosOperativos(sesion.user.rol);
  const veLogs = puedeVerLogs(sesion.user.rol);
  const veEstadoSistema = puedeVerEstadoSistema(sesion.user.rol);
  const vePreferencias = puedeEditarCuentaPropia(sesion.user);
  const vePapeleraDenuncias = puedeVerPapeleraDenuncias(sesion.user.rol);
  const veCensoRed = puedeVerCensoRapidoRed(sesion.user.rol);
  const vePoblacionRed = puedeVerPoblacionRed(sesion.user.rol);
  const veTraslados = puedeVerTraslados(sesion.user.rol);
  const { casos: casosSalud } = useCasosSaludCentros({ soloActivos: true });
  const abiertas = esCensoRapido ? 0 : totalCasosSaludActivosRed(casosSalud);
  const urgentes = esCensoRapido
    ? 0
    : casosSalud.filter((c) => c.estatus === "activo").length;

  if (esTerreno) {
    return <NavTerreno sesion={sesion} />;
  }

  if (esCensoRapido) {
    return (
      <>
        <SidebarGroup>
          <SidebarGroupLabel>Campamentos transitorios</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <ItemMenu
                to="/centros/mapa"
                icono={MapPinned}
                label="Mapa"
                activo={pathname === "/" || rutaActiva(pathname, "/centros/mapa")}
              />
              <ItemMenu
                to="/centros/registro"
                icono={ContactRound}
                label="Registro (red)"
                activo={rutaActiva(pathname, "/centros/registro")}
              />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {vePreferencias && (
          <SidebarGroup>
            <SidebarGroupLabel>Cuenta</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <ItemPreferenciasCuenta pathname={pathname} visible />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </>
    );
  }

  const esSeccionCampamentos =
    rutaActiva(pathname, "/centros/tablero") ||
    rutaActiva(pathname, "/centros/refugiados") ||
    pathname === "/centro/nuevo";

  return (
    <>
      <SidebarGroup>
        <SidebarGroupLabel>Sala situacional</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <ItemMenu
              to="/dashboard"
              icono={MonitorPlay}
              label="Pantalla"
              activo={rutaActiva(pathname, "/dashboard")}
            />
            <ItemMenu
              to="/brain"
              icono={Network}
              label="Brain SEBIN"
              activo={rutaActiva(pathname, "/brain")}
            />
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarSeparator />

      <SidebarGroup>
        <SidebarGroupLabel>Campamentos transitorios</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <ItemMenu
              to="/centros/mapa"
              icono={MapPinned}
              label="Mapa"
              activo={pathname === "/" || rutaActiva(pathname, "/centros/mapa")}
            />
            <ItemMenu
              to="/centros/tablero"
              icono={LayoutGrid}
              label="Campamentos"
              activo={esSeccionCampamentos}
            />
            <ItemMenu
              to="/centros/reportes"
              icono={ClipboardList}
              label="Partes del día"
              activo={rutaActiva(pathname, "/centros/reportes")}
            />
            {veCensoRed && (
              <ItemMenu
                to="/centros/registro"
                icono={ContactRound}
                label="Registro (red)"
                activo={rutaActiva(pathname, "/centros/registro")}
              />
            )}
            {vePoblacionRed && (
              <ItemMenu
                to="/centros/refugiados"
                icono={Users}
                label="Población (red)"
                activo={rutaActiva(pathname, "/centros/refugiados")}
              />
            )}
            {veTraslados && (
              <ItemMenu
                to="/centros/traslados"
                icono={Truck}
                label="Traslados entre campamentos"
                activo={rutaActiva(pathname, "/centros/traslados")}
              />
            )}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarGroup>
        <SidebarGroupLabel>Incidencias</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <ItemMenu
              to="/incidencias/funcionarios"
              icono={Siren}
              label="Bandeja funcionarios"
              activo={rutaActiva(pathname, "/incidencias/funcionarios")}
              badge={abiertas}
              badgeClassName={cn(urgentes > 0 && "bg-red-500/20 text-red-400")}
            />
            <ItemMenu
              to="/incidencias/refugiados"
              icono={UserRound}
              label="Bandeja damnificados"
              activo={rutaActiva(pathname, "/incidencias/refugiados")}
            />
            {vePapeleraDenuncias && (
              <ItemMenu
                to="/incidencias/eliminadas"
                icono={Trash2}
                label="Denuncias eliminadas"
                activo={rutaActiva(pathname, "/incidencias/eliminadas")}
              />
            )}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      {(esAdmin || veBandejaTerreno || gestionaCatalogos || veLogs || veEstadoSistema || vePreferencias) && (
        <SidebarGroup>
          <SidebarGroupLabel>Configuración</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {veBandejaTerreno && (
                <ItemMenu
                  to="/usuarios"
                  icono={Users}
                  label={esAdmin ? "Gestión de usuarios" : "Mis operadores"}
                  activo={rutaActiva(pathname, "/usuarios") && pathname !== "/usuarios/terreno"}
                />
              )}
              {veBandejaTerreno && (
                <ItemMenu
                  to="/usuarios/terreno"
                  icono={IdCard}
                  label="Operadores por campamento"
                  activo={pathname === "/usuarios/terreno"}
                />
              )}
              {gestionaCatalogos && (
                <ItemMenu
                  to="/config/catalogos-operativos"
                  icono={Shield}
                  label="Cuerpos y unidades"
                  activo={rutaActiva(pathname, "/config/catalogos-operativos")}
                />
              )}
              {veEstadoSistema && (
                <ItemMenu
                  to="/estado"
                  icono={Activity}
                  label="Estado del sistema"
                  activo={rutaActiva(pathname, "/estado")}
                />
              )}
              {veLogs && (
                <ItemMenu
                  to="/logs"
                  icono={ScrollText}
                  label="Bitácora de acciones"
                  activo={rutaActiva(pathname, "/logs")}
                />
              )}
              <ItemPreferenciasCuenta pathname={pathname} visible={vePreferencias} />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      )}
    </>
  );
}

/**
 * Luz de salud del sistema en el pie del sidebar: verde latiendo = todo
 * operativo; roja = hay incidentes abiertos (Realtime). Clic → /estado.
 * Solo la ven los roles con acceso a esa vista (admin/analista/autoridad).
 */
function LuzEstadoSistema() {
  const { marcarNavegacion } = usePathnameNavegacion();
  const abiertos = useIncidentesAbiertos();
  const hayFalla = abiertos.length > 0;
  const etiqueta = hayFalla
    ? `${abiertos.length} ${abiertos.length === 1 ? "falla activa" : "fallas activas"}`
    : "Sistemas operativos";

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          asChild
          tooltip={`${etiqueta} — ver estado del sistema`}
          className="group-data-[collapsible=icon]:justify-center"
        >
          <Link to="/estado" onClick={() => marcarNavegacion("/estado")}>
            <span
              className={cn(
                "inline-block size-2.5 shrink-0 animate-pulse rounded-full",
                hayFalla
                  ? "bg-destructive shadow-[0_0_0_3px] shadow-destructive/30"
                  : "bg-emerald-500 shadow-[0_0_0_3px] shadow-emerald-500/25",
              )}
              aria-hidden
            />
            <span
              className={cn(
                "truncate text-xs group-data-[collapsible=icon]:hidden",
                hayFalla
                  ? "font-medium text-destructive"
                  : "text-sidebar-foreground/70",
              )}
            >
              {etiqueta}
            </span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

/** Sidebar completo para vistas con rail colapsado. */
export function AppSidebar({ sesion }: Props) {
  const { marcarNavegacion } = usePathnameNavegacion();
  const esTerreno = esRolTerreno(sesion.user.rol);

  return (
    <>
      <SidebarHeader className="border-b border-sidebar-border p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            {esTerreno ? (
              <SidebarMenuButton
                type="button"
                size="lg"
                tooltip="Volver al inicio"
                className="cursor-pointer group-data-[collapsible=icon]:justify-center"
                onClick={() => irAlPortalTerreno()}
              >
                <span className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-inset ring-primary/30">
                  <Home className="size-4" />
                </span>
                <span className="flex min-w-0 flex-col leading-none group-data-[collapsible=icon]:hidden">
                  <span className="truncate text-sm font-semibold">
                    Reportes en el terreno
                  </span>
                  <span className="truncate text-xs text-sidebar-foreground/70">
                    Volver al inicio
                  </span>
                </span>
              </SidebarMenuButton>
            ) : (
              <SidebarMenuButton
                asChild
                size="lg"
                tooltip="Campamentos Transitorios"
                className="group-data-[collapsible=icon]:justify-center"
              >
                <Link
                  to="/centros/mapa"
                  onClick={() => marcarNavegacion("/centros/mapa")}
                >
                  <span className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-inset ring-primary/30">
                    <MapPinned className="size-4" />
                  </span>
                  <span className="flex min-w-0 flex-col leading-none group-data-[collapsible=icon]:hidden">
                    <span className="truncate text-sm font-semibold">
                      Campamentos Transitorios
                    </span>
                    <span className="truncate text-xs text-sidebar-foreground/70">
                      Caracas
                    </span>
                  </span>
                </Link>
              </SidebarMenuButton>
            )}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavContenido sesion={sesion} />
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-2">
        {puedeVerEstadoSistema(sesion.user.rol) && <LuzEstadoSistema />}
        <p className="truncate px-2 text-[10px] text-sidebar-foreground/60 group-data-[collapsible=icon]:sr-only">
          @{sesion.user.username}
        </p>
      </SidebarFooter>
    </>
  );
}
