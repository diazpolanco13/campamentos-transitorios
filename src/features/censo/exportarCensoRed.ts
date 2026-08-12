// Exporta Importaciones Excel (red) a PDF (jsPDF) o Excel (xlsx).
// PDF = mismas columnas que CensoRegistrosTabla; Excel = detalle completo.

import { type RegistroCensoRed } from "@/data/reposCenso";
import { nombreCompletoRegistro } from "./censoRegistrosUtil";
import { etiquetaDelito } from "./delitosCategoria";

function fechaArchivo(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatearDocumento(fila: RegistroCensoRed): string {
  if (!fila.documento) return "";
  const prefijo = fila.tipo_doc === "P" ? "PP " : `${fila.tipo_doc ?? "V"}-`;
  return `${prefijo}${fila.documento}`;
}

function etiquetaSexo(sexo: string | null): string {
  if (sexo === "M") return "Hombre";
  if (sexo === "F") return "Mujer";
  if (sexo === "O") return "Otro";
  return "";
}

function formatearFechaRegistro(iso: string): string {
  return new Date(iso).toLocaleString("es-VE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Misma fecha corta que CensoRegistrosTabla (sin año). */
function formatearFechaTabla(iso: string): string {
  return new Date(iso).toLocaleString("es-VE", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function siOGuion(valor: boolean | null | undefined): string {
  return valor ? "Sí" : "—";
}

/** Columnas alineadas con CensoRegistrosTabla (vista red / Importaciones Excel). */
function filaPdf(fila: RegistroCensoRed, numero: number): string[] {
  return [
    String(numero),
    nombreCompletoRegistro(fila),
    formatearDocumento(fila),
    fila.edad != null ? String(fila.edad) : "—",
    fila.sexo ?? "—",
    fila.centro_nombre,
    !fila.documento?.trim()
      ? "—"
      : fila.verificado_nexus
        ? "Verificado"
        : "Pendiente",
    fila.verificado_siipol ? "Verificado" : "Pendiente",
    siOGuion(fila.solicitado),
    siOGuion(fila.registro_policial),
    formatearFechaTabla(fila.creado_en),
  ];
}

const ENCABEZADOS_PDF = [
  "#",
  "Nombre",
  "Documento",
  "Edad",
  "Sexo",
  "Campamento",
  "Nexus",
  "SIIPOL",
  "Solicitado",
  "Reg. policial",
  "Registro",
];

// A4 landscape ~273 mm útiles (márgenes 12+12).
const ANCHOS_PDF_MM = [8, 50, 22, 10, 10, 46, 20, 20, 20, 22, 30];

function truncar(texto: string, max = 42): string {
  const t = texto.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}...`;
}

export async function exportarCensoRedPdf(filas: RegistroCensoRed[]): Promise<void> {
  if (filas.length === 0) throw new Error("No hay registros para exportar");

  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const margen = 12;
  const altoPagina = 210;
  const altoFila = 5;
  let y = margen;

  doc.setFontSize(13);
  doc.text("Importaciones Excel (red) — Personas registradas", margen, y);
  y += 7;

  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text(
    `Generado: ${new Date().toLocaleString("es")} · ${filas.length} persona${filas.length === 1 ? "" : "s"}`,
    margen,
    y,
  );
  doc.setTextColor(0);
  y += 8;

  function dibujarEncabezado() {
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    let x = margen;
    for (let i = 0; i < ENCABEZADOS_PDF.length; i++) {
      doc.text(ENCABEZADOS_PDF[i], x, y);
      x += ANCHOS_PDF_MM[i];
    }
    doc.setFont("helvetica", "normal");
    y += altoFila;
  }

  dibujarEncabezado();

  doc.setFontSize(6.5);
  for (let i = 0; i < filas.length; i++) {
    if (y > altoPagina - margen) {
      doc.addPage();
      y = margen;
      dibujarEncabezado();
    }
    // Truncar Nombre (1) y Campamento (5); el resto cabe en el ancho.
    const celdas = filaPdf(filas[i], filas.length - i).map((c, idx) =>
      idx === 1 || idx === 5 ? truncar(c, idx === 1 ? 42 : 38) : c,
    );
    let x = margen;
    for (let j = 0; j < celdas.length; j++) {
      doc.text(celdas[j], x, y, { maxWidth: ANCHOS_PDF_MM[j] - 1 });
      x += ANCHOS_PDF_MM[j];
    }
    y += altoFila;
  }

  doc.save(`importaciones-excel-personas-${fechaArchivo()}.pdf`);
}

function filaExcel(fila: RegistroCensoRed, numero: number): Record<string, string | number | boolean> {
  return {
    "N°": numero,
    "Primer nombre": fila.primer_nombre,
    "Segundo nombre": fila.segundo_nombre,
    "Primer apellido": fila.primer_apellido,
    "Segundo apellido": fila.segundo_apellido,
    "Tipo doc.": fila.tipo_doc ?? "",
    Documento: fila.documento,
    Edad: fila.edad ?? "",
    Sexo: etiquetaSexo(fila.sexo),
    Teléfono: fila.telefono,
    Campamento: fila.centro_nombre,
    // Alertas primero tras identidad: AutoFilter por delito en Excel.
    Solicitado: fila.solicitado ? "Sí" : "No",
    "Categoría delito (solicitado)": etiquetaDelito(fila.categoria_delito_solicitado),
    "Registro policial": fila.registro_policial ? "Sí" : "No",
    "Categoría delito (reg. policial)": etiquetaDelito(fila.categoria_delito_registro),
    Deportado: fila.deportado ? "Sí" : "No",
    "Tipo registro policial": fila.tipo_registro_policial ?? "",
    "Observaciones seguridad": fila.observaciones_seguridad ?? "",
    "Verificación seguridad": fila.verificacion_seguridad_en
      ? formatearFechaRegistro(fila.verificacion_seguridad_en)
      : "",
    "Verificado SIIPOL": fila.verificado_siipol ? "Sí" : "No",
    "Fecha verificación SIIPOL": fila.verificado_siipol_en
      ? formatearFechaRegistro(fila.verificado_siipol_en)
      : "",
    "Fuente verificación SIIPOL": fila.verificado_siipol_fuente ?? "",
    "Verificado Nexus": !fila.documento?.trim()
      ? ""
      : fila.verificado_nexus
        ? "Sí"
        : "No",
    "Fecha verificación Nexus": fila.verificado_nexus_en
      ? formatearFechaRegistro(fila.verificado_nexus_en)
      : "",
    "Fuente verificación Nexus": fila.verificado_nexus_fuente ?? "",
    "Parentesco jefe": fila.parentesco_jefe,
    "Cédula jefe": fila.jefe_documento,
    País: fila.pais,
    Estado: fila.estado_federativo,
    Municipio: fila.municipio,
    Parroquia: fila.parroquia,
    "Fecha registro": formatearFechaRegistro(fila.creado_en),
  };
}

/** Hoja alertas: categoría delito en col. A para filtrar rápido en Excel. */
function filaExcelAlerta(
  fila: RegistroCensoRed,
  numero: number,
  variante: "solicitado" | "registro",
): Record<string, string | number | boolean> {
  const categoria =
    variante === "solicitado"
      ? etiquetaDelito(fila.categoria_delito_solicitado)
      : etiquetaDelito(fila.categoria_delito_registro);
  return {
    "Categoría delito": categoria,
    "N°": numero,
    "Primer nombre": fila.primer_nombre,
    "Segundo nombre": fila.segundo_nombre,
    "Primer apellido": fila.primer_apellido,
    "Segundo apellido": fila.segundo_apellido,
    "Tipo doc.": fila.tipo_doc ?? "",
    Documento: fila.documento,
    Edad: fila.edad ?? "",
    Sexo: etiquetaSexo(fila.sexo),
    Teléfono: fila.telefono,
    Campamento: fila.centro_nombre,
    Solicitado: fila.solicitado ? "Sí" : "No",
    "Registro policial": fila.registro_policial ? "Sí" : "No",
    Deportado: fila.deportado ? "Sí" : "No",
    "Tipo registro policial": fila.tipo_registro_policial ?? "",
    "Observaciones seguridad": fila.observaciones_seguridad ?? "",
    "Verificado SIIPOL": fila.verificado_siipol ? "Sí" : "No",
    "Fecha registro": formatearFechaRegistro(fila.creado_en),
  };
}

type XlsxMod = typeof import("xlsx");

function hojaConAutofiltro(
  XLSX: XlsxMod,
  filas: Record<string, string | number | boolean>[],
  opts?: { anchoPrimera?: number },
) {
  const hoja = XLSX.utils.json_to_sheet(filas);
  const ref = hoja["!ref"];
  if (ref) {
    hoja["!autofilter"] = { ref };
    const rango = XLSX.utils.decode_range(ref);
    const w0 = opts?.anchoPrimera ?? 14;
    hoja["!cols"] = Array.from({ length: rango.e.c + 1 }, (_, i) => ({
      wch: i === 0 ? w0 : 14,
    }));
  }
  return hoja;
}

export async function exportarCensoRedExcel(filas: RegistroCensoRed[]): Promise<void> {
  if (filas.length === 0) throw new Error("No hay registros para exportar");

  const XLSX = await import("xlsx");
  const libro = XLSX.utils.book_new();

  const personas = filas.map((f, i) => filaExcel(f, filas.length - i));
  XLSX.utils.book_append_sheet(
    libro,
    hojaConAutofiltro(XLSX, personas),
    "Personas",
  );

  const solicitados = filas.filter((f) => f.solicitado);
  if (solicitados.length > 0) {
    const datos = solicitados.map((f, i) =>
      filaExcelAlerta(f, solicitados.length - i, "solicitado"),
    );
    XLSX.utils.book_append_sheet(
      libro,
      hojaConAutofiltro(XLSX, datos, { anchoPrimera: 40 }),
      "Solicitados",
    );
  }

  const conRegistro = filas.filter((f) => f.registro_policial);
  if (conRegistro.length > 0) {
    const datos = conRegistro.map((f, i) =>
      filaExcelAlerta(f, conRegistro.length - i, "registro"),
    );
    XLSX.utils.book_append_sheet(
      libro,
      hojaConAutofiltro(XLSX, datos, { anchoPrimera: 40 }),
      "Reg. policial",
    );
  }

  XLSX.writeFile(libro, `importaciones-excel-personas-${fechaArchivo()}.xlsx`);
}
