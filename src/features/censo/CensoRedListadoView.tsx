// Listado general del censo rápido (toda la red) vía RPC paginado.

import { useCallback, useMemo, useState } from "react";
import {
  Baby,
  BadgeCheck,
  Check,
  ChevronsUpDown,
  ClipboardList,
  FileSpreadsheet,
  IdCard,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Users,
  FilterX,
  CircleAlert,
  ScanSearch,
} from "lucide-react";
import type { Sesion } from "@/data/authSupabase";
import { obtenerListadoCensoRedFiltrado } from "@/data/reposCenso";
import { useCensoRedListado } from "@/data/useCensoRedListado";
import { useCensoRedResumen } from "@/data/useCensoRedResumen";
import { puedeVerCensoRapidoRed } from "@/domain/permisos";
import { BotonExportarCensoRed } from "@/features/censo/BotonExportarCensoRed";
import { CensoRedTabs } from "@/features/censo/CensoRedTabs";
import { CensoRegistrosTabla } from "@/features/censo/CensoRegistrosTabla";
import { CENSO_SELECT_TRIGGER } from "@/features/censo/censoFormularioShared";
import type { OrdenRegistrosCenso } from "@/features/censo/censoRegistrosUtil";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { PaginadorTabla } from "@/components/ui/pagination";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VistaPagina } from "@/components/VistaPagina";
import { cn } from "@/lib/utils";

type FiltroSexo = "todos" | "M" | "F";
type FiltroBinario = "todos" | "si" | "no";

function KpiPersona({
  valor,
  etiqueta,
  detalle,
  icono: Icono,
  clase,
  onClick,
  activo,
}: {
  valor: number;
  etiqueta: string;
  detalle?: string;
  icono: typeof Users;
  clase?: string;
  onClick?: () => void;
  activo?: boolean;
}) {
  const contenido = (
    <CardContent className="flex items-center gap-3 px-3">
      <div
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-300",
          clase,
        )}
      >
        <Icono className="size-4" />
      </div>
      <div className="min-w-0 text-left">
        <p className="text-lg font-bold tabular-nums leading-none">
          {valor.toLocaleString("es")}
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{etiqueta}</p>
        {detalle ? (
          <p className="text-[10px] text-muted-foreground/80">{detalle}</p>
        ) : null}
      </div>
    </CardContent>
  );

  if (!onClick) {
    return (
      <Card size="sm" className="border-teal-500/15 py-2">
        {contenido}
      </Card>
    );
  }

  return (
    <Card
      size="sm"
      role="button"
      tabIndex={0}
      aria-pressed={activo}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "cursor-pointer border-teal-500/15 py-2 transition-colors hover:border-teal-500/40 hover:bg-teal-500/5",
        activo && "border-teal-500/70 bg-teal-500/10 ring-1 ring-teal-500/40",
      )}
    >
      {contenido}
    </Card>
  );
}

export function CensoRedListadoView({ sesion }: { sesion: Sesion }) {
  const tieneAcceso = puedeVerCensoRapidoRed(sesion.user.rol);

  const {
    resumenes,
    kpisImportaciones,
    cargando: cargandoResumen,
    refrescar: refrescarResumen,
  } = useCensoRedResumen();

  const [busqueda, setBusqueda] = useState("");
  const [centroId, setCentroId] = useState("todos");
  const [campamentoAbierto, setCampamentoAbierto] = useState(false);
  const [sexo, setSexo] = useState<FiltroSexo>("todos");
  const [solicitado, setSolicitado] = useState<FiltroBinario>("todos");
  const [registroPolicial, setRegistroPolicial] = useState<FiltroBinario>("todos");
  const [verificadoSiipol, setVerificadoSiipol] = useState<FiltroBinario>("todos");
  const [orden, setOrden] = useState<OrdenRegistrosCenso>("reciente");

  const {
    registros,
    total,
    pagina,
    setPagina,
    totalPaginas,
    filasPorPagina,
    cargando,
    error,
    refrescar,
    filtrosApi,
  } = useCensoRedListado(
    {
      busqueda,
      centroId,
      sexo,
      orden,
      solicitado,
      registroPolicial,
      verificadoSiipol,
    },
    { enabled: tieneAcceso },
  );

  const campamentos = useMemo(
    () =>
      [...resumenes]
        .filter((r) => r.totalRegistrados > 0)
        .sort((a, b) => a.centroNombre.localeCompare(b.centroNombre, "es"))
        .map((r) => ({ id: r.centroId, nombre: r.centroNombre })),
    [resumenes],
  );

  const kpisDemo = useMemo(() => {
    let hombres = 0;
    let mujeres = 0;
    let menores = 0;
    for (const r of resumenes) {
      if (r.totalRegistrados <= 0) continue;
      hombres += r.hombres;
      mujeres += r.mujeres;
      menores +=
        r.recienNacidosH +
        r.recienNacidosM +
        r.ninos +
        r.ninas +
        r.adolescentesH +
        r.adolescentesM;
    }
    return { hombres, mujeres, menores };
  }, [resumenes]);

  const pctVerif = (parte: number) => {
    const base = kpisImportaciones.personasVerificables;
    if (base <= 0) return "0% de verificables";
    return `${Math.round((parte / base) * 100)}% de ${base.toLocaleString("es")}`;
  };

  const hayFiltros =
    busqueda.trim() !== "" ||
    centroId !== "todos" ||
    sexo !== "todos" ||
    solicitado !== "todos" ||
    registroPolicial !== "todos" ||
    verificadoSiipol !== "todos" ||
    orden !== "reciente";

  const obtenerFilasExportacion = useCallback(
    (onProgreso?: (cargados: number, totalFilas: number) => void) =>
      obtenerListadoCensoRedFiltrado(filtrosApi, onProgreso),
    [filtrosApi],
  );

  async function refrescarTodo() {
    await Promise.all([refrescar(), refrescarResumen()]);
  }

  return (
    <VistaPagina
      icono={Users}
      acento="teal"
      titulo="Importaciones Excel"
      descripcion="Planillas externas contrastadas con el último parte de campamentos; SIIPOL y SAIME sobre cédulas verificables."
      cuerpoClassName="p-4 lg:p-6"
      acciones={
        tieneAcceso ? (
          <div className="flex items-center gap-2">
            <BotonExportarCensoRed
              obtenerFilas={obtenerFilasExportacion}
              totalEsperado={total}
              deshabilitado={cargando || total === 0}
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 border border-border"
              disabled={cargando || cargandoResumen}
              onClick={() => void refrescarTodo()}
            >
              <RefreshCw
                className={cn(
                  "size-3.5",
                  (cargando || cargandoResumen) && "animate-spin",
                )}
              />
              Actualizar
            </Button>
          </div>
        ) : undefined
      }
    >
      {!tieneAcceso ? (
        <div className="mx-auto mt-6 max-w-md rounded-xl border border-border bg-background/70 p-6 text-center">
          <ShieldCheck className="mx-auto mb-3 size-8 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">
            Acceso restringido
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Solo el administrador, el analista y la autoridad pueden
            consultar el registro de la red.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <CensoRedTabs />

          {error ? (
            <div className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <div className="space-y-2">
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Meta operativa
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <KpiPersona
                  valor={kpisImportaciones.parteUltimo}
                  etiqueta="Último parte totalizado"
                  detalle="Misma cifra que Campamentos"
                  icono={ClipboardList}
                  clase="bg-sky-500/10 text-sky-600 dark:text-sky-300"
                />
                <KpiPersona
                  valor={kpisImportaciones.importadosExcel}
                  etiqueta="Cargadas por Excel"
                  detalle={`${kpisImportaciones.campamentosConImport.toLocaleString("es")} campamentos`}
                  icono={FileSpreadsheet}
                />
                <KpiPersona
                  valor={kpisImportaciones.campamentosConImport}
                  etiqueta="Campamentos con planilla"
                  detalle={
                    kpisImportaciones.totalRegistros > kpisImportaciones.importadosExcel
                      ? `+${(kpisImportaciones.totalRegistros - kpisImportaciones.importadosExcel).toLocaleString("es")} fuera de Excel en listado`
                      : "Con al menos un import Excel"
                  }
                  icono={Users}
                />
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Identidad · partición de las{" "}
                {kpisImportaciones.importadosExcel.toLocaleString("es")} Excel
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
                <KpiPersona
                  valor={kpisImportaciones.ceduladasVerificables}
                  etiqueta="Ceduladas verificables"
                  detalle="Adultos/sin edad · cédula OK"
                  icono={IdCard}
                  clase="bg-sky-500/10 text-sky-600 dark:text-sky-300"
                  activo={orden === "con_cedula"}
                  onClick={() =>
                    setOrden((v) => (v === "con_cedula" ? "reciente" : "con_cedula"))
                  }
                />
                <KpiPersona
                  valor={kpisImportaciones.menoresNoCedulados}
                  etiqueta="Menores no cedulados"
                  detalle="Menores de 18 sin documento"
                  icono={Baby}
                  clase="bg-violet-500/10 text-violet-600 dark:text-violet-300"
                  activo={orden === "sin_cedula"}
                  onClick={() =>
                    setOrden((v) => (v === "sin_cedula" ? "reciente" : "sin_cedula"))
                  }
                />
                <KpiPersona
                  valor={kpisImportaciones.menoresConCedula}
                  etiqueta="Menores con cédula"
                  detalle="Menores de 18 con documento OK"
                  icono={Baby}
                  clase="bg-indigo-500/10 text-indigo-600 dark:text-indigo-300"
                />
                <KpiPersona
                  valor={kpisImportaciones.adultosSinCedula}
                  etiqueta="Adultos sin cédula"
                  detalle="≥18 o sin edad · sin doc"
                  icono={Users}
                  clase="bg-slate-500/10 text-slate-600 dark:text-slate-300"
                />
                <KpiPersona
                  valor={kpisImportaciones.cedulasInvalidas}
                  etiqueta="Cédulas con error"
                  detalle="Formato no consultable"
                  icono={CircleAlert}
                  clase="bg-rose-500/10 text-rose-600 dark:text-rose-300"
                />
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Verificación ·{" "}
                {kpisImportaciones.personasVerificables.toLocaleString("es")}{" "}
                personas con cédula (adultos + menores)
              </p>
              <div className="grid grid-cols-2 gap-2 xl:grid-cols-5">
                <KpiPersona
                  valor={kpisImportaciones.personasVerificables}
                  etiqueta="Personas verificables"
                  detalle={`${kpisImportaciones.ceduladasVerificables.toLocaleString("es")} adultos + ${kpisImportaciones.menoresConCedula.toLocaleString("es")} menores`}
                  icono={IdCard}
                  clase="bg-sky-500/10 text-sky-600 dark:text-sky-300"
                />
                <KpiPersona
                  valor={kpisImportaciones.siipolVerificados}
                  etiqueta="SIIPOL verificados"
                  detalle={pctVerif(kpisImportaciones.siipolVerificados)}
                  icono={BadgeCheck}
                  clase="bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
                  activo={verificadoSiipol === "si"}
                  onClick={() =>
                    setVerificadoSiipol((v) => (v === "si" ? "todos" : "si"))
                  }
                />
                <KpiPersona
                  valor={kpisImportaciones.siipolPendientes}
                  etiqueta="SIIPOL pendientes"
                  detalle={pctVerif(kpisImportaciones.siipolPendientes)}
                  icono={ScanSearch}
                  clase="bg-slate-500/10 text-slate-600 dark:text-slate-300"
                  activo={verificadoSiipol === "no"}
                  onClick={() =>
                    setVerificadoSiipol((v) => (v === "no" ? "todos" : "no"))
                  }
                />
                <KpiPersona
                  valor={kpisImportaciones.saimeVerificados}
                  etiqueta="SAIME verificados"
                  detalle={pctVerif(kpisImportaciones.saimeVerificados)}
                  icono={BadgeCheck}
                  clase="bg-blue-500/10 text-blue-600 dark:text-blue-300"
                  activo={orden === "nexus"}
                  onClick={() =>
                    setOrden((v) => (v === "nexus" ? "reciente" : "nexus"))
                  }
                />
                <KpiPersona
                  valor={kpisImportaciones.saimePendientes}
                  etiqueta="SAIME pendientes"
                  detalle={pctVerif(kpisImportaciones.saimePendientes)}
                  icono={ScanSearch}
                  clase="bg-orange-500/10 text-orange-600 dark:text-orange-300"
                />
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Alertas de seguridad · clic para filtrar
              </p>
              <div className="grid grid-cols-2 gap-2">
                <KpiPersona
                  valor={kpisImportaciones.solicitados}
                  etiqueta="Solicitados"
                  icono={ShieldAlert}
                  clase="bg-red-500/10 text-red-600 dark:text-red-300"
                  activo={solicitado === "si"}
                  onClick={() =>
                    setSolicitado((v) => (v === "si" ? "todos" : "si"))
                  }
                />
                <KpiPersona
                  valor={kpisImportaciones.conRegistroPolicial}
                  etiqueta="Reg. policial"
                  icono={ShieldCheck}
                  clase="bg-amber-500/10 text-amber-600 dark:text-amber-300"
                  activo={registroPolicial === "si"}
                  onClick={() =>
                    setRegistroPolicial((v) => (v === "si" ? "todos" : "si"))
                  }
                />
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Demografía · clic para filtrar
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <KpiPersona
                  valor={kpisDemo.hombres}
                  etiqueta="Hombres"
                  icono={Users}
                  activo={sexo === "M"}
                  onClick={() => setSexo((v) => (v === "M" ? "todos" : "M"))}
                />
                <KpiPersona
                  valor={kpisDemo.mujeres}
                  etiqueta="Mujeres"
                  icono={Users}
                  activo={sexo === "F"}
                  onClick={() => setSexo((v) => (v === "F" ? "todos" : "F"))}
                />
                <KpiPersona
                  valor={kpisDemo.menores}
                  etiqueta="Menores de 18"
                  detalle="Con edad consignada"
                  icono={Baby}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[180px] flex-1 sm:max-w-sm">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar nombre, cédula, teléfono o campamento…"
                className="h-8 pl-8 text-sm"
              />
            </div>

            <Popover open={campamentoAbierto} onOpenChange={setCampamentoAbierto}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={campamentoAbierto}
                  className="h-8 w-52 max-w-full justify-between border border-input px-2.5 text-sm font-normal"
                >
                  <span className="truncate">
                    {centroId === "todos"
                      ? "Todos los campamentos"
                      : (campamentos.find((c) => c.id === centroId)?.nombre ?? centroId)}
                  </span>
                  <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-64 p-0">
                <Command>
                  <CommandInput placeholder="Buscar campamento…" className="h-9" />
                  <CommandList>
                    <CommandEmpty>Sin campamentos.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="Todos los campamentos"
                        onSelect={() => {
                          setCentroId("todos");
                          setCampamentoAbierto(false);
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 size-3.5",
                            centroId === "todos" ? "opacity-100" : "opacity-0",
                          )}
                        />
                        Todos los campamentos
                      </CommandItem>
                      {campamentos.map((c) => (
                        <CommandItem
                          key={c.id}
                          value={c.nombre}
                          onSelect={() => {
                            setCentroId(c.id);
                            setCampamentoAbierto(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 size-3.5",
                              centroId === c.id ? "opacity-100" : "opacity-0",
                            )}
                          />
                          <span className="truncate">{c.nombre}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            <Select
              value={sexo}
              onValueChange={(v) => setSexo(v as FiltroSexo)}
            >
              <SelectTrigger
                size="sm"
                className={cn(CENSO_SELECT_TRIGGER, "h-8 w-32")}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todo sexo</SelectItem>
                <SelectItem value="M">Hombres</SelectItem>
                <SelectItem value="F">Mujeres</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={solicitado}
              onValueChange={(v) => setSolicitado(v as FiltroBinario)}
            >
              <SelectTrigger
                size="sm"
                className={cn(CENSO_SELECT_TRIGGER, "h-8 w-36")}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Solicitados</SelectItem>
                <SelectItem value="si">Solo sí</SelectItem>
                <SelectItem value="no">Solo no</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={registroPolicial}
              onValueChange={(v) => setRegistroPolicial(v as FiltroBinario)}
            >
              <SelectTrigger
                size="sm"
                className={cn(CENSO_SELECT_TRIGGER, "h-8 w-40")}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Reg. policial</SelectItem>
                <SelectItem value="si">Solo sí</SelectItem>
                <SelectItem value="no">Solo no</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={verificadoSiipol}
              onValueChange={(v) => setVerificadoSiipol(v as FiltroBinario)}
            >
              <SelectTrigger
                size="sm"
                className={cn(CENSO_SELECT_TRIGGER, "h-8 w-44")}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Estado SIIPOL</SelectItem>
                <SelectItem value="si">Verificados</SelectItem>
                <SelectItem value="no">Pendientes</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={orden}
              onValueChange={(v) => setOrden(v as OrdenRegistrosCenso)}
            >
              <SelectTrigger
                size="sm"
                className={cn(CENSO_SELECT_TRIGGER, "h-8 w-48")}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="reciente">Más recientes</SelectItem>
                <SelectItem value="nombre">Nombre A → Z</SelectItem>
                <SelectItem value="campamento">Campamento</SelectItem>
                <SelectItem value="edad">Mayor edad</SelectItem>
                <SelectItem value="solicitado">Solicitados primero</SelectItem>
                <SelectItem value="reg_policial">Reg. policial primero</SelectItem>
                <SelectItem value="nexus">Nexus verificados primero</SelectItem>
                <SelectItem value="siipol">SIIPOL verificados primero</SelectItem>
                <SelectItem value="con_cedula">Con cédula primero</SelectItem>
                <SelectItem value="sin_cedula">Sin cédula primero</SelectItem>
              </SelectContent>
            </Select>

            {hayFiltros ? (
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 border border-border text-xs"
                onClick={() => {
                  setBusqueda("");
                  setCentroId("todos");
                  setSexo("todos");
                  setSolicitado("todos");
                  setRegistroPolicial("todos");
                  setVerificadoSiipol("todos");
                  setOrden("reciente");
                }}
              >
                <FilterX className="size-3.5" />
                Limpiar
              </Button>
            ) : null}

            <Badge variant="outline" className="ml-auto tabular-nums">
              {total.toLocaleString("es")} persona{total === 1 ? "" : "s"}
              {hayFiltros ? " (filtradas)" : ""}
            </Badge>
          </div>

          <Card className="border-teal-500/15">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Registro rápido</CardTitle>
              <CardDescription>
                {cargando && registros.length === 0
                  ? "Cargando…"
                  : `${total.toLocaleString("es")} registro${total === 1 ? "" : "s"} · ${filasPorPagina} por página`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 p-4 pt-0">
              {cargando && registros.length === 0 ? (
                <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin text-primary" />
                  Cargando listado…
                </div>
              ) : total === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  {hayFiltros
                    ? "Ninguna persona coincide con los filtros seleccionados."
                    : "Aún no hay registros en la planilla rápida."}
                </p>
              ) : (
                <>
                  <PaginadorTabla
                    pagina={pagina}
                    totalPaginas={totalPaginas}
                    totalFilas={total}
                    filasPorPagina={filasPorPagina}
                    cargando={cargando}
                    onPagina={setPagina}
                    className="border-t-0 pt-0"
                  />
                  <CensoRegistrosTabla
                    filas={registros}
                    mostrarCentro
                    numeroInicial={pagina * filasPorPagina + 1}
                    numeracionDescendente={false}
                    puedeEditar={false}
                    onEditar={() => {}}
                    onEliminar={() => {}}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </VistaPagina>
  );
}
