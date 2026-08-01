import { LogoCuerpo } from "@/components/LogoCuerpo";
import { BadgePruebaCentro } from "@/components/BadgePruebaCentro";
import {
  coincideFiltroEscalar,
  coincideFiltroLista,
  FiltroMultiBusqueda,
  VALOR_SIN_ASIGNAR,
  type OpcionFiltroMulti,
} from "@/components/FiltroMultiBusqueda";
import { useMemo, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import {
  BedDouble,
  ChevronDown,
  ChevronRight,
  Droplets,
  FilterX,
  LayoutGrid,
  List,
  ListFilter,
  Home,
  PawPrint,
  Plus,
  Search,
  Shirt,
  ShowerHead,
  Trash,
  TriangleAlert,
  UserCog,
  Users,
  Users2,
  Utensils,
  X,
} from "lucide-react";
import {
  centrosDeProduccion,
  esCentroDePrueba,
  ESTADOS_CENTRO,
  metaCuerpoDe,
  normalizarCentro,
  normalizarCuerpo,
  type CentroTransitorio,
  type ClaveCuerpo,
} from "@/domain/centrosTransitorios";
import { totalUnidadesConteo } from "@/domain/complejosCentros";
import { normalizarUnidadSebin } from "@/domain/unidadesSebin";
import {
  COLOR_ESTADO_AGUA,
  COLOR_SEMAFORO,
  type ClaveRecurso,
  type RecursoAnalisis,
} from "@/domain/capacidadCentros";
import {
  COLOR_NIVEL,
  COLOR_SEVERIDAD,
  ETIQUETA_NIVEL,
  ORDEN_NIVELES,
  ordenarPorPrioridad,
  prioridadCentro,
  type NivelPrioridad,
  type PrioridadCentro,
} from "@/domain/prioridadCentros";
import {
  AGUA_LITROS_PERSONA_DIA,
  AGUA_POTABLE_LITROS_PERSONA_DIA,
  COMIDAS_POR_PERSONA_DIA,
  demandaAguaDia,
} from "@/domain/estandares";
import {
  cargarVistaTableroCentros,
  guardarVistaTableroCentros,
  type VistaTableroCentros,
} from "@/data/preferenciasTablero";
import {
  etiquetaAnalistaSae,
  useAnalistasSae,
} from "@/data/useAnalistasSae";
import { useCatalogoCuerposActivos } from "@/data/useCuerposPoliciales";
import { useCatalogoUnidadesSebinActivas } from "@/data/useUnidadesSebin";
import { useSupervisoresSebin } from "@/data/useSupervisoresSebin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { tieneTelefonoContacto } from "@/lib/contacto";
import { cn } from "@/lib/utils";
import { AccionesContacto } from "@/components/AccionesContacto";
import { VistaEncabezado } from "@/components/VistaEncabezado";

interface Props {
  centros: CentroTransitorio[];
  onSeleccionar: (id: string) => void;
  puedeCrearCentro?: boolean;
  /** Mientras llegan los centros: shell visible, skeleton solo en la lista. */
  cargando?: boolean;
}

type Orden = "prioridad" | "ocupados" | "nombre";

const VERDE = "#22c55e";
const AMBAR = "#f59e0b";
const ROJO = "#ef4444";

/** Etiqueta corta y icono por recurso (para las barras de capacidad). */
const RECURSO_LABEL: Record<ClaveRecurso, string> = {
  camas: "Camas",
  pocetas: "Baños",
  duchas: "Duchas",
  lavaderos: "Lavaderos",
  contenedores: "Basura",
};

const RECURSO_ICONO: Record<ClaveRecurso, React.ReactNode> = {
  camas: <BedDouble className="size-3 text-emerald-400" />,
  pocetas: <span className="text-[11px] leading-none">🚽</span>,
  duchas: <ShowerHead className="size-3 text-cyan-400" />,
  lavaderos: <Shirt className="size-3 text-violet-400" />,
  contenedores: <Trash className="size-3 text-lime-500" />,
};

interface Fila {
  centro: CentroTransitorio;
  prioridad: PrioridadCentro;
}

/** Quita acentos y pasa a minúsculas para búsquedas tolerantes. */
function normalizarTexto(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function BuscadorCampamento({
  valor,
  onChange,
  inputRef,
  className,
}: {
  valor: string;
  onChange: (v: string) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  className?: string;
}) {
  return (
    <div className={cn("relative min-w-0", className)}>
      <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        type="search"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Buscar por nombre…"
        aria-label="Buscar campamento"
        className="h-8 border-border/60 bg-background/80 pl-7 pr-7 text-xs sm:h-7"
      />
      {valor && (
        <button
          type="button"
          onClick={() => {
            onChange("");
            inputRef?.current?.focus();
          }}
          title="Limpiar búsqueda"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}

function ToggleVistaTablero({
  vista,
  onChange,
  className,
}: {
  vista: VistaTableroCentros;
  onChange: (v: VistaTableroCentros) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex h-8 overflow-hidden rounded-lg border border-border/60 bg-card/70",
        className,
      )}
    >
      <Button
        type="button"
        variant={vista === "grid" ? "secondary" : "ghost"}
        size="icon-xs"
        className="h-full rounded-none border-r border-border/60"
        title="Vista cuadrícula"
        onClick={() => onChange("grid")}
      >
        <LayoutGrid className="size-3.5" />
      </Button>
      <Button
        type="button"
        variant={vista === "lista" ? "secondary" : "ghost"}
        size="icon-xs"
        className="h-full rounded-none"
        title="Vista lista"
        onClick={() => onChange("lista")}
      >
        <List className="size-3.5" />
      </Button>
    </div>
  );
}

const n = (x: number) => x.toLocaleString("es");

/** KPI destacado de la red (población, agua, comidas). */
function KpiRed({
  icono,
  valor,
  etiqueta,
  unidad,
  detalle,
  cargando = false,
}: {
  icono: React.ReactNode;
  valor: number;
  etiqueta: string;
  unidad?: string;
  detalle?: string;
  /** Evita pintar totales de ficha antes de aplicar el último parte. */
  cargando?: boolean;
}) {
  return (
    <div
      className="min-w-0 rounded-lg border border-border/70 bg-background/80 px-2.5 py-2 sm:rounded-xl sm:px-3 sm:py-2.5"
      title={cargando ? undefined : detalle}
    >
      <div className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground sm:text-[11px]">
        {icono}
        <span className="truncate">{etiqueta}</span>
      </div>
      <div className="mt-0.5 flex items-baseline gap-1">
        {cargando ? (
          <Skeleton className="h-5 w-16 sm:h-6 sm:w-20" aria-hidden />
        ) : (
          <>
            <span className="text-lg font-bold tabular-nums leading-none text-foreground sm:text-xl">
              {n(valor)}
            </span>
            {unidad && (
              <span className="text-[10px] text-muted-foreground sm:text-[11px]">{unidad}</span>
            )}
          </>
        )}
      </div>
      {detalle && !cargando && (
        <p className="mt-1 hidden truncate text-[9px] leading-tight text-muted-foreground/80 sm:block">
          {detalle}
        </p>
      )}
    </div>
  );
}

function claseChipFiltro(activo: boolean) {
  return cn(
    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all",
    activo
      ? "shadow-sm ring-2 ring-offset-1 ring-offset-background"
      : "opacity-65 hover:opacity-100 hover:bg-muted/45",
  );
}

function estiloChipFiltro(activo: boolean, color: string): CSSProperties {
  return activo
    ? {
        borderColor: color,
        background: `${color}2e`,
        color,
        boxShadow: `0 0 0 1px ${color}66`,
        ["--tw-ring-color" as string]: `${color}55`,
      }
    : { borderColor: `${color}33`, background: `${color}0a` };
}

/**
 * ¿El funcionario de revista del campamento coincide con la selección
 * (usernames del catálogo o nombre libre)?
 */
function coincideFiltroRevista(
  seleccion: readonly string[],
  supervisorRaw: string | undefined,
  porUsername: ReadonlyMap<string, { username: string; nombre: string }>,
): boolean {
  if (seleccion.length === 0) return true;
  const actual = supervisorRaw?.trim() ?? "";
  if (!actual) return seleccion.includes(VALOR_SIN_ASIGNAR);
  for (const key of seleccion) {
    if (key === VALOR_SIN_ASIGNAR) continue;
    const s = porUsername.get(key);
    if (s && (actual === s.nombre || actual === s.username)) return true;
    if (actual === key) return true;
  }
  return false;
}

/**
 * Sala situacional de la red de Centros Transitorios: cuadrícula de tarjetas
 * densas ordenadas por PRIORIDAD ("¿quién requiere más atención?"). Cada
 * capacidad logística se evalúa con una barra "tienes / deberías / faltan"
 * coloreada por gravedad. El clic abre la ficha completa del centro.
 */
export function TableroCentros({
  centros,
  onSeleccionar,
  puedeCrearCentro,
  cargando = false,
}: Props) {
  const analistasSae = useAnalistasSae();
  const catalogoUnidades = useCatalogoUnidadesSebinActivas();
  const catalogoCuerpos = useCatalogoCuerposActivos();
  const { supervisores } = useSupervisoresSebin();
  const [orden, setOrden] = useState<Orden>("prioridad");
  const [filtroNivel, setFiltroNivel] = useState<NivelPrioridad | null>(null);
  const [filtroCuerpos, setFiltroCuerpos] = useState<string[]>([]);
  const [filtroUnidades, setFiltroUnidades] = useState<string[]>([]);
  const [filtroRevistas, setFiltroRevistas] = useState<string[]>([]);
  const [filtroAnalistas, setFiltroAnalistas] = useState<string[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [vista, setVista] = useState<VistaTableroCentros>(() => cargarVistaTableroCentros());
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const inputBusquedaRef = useRef<HTMLInputElement>(null);

  function cambiarVista(nueva: VistaTableroCentros) {
    setVista(nueva);
    guardarVistaTableroCentros(nueva);
  }

  const base = useMemo<Fila[]>(
    () => centros.map((c) => ({ centro: c, prioridad: prioridadCentro(c) })),
    [centros],
  );

  const supervisoresPorUsername = useMemo(() => {
    const m = new Map<string, { username: string; nombre: string }>();
    for (const s of supervisores) m.set(s.username, s);
    return m;
  }, [supervisores]);

  const opcionesCuerpo = useMemo(() => {
    const m = new Map<ClaveCuerpo, CentroTransitorio[]>();
    const sinAsignar: CentroTransitorio[] = [];
    for (const { centro } of base) {
      const clave = normalizarCuerpo(centro.cuerpo);
      if (clave === VALOR_SIN_ASIGNAR) {
        sinAsignar.push(centro);
        continue;
      }
      const arr = m.get(clave);
      if (arr) arr.push(centro);
      else m.set(clave, [centro]);
    }
    const opciones: OpcionFiltroMulti[] = catalogoCuerpos
      .filter(
        (c) => c.clave !== VALOR_SIN_ASIGNAR && (m.get(c.clave)?.length ?? 0) > 0,
      )
      .map((c) => ({
        valor: c.clave,
        etiqueta: c.label,
        cantidad: totalUnidadesConteo(m.get(c.clave) ?? []),
      }));
    return { opciones, cantidadSinAsignar: totalUnidadesConteo(sinAsignar) };
  }, [base, catalogoCuerpos]);

  const opcionesUnidad = useMemo(() => {
    const m = new Map<string, CentroTransitorio[]>();
    const sinAsignar: CentroTransitorio[] = [];
    for (const { centro } of base) {
      const clave = normalizarUnidadSebin(centro.supervision?.unidad_sebin);
      if (clave === VALOR_SIN_ASIGNAR) {
        sinAsignar.push(centro);
        continue;
      }
      const arr = m.get(clave);
      if (arr) arr.push(centro);
      else m.set(clave, [centro]);
    }
    const opciones: OpcionFiltroMulti[] = catalogoUnidades
      .filter((u) => u.clave !== VALOR_SIN_ASIGNAR && (m.get(u.clave)?.length ?? 0) > 0)
      .map((u) => ({
        valor: u.clave,
        etiqueta: u.cuerpoClave
          ? `${u.label} (${catalogoCuerpos.find((c) => c.clave === u.cuerpoClave)?.label ?? u.cuerpoClave})`
          : u.label,
        cantidad: totalUnidadesConteo(m.get(u.clave) ?? []),
        indicador: (
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: u.color }}
            aria-hidden
          />
        ),
      }));
    for (const [clave, lista] of m) {
      if (opciones.some((o) => o.valor === clave)) continue;
      opciones.push({
        valor: clave,
        etiqueta: clave,
        cantidad: totalUnidadesConteo(lista),
      });
    }
    return { opciones, cantidadSinAsignar: totalUnidadesConteo(sinAsignar) };
  }, [base, catalogoUnidades, catalogoCuerpos]);

  const opcionesRevista = useMemo(() => {
    const porValor = new Map<string, { etiqueta: string; centros: CentroTransitorio[] }>();
    const sinAsignar: CentroTransitorio[] = [];
    for (const { centro } of base) {
      const actual = centro.supervision?.supervisor_sebin?.trim() ?? "";
      if (!actual) {
        sinAsignar.push(centro);
        continue;
      }
      const delCatalogo = supervisores.find(
        (s) => s.nombre === actual || s.username === actual,
      );
      const valor = delCatalogo?.username ?? actual;
      const etiqueta = delCatalogo?.nombre ?? actual;
      const prev = porValor.get(valor);
      if (prev) prev.centros.push(centro);
      else porValor.set(valor, { etiqueta, centros: [centro] });
    }
    const opciones: OpcionFiltroMulti[] = [...porValor.entries()]
      .map(([valor, { etiqueta, centros: lista }]) => ({
        valor,
        etiqueta,
        cantidad: totalUnidadesConteo(lista),
      }))
      .sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, "es"));
    return { opciones, cantidadSinAsignar: totalUnidadesConteo(sinAsignar) };
  }, [base, supervisores]);

  const opcionesAnalista = useMemo(() => {
    const sinAsignar = base
      .filter(({ centro }) => (centro.supervision?.analistas_sae ?? []).length === 0)
      .map(({ centro }) => centro);
    const opciones: OpcionFiltroMulti[] = analistasSae.map((analista) => ({
      valor: analista.user_id,
      etiqueta: etiquetaAnalistaSae(analista),
      cantidad: totalUnidadesConteo(
        base
          .filter(({ centro }) =>
            centro.supervision?.analistas_sae?.includes(analista.user_id),
          )
          .map(({ centro }) => centro),
      ),
    }));
    return { opciones, cantidadSinAsignar: totalUnidadesConteo(sinAsignar) };
  }, [analistasSae, base]);

  const enContexto = useMemo(() => {
    const q = normalizarTexto(busqueda.trim());
    return base.filter(({ centro }) => {
      if (
        !coincideFiltroEscalar(
          filtroCuerpos,
          normalizarCuerpo(centro.cuerpo),
        )
      ) {
        return false;
      }
      if (
        !coincideFiltroEscalar(
          filtroUnidades,
          normalizarUnidadSebin(centro.supervision?.unidad_sebin),
        )
      ) {
        return false;
      }
      if (
        !coincideFiltroRevista(
          filtroRevistas,
          centro.supervision?.supervisor_sebin,
          supervisoresPorUsername,
        )
      ) {
        return false;
      }
      if (
        !coincideFiltroLista(
          filtroAnalistas,
          centro.supervision?.analistas_sae ?? [],
        )
      ) {
        return false;
      }
      if (q) {
        const heno = normalizarTexto(`${centro.nombre} ${centro.parroquia}`);
        if (!heno.includes(q)) return false;
      }
      return true;
    });
  }, [
    base,
    busqueda,
    filtroAnalistas,
    filtroCuerpos,
    filtroRevistas,
    filtroUnidades,
    supervisoresPorUsername,
  ]);

  const conteo = useMemo(() => {
    const m: Record<NivelPrioridad, number> = {
      critico: 0,
      alto: 0,
      medio: 0,
      estable: 0,
      sin_datos: 0,
    };
    const porUnidad = new Map<string, NivelPrioridad[]>();
    for (const f of enContexto) {
      if (esCentroDePrueba(f.centro)) continue;
      const clave = f.centro.complejoId?.trim() || f.centro.id;
      const arr = porUnidad.get(clave);
      if (arr) arr.push(f.prioridad.nivel);
      else porUnidad.set(clave, [f.prioridad.nivel]);
    }
    for (const niveles of porUnidad.values()) {
      const peor =
        ORDEN_NIVELES.find((n) => niveles.includes(n)) ?? "sin_datos";
      m[peor]++;
    }
    return m;
  }, [enContexto]);

  /** Alcance sin filtro de nivel (denominador de “visibles” y chips de nivel). */
  const totalAlcance = useMemo(
    () => totalUnidadesConteo(centrosDeProduccion(enContexto.map((f) => f.centro))),
    [enContexto],
  );

  const filas = useMemo(() => {
    const filtradas = filtroNivel
      ? enContexto.filter((f) => f.prioridad.nivel === filtroNivel)
      : enContexto;
    if (orden === "prioridad") return ordenarPorPrioridad(filtradas);
    const arr = [...filtradas];
    arr.sort((a, b) => {
      const aa = a.prioridad.analisis;
      const bb = b.prioridad.analisis;
      switch (orden) {
        case "ocupados":
          return bb.refugiados - aa.refugiados;
        case "nombre":
          return a.centro.nombre.localeCompare(b.centro.nombre, "es");
        default:
          return 0;
      }
    });
    return arr;
  }, [enContexto, orden, filtroNivel]);

  const visiblesUnidades = useMemo(
    () => totalUnidadesConteo(centrosDeProduccion(filas.map((f) => f.centro))),
    [filas],
  );

  /** KPIs y logística según la vista filtrada (incluye nivel). */
  const totales = useMemo(() => {
    let refugiados = 0;
    let familias = 0;
    let funcionarios = 0;
    let mascotas = 0;
    let camas = 0;
    let banos = 0;
    let duchas = 0;
    let cupo = 0;
    for (const { centro, prioridad } of filas) {
      if (esCentroDePrueba(centro)) continue;
      const a = prioridad.analisis;
      const c = normalizarCentro(centro);
      refugiados += a.refugiados;
      familias += c.familias_ocupadas;
      funcionarios += a.personal;
      mascotas += c.ocupacion.mascotas;
      camas += c.capacidad.camas_instaladas;
      banos += c.capacidad.pocetas_instaladas;
      duchas += c.capacidad.duchas_instaladas;
      if (a.cupoDisponible != null) cupo += a.cupoDisponible;
    }
    const total = refugiados + funcionarios;
    const agua = demandaAguaDia(total);
    return {
      refugiados,
      familias,
      funcionarios,
      mascotas,
      total,
      camas,
      banos,
      duchas,
      cupo,
      aguaPotableDia: agua.potableL,
      aguaUsoCotidianoDia: agua.usoCotidianoL,
      comidasDia: total * COMIDAS_POR_PERSONA_DIA,
    };
  }, [filas]);

  const ordenes: { valor: Orden; label: string }[] = [
    { valor: "prioridad", label: "Nivel de atención" },
    { valor: "ocupados", label: "Damnificados" },
    { valor: "nombre", label: "Alfabético" },
  ];

  const hayFiltros =
    filtroNivel !== null ||
    filtroCuerpos.length > 0 ||
    filtroUnidades.length > 0 ||
    filtroRevistas.length > 0 ||
    filtroAnalistas.length > 0 ||
    orden !== "prioridad" ||
    busqueda.trim() !== "";

  function limpiarFiltros() {
    setFiltroNivel(null);
    setFiltroCuerpos([]);
    setFiltroUnidades([]);
    setFiltroRevistas([]);
    setFiltroAnalistas([]);
    setOrden("prioridad");
    setBusqueda("");
    setFiltrosAbiertos(false);
  }

  const selectoresFiltro = (
    <>
      <FiltroMultiBusqueda
        placeholder="Cuerpo policial"
        buscarPlaceholder="Buscar cuerpo…"
        opciones={opcionesCuerpo.opciones}
        seleccion={filtroCuerpos}
        onCambiar={setFiltroCuerpos}
        cantidadSinAsignar={opcionesCuerpo.cantidadSinAsignar}
      />
      <FiltroMultiBusqueda
        placeholder="Unidad de supervisión"
        buscarPlaceholder="Buscar unidad…"
        opciones={opcionesUnidad.opciones}
        seleccion={filtroUnidades}
        onCambiar={setFiltroUnidades}
        cantidadSinAsignar={opcionesUnidad.cantidadSinAsignar}
      />
      <FiltroMultiBusqueda
        placeholder="Funcionario revista"
        buscarPlaceholder="Buscar funcionario…"
        opciones={opcionesRevista.opciones}
        seleccion={filtroRevistas}
        onCambiar={setFiltroRevistas}
        cantidadSinAsignar={opcionesRevista.cantidadSinAsignar}
      />
      <FiltroMultiBusqueda
        placeholder="Analista"
        buscarPlaceholder="Buscar analista…"
        opciones={opcionesAnalista.opciones}
        seleccion={filtroAnalistas}
        onCambiar={setFiltroAnalistas}
        cantidadSinAsignar={opcionesAnalista.cantidadSinAsignar}
      />
      <Select value={orden} onValueChange={(v) => setOrden(v as Orden)}>
        <SelectTrigger className="h-8 w-full bg-card/70 text-xs">
          <SelectValue placeholder="Orden" />
        </SelectTrigger>
        <SelectContent>
          {ordenes.map(({ valor, label }) => (
            <SelectItem key={valor} value={valor}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );

  return (
    <>
      <VistaEncabezado
        icono={LayoutGrid}
        acento="sky"
        titulo="Campamentos"
        descripcion="Prioridad, capacidad y déficits logísticos · clic para abrir la ficha del centro"
        acciones={
          puedeCrearCentro ? (
            <Button asChild size="sm" className="h-8 shrink-0 gap-1.5">
              <Link to="/centro/nuevo">
                <Plus className="size-3.5" />
                <span className="hidden sm:inline">Nuevo campamento</span>
                <span className="sm:hidden">Nuevo</span>
              </Link>
            </Button>
          ) : undefined
        }
        debajo={
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 sm:gap-2 lg:grid-cols-5">
            <KpiRed
              icono={<LayoutGrid className="size-3.5 text-emerald-300" />}
              valor={visiblesUnidades}
              etiqueta="Campamentos"
              cargando={cargando}
            />
            <KpiRed
              icono={<Home className="size-3.5 text-orange-300" />}
              valor={totales.familias}
              etiqueta="Familias"
              cargando={cargando}
            />
            <KpiRed
              icono={<Users className="size-3.5 text-sky-300" />}
              valor={totales.refugiados}
              etiqueta="Damnificados"
              cargando={cargando}
            />
            <KpiRed
              icono={<UserCog className="size-3.5 text-violet-300" />}
              valor={totales.funcionarios}
              etiqueta="Funcionarios"
              cargando={cargando}
            />
            <KpiRed
              icono={<PawPrint className="size-3.5 text-amber-300" />}
              valor={totales.mascotas}
              etiqueta="Mascotas"
              cargando={cargando}
            />
          </div>
        }
      />

      <div className="border-b border-border bg-muted/10 px-3 py-2.5 sm:px-4 sm:py-3 lg:px-6">
        <div className="space-y-2 sm:space-y-3">
          <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-[minmax(0,1fr)_auto] md:hidden">
            <BuscadorCampamento
              valor={busqueda}
              onChange={setBusqueda}
              inputRef={inputBusquedaRef}
            />
            <ToggleVistaTablero vista={vista} onChange={cambiarVista} />
          </div>

          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3 sm:gap-2">
            <KpiRed
              icono={<Droplets className="size-3.5 text-cyan-300" />}
              valor={totales.aguaPotableDia}
              etiqueta="Agua potable"
              unidad="L/día"
              detalle={`${AGUA_POTABLE_LITROS_PERSONA_DIA} L/pers. · bebida y cocina`}
              cargando={cargando}
            />
            <KpiRed
              icono={<Droplets className="size-3.5 text-sky-300" />}
              valor={totales.aguaUsoCotidianoDia}
              etiqueta="Agua uso cotidiano"
              unidad="L/día"
              detalle={`${AGUA_LITROS_PERSONA_DIA} L/pers. · aseo, pocetas, lavado`}
              cargando={cargando}
            />
            <KpiRed
              icono={<Utensils className="size-3.5 text-amber-300" />}
              valor={totales.comidasDia}
              etiqueta="Comidas"
              unidad="/día"
              detalle={`${COMIDAS_POR_PERSONA_DIA} raciones/pers.`}
              cargando={cargando}
            />
          </div>

          <Collapsible open={filtrosAbiertos} onOpenChange={setFiltrosAbiertos} className="md:hidden">
            <div className="flex items-center gap-2">
              <CollapsibleTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 flex-1 justify-between gap-2 text-xs"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <ListFilter className="size-3.5 text-muted-foreground" />
                    Filtros y orden
                    {hayFiltros && <span className="size-1.5 rounded-full bg-primary" />}
                  </span>
                  <ChevronDown
                    className={cn(
                      "size-3.5 text-muted-foreground transition-transform",
                      filtrosAbiertos && "rotate-180",
                    )}
                  />
                </Button>
              </CollapsibleTrigger>
              {hayFiltros && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="shrink-0"
                  title="Limpiar filtros"
                  onClick={limpiarFiltros}
                >
                  <FilterX className="size-3.5" />
                </Button>
              )}
            </div>
            <CollapsibleContent className="mt-2 space-y-2">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {selectoresFiltro}
              </div>
              <p className="text-center text-[11px] text-muted-foreground">
                {visiblesUnidades} de {totalAlcance} campamentos visibles
              </p>
            </CollapsibleContent>
          </Collapsible>

          <div className="hidden rounded-xl border border-border/70 bg-background/80 p-3 md:block">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-lg bg-muted/60">
                  <ListFilter className="size-3.5 text-muted-foreground" />
                </span>
                <div>
                  <p className="text-xs font-semibold text-foreground">Filtros de vista</p>
                  <p className="text-[11px] text-muted-foreground">
                    {visiblesUnidades} de {totalAlcance} campamentos visibles
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {hayFiltros && (
                  <Button
                    variant="ghost"
                    size="xs"
                    className="h-6 gap-1 px-2 text-[11px]"
                    onClick={limpiarFiltros}
                  >
                    <FilterX className="size-3" />
                    Limpiar
                  </Button>
                )}
                <ToggleVistaTablero vista={vista} onChange={cambiarVista} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {selectoresFiltro}
            </div>
          </div>

          <div className="hidden flex-wrap items-center gap-2 md:flex">
            <span className="mr-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Nivel
            </span>
            {ORDEN_NIVELES.map((nivel) => {
              const activo = filtroNivel === nivel;
              const color = COLOR_NIVEL[nivel];
              return (
                <button
                  key={nivel}
                  type="button"
                  onClick={() => setFiltroNivel(filtroNivel === nivel ? null : nivel)}
                  className={claseChipFiltro(activo)}
                  style={estiloChipFiltro(activo, color)}
                >
                  <span
                    className="size-2.5 rounded-full ring-2 ring-background"
                    style={{ background: color }}
                  />
                  <span className={activo ? "font-semibold" : "text-muted-foreground"}>
                    {ETIQUETA_NIVEL[nivel]}
                  </span>
                  <span
                    className={cn(
                      "tabular-nums",
                      activo ? "font-bold" : "font-bold text-foreground",
                    )}
                  >
                    {conteo[nivel]}
                  </span>
                </button>
              );
            })}
            <BuscadorCampamento
              valor={busqueda}
              onChange={setBusqueda}
              inputRef={inputBusquedaRef}
              className="ml-auto w-52"
            />
          </div>
        </div>
      </div>

      <div className="px-3 pb-4 pt-3 sm:px-4 sm:pt-4 lg:px-6">
        <div className="mb-2 flex items-center justify-between gap-2 sm:mb-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              {vista === "grid" ? "Cuadrícula de campamentos" : "Lista de campamentos"}
              <span className="ml-1.5 font-normal text-muted-foreground sm:hidden">
                · {visiblesUnidades}
              </span>
            </p>
            <p className="hidden text-xs text-muted-foreground sm:block">
              {orden === "prioridad"
                ? "Ordenados por nivel de atención"
                : orden === "ocupados"
                  ? "Ordenados por población damnificada"
                  : "Orden alfabético"}
            </p>
          </div>
          <Badge
            variant="outline"
            className={cn(
              "hidden h-7 gap-1.5 px-2.5 text-xs tabular-nums sm:inline-flex",
              hayFiltros || visiblesUnidades !== totalAlcance
                ? "border-primary/70 bg-primary/15 font-semibold text-foreground shadow-sm ring-1 ring-primary/35"
                : "border-border/80 bg-muted/50 font-medium text-foreground",
            )}
          >
            {vista === "grid" ? (
              <LayoutGrid
                className={cn(
                  "size-3.5",
                  hayFiltros || visiblesUnidades !== totalAlcance
                    ? "text-primary"
                    : "text-muted-foreground",
                )}
              />
            ) : (
              <List
                className={cn(
                  "size-3.5",
                  hayFiltros || visiblesUnidades !== totalAlcance
                    ? "text-primary"
                    : "text-muted-foreground",
                )}
              />
            )}
            <span>
              {visiblesUnidades}
              <span className="font-normal text-muted-foreground">
                {" "}
                / {totalAlcance}
              </span>{" "}
              visible(s)
            </span>
          </Badge>
        </div>

        {cargando ? (
          <ul
            className="space-y-1.5 sm:space-y-2"
            aria-busy="true"
            aria-label="Cargando campamentos"
          >
            {Array.from({ length: 8 }, (_, i) => (
              <li
                key={i}
                className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/65 px-2.5 py-2 sm:gap-3 sm:rounded-xl sm:px-3 sm:py-3"
                aria-hidden
              >
                <Skeleton className="size-8 shrink-0 rounded-full sm:size-9" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton
                    className="h-3.5"
                    style={{ width: `${48 + ((i * 11) % 28)}%` }}
                  />
                  <Skeleton
                    className="h-2.5"
                    style={{ width: `${32 + ((i * 7) % 22)}%` }}
                  />
                </div>
                <div className="hidden items-center gap-1.5 sm:flex">
                  <Skeleton className="h-6 w-12 rounded-md" />
                  <Skeleton className="h-6 w-12 rounded-md" />
                  <Skeleton className="h-6 w-12 rounded-md" />
                  <Skeleton className="h-6 w-14 rounded-full" />
                </div>
              </li>
            ))}
          </ul>
        ) : filas.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
            {busqueda.trim()
              ? `Ningún campamento coincide con «${busqueda.trim()}».`
              : "Ningún campamento coincide con los filtros seleccionados."}
          </p>
        ) : vista === "grid" ? (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2 2xl:grid-cols-3">
            {filas.map((fila) => (
              <TarjetaCentro
                key={fila.centro.id}
                fila={fila}
                onSeleccionar={() => onSeleccionar(fila.centro.id)}
              />
            ))}
          </div>
        ) : (
          <ul className="space-y-1.5 sm:space-y-2">
            {filas.map((fila) => (
              <li key={fila.centro.id}>
                <FilaCentroTablero
                  fila={fila}
                  onSeleccionar={() => onSeleccionar(fila.centro.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

/**
 * Píldoras de población al final de cada fila en la vista lista.
 */
function PillsPoblacionLista({
  familias,
  refugiados,
  funcionarios,
  mascotas,
  compact = false,
}: {
  familias: number;
  refugiados: number;
  funcionarios: number;
  mascotas: number;
  compact?: boolean;
}) {
  const base = compact
    ? "inline-flex h-6 items-center gap-0.5 rounded-md border px-1.5 text-[10px] tabular-nums"
    : "inline-flex h-7 items-center gap-1 rounded-lg border px-2 text-xs tabular-nums";
  const icon = compact ? "size-2.5" : "size-3";

  return (
    <>
      <span className={`${base} border-orange-400/25 bg-orange-400/10 text-orange-100`}>
        <Home className={`${icon} text-orange-300`} />
        <span className="font-semibold">{n(familias)}</span>
      </span>
      <span className={`${base} border-sky-400/25 bg-sky-400/10 text-sky-100`}>
        <Users className={`${icon} text-sky-300`} />
        <span className="font-semibold">{n(refugiados)}</span>
      </span>
      <span className={`${base} border-violet-400/25 bg-violet-400/10 text-violet-100`}>
        <UserCog className={`${icon} text-violet-300`} />
        <span className="font-semibold">{n(funcionarios)}</span>
      </span>
      <span className={`${base} border-amber-400/25 bg-amber-400/10 text-amber-100`}>
        <PawPrint className={`${icon} text-amber-300`} />
        <span className="font-semibold">{n(mascotas)}</span>
      </span>
    </>
  );
}

/**
 * Fila compacta de un campamento (vista lista), al estilo de reportes diarios.
 */
function FilaCentroTablero({
  fila,
  onSeleccionar,
}: {
  fila: Fila;
  onSeleccionar: () => void;
}) {
  const { centro, prioridad } = fila;
  const c = normalizarCentro(centro);
  const meta = metaCuerpoDe(centro.cuerpo);
  const analisis = prioridad.analisis;
  const colorNivel = COLOR_NIVEL[prioridad.nivel];

  return (
    <button
      type="button"
      onClick={onSeleccionar}
      className="group flex w-full cursor-pointer items-center gap-2 rounded-lg border border-border/60 bg-background/65 px-2.5 py-2 text-left transition-all active:bg-muted/30 sm:gap-3 sm:rounded-xl sm:px-3 sm:py-3 sm:hover:-translate-y-0.5 sm:hover:border-border sm:hover:bg-muted/25 sm:hover:shadow-sm"
    >
      <div
        className="flex size-8 shrink-0 flex-col items-center justify-center overflow-hidden rounded-lg border bg-muted/30 sm:size-10 sm:rounded-xl"
        style={{ borderColor: `${meta.color}55` }}
      >
        {meta.logo ? (
          <LogoCuerpo src={meta.logo} priority="low" />
        ) : (
          <>
            <span className="text-[8px] font-medium leading-none text-muted-foreground sm:text-[9px]">
              N.°
            </span>
            <span className="text-xs font-semibold leading-none tabular-nums text-foreground sm:text-sm">
              {centro.nro}
            </span>
          </>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{centro.nombre}</p>
        <p className="truncate text-[11px] text-muted-foreground sm:text-xs">
          {meta.label}
          {centro.parroquia ? ` · ${centro.parroquia.replace(/^Parroquia\s/i, "")}` : ""}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1 sm:hidden">
          <PillsPoblacionLista
            compact
            familias={c.familias_ocupadas}
            refugiados={analisis.refugiados}
            funcionarios={analisis.personal}
            mascotas={c.ocupacion.mascotas}
          />
          <Badge
            variant="outline"
            className="h-5 px-1.5 text-[10px]"
            style={{ borderColor: `${colorNivel}66`, color: colorNivel }}
          >
            {ETIQUETA_NIVEL[prioridad.nivel]}
          </Badge>
        </div>
      </div>
      <div className="hidden min-w-0 shrink-0 items-center gap-1.5 sm:flex sm:justify-end">
        <PillsPoblacionLista
          familias={c.familias_ocupadas}
          refugiados={analisis.refugiados}
          funcionarios={analisis.personal}
          mascotas={c.ocupacion.mascotas}
        />
        <Badge
          variant="outline"
          className="h-7"
          style={{ borderColor: `${colorNivel}66`, color: colorNivel }}
        >
          {prioridad.nivel === "critico" && (
            <TriangleAlert className="mr-1 size-3" />
          )}
          {ETIQUETA_NIVEL[prioridad.nivel]}
        </Badge>
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

/**
 * Tarjeta densa de un centro. En escritorio (sm+) la foto va a la izquierda y el
 * contenido a la derecha; en móvil se apila (foto arriba). Las capacidades
 * logísticas se muestran como barras "tienes / deberías / faltan".
 */
function TarjetaCentro({
  fila,
  onSeleccionar,
}: {
  fila: Fila;
  onSeleccionar: () => void;
}) {
  const { centro, prioridad } = fila;
  const c = normalizarCentro(centro);
  const meta = metaCuerpoDe(centro.cuerpo);
  const analisis = prioridad.analisis;
  const colorNivel = COLOR_NIVEL[prioridad.nivel];
  const colorSemaforo = COLOR_SEMAFORO[analisis.semaforo];
  const estadoInfo = ESTADOS_CENTRO.find((e) => e.valor === c.estado);
  const agua = analisis.agua;
  const aguaColor = COLOR_ESTADO_AGUA[agua.estado];

  const logistica = analisis.personasLogistica;
  const aguaDiaL = logistica * AGUA_LITROS_PERSONA_DIA;
  const comidasDia = logistica * COMIDAS_POR_PERSONA_DIA;
  const mascotas = c.ocupacion.mascotas;

  const responsables = c.responsables_coordinacion.filter(
    (r) =>
      r.nombre.trim() && r.telefonos.some((t) => tieneTelefonoContacto(t)),
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSeleccionar}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSeleccionar();
        }
      }}
      className="group flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-border bg-card text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md sm:flex-row"
      style={{ borderTopColor: colorNivel, borderTopWidth: 3 }}
    >
      {/* Foto / color del cuerpo. Arriba en móvil, izquierda en PC. */}
      <div className="relative h-24 w-full shrink-0 overflow-hidden bg-muted/40 sm:h-auto sm:w-36">
        {c.foto_url ? (
          <img
            src={c.foto_url}
            alt=""
            className="size-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div
            className="flex size-full min-h-24 items-center justify-center"
            style={{ background: `${meta.color}22` }}
          >
            <span
              className="flex size-12 items-center justify-center overflow-hidden rounded-full border-2 bg-white text-xl"
              style={{ borderColor: meta.color }}
            >
              {meta.logo ? (
                <LogoCuerpo src={meta.logo} priority="low" />
              ) : (
                meta.icono
              )}
            </span>
          </div>
        )}

        <span
          className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-white shadow"
          style={{ background: colorNivel }}
        >
          {prioridad.nivel === "critico" && <TriangleAlert className="size-3" />}
          {ETIQUETA_NIVEL[prioridad.nivel]}
        </span>
        {esCentroDePrueba(centro) && (
          <span className="absolute right-2 top-2">
            <BadgePruebaCentro compacto />
          </span>
        )}

        {estadoInfo && (
          <span
            className="absolute right-2 top-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold backdrop-blur-sm"
            style={{ color: estadoInfo.color }}
          >
            {estadoInfo.label}
          </span>
        )}

        {c.foto_url && (
          <span className="absolute bottom-2 left-2 inline-flex items-center gap-1.5 rounded-full bg-black/55 py-0.5 pl-0.5 pr-2 backdrop-blur-sm">
            <span
              className="flex size-5 items-center justify-center overflow-hidden rounded-full border bg-white text-[9px]"
              style={{ borderColor: meta.color }}
            >
              {meta.logo ? (
                <LogoCuerpo src={meta.logo} priority="low" />
              ) : (
                meta.icono
              )}
            </span>
            <span className="text-[10px] font-semibold text-white">{meta.label}</span>
          </span>
        )}
      </div>

      {/* Contenido */}
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-2.5">
        {/* Título + ocupación */}
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
              {centro.nombre}
            </p>
            {analisis.porcentajeOcupacion != null && (
              <span
                className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold"
                style={{ background: `${colorSemaforo}1f`, color: colorSemaforo }}
                title="Ocupación sobre la capacidad efectiva"
              >
                {Math.min(999, analisis.porcentajeOcupacion)}%
              </span>
            )}
          </div>
          <p className="truncate text-[11px] text-muted-foreground">
            {!c.foto_url && <span className="font-medium">{meta.label} · </span>}
            {centro.nro != null && <>N.° {centro.nro} · </>}
            {centro.parroquia.replace(/^Parroquia\s/i, "")}
            {analisis.cuelloBotella && (
              <> · límite: {analisis.cuelloBotella.label.toLowerCase()}</>
            )}
          </p>
        </div>

        {/* Población (inline compacto) */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Stat icono={<Users className="size-3.5 text-sky-300" />} valor={analisis.refugiados} etiqueta="damnif." />
          <Stat icono={<UserCog className="size-3.5 text-violet-300" />} valor={analisis.personal} etiqueta="func." />
          <Stat icono={<PawPrint className="size-3.5 text-amber-300" />} valor={mascotas} etiqueta="masc." />
          <Stat icono={<Users2 className="size-3.5 text-foreground" />} valor={logistica} etiqueta="total" resaltar />
        </div>

        {/* Necesidad diaria (inline) */}
        {logistica > 0 && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Droplets className="size-3 text-sky-300" />
              <span className="font-semibold text-foreground">{n(aguaDiaL)} L</span>/día
            </span>
            <span className="inline-flex items-center gap-1">
              <Utensils className="size-3 text-amber-300" />
              <span className="font-semibold text-foreground">{n(comidasDia)}</span> comidas/día
            </span>
          </div>
        )}

        {/* Capacidades logísticas: tienes / deberías / faltan */}
        <div className="space-y-1.5">
          {analisis.recursos.map((r) => (
            <BarraCapacidad key={r.clave} recurso={r} />
          ))}
          <BarraAgua
            medido={agua.medido}
            operativa={agua.operativa}
            autonomiaDias={agua.autonomiaDias}
            color={aguaColor}
          />
        </div>

        {/* Factores (motivos) */}
        {prioridad.factores.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {prioridad.factores.map((f, i) => {
              const color = COLOR_SEVERIDAD[f.severidad];
              return (
                <span
                  key={`${f.clave}-${i}`}
                  className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                  style={{ background: `${color}1f`, color }}
                >
                  {f.label}
                </span>
              );
            })}
          </div>
        )}

        {/* Responsables con contacto (Telegram/WhatsApp/llamar) */}
        {responsables.length > 0 && (
          <div className="mt-auto space-y-1 border-t border-border pt-2">
            {responsables.slice(0, 2).map((r) => {
              const telefono = r.telefonos.find((t) => tieneTelefonoContacto(t)) ?? "";
              return (
              <div key={r.id} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="truncate text-[11px] font-medium text-foreground">
                    {r.nombre}
                  </span>
                  {r.ente && (
                    <span className="ml-1 truncate text-[10px] text-muted-foreground">
                      · {r.ente}
                    </span>
                  )}
                </div>
                <div onClick={(e) => e.stopPropagation()}>
                  <AccionesContacto telefono={telefono} />
                </div>
              </div>
            );
            })}
            {responsables.length > 2 && (
              <p className="text-[10px] text-muted-foreground">
                +{responsables.length - 2} responsable(s) más
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Estadística inline compacta (icono + número + etiqueta). */
function Stat({
  icono,
  valor,
  etiqueta,
  resaltar,
}: {
  icono: React.ReactNode;
  valor: number;
  etiqueta: string;
  resaltar?: boolean;
}) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="translate-y-0.5">{icono}</span>
      <span
        className={cn(
          "text-sm font-bold tabular-nums text-foreground",
          resaltar && "text-emerald-300",
        )}
      >
        {n(valor)}
      </span>
      <span className="text-[10px] text-muted-foreground">{etiqueta}</span>
    </span>
  );
}

/**
 * Barra de una capacidad física: cuánto TIENES (operativas) vs. cuánto
 * DEBERÍAS (requeridas por la población), con el faltante y color por gravedad.
 */
function BarraCapacidad({ recurso }: { recurso: RecursoAnalisis }) {
  const label = RECURSO_LABEL[recurso.clave];
  const icono = RECURSO_ICONO[recurso.clave];

  if (!recurso.medido) {
    return (
      <Barra
        icono={icono}
        label={label}
        color={ROJO}
        ancho={0}
        derecha={<span className="text-muted-foreground">sin registrar</span>}
      />
    );
  }

  if (recurso.sinNecesidad) {
    return (
      <Barra
        icono={icono}
        label={label}
        color={VERDE}
        ancho={100}
        derecha={
          <span className="text-muted-foreground">
            <span className="font-bold text-foreground">{n(recurso.operativas)}</span> · sin demanda
          </span>
        }
      />
    );
  }

  const faltan = Math.max(0, recurso.requeridas - recurso.operativas);
  const color = recurso.cobertura >= 100 ? VERDE : recurso.cobertura >= 60 ? AMBAR : ROJO;

  return (
    <Barra
      icono={icono}
      label={label}
      color={color}
      ancho={Math.min(100, recurso.cobertura)}
      derecha={
        <span className="tabular-nums">
          <span className="font-bold" style={{ color }}>
            {n(recurso.operativas)}
          </span>
          <span className="text-muted-foreground">/{n(recurso.requeridas)}</span>
          {faltan > 0 ? (
            <span className="ml-1 font-semibold" style={{ color: ROJO }}>
              faltan {n(faltan)}
            </span>
          ) : (
            <span className="ml-1 font-semibold" style={{ color: VERDE }}>
              ✓
            </span>
          )}
        </span>
      }
    />
  );
}

/** Barra especial de agua: mide autonomía del tanque, no unidades. */
function BarraAgua({
  medido,
  operativa,
  autonomiaDias,
  color,
}: {
  medido: boolean;
  operativa: boolean;
  autonomiaDias: number | null;
  color: string;
}) {
  const icono = <Droplets className="size-3 text-sky-300" />;
  if (!medido) {
    return (
      <Barra
        icono={icono}
        label="Agua"
        color={ROJO}
        ancho={0}
        derecha={<span className="text-muted-foreground">sin tanque</span>}
      />
    );
  }
  // Objetivo de autonomía: 3 días de reserva.
  const ancho = autonomiaDias != null ? Math.min(100, (autonomiaDias / 3) * 100) : 0;
  const texto =
    !operativa
      ? "sin suministro"
      : autonomiaDias == null
        ? "sin consumo"
        : autonomiaDias < 1
          ? "< 1 día"
          : `~${Math.floor(autonomiaDias)} d`;
  return (
    <Barra
      icono={icono}
      label="Agua"
      color={color}
      ancho={ancho}
      derecha={
        <span className="font-semibold" style={{ color }}>
          {texto}
        </span>
      }
    />
  );
}

/** Fila base de barra: icono + label a la izquierda, dato a la derecha, barra debajo. */
function Barra({
  icono,
  label,
  color,
  ancho,
  derecha,
}: {
  icono: React.ReactNode;
  label: string;
  color: string;
  ancho: number;
  derecha: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="flex items-center gap-1 font-medium text-foreground">
          {icono}
          {label}
        </span>
        <span className="shrink-0">{derecha}</span>
      </div>
      <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${ancho}%`, background: color }}
        />
      </div>
    </div>
  );
}

