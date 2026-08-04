// Persona slim devuelta por el gateway Nexus (modo /censo).
// Solo campos útiles para verificar identidad y armar el hogar.

export type LetraDocNexus = "V" | "E" | "J";

export interface FamiliarNexus {
  letra: LetraDocNexus | string;
  cedula: string;
  nombre: string;
  parentesco: string;
  foto_nombre?: string | null;
  sexo?: string | null;
  fecha_nacimiento?: string | null;
  fallecido?: boolean;
  fecha_fallecimiento?: string | null;
  fuente?: string;
}

export interface PersonaNexusCenso {
  ok: boolean;
  letra: LetraDocNexus | string;
  cedula: string;
  primer_nombre: string;
  segundo_nombre: string;
  primer_apellido: string;
  segundo_apellido: string;
  nombre_completo: string;
  sexo: "M" | "F" | "O" | string | null;
  edad: number | null;
  fecha_nacimiento: string | null;
  estado_civil?: string | null;
  fallecido?: boolean;
  fecha_fallecimiento?: string | null;
  foto_nombre?: string | null;
  tiene_foto_saime: boolean;
  telefonos: string[];
  direccion_fiscal?: string;
  ubicacion_fiscal?: {
    estado?: string | null;
    municipio?: string | null;
    parroquia?: string | null;
  };
  familiares: FamiliarNexus[];
  error?: string;
}

export function inicialesPersona(p: Pick<PersonaNexusCenso, "primer_nombre" | "primer_apellido">): string {
  const a = (p.primer_nombre || "?").trim().charAt(0).toUpperCase();
  const b = (p.primer_apellido || "?").trim().charAt(0).toUpperCase();
  return `${a}${b}`;
}

/**
 * Gateway/caché a veces omiten `familiares` o `telefonos`. Sin arrays, el
 * panel de censo hace `.filter`/`.map` y la pantalla queda en negro.
 */
export function normalizarPersonaNexus(raw: PersonaNexusCenso): PersonaNexusCenso {
  return {
    ...raw,
    telefonos: Array.isArray(raw.telefonos) ? raw.telefonos : [],
    familiares: Array.isArray(raw.familiares) ? raw.familiares : [],
  };
}
