import { Link } from "react-router-dom";
import { BadgeCheck, Ban, Clock3, FileSpreadsheet, Pencil, Trash2 } from "lucide-react";
import { type RegistroCensoGuardado } from "@/data/reposCenso";
import { CEDULA_JEFE_NO_SE } from "@/domain/catalogosHumanitarios";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { nombreCompletoRegistro } from "./censoRegistrosUtil";

function tituloSeguridad(fila: RegistroCensoGuardado): string | undefined {
  const partes = [
    fila.tipo_registro_policial,
    fila.observaciones_seguridad,
    fila.deportado ? "Deportado" : "",
  ].filter(Boolean);
  return partes.length > 0 ? partes.join(" · ") : undefined;
}

function tituloSiipol(fila: RegistroCensoGuardado): string {
  if (!fila.verificado_siipol) return "Pendiente de verificación SIIPOL";
  const partes = ["Verificado SIIPOL", fila.verificado_siipol_fuente];
  if (fila.verificado_siipol_en) {
    partes.push(new Date(fila.verificado_siipol_en).toLocaleString("es-VE"));
  }
  return partes.filter(Boolean).join(" · ");
}

function documentoInvalidoNexus(fila: RegistroCensoGuardado): boolean {
  if (fila.documento_invalido) return true;
  const digitos = (fila.documento ?? "").replace(/\D/g, "");
  if (!digitos) return false;
  return digitos.length < 6 || digitos.length > 8 || /^0+$/.test(digitos);
}

function tituloNexus(fila: RegistroCensoGuardado): string {
  if (!fila.documento?.trim()) return "Sin documento — no verificable en Nexus";
  if (documentoInvalidoNexus(fila)) {
    return "Cédula con formato inválido — no consultable en Nexus (esperado 6–8 dígitos)";
  }
  if (!fila.verificado_nexus) return "Pendiente de verificación Nexus/SAIME";
  const partes = ["Verificado Nexus", fila.verificado_nexus_fuente];
  if (fila.verificado_nexus_en) {
    partes.push(new Date(fila.verificado_nexus_en).toLocaleString("es-VE"));
  }
  return partes.filter(Boolean).join(" · ");
}

function FilaRegistro({
  fila,
  numero,
  mostrarCentro,
  puedeEditar,
  onEditar,
  onEliminar,
}: {
  fila: RegistroCensoGuardado & { centro_id?: string; centro_nombre?: string };
  numero: number;
  mostrarCentro?: boolean;
  puedeEditar: boolean;
  onEditar: () => void;
  onEliminar: () => void;
}) {
  const nombre = nombreCompletoRegistro(fila);
  const doc = fila.documento
    ? `${fila.tipo_doc === "P" ? "PP " : (fila.tipo_doc ?? "V") + "-"}${fila.documento}`
    : "—";
  const fecha = new Date(fila.creado_en).toLocaleString("es-VE", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <TableRow>
      <TableCell className="px-2 py-1.5 text-center text-muted-foreground">{numero}</TableCell>
      <TableCell className="max-w-40 px-2 py-1.5">
        <span className="block truncate font-medium" title={nombre}>
          {nombre}
        </span>
        {fila.parentesco_jefe && (
          <span className="block truncate text-[10px] text-muted-foreground">
            {fila.parentesco_jefe}
            {fila.jefe_documento === CEDULA_JEFE_NO_SE ? " · cédula no conocida" : null}
          </span>
        )}
        {fila.origen === "import_excel" && (
          <span className="mt-0.5 flex flex-wrap gap-1">
            <Badge
              variant="outline"
              className="h-4 gap-0.5 border-violet-500/50 px-1 text-[9px] text-violet-700 dark:text-violet-300"
              title={
                [fila.fuente_archivo, fila.nombre_centro_raw, fila.centro_match]
                  .filter(Boolean)
                  .join(" · ") || "Importación Excel"
              }
            >
              <FileSpreadsheet className="size-2.5" />
              XLS
            </Badge>
          </span>
        )}
      </TableCell>
      <TableCell className="px-2 py-1.5 font-mono text-[11px]">{doc}</TableCell>
      <TableCell className="px-2 py-1.5 text-center">{fila.edad ?? "—"}</TableCell>
      <TableCell className="px-2 py-1.5 text-center">{fila.sexo ?? "—"}</TableCell>
      {mostrarCentro && (
        <TableCell className="max-w-36 px-2 py-1.5">
          {fila.centro_id ? (
            <Link
              to={`/centros/registro/${fila.centro_id}`}
              className="block truncate text-teal-600 hover:underline dark:text-teal-300"
              title={fila.centro_nombre}
            >
              {fila.centro_nombre ?? fila.centro_id}
            </Link>
          ) : (
            "—"
          )}
        </TableCell>
      )}
      <TableCell className="px-2 py-1.5 text-center" title={tituloNexus(fila)}>
        {!fila.documento?.trim() ? (
          "—"
        ) : documentoInvalidoNexus(fila) ? (
          <Badge
            variant="outline"
            className="h-5 gap-1 border-rose-500/60 px-1.5 text-[10px] text-rose-700 dark:text-rose-300"
          >
            <Ban className="size-3" />
            Inválida
          </Badge>
        ) : fila.verificado_nexus ? (
          <Badge
            variant="outline"
            className="h-5 gap-1 border-sky-500/60 px-1.5 text-[10px] text-sky-700 dark:text-sky-300"
          >
            <BadgeCheck className="size-3" />
            Verificado
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="h-5 gap-1 border-slate-400/50 px-1.5 text-[10px] text-muted-foreground"
          >
            <Clock3 className="size-3" />
            Pendiente
          </Badge>
        )}
      </TableCell>
      <TableCell className="px-2 py-1.5 text-center" title={tituloSiipol(fila)}>
        {fila.verificado_siipol ? (
          <Badge
            variant="outline"
            className="h-5 gap-1 border-emerald-500/60 px-1.5 text-[10px] text-emerald-700 dark:text-emerald-300"
          >
            <BadgeCheck className="size-3" />
            Verificado
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="h-5 gap-1 border-slate-400/50 px-1.5 text-[10px] text-muted-foreground"
          >
            <Clock3 className="size-3" />
            Pendiente
          </Badge>
        )}
      </TableCell>
      <TableCell className="px-2 py-1.5 text-center" title={tituloSeguridad(fila)}>
        {fila.solicitado ? (
          <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
            Sí
          </Badge>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell className="px-2 py-1.5 text-center" title={tituloSeguridad(fila)}>
        {fila.registro_policial ? (
          <Badge
            variant="outline"
            className="h-5 border-amber-500/60 px-1.5 text-[10px] text-amber-700 dark:text-amber-300"
          >
            Sí
          </Badge>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell className="px-2 py-1.5 text-right text-muted-foreground">{fecha}</TableCell>
      {puedeEditar && (
        <TableCell className="px-1 py-1.5">
          <div className="flex items-center justify-center gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              title="Corregir registro"
              onClick={onEditar}
            >
              <Pencil className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 text-destructive hover:text-destructive"
              title="Eliminar registro"
              onClick={onEliminar}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </TableCell>
      )}
    </TableRow>
  );
}

interface Props {
  filas: (RegistroCensoGuardado & { centro_id?: string; centro_nombre?: string })[];
  mostrarCentro?: boolean;
  /** Número de la primera fila visible (para paginación). */
  numeroInicial?: number;
  numeracionDescendente?: boolean;
  puedeEditar: boolean;
  onEditar: (fila: RegistroCensoGuardado) => void;
  onEliminar: (fila: RegistroCensoGuardado) => void;
}

export function CensoRegistrosTabla({
  filas,
  mostrarCentro = false,
  numeroInicial,
  numeracionDescendente = true,
  puedeEditar,
  onEditar,
  onEliminar,
}: Props) {
  const baseNumero = numeroInicial ?? filas.length;
  return (
    <div className="-mx-4 overflow-x-auto">
      <Table className="text-xs">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-8 w-8 px-2 text-center">#</TableHead>
            <TableHead className="h-8 px-2">Nombre</TableHead>
            <TableHead className="h-8 px-2">Documento</TableHead>
            <TableHead className="h-8 px-2 text-center">Edad</TableHead>
            <TableHead className="h-8 px-2 text-center">Sexo</TableHead>
            {mostrarCentro && <TableHead className="h-8 px-2">Campamento</TableHead>}
            <TableHead className="h-8 px-2 text-center">Nexus</TableHead>
            <TableHead className="h-8 px-2 text-center">SIIPOL</TableHead>
            <TableHead className="h-8 px-2 text-center">Solicitado</TableHead>
            <TableHead className="h-8 px-2 text-center">Reg. policial</TableHead>
            <TableHead className="h-8 px-2 text-right">Registro</TableHead>
            {puedeEditar && <TableHead className="h-8 w-16 px-1 text-center">Acc.</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {filas.map((f, i) => (
            <FilaRegistro
              key={f.id}
              fila={f}
              numero={numeracionDescendente ? baseNumero - i : baseNumero + i}
              mostrarCentro={mostrarCentro}
              puedeEditar={puedeEditar}
              onEditar={() => onEditar(f)}
              onEliminar={() => onEliminar(f)}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
