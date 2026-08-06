import type { RegistroCensoGuardado } from "@/data/reposCenso";

export function normalizarBusquedaCenso(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

export function nombreCompletoRegistro(fila: RegistroCensoGuardado): string {
  return [fila.primer_nombre, fila.segundo_nombre, fila.primer_apellido, fila.segundo_apellido]
    .filter(Boolean)
    .join(" ");
}

export function filtrarRegistrosCenso<T extends RegistroCensoGuardado>(
  filas: T[],
  termino: string,
  extraCampos?: (fila: T) => string[],
): T[] {
  const q = normalizarBusquedaCenso(termino);
  if (!q) return filas;
  return filas.filter((f) => {
    const nombreCompleto = nombreCompletoRegistro(f);
    const doc = [f.tipo_doc, f.documento].filter(Boolean).join("");
    const campos = [
      nombreCompleto,
      f.primer_nombre,
      f.primer_apellido,
      doc,
      f.telefono,
      ...(extraCampos?.(f) ?? []),
    ];
    return campos.some((c) => normalizarBusquedaCenso(c).includes(q));
  });
}

export type OrdenRegistrosCenso =
  | "reciente"
  | "nombre"
  | "campamento"
  | "edad"
  | "solicitado"
  | "reg_policial"
  | "nexus"
  | "siipol"
  | "con_cedula"
  | "sin_cedula";

function tieneCedula(fila: RegistroCensoGuardado): boolean {
  return Boolean((fila.documento ?? "").trim());
}

export function ordenarRegistrosCenso<T extends RegistroCensoGuardado>(
  filas: T[],
  orden: OrdenRegistrosCenso,
  centroNombre?: (fila: T) => string,
): T[] {
  const copia = [...filas];
  const porReciente = (a: T, b: T) =>
    new Date(b.creado_en).getTime() - new Date(a.creado_en).getTime();
  switch (orden) {
    case "nombre":
      return copia.sort((a, b) =>
        nombreCompletoRegistro(a).localeCompare(nombreCompletoRegistro(b), "es"),
      );
    case "campamento":
      return copia.sort((a, b) => {
        const ca = centroNombre?.(a) ?? "";
        const cb = centroNombre?.(b) ?? "";
        return ca.localeCompare(cb, "es") || nombreCompletoRegistro(a).localeCompare(nombreCompletoRegistro(b), "es");
      });
    case "edad":
      return copia.sort((a, b) => (b.edad ?? -1) - (a.edad ?? -1));
    case "solicitado":
      return copia.sort(
        (a, b) => Number(Boolean(b.solicitado)) - Number(Boolean(a.solicitado)) || porReciente(a, b),
      );
    case "reg_policial":
      return copia.sort(
        (a, b) =>
          Number(Boolean(b.registro_policial)) - Number(Boolean(a.registro_policial)) ||
          porReciente(a, b),
      );
    case "nexus":
      return copia.sort(
        (a, b) =>
          Number(Boolean(b.verificado_nexus)) -
            Number(Boolean(a.verificado_nexus)) || porReciente(a, b),
      );
    case "siipol":
      return copia.sort(
        (a, b) =>
          Number(Boolean(b.verificado_siipol)) -
            Number(Boolean(a.verificado_siipol)) || porReciente(a, b),
      );
    case "con_cedula":
      return copia.sort(
        (a, b) => Number(tieneCedula(b)) - Number(tieneCedula(a)) || porReciente(a, b),
      );
    case "sin_cedula":
      return copia.sort(
        (a, b) => Number(!tieneCedula(b)) - Number(!tieneCedula(a)) || porReciente(a, b),
      );
    case "reciente":
    default:
      return copia.sort(porReciente);
  }
}
