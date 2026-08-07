// PDF institucional: verificación poblacional Nexus/SIIPOL (Importaciones Excel).
// Reutiliza logos y franja del membrete dinámico (mismo patrón que estatus censo).

import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { DelitosResumen, VerificacionCensoCentro } from "@/data/reposCenso";
import type { TotalesVerificacionCenso } from "@/data/useCensoVerificacion";
import type { MembreteListo } from "@/lib/imagenPdf";

const azul = "#0f2f3f";
const azulInstitucional = "#0b1c2e";
const oroInstitucional = "#d4af37";
const teal = "#0f766e";
const verde = "#047857";
const ambar = "#b45309";
const rojo = "#b91c1c";
const naranja = "#ea580c";
const gris = "#64748b";
const borde = "#d8e2ea";
const fondoSuave = "#f4f8fb";
const sky = "#0369a1";
const skyClaro = "#7dd3fc";

const MESES_MILITAR = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
] as const;

function n(valor: number): string {
  return valor.toLocaleString("es-VE");
}

function pct(parte: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((parte / total) * 1000) / 10;
}

function fechaHoraMilitar(ts: number): string {
  const d = new Date(ts);
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const mon = MESES_MILITAR[d.getMonth()];
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}${hh}${mm}${mon}${yy}`;
}

function fechaCorteLegible(ts: number): string {
  return new Date(ts).toLocaleString("es-VE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ordenarPorNro(
  filas: VerificacionCensoCentro[],
): VerificacionCensoCentro[] {
  return [...filas].sort((a, b) => {
    const na = a.centroNro;
    const nb = b.centroNro;
    if (na != null && nb != null && na !== nb) return na - nb;
    if (na != null && nb == null) return -1;
    if (na == null && nb != null) return 1;
    return a.centroNombre.localeCompare(b.centroNombre, "es");
  });
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 0,
    paddingHorizontal: 0,
    paddingBottom: 26,
    backgroundColor: "#ffffff",
    color: "#10212b",
    fontFamily: "Helvetica",
    fontSize: 7.5,
  },
  contenido: {
    paddingHorizontal: 12,
    paddingTop: 6,
  },
  franja: {
    backgroundColor: azulInstitucional,
    borderTopWidth: 3,
    borderTopColor: oroInstitucional,
    borderBottomWidth: 1.5,
    borderBottomColor: oroInstitucional,
    paddingVertical: 7,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  franjaLado: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1.15,
    minWidth: 0,
  },
  franjaLadoDerecho: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    flex: 1.15,
    minWidth: 0,
  },
  franjaCentro: {
    flex: 0.9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  logoSebin: {
    width: 48,
    height: 32,
    objectFit: "contain",
  },
  logoSae: {
    width: 34,
    height: 34,
    objectFit: "contain",
  },
  franjaTextoIzq: {
    marginLeft: 8,
    color: "#ffffff",
    fontSize: 7,
    fontWeight: 700,
    lineHeight: 1.25,
  },
  franjaTextoDer: {
    marginRight: 8,
    color: "#ffffff",
    fontSize: 7,
    fontWeight: 700,
    textAlign: "right",
    lineHeight: 1.25,
  },
  franjaSubrayado: {
    marginTop: 3,
    height: 1,
    backgroundColor: oroInstitucional,
    width: "100%",
  },
  dtgCaja: {
    borderWidth: 1,
    borderColor: "#ffffff",
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  dtgTexto: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 1.2,
    textAlign: "center",
  },
  tituloBloque: {
    marginTop: 4,
    marginBottom: 3,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 4,
    backgroundColor: azulInstitucional,
  },
  tituloBloqueTexto: {
    color: oroInstitucional,
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: 0.5,
    textAlign: "center",
  },
  corteCaja: {
    marginBottom: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: oroInstitucional,
    borderRadius: 4,
    backgroundColor: fondoSuave,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  corteLabel: {
    color: azul,
    fontSize: 7.5,
    fontWeight: 700,
  },
  corteValor: {
    color: azulInstitucional,
    fontSize: 8,
    fontWeight: 700,
  },
  kpiRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  kpiCard: {
    flex: 1,
    marginRight: 4,
    paddingVertical: 5,
    paddingHorizontal: 5,
    borderWidth: 1,
    borderColor: borde,
    borderRadius: 5,
    backgroundColor: "#fbfdff",
  },
  kpiCardLast: {
    marginRight: 0,
  },
  kpiLabel: {
    color: gris,
    fontSize: 6,
    fontWeight: 700,
  },
  kpiValue: {
    marginTop: 1,
    color: azul,
    fontSize: 12,
    fontWeight: 700,
  },
  kpiDetalle: {
    marginTop: 1,
    color: gris,
    fontSize: 5.5,
  },
  seccion: {
    marginBottom: 6,
    padding: 6,
    borderWidth: 1,
    borderColor: borde,
    borderRadius: 5,
    backgroundColor: "#ffffff",
  },
  seccionTitulo: {
    color: azul,
    fontSize: 8,
    fontWeight: 700,
    marginBottom: 4,
  },
  delitosRow: {
    flexDirection: "row",
    marginTop: 2,
  },
  delitosCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: borde,
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: "#ffffff",
  },
  delitosCardPrimera: {
    marginRight: 10,
  },
  delitosCardHeaderSol: {
    backgroundColor: "#7f1d1d",
    paddingVertical: 7,
    paddingHorizontal: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: oroInstitucional,
  },
  delitosCardHeaderReg: {
    backgroundColor: "#78350f",
    paddingVertical: 7,
    paddingHorizontal: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: oroInstitucional,
  },
  delitosCardTitulo: {
    color: "#ffffff",
    fontSize: 8,
    fontWeight: 700,
    flex: 1,
    paddingRight: 6,
  },
  delitosCardTotal: {
    color: oroInstitucional,
    fontSize: 10,
    fontWeight: 700,
  },
  delitosColHeader: {
    flexDirection: "row",
    backgroundColor: fondoSuave,
    borderBottomWidth: 1,
    borderBottomColor: borde,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  delitosColHeaderTexto: {
    color: gris,
    fontSize: 6.5,
    fontWeight: 700,
    letterSpacing: 0.4,
  },
  delitosFila: {
    flexDirection: "row",
    paddingVertical: 3.5,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: "#e8eef3",
    alignItems: "center",
  },
  delitosFilaAlt: {
    backgroundColor: "#f8fafc",
  },
  delitosFilaCat: {
    flex: 1,
    color: azul,
    fontSize: 7.5,
    paddingRight: 6,
  },
  delitosFilaCasos: {
    width: 42,
    textAlign: "right",
    color: azulInstitucional,
    fontSize: 8.5,
    fontWeight: 700,
  },
  delitosFilaCasosSol: {
    color: rojo,
  },
  delitosFilaCasosReg: {
    color: ambar,
  },
  delitosPie: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 5,
    paddingHorizontal: 8,
    backgroundColor: fondoSuave,
    borderTopWidth: 1,
    borderTopColor: borde,
  },
  delitosPieTexto: {
    color: azul,
    fontSize: 7.5,
    fontWeight: 700,
  },
  delitosNota: {
    marginTop: 8,
    color: gris,
    fontSize: 6.5,
    lineHeight: 1.35,
  },
  barrasRow: {
    flexDirection: "row",
  },
  barraBloque: {
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  barraBloqueLast: {
    marginRight: 0,
  },
  barraTitulo: {
    color: azul,
    fontSize: 6.5,
    fontWeight: 700,
    marginBottom: 3,
  },
  barraTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: fondoSuave,
    borderWidth: 0.5,
    borderColor: borde,
    flexDirection: "row",
    overflow: "hidden",
  },
  barraSeg: {
    height: "100%",
  },
  leyendaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 3,
  },
  leyendaItem: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 8,
    marginBottom: 2,
  },
  leyendaCuadro: {
    width: 7,
    height: 7,
    borderRadius: 1,
    marginRight: 3,
  },
  leyendaTexto: {
    color: gris,
    fontSize: 5.5,
  },
  tablaHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 3,
    borderBottomWidth: 1,
    borderBottomColor: borde,
    backgroundColor: fondoSuave,
  },
  fila: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 2.5,
    borderBottomWidth: 0.4,
    borderBottomColor: "#e8eef3",
  },
  filaSinLista: {
    backgroundColor: "#f8fafc",
  },
  colNro: { width: 28, textAlign: "right", paddingRight: 4 },
  colNombre: { flex: 2.4, minWidth: 0, paddingRight: 4 },
  colNum: { width: 36, textAlign: "right", paddingRight: 2 },
  colPct: { width: 52, paddingLeft: 2 },
  colAlert: { width: 32, textAlign: "right", paddingRight: 2 },
  celda: { fontSize: 6.2, color: azul, fontWeight: 700 },
  celdaMuted: { fontSize: 6.2, color: gris },
  celdaHeader: { fontSize: 5.8, color: gris, fontWeight: 700 },
  nombreTexto: { fontSize: 6.3, color: azul, fontWeight: 700 },
  badgeSin: {
    marginLeft: 3,
    fontSize: 5,
    color: ambar,
    fontWeight: 700,
  },
  miniBarTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: fondoSuave,
    borderWidth: 0.4,
    borderColor: borde,
    overflow: "hidden",
    marginBottom: 1,
  },
  miniBarFill: {
    height: "100%",
    backgroundColor: sky,
  },
  pctMini: {
    fontSize: 5.5,
    color: gris,
    textAlign: "right",
  },
  alertaRoja: { color: rojo, fontSize: 6.2, fontWeight: 700, textAlign: "right" },
  alertaAmbar: { color: ambar, fontSize: 6.2, fontWeight: 700, textAlign: "right" },
  pie: {
    position: "absolute",
    bottom: 8,
    left: 12,
    right: 12,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  pieTexto: {
    color: gris,
    fontSize: 5.5,
  },
  nota: {
    color: gris,
    fontSize: 5.8,
    marginBottom: 4,
  },
  campGrupo: {
    marginBottom: 6,
    padding: 5,
    borderWidth: 1,
    borderColor: borde,
    borderRadius: 4,
    backgroundColor: "#ffffff",
  },
  campGrupoTitulo: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 3,
    paddingBottom: 3,
    borderBottomWidth: 0.6,
    borderBottomColor: borde,
  },
  campGrupoNombre: {
    color: azulInstitucional,
    fontSize: 7.5,
    fontWeight: 700,
    flex: 1,
    minWidth: 0,
    paddingRight: 6,
  },
  campGrupoMeta: {
    color: gris,
    fontSize: 6,
    fontWeight: 700,
  },
  alertaTablaHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 2.5,
    borderBottomWidth: 0.8,
    borderBottomColor: borde,
    backgroundColor: fondoSuave,
  },
  alertaFila: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 2,
    borderBottomWidth: 0.35,
    borderBottomColor: "#e8eef3",
  },
  colAlertaNro: { width: 22, textAlign: "right", paddingRight: 3 },
  colAlertaNombre: { flex: 2.2, minWidth: 0, paddingRight: 3 },
  colAlertaDoc: { width: 72, paddingRight: 3 },
  colAlertaEdad: { width: 28, textAlign: "right", paddingRight: 3 },
  colAlertaFlag: { width: 28, textAlign: "center" },
  colAlertaTipo: { flex: 1.4, minWidth: 0, paddingLeft: 3 },
  celdaAlerta: { fontSize: 6, color: azul, fontWeight: 700 },
  celdaAlertaMuted: { fontSize: 6, color: gris },
  badgeSol: { color: rojo, fontSize: 6, fontWeight: 700, textAlign: "center" },
  badgeReg: { color: ambar, fontSize: 6, fontWeight: 700, textAlign: "center" },
  vacioAnexo: {
    marginTop: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: borde,
    borderRadius: 4,
    backgroundColor: fondoSuave,
  },
  vacioAnexoTexto: {
    color: gris,
    fontSize: 7.5,
    textAlign: "center",
  },
});

function EncabezadoInstitucional({
  generadoTs,
  membrete,
}: {
  generadoTs: number;
  membrete: MembreteListo;
}) {
  return (
    <View style={styles.franja} fixed>
      <View style={styles.franjaLado}>
        {membrete.izqLogo ? (
          <Image src={membrete.izqLogo} style={styles.logoSebin} />
        ) : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          {membrete.izqLineas.map((linea) => (
            <Text key={linea} style={styles.franjaTextoIzq}>
              {linea}
            </Text>
          ))}
          {membrete.izqLineas.length > 0 && <View style={styles.franjaSubrayado} />}
        </View>
      </View>

      <View style={styles.franjaCentro}>
        <View style={styles.dtgCaja}>
          <Text style={styles.dtgTexto}>{fechaHoraMilitar(generadoTs)}</Text>
        </View>
      </View>

      <View style={styles.franjaLadoDerecho}>
        <View style={{ flex: 1, minWidth: 0, alignItems: "flex-end" }}>
          {membrete.derLineas.map((linea) => (
            <Text key={linea} style={styles.franjaTextoDer}>
              {linea}
            </Text>
          ))}
          {membrete.derLineas.length > 0 && <View style={styles.franjaSubrayado} />}
        </View>
        {membrete.derLogo ? (
          <Image src={membrete.derLogo} style={styles.logoSae} />
        ) : null}
      </View>
    </View>
  );
}

function KpiCard({
  label,
  value,
  detalle,
  accent,
  last,
}: {
  label: string;
  value: number;
  detalle?: string;
  accent?: string;
  last?: boolean;
}) {
  return (
    <View style={last ? [styles.kpiCard, styles.kpiCardLast] : styles.kpiCard}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={accent ? [styles.kpiValue, { color: accent }] : styles.kpiValue}>
        {n(value)}
      </Text>
      {detalle ? <Text style={styles.kpiDetalle}>{detalle}</Text> : null}
    </View>
  );
}

function BarraApiladaPdf({
  titulo,
  segmentos,
  last,
}: {
  titulo: string;
  segmentos: { label: string; valor: number; color: string }[];
  last?: boolean;
}) {
  const total = segmentos.reduce((acc, s) => acc + s.valor, 0);
  return (
    <View style={last ? [styles.barraBloque, styles.barraBloqueLast] : styles.barraBloque}>
      <Text style={styles.barraTitulo}>{titulo}</Text>
      <View style={styles.barraTrack}>
        {total <= 0 ? (
          <View style={[styles.barraSeg, { flex: 1, backgroundColor: fondoSuave }]} />
        ) : (
          segmentos.map((s) =>
            s.valor <= 0 ? null : (
              <View
                key={s.label}
                style={[
                  styles.barraSeg,
                  {
                    width: `${(s.valor / total) * 100}%`,
                    backgroundColor: s.color,
                  },
                ]}
              />
            ),
          )
        )}
      </View>
      <View style={styles.leyendaRow}>
        {segmentos.map((s) => (
          <View key={s.label} style={styles.leyendaItem}>
            <View style={[styles.leyendaCuadro, { backgroundColor: s.color }]} />
            <Text style={styles.leyendaTexto}>
              {s.label} {pct(s.valor, total)}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function EncabezadoTabla() {
  return (
    <View style={styles.tablaHeader} wrap={false}>
      <Text style={[styles.colNro, styles.celdaHeader]}>N.º</Text>
      <Text style={[styles.colNombre, styles.celdaHeader]}>Campamento</Text>
      <Text style={[styles.colNum, styles.celdaHeader]}>Cens.</Text>
      <Text style={[styles.colNum, styles.celdaHeader]}>Men.</Text>
      <Text style={[styles.colNum, styles.celdaHeader]}>Adul.</Text>
      <Text style={[styles.colNum, styles.celdaHeader]}>Nex.</Text>
      <Text style={[styles.colNum, styles.celdaHeader]}>SIIP.</Text>
      <Text style={[styles.colNum, styles.celdaHeader]}>Verif.</Text>
      <Text style={[styles.colPct, styles.celdaHeader]}>% verif.</Text>
      <Text style={[styles.colNum, styles.celdaHeader]}>Falt.</Text>
      <Text style={[styles.colAlert, styles.celdaHeader]}>Sol.</Text>
      <Text style={[styles.colAlert, styles.celdaHeader]}>Reg.</Text>
    </View>
  );
}

function TablaDelitosPdf({
  titulo,
  total,
  categorias,
  variante,
  primera,
}: {
  titulo: string;
  total: number;
  categorias: { slug: string; etiqueta: string; casos: number }[];
  variante: "sol" | "reg";
  primera?: boolean;
}) {
  const headerStyle =
    variante === "sol" ? styles.delitosCardHeaderSol : styles.delitosCardHeaderReg;
  const casosStyle =
    variante === "sol" ? styles.delitosFilaCasosSol : styles.delitosFilaCasosReg;

  return (
    <View style={[styles.delitosCard, primera ? styles.delitosCardPrimera : {}]}>
      <View style={headerStyle}>
        <Text style={styles.delitosCardTitulo}>{titulo}</Text>
        <Text style={styles.delitosCardTotal}>{n(total)}</Text>
      </View>
      <View style={styles.delitosColHeader}>
        <Text style={[styles.delitosColHeaderTexto, { flex: 1 }]}>CATEGORÍA</Text>
        <Text style={[styles.delitosColHeaderTexto, { width: 42, textAlign: "right" }]}>
          CASOS
        </Text>
      </View>
      {categorias.map((c, i) => (
        <View
          key={`${variante}-${c.slug}`}
          style={[styles.delitosFila, i % 2 === 1 ? styles.delitosFilaAlt : {}]}
          wrap={false}
        >
          <Text style={styles.delitosFilaCat}>{c.etiqueta}</Text>
          <Text style={[styles.delitosFilaCasos, casosStyle]}>{n(c.casos)}</Text>
        </View>
      ))}
      <View style={styles.delitosPie}>
        <Text style={styles.delitosPieTexto}>Total general</Text>
        <Text style={[styles.delitosFilaCasos, casosStyle]}>{n(total)}</Text>
      </View>
    </View>
  );
}

function PaginaDelitosPdf({
  delitos,
  fechaCorteTs,
  membrete,
}: {
  delitos: DelitosResumen;
  fechaCorteTs: number;
  membrete: MembreteListo;
}) {
  const sol = delitos.solicitados;
  const reg = delitos.registro_policial;

  return (
    <Page size="LETTER" orientation="landscape" style={styles.page}>
      <EncabezadoInstitucional generadoTs={fechaCorteTs} membrete={membrete} />

      <View style={styles.contenido}>
        <View style={styles.tituloBloque}>
          <Text style={styles.tituloBloqueTexto}>
            SALA SITUACIONAL — CONTABILIZACIÓN POR DELITO
          </Text>
        </View>

        <View style={styles.corteCaja}>
          <Text style={styles.corteLabel}>ALERTAS CLASIFICADAS POR TIPO DE DELITO</Text>
          <Text style={styles.corteValor}>
            Solicitados {n(sol.total)} · Reg. policial {n(reg.total)} · Corte{" "}
            {fechaCorteLegible(fechaCorteTs)}
          </Text>
        </View>

        <View style={styles.delitosRow}>
          <TablaDelitosPdf
            titulo="Personas en estatus de «Solicitados»"
            total={sol.total}
            categorias={sol.categorias}
            variante="sol"
            primera
          />
          <TablaDelitosPdf
            titulo="Personas con historial / registro policial"
            total={reg.total}
            categorias={reg.categorias}
            variante="reg"
          />
        </View>

        <Text style={styles.delitosNota}>
          Clasificación automática desde observaciones de verificación SIIPOL
          (categoría primaria por severidad). «Sin indicar delito» solo cuando el
          texto declara explícitamente que no indica o no especifica el delito.
          Una persona con varios delitos cuenta en una sola categoría.
        </Text>
      </View>

      <View style={styles.pie} fixed>
        <Text style={styles.pieTexto}>
          Contabilización por delito · corte {fechaCorteLegible(fechaCorteTs)} ·{" "}
          {fechaHoraMilitar(fechaCorteTs)}
        </Text>
        <Text
          style={styles.pieTexto}
          render={({ pageNumber, totalPages }) =>
            `Pág. ${pageNumber} / ${totalPages}`
          }
        />
      </View>
    </Page>
  );
}

function EncabezadoTablaAlertas({
  mostrarTipoRegistro,
}: {
  mostrarTipoRegistro: boolean;
}) {
  return (
    <View style={styles.alertaTablaHeader} wrap={false}>
      <Text style={[styles.colAlertaNro, styles.celdaHeader]}>#</Text>
      <Text style={[styles.colAlertaNombre, styles.celdaHeader]}>Nombre</Text>
      <Text style={[styles.colAlertaDoc, styles.celdaHeader]}>Documento</Text>
      <Text style={[styles.colAlertaEdad, styles.celdaHeader]}>Edad</Text>
      <Text style={[styles.colAlertaFlag, styles.celdaHeader]}>Sol.</Text>
      <Text style={[styles.colAlertaFlag, styles.celdaHeader]}>Reg.</Text>
      {mostrarTipoRegistro ? (
        <Text style={[styles.colAlertaTipo, styles.celdaHeader]}>
          Tipo registro / obs.
        </Text>
      ) : null}
    </View>
  );
}

function FilaAlerta({
  persona,
  indice,
  mostrarTipoRegistro,
}: {
  persona: PersonaAlertaVerificacion;
  indice: number;
  mostrarTipoRegistro: boolean;
}) {
  const detalle = [persona.tipoRegistroPolicial, persona.observacionesSeguridad]
    .filter(Boolean)
    .join(" · ");
  return (
    <View style={styles.alertaFila} wrap={false}>
      <Text style={[styles.colAlertaNro, styles.celdaAlertaMuted]}>{indice}</Text>
      <Text style={[styles.colAlertaNombre, styles.celdaAlerta]}>
        {persona.nombre.length > 48
          ? `${persona.nombre.slice(0, 46)}…`
          : persona.nombre}
      </Text>
      <Text style={[styles.colAlertaDoc, styles.celdaAlertaMuted]}>
        {persona.documento}
      </Text>
      <Text style={[styles.colAlertaEdad, styles.celdaAlertaMuted]}>
        {persona.edad != null ? String(persona.edad) : "—"}
      </Text>
      <Text
        style={[
          styles.colAlertaFlag,
          persona.solicitado ? styles.badgeSol : styles.celdaAlertaMuted,
        ]}
      >
        {persona.solicitado ? "Sí" : "—"}
      </Text>
      <Text
        style={[
          styles.colAlertaFlag,
          persona.registroPolicial ? styles.badgeReg : styles.celdaAlertaMuted,
        ]}
      >
        {persona.registroPolicial ? "Sí" : "—"}
      </Text>
      {mostrarTipoRegistro ? (
        <Text style={[styles.colAlertaTipo, styles.celdaAlertaMuted]}>
          {detalle
            ? detalle.length > 56
              ? `${detalle.slice(0, 54)}…`
              : detalle
            : "—"}
        </Text>
      ) : null}
    </View>
  );
}

function GrupoCampamentoAlertas({ grupo }: { grupo: GrupoAlertaCampamento }) {
  const nro = grupo.centroNro != null ? `${grupo.centroNro}. ` : "";
  const sol = grupo.personas.filter((p) => p.solicitado).length;
  const reg = grupo.personas.filter((p) => p.registroPolicial).length;
  return (
    <View style={styles.campGrupo}>
      <View style={styles.campGrupoTitulo} wrap={false}>
        <Text style={styles.campGrupoNombre}>
          {nro}
          {grupo.centroNombre}
        </Text>
        <Text style={styles.campGrupoMeta}>
          {n(grupo.personas.length)} pers. · Sol. {n(sol)} · Reg. {n(reg)}
        </Text>
      </View>
      <EncabezadoTablaAlertas mostrarTipoRegistro />
      {grupo.personas.map((p, i) => (
        <FilaAlerta
          key={p.id}
          persona={p}
          indice={i + 1}
          mostrarTipoRegistro
        />
      ))}
    </View>
  );
}

function AnexoAlertasPage({
  titulo,
  nota,
  grupos,
  vacioTexto,
  fechaCorteTs,
  membrete,
  pieLabel,
}: {
  titulo: string;
  nota: string;
  grupos: GrupoAlertaCampamento[];
  vacioTexto: string;
  fechaCorteTs: number;
  membrete: MembreteListo;
  pieLabel: string;
}) {
  return (
    <Page size="LETTER" orientation="landscape" style={styles.page}>
      <EncabezadoInstitucional generadoTs={fechaCorteTs} membrete={membrete} />

      <View style={styles.contenido}>
        <View style={styles.tituloBloque}>
          <Text style={styles.tituloBloqueTexto}>{titulo}</Text>
        </View>

        <Text style={styles.nota}>{nota}</Text>

        {grupos.length === 0 ? (
          <View style={styles.vacioAnexo}>
            <Text style={styles.vacioAnexoTexto}>{vacioTexto}</Text>
          </View>
        ) : (
          grupos.map((g) => (
            <GrupoCampamentoAlertas key={g.centroId} grupo={g} />
          ))
        )}
      </View>

      <View style={styles.pie} fixed>
        <Text style={styles.pieTexto}>
          {pieLabel} · corte {fechaCorteLegible(fechaCorteTs)} ·{" "}
          {fechaHoraMilitar(fechaCorteTs)}
        </Text>
        <Text
          style={styles.pieTexto}
          render={({ pageNumber, totalPages }) =>
            `Pág. ${pageNumber} / ${totalPages}`
          }
        />
      </View>
    </Page>
  );
}

function FilaCentro({ fila }: { fila: VerificacionCensoCentro }) {
  const sinLista = fila.censadas === 0;
  const pctVerif = pct(fila.verificadas, fila.adultos);
  return (
    <View
      style={sinLista ? [styles.fila, styles.filaSinLista] : styles.fila}
      wrap={false}
    >
      <Text style={[styles.colNro, styles.celdaMuted]}>
        {fila.centroNro ?? "—"}
      </Text>
      <View style={[styles.colNombre, { flexDirection: "row", alignItems: "center" }]}>
        <Text style={styles.nombreTexto}>
          {fila.centroNombre.length > 42
            ? `${fila.centroNombre.slice(0, 40)}…`
            : fila.centroNombre}
        </Text>
        {sinLista ? <Text style={styles.badgeSin}>SIN LISTA</Text> : null}
      </View>
      <Text style={[styles.colNum, styles.celda]}>{n(fila.censadas)}</Text>
      <Text style={[styles.colNum, styles.celdaMuted]}>{n(fila.menores)}</Text>
      <Text style={[styles.colNum, styles.celdaMuted]}>{n(fila.adultos)}</Text>
      <Text style={[styles.colNum, styles.celdaMuted]}>{n(fila.nexus)}</Text>
      <Text style={[styles.colNum, styles.celdaMuted]}>{n(fila.siipol)}</Text>
      <Text style={[styles.colNum, styles.celda]}>{n(fila.verificadas)}</Text>
      <View style={styles.colPct}>
        {sinLista ? (
          <Text style={styles.pctMini}>—</Text>
        ) : (
          <>
            <View style={styles.miniBarTrack}>
              <View style={[styles.miniBarFill, { width: `${pctVerif}%` }]} />
            </View>
            <Text style={styles.pctMini}>{pctVerif}%</Text>
          </>
        )}
      </View>
      <Text style={[styles.colNum, styles.celdaMuted]}>{n(fila.faltan)}</Text>
      <Text
        style={[
          styles.colAlert,
          fila.solicitadas > 0 ? styles.alertaRoja : styles.celdaMuted,
        ]}
      >
        {fila.solicitadas > 0 ? n(fila.solicitadas) : "—"}
      </Text>
      <Text
        style={[
          styles.colAlert,
          fila.conRegistro > 0 ? styles.alertaAmbar : styles.celdaMuted,
        ]}
      >
        {fila.conRegistro > 0 ? n(fila.conRegistro) : "—"}
      </Text>
    </View>
  );
}

/** Persona con alerta (solicitado y/o registro policial) para anexos. */
export interface PersonaAlertaVerificacion {
  id: string;
  centroId: string;
  centroNombre: string;
  nombre: string;
  documento: string;
  edad: number | null;
  sexo: string | null;
  solicitado: boolean;
  registroPolicial: boolean;
  tipoRegistroPolicial: string;
  observacionesSeguridad: string;
}

export interface DatosReporteVerificacionCenso {
  filas: VerificacionCensoCentro[];
  totales: TotalesVerificacionCenso;
  /** Personas solicitadas y/o con registro policial. */
  alertas: PersonaAlertaVerificacion[];
  /** Contabilización por delito (RPC censo_delitos_resumen). */
  delitos?: DelitosResumen | null;
  /** Epoch ms: fecha de corte de los datos (= momento de generación). */
  fechaCorteTs: number;
  generadoPor?: string;
}

interface GrupoAlertaCampamento {
  centroId: string;
  centroNro: number | null;
  centroNombre: string;
  personas: PersonaAlertaVerificacion[];
}

function agruparAlertasPorCampamento(
  alertas: PersonaAlertaVerificacion[],
  filas: VerificacionCensoCentro[],
): GrupoAlertaCampamento[] {
  const meta = new Map(
    filas.map((f) => [
      f.centroId,
      { nro: f.centroNro, nombre: f.centroNombre },
    ]),
  );
  const grupos = new Map<string, GrupoAlertaCampamento>();

  for (const p of alertas) {
    const m = meta.get(p.centroId);
    let g = grupos.get(p.centroId);
    if (!g) {
      g = {
        centroId: p.centroId,
        centroNro: m?.nro ?? null,
        centroNombre: m?.nombre ?? p.centroNombre,
        personas: [],
      };
      grupos.set(p.centroId, g);
    }
    g.personas.push(p);
  }

  for (const g of grupos.values()) {
    // Primero solicitados; luego solo-registro; nombre dentro de cada bloque.
    g.personas.sort((a, b) => {
      const rank = (p: PersonaAlertaVerificacion) => (p.solicitado ? 0 : 1);
      const porTipo = rank(a) - rank(b);
      if (porTipo !== 0) return porTipo;
      return a.nombre.localeCompare(b.nombre, "es");
    });
  }

  return [...grupos.values()].sort((a, b) => {
    const na = a.centroNro;
    const nb = b.centroNro;
    if (na != null && nb != null && na !== nb) return na - nb;
    if (na != null && nb == null) return -1;
    if (na == null && nb != null) return 1;
    return a.centroNombre.localeCompare(b.centroNombre, "es");
  });
}

export function ReporteVerificacionCensoPdf({
  datos,
  membrete,
}: {
  datos: DatosReporteVerificacionCenso;
  membrete: MembreteListo;
}) {
  const { filas, totales, alertas, delitos, fechaCorteTs, generadoPor } = datos;
  const ordenadas = ordenarPorNro(filas);
  const listaAlertas = alertas ?? [];
  const gruposMixtos = agruparAlertasPorCampamento(listaAlertas, filas);
  const totalSol = listaAlertas.filter((a) => a.solicitado).length;
  const totalReg = listaAlertas.filter((a) => a.registroPolicial).length;
  return (
    <Document
      title="Verificación poblacional — Importaciones Excel"
      author={generadoPor ?? "Sala de Análisis Estratégico"}
      subject="Cobertura Nexus/SAIME y SIIPOL de personas registradas (import_excel)"
      creator="Campamentos Transitorios"
      producer="@react-pdf/renderer"
      language="es-VE"
    >
      <Page size="LETTER" orientation="landscape" style={styles.page}>
        <EncabezadoInstitucional generadoTs={fechaCorteTs} membrete={membrete} />

        <View style={styles.contenido}>
          <View style={styles.tituloBloque}>
            <Text style={styles.tituloBloqueTexto}>
              SALA SITUACIONAL — VERIFICACIÓN POBLACIONAL (IMPORTACIONES EXCEL)
            </Text>
          </View>

          <View style={styles.corteCaja}>
            <Text style={styles.corteLabel}>FECHA DE CORTE DE LOS DATOS</Text>
            <Text style={styles.corteValor}>
              {fechaCorteLegible(fechaCorteTs)} · DTG {fechaHoraMilitar(fechaCorteTs)}
            </Text>
          </View>

          <Text style={styles.nota}>
            Fuente: Importaciones Excel · Menores de 18 años no se verifican ·
            Adulto verificado = Nexus o SIIPOL · {n(totales.campamentos)} campamentos ·{" "}
            {n(totales.campamentosConLista)} con lista · {n(totales.campamentosSinLista)}{" "}
            sin lista
          </Text>

          <View style={styles.kpiRow}>
            <KpiCard
              label="Personas registradas"
              value={totales.censadas}
              detalle={`${n(totales.campamentosConLista)} con lista`}
            />
            <KpiCard
              label="Menores de edad"
              value={totales.menores}
              detalle={`${pct(totales.menores, totales.censadas)}% · no se verifican`}
              accent={teal}
            />
            <KpiCard
              label="Adultos (a verificar)"
              value={totales.adultos}
              detalle={`${pct(totales.adultos, totales.censadas)}% del total`}
              last
            />
          </View>
          <View style={styles.kpiRow}>
            <KpiCard
              label="Adultos verificados"
              value={totales.verificadas}
              detalle={`${pct(totales.verificadas, totales.adultos)}% de adultos`}
              accent={sky}
            />
            <KpiCard
              label="Por Nexus / SAIME"
              value={totales.nexus}
              detalle={`${pct(totales.nexus, totales.adultos)}% de adultos`}
              accent={sky}
            />
            <KpiCard
              label="Por SIIPOL"
              value={totales.siipol}
              detalle={`${pct(totales.siipol, totales.adultos)}% de adultos`}
              accent={verde}
              last
            />
          </View>
          <View style={styles.kpiRow}>
            <KpiCard
              label="Faltan por verificar"
              value={totales.faltan}
              detalle={`${pct(totales.faltan, totales.adultos)}% de adultos`}
              accent={gris}
            />
            <KpiCard
              label="Solicitadas"
              value={totales.solicitadas}
              detalle={`${n(totales.campamentosConSolicitadas)} campamentos`}
              accent={rojo}
            />
            <KpiCard
              label="Con registro policial"
              value={totales.conRegistro}
              detalle={`${n(totales.campamentosConRegistro)} campamentos`}
              accent={ambar}
              last
            />
          </View>

          <View style={styles.seccion}>
            <Text style={styles.seccionTitulo}>Composición y cobertura de verificación</Text>
            <View style={styles.barrasRow}>
              <BarraApiladaPdf
                titulo="Composición del registro"
                segmentos={[
                  {
                    label: "Adultos",
                    valor: totales.adultos,
                    color: "#0c4a6e",
                  },
                  {
                    label: "Menores",
                    valor: totales.menores,
                    color: skyClaro,
                  },
                ]}
              />
              <BarraApiladaPdf
                titulo="Verificación de los adultos"
                last
                segmentos={[
                  { label: "Nexus + SIIPOL", valor: totales.ambos, color: "#0c4a6e" },
                  { label: "Solo Nexus", valor: totales.soloNexus, color: naranja },
                  { label: "Solo SIIPOL", valor: totales.soloSiipol, color: verde },
                  { label: "Sin verificar", valor: totales.faltan, color: "#94a3b8" },
                ]}
              />
            </View>
          </View>

          <View style={styles.seccion}>
            <Text style={styles.seccionTitulo}>
              Campamentos — registro, verificación y alertas ({n(ordenadas.length)})
            </Text>
            <EncabezadoTabla />
            {ordenadas.map((f) => (
              <FilaCentro key={f.centroId} fila={f} />
            ))}
          </View>
        </View>

        <View style={styles.pie} fixed>
          <Text style={styles.pieTexto}>
            Verificación poblacional · corte {fechaCorteLegible(fechaCorteTs)} ·{" "}
            {fechaHoraMilitar(fechaCorteTs)}
          </Text>
          <Text
            style={styles.pieTexto}
            render={({ pageNumber, totalPages }) =>
              `Pág. ${pageNumber} / ${totalPages}`
            }
          />
        </View>
      </Page>

      {delitos ? (
        <PaginaDelitosPdf
          delitos={delitos}
          fechaCorteTs={fechaCorteTs}
          membrete={membrete}
        />
      ) : null}

      <AnexoAlertasPage
        titulo="ANEXO — SOLICITADOS Y REGISTRO POLICIAL POR CAMPAMENTO"
        nota={`Lista mixta por campamento (primero solicitados, luego con registro) · ${n(listaAlertas.length)} personas · Sol. ${n(totalSol)} · Reg. ${n(totalReg)} · ${n(gruposMixtos.length)} campamentos`}
        grupos={gruposMixtos}
        vacioTexto="Sin personas solicitadas ni con registro policial en la fecha de corte."
        fechaCorteTs={fechaCorteTs}
        membrete={membrete}
        pieLabel="Anexo · Alertas por campamento"
      />
    </Document>
  );
}
