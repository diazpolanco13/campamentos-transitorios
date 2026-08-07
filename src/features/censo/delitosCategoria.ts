/** Etiquetas de slug delito (alineadas con censo_etiqueta_delito en BD). */

const ETIQUETAS: Record<string, string> = {
  extraviada: "Personas desaparecidas / extraviadas",
  homicidio: "Homicidio",
  delitos_sexuales: "Delitos sexuales",
  secuestro: "Secuestro",
  drogas: "Drogas (tráfico / posesión)",
  comercio_detente: "Comercio detente",
  violencia: "Violencia (física, género, trato cruel)",
  robo: "Robo",
  hurto: "Hurto",
  lesiones: "Lesiones personales",
  porte_armas: "Porte de armas",
  aprovechamiento: "Aprovechamiento / apropiación indebida",
  estafa: "Estafa / falsificación",
  resistencia: "Resistencia / ultraje a la autoridad",
  desercion: "Deserción",
  metales_estrategicos: "Tráfico de metales / materiales estratégicos",
  fuga_detenidos: "Fuga de detenidos",
  delitos_informaticos: "Delitos informáticos",
  contrabando: "Contrabando",
  odio_convivencia: "Odio / convivencia pacífica",
  averiguacion: "Averiguación",
  otros_especificos: "Otros delitos tipificados",
  sin_especificar: "Sin indicar delito",
};

export function etiquetaDelito(slug: string | null | undefined): string {
  if (!slug?.trim()) return "";
  return ETIQUETAS[slug] ?? slug;
}
