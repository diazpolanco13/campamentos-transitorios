// Dashboard de verificación Nexus/SIIPOL de Importaciones Excel (red).

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Baby,
  BadgeCheck,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { Sesion } from "@/data/authSupabase";
import type { VerificacionCensoCentro } from "@/data/reposCenso";
import {
  esNoInstaladoSinExcel,
  useCensoVerificacion,
} from "@/data/useCensoVerificacion";
import { puedeVerCensoRapidoRed } from "@/domain/permisos";
import { CensoRedTabs } from "@/features/censo/CensoRedTabs";
import { BotonReporteVerificacionCenso } from "@/features/censo/reporte-verificacion/BotonReporteVerificacionCenso";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VistaPagina } from "@/components/VistaPagina";
import { cn } from "@/lib/utils";

type OrdenVerificacion =
  | "nro"
  | "solicitadas"
  | "registro"
  | "faltan"
  | "pct_verif"
  | "censadas"
  | "sin_lista"
  | "no_instalados";

const ORDENES: { valor: OrdenVerificacion; label: string }[] = [
  { valor: "nro", label: "N.º" },
  { valor: "solicitadas", label: "Solicitadas" },
  { valor: "registro", label: "Con registro" },
  { valor: "faltan", label: "Faltan" },
  { valor: "pct_verif", label: "% verif." },
  { valor: "censadas", label: "Censadas" },
  { valor: "sin_lista", label: "Sin lista" },
  { valor: "no_instalados", label: "No instalados" },
];

function pct(parte: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((parte / total) * 1000) / 10;
}

function fmt(n: number): string {
  return n.toLocaleString("es");
}

function pctVerifFila(f: VerificacionCensoCentro): number {
  return pct(f.verificadas, f.adultos);
}

function compararNroNombre(a: VerificacionCensoCentro, b: VerificacionCensoCentro): number {
  const na = a.centroNro;
  const nb = b.centroNro;
  if (na != null && nb != null && na !== nb) return na - nb;
  if (na != null && nb == null) return -1;
  if (na == null && nb != null) return 1;
  return a.centroNombre.localeCompare(b.centroNombre, "es");
}

function ordenarFilas(
  filas: VerificacionCensoCentro[],
  orden: OrdenVerificacion,
): VerificacionCensoCentro[] {
  const copia = [...filas];
  copia.sort((a, b) => {
    switch (orden) {
      case "solicitadas":
        return b.solicitadas - a.solicitadas || compararNroNombre(a, b);
      case "registro":
        return b.conRegistro - a.conRegistro || compararNroNombre(a, b);
      case "faltan":
        return b.faltan - a.faltan || compararNroNombre(a, b);
      case "pct_verif": {
        const pa = a.censadas > 0 ? pctVerifFila(a) : -1;
        const pb = b.censadas > 0 ? pctVerifFila(b) : -1;
        return pa - pb || compararNroNombre(a, b);
      }
      case "censadas":
        return b.censadas - a.censadas || compararNroNombre(a, b);
      case "sin_lista": {
        const sa = a.censadas === 0 ? 0 : 1;
        const sb = b.censadas === 0 ? 0 : 1;
        return sa - sb || compararNroNombre(a, b);
      }
      case "no_instalados": {
        const sa = esNoInstaladoSinExcel(a) ? 0 : 1;
        const sb = esNoInstaladoSinExcel(b) ? 0 : 1;
        return sa - sb || compararNroNombre(a, b);
      }
      case "nro":
      default:
        return compararNroNombre(a, b);
    }
  });
  return copia;
}

function KpiCard({
  valor,
  etiqueta,
  detalle,
  icono: Icono,
  claseIcono,
}: {
  valor: number;
  etiqueta: string;
  detalle?: string;
  icono: typeof Users;
  claseIcono?: string;
}) {
  return (
    <Card size="sm" className="border-teal-500/15 py-2">
      <CardContent className="flex items-center gap-3 px-3">
        <div
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-300",
            claseIcono,
          )}
        >
          <Icono className="size-4" />
        </div>
        <div className="min-w-0 text-left">
          <p className="text-lg font-bold tabular-nums leading-none">
            {fmt(valor)}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{etiqueta}</p>
          {detalle ? (
            <p className="text-[10px] text-muted-foreground/80">{detalle}</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function BarraApilada({
  titulo,
  segmentos,
}: {
  titulo: string;
  segmentos: { clave: string; label: string; valor: number; clase: string }[];
}) {
  const total = segmentos.reduce((acc, s) => acc + s.valor, 0);
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-[11px] font-medium text-foreground">{titulo}</p>
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
        {total <= 0 ? (
          <div className="h-full w-full bg-muted" />
        ) : (
          segmentos.map((s) =>
            s.valor <= 0 ? null : (
              <div
                key={s.clave}
                className={cn("h-full min-w-0", s.clase)}
                style={{ width: `${(s.valor / total) * 100}%` }}
                title={`${s.label}: ${fmt(s.valor)} (${pct(s.valor, total)}%)`}
              />
            ),
          )
        )}
      </div>
      <div className="flex flex-wrap gap-x-2.5 gap-y-0.5">
        {segmentos.map((s) => (
          <span
            key={s.clave}
            className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"
          >
            <span className={cn("size-2 rounded-sm", s.clase)} />
            {s.label} {pct(s.valor, total)}%
          </span>
        ))}
      </div>
    </div>
  );
}

export function CensoVerificacionView({ sesion }: { sesion: Sesion }) {
  const tieneAcceso = puedeVerCensoRapidoRed(sesion.user.rol);
  const { filas, totales, cargando, error, refrescar } =
    useCensoVerificacion(tieneAcceso);
  const [busqueda, setBusqueda] = useState("");
  const [orden, setOrden] = useState<OrdenVerificacion>("nro");

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLocaleLowerCase("es");
    let filtradas = !q
      ? filas
      : filas.filter(
          (f) =>
            f.centroNombre.toLocaleLowerCase("es").includes(q) ||
            (f.centroNro != null && String(f.centroNro).includes(q)),
        );
    if (orden === "no_instalados") {
      filtradas = filtradas.filter(esNoInstaladoSinExcel);
    }
    return ordenarFilas(filtradas, orden);
  }, [busqueda, filas, orden]);

  return (
    <VistaPagina
      icono={ShieldCheck}
      acento="teal"
      titulo="Verificación"
      descripcion="Cobertura Nexus/SAIME y SIIPOL de personas en Importaciones Excel."
      cuerpoClassName="min-w-0 p-4 lg:p-6"
      acciones={
        tieneAcceso ? (
          <div className="flex items-center gap-2">
            <BotonReporteVerificacionCenso
              filas={filas}
              totales={totales}
              cargando={cargando}
              generadoPor={
                sesion.user.nombre?.trim() || sesion.user.username
              }
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 border border-border"
              disabled={cargando}
              onClick={() => void refrescar()}
            >
              <RefreshCw
                className={cn("size-3.5", cargando && "animate-spin")}
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
            Solo el administrador, el analista y la autoridad pueden consultar
            la verificación del registro.
          </p>
        </div>
      ) : (
        <div className="min-w-0 space-y-3">
          <CensoRedTabs />

          {error ? (
            <div className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          {cargando && filas.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Cargando verificación…
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
                <KpiCard
                  valor={totales.censadas}
                  etiqueta="Personas censadas"
                  detalle={`${fmt(totales.campamentosConLista)} con lista · ${fmt(totales.campamentos)} campamentos`}
                  icono={Users}
                />
                <KpiCard
                  valor={totales.menores}
                  etiqueta="Menores de edad"
                  detalle={`${pct(totales.menores, totales.censadas)}% · no se verifican`}
                  icono={Baby}
                />
                <KpiCard
                  valor={totales.adultos}
                  etiqueta="Adultos (a verificar)"
                  detalle={`${pct(totales.adultos, totales.censadas)}% del total`}
                  icono={Users}
                />
                <KpiCard
                  valor={totales.verificadas}
                  etiqueta="Adultos verificados"
                  detalle={`${pct(totales.verificadas, totales.adultos)}% de adultos`}
                  icono={BadgeCheck}
                  claseIcono="bg-sky-500/10 text-sky-600 dark:text-sky-300"
                />
                <KpiCard
                  valor={totales.nexus}
                  etiqueta="Por Nexus / SAIME"
                  detalle={`${pct(totales.nexus, totales.adultos)}% de adultos`}
                  icono={BadgeCheck}
                  claseIcono="bg-blue-500/10 text-blue-600 dark:text-blue-300"
                />
                <KpiCard
                  valor={totales.siipol}
                  etiqueta="Por SIIPOL"
                  detalle={`${pct(totales.siipol, totales.adultos)}% de adultos`}
                  icono={BadgeCheck}
                  claseIcono="bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
                />
                <KpiCard
                  valor={totales.faltan}
                  etiqueta="Faltan por verificar"
                  detalle={`${pct(totales.faltan, totales.adultos)}% de adultos`}
                  icono={Search}
                  claseIcono="bg-slate-500/10 text-slate-600 dark:text-slate-300"
                />
                <KpiCard
                  valor={totales.solicitadas}
                  etiqueta="Solicitadas"
                  detalle={`${fmt(totales.campamentosConSolicitadas)} campamentos`}
                  icono={ShieldAlert}
                  claseIcono="bg-red-500/10 text-red-600 dark:text-red-300"
                />
                <KpiCard
                  valor={totales.conRegistro}
                  etiqueta="Con registro policial"
                  detalle={`${fmt(totales.campamentosConRegistro)} campamentos`}
                  icono={ShieldAlert}
                  claseIcono="bg-amber-500/10 text-amber-600 dark:text-amber-300"
                />
              </div>

              <Card size="sm" className="py-3">
                <CardHeader className="px-4 pb-2 pt-0">
                  <CardTitle className="text-sm">
                    Composición y cobertura
                  </CardTitle>
                  <CardDescription className="text-[11px]">
                    Menores no entran en la verificación. Entre adultos: Nexus,
                    SIIPOL o ambos.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 px-4 pb-0 pt-0 md:grid-cols-2">
                  <BarraApilada
                    titulo="Composición del registro"
                    segmentos={[
                      {
                        clave: "adultos",
                        label: "Adultos (a verificar)",
                        valor: totales.adultos,
                        clase: "bg-sky-700",
                      },
                      {
                        clave: "menores",
                        label: "Menores (no se verifican)",
                        valor: totales.menores,
                        clase: "bg-sky-300",
                      },
                    ]}
                  />
                  <BarraApilada
                    titulo="Verificación de los adultos"
                    segmentos={[
                      {
                        clave: "ambos",
                        label: "Nexus + SIIPOL",
                        valor: totales.ambos,
                        clase: "bg-sky-800",
                      },
                      {
                        clave: "solo_nexus",
                        label: "Solo Nexus/SAIME",
                        valor: totales.soloNexus,
                        clase: "bg-orange-400",
                      },
                      {
                        clave: "solo_siipol",
                        label: "Solo SIIPOL",
                        valor: totales.soloSiipol,
                        clase: "bg-emerald-500",
                      },
                      {
                        clave: "ninguno",
                        label: "Sin verificar",
                        valor: totales.faltan,
                        clase: "bg-slate-300 dark:bg-slate-600",
                      },
                    ]}
                  />
                </CardContent>
              </Card>

              <Card className="min-w-0 overflow-hidden py-0">
                <CardHeader className="gap-3 space-y-0 px-4 pt-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <CardTitle className="text-base">
                        Campamentos: censo, verificación y alertas
                      </CardTitle>
                      <CardDescription>
                        {fmt(totales.campamentos)} centros ·{" "}
                        {fmt(totales.campamentosSinLista)} sin lista importada ·{" "}
                        {fmt(totales.campamentosNoInstalados)} no instalados
                        (sin Excel).
                      </CardDescription>
                    </div>
                    <div className="relative w-full sm:max-w-xs">
                      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                        placeholder="Buscar n.º o campamento…"
                        className="h-8 pl-8 text-sm"
                      />
                    </div>
                  </div>
                  <Tabs
                    value={orden}
                    onValueChange={(v) => setOrden(v as OrdenVerificacion)}
                    className="gap-1.5"
                  >
                    <p className="text-[11px] font-medium text-muted-foreground">
                      Ordenar / filtrar
                    </p>
                    <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-muted/40 p-1">
                      {ORDENES.map((o) => (
                        <TabsTrigger
                          key={o.valor}
                          value={o.valor}
                          className="h-7 flex-none px-2.5 text-[11px]"
                        >
                          {o.label}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                </CardHeader>
                <CardContent className="min-w-0 px-0 pb-0">
                  <Table className="w-full table-fixed" containerClassName="min-w-0">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10 pl-3 text-right">N.º</TableHead>
                        <TableHead className="w-[9.5rem] sm:w-[12rem]">
                          Campamento
                        </TableHead>
                        <TableHead className="w-14 text-right">Cens.</TableHead>
                        <TableHead className="w-12 text-right">Men.</TableHead>
                        <TableHead className="w-12 text-right">Adul.</TableHead>
                        <TableHead className="w-12 text-right">Nex.</TableHead>
                        <TableHead className="w-12 text-right">SIIP.</TableHead>
                        <TableHead className="w-12 text-right">Verif.</TableHead>
                        <TableHead className="w-[5.5rem]">% verif.</TableHead>
                        <TableHead className="w-12 text-right">Falt.</TableHead>
                        <TableHead className="w-12 text-right">Sol.</TableHead>
                        <TableHead className="w-12 pr-3 text-right">Reg.</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibles.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={12}
                            className="h-24 text-center text-muted-foreground"
                          >
                            Sin campamentos.
                          </TableCell>
                        </TableRow>
                      ) : (
                        visibles.map((f) => {
                          const pctVerif = pctVerifFila(f);
                          const sinLista = f.censadas === 0;
                          const noInstalado = esNoInstaladoSinExcel(f);
                          return (
                            <TableRow
                              key={f.centroId}
                              className={cn(
                                "hover:bg-muted/40",
                                sinLista && "bg-muted/20 text-muted-foreground",
                              )}
                            >
                              <TableCell className="pl-3 text-right tabular-nums text-muted-foreground">
                                {f.centroNro ?? "—"}
                              </TableCell>
                              <TableCell className="max-w-0">
                                <div className="flex min-w-0 items-center gap-1">
                                  <Link
                                    to={`/centros/registro/${f.centroId}`}
                                    title={f.centroNombre}
                                    className="block min-w-0 truncate text-xs font-medium text-foreground underline-offset-2 hover:underline"
                                  >
                                    {f.centroNombre}
                                  </Link>
                                  {noInstalado ? (
                                    <Badge
                                      variant="outline"
                                      title="En proceso de instalación: no se exige planilla Excel"
                                      className="shrink-0 border-amber-500/40 px-1 text-[9px] text-amber-700 dark:text-amber-300"
                                    >
                                      No instal.
                                    </Badge>
                                  ) : sinLista ? (
                                    <Badge
                                      variant="outline"
                                      className="shrink-0 px-1 text-[9px]"
                                    >
                                      Sin
                                    </Badge>
                                  ) : null}
                                </div>
                              </TableCell>
                              <TableCell className="text-right text-xs tabular-nums">
                                {fmt(f.censadas)}
                              </TableCell>
                              <TableCell className="text-right text-xs tabular-nums">
                                {fmt(f.menores)}
                              </TableCell>
                              <TableCell className="text-right text-xs tabular-nums">
                                {fmt(f.adultos)}
                              </TableCell>
                              <TableCell className="text-right text-xs tabular-nums">
                                {fmt(f.nexus)}
                              </TableCell>
                              <TableCell className="text-right text-xs tabular-nums">
                                {fmt(f.siipol)}
                              </TableCell>
                              <TableCell className="text-right text-xs tabular-nums">
                                {fmt(f.verificadas)}
                              </TableCell>
                              <TableCell>
                                {sinLista ? (
                                  <span className="text-xs text-muted-foreground">
                                    —
                                  </span>
                                ) : (
                                  <div className="flex min-w-0 items-center gap-1">
                                    <Progress
                                      value={pctVerif}
                                      className="h-1 min-w-0 flex-1"
                                    />
                                    <span className="w-8 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
                                      {pctVerif}%
                                    </span>
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className="text-right text-xs tabular-nums">
                                {fmt(f.faltan)}
                              </TableCell>
                              <TableCell className="text-right">
                                {f.solicitadas > 0 ? (
                                  <Badge
                                    variant="destructive"
                                    className="px-1.5 text-[10px] tabular-nums"
                                  >
                                    {fmt(f.solicitadas)}
                                  </Badge>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell className="pr-3 text-right">
                                {f.conRegistro > 0 ? (
                                  <Badge
                                    variant="secondary"
                                    className="bg-amber-500/15 px-1.5 text-[10px] text-amber-800 tabular-nums dark:text-amber-200"
                                  >
                                    {fmt(f.conRegistro)}
                                  </Badge>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}
    </VistaPagina>
  );
}
