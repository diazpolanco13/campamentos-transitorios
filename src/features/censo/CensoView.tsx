// Planilla pública de registro rápido de damnificados (sin login).
// Paso 1: refugio (con búsqueda) + identificación del funcionario.
// Paso 2: registro de personas según la planilla física (identidad, documento,
//         teléfono y vínculo con el jefe de familia).
// Paso 3: estadística y lista de los registrados en el refugio.
// Los datos van a la tabla staging `censo_registros` vía RPCs públicas.
// Los campos históricos de salud/vivienda se conservan en el estado del
// formulario (sin UI) para que editar un registro viejo no los pise.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  Check,
  CheckCircle2,
  Flag,
  AlertTriangle,
  LayoutGrid,
  Loader2,
  LocateFixed,
  MapPin,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  RotateCcw,
  Search,
  Tent,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CEDULA_JEFE_NO_SE } from "@/domain/catalogosHumanitarios";
import {
  PARENTESCOS_MENOR,
  actualizarCenso,
  completarCenso,
  eliminarCenso,
  listarCentrosCenso,
  listarIdsCensoProcesados,
  listarRegistrosCenso,
  obtenerCentroTerreno,
  obtenerCierreCenso,
  registrarCenso,
  registroDesdeGuardado,
  ubicacionCensadorVacia,
  type CentroCenso,
  type CierreCenso,
  type FuncionarioCenso,
  type RegistroCenso,
  type RegistroCensoGuardado,
  type UbicacionCensador,
} from "@/data/reposCenso";
import { CensoInstrucciones } from "@/features/censo/CensoInstrucciones";
import { CensoNexusPanel } from "@/features/censo/CensoNexusPanel";
import { CensoListaCensadosPanel } from "@/features/censo/CensoListaCensadosPanel";
import { SelectorCentroLista } from "@/features/censo/SelectorCentroLista";
import { CENSO_BOTON_ACCION, CENSO_BOTON_SECUNDARIO, CENSO_SELECT_TRIGGER } from "@/features/censo/censoFormularioShared";
import { FormularioIdentificacionFuncionario } from "@/features/censo/FormularioIdentificacionFuncionario";
import { type NexusEnLinea } from "@/features/censo/EstadoNexusApi";
import { consultarEstadoNexusApi } from "@/data/reposNexus";
import { MenuItemActualizarApp } from "@/components/BotonBorrarCache";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  INSTRUCCIONES_CENSO_KEY,
  debeMostrarInstrucciones,
  marcarInstruccionesVistas,
} from "@/lib/instruccionesCampo";
import { tokenTerrenoActual } from "@/lib/tokenTerreno";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "censo_funcionario_v1";

const TIPOS_DOC: { valor: RegistroCenso["tipo_doc"]; label: string }[] = [
  { valor: "V", label: "V-" },
  { valor: "E", label: "E-" },
  { valor: "P", label: "PP" },
];

const SEXOS: { valor: RegistroCenso["sexo"]; label: string }[] = [
  { valor: "M", label: "Masculino" },
  { valor: "F", label: "Femenino" },
];

function registroVacio(): RegistroCenso {
  return {
    primer_nombre: "",
    segundo_nombre: "",
    primer_apellido: "",
    segundo_apellido: "",
    edad: null,
    tipo_doc: "V",
    documento: "",
    sexo: "",
    telefono: "",
    embarazada: false,
    embarazo_semanas: null,
    discapacidad: false,
    discapacidad_detalle: "",
    enfermedad: false,
    enfermedad_detalle: "",
    jefe_tipo_doc: "V",
    jefe_documento: "",
    parentesco_jefe: "",
    pais: "Venezuela",
    estado_federativo: "",
    municipio: "",
    parroquia: "",
    condicion_vivienda: "",
    calle: "",
    casa_edificio: "",
  };
}

type IdCampoRegistro =
  | "primer_nombre"
  | "primer_apellido"
  | "edad"
  | "sexo"
  | "parentesco_jefe"
  | "jefe_documento";

type IdCampoFuncionario = "jerarquia" | "nombre" | "institucion" | "telefono";

interface CampoFaltante {
  id: IdCampoRegistro | IdCampoFuncionario;
  label: string;
}

function camposFaltantesRegistro(
  registro: RegistroCenso,
  esMenor: boolean,
  conoceCedulaJefe: boolean,
): CampoFaltante[] {
  const faltantes: CampoFaltante[] = [];
  if (!registro.primer_nombre.trim()) faltantes.push({ id: "primer_nombre", label: "primer nombre" });
  if (!registro.primer_apellido.trim()) {
    faltantes.push({ id: "primer_apellido", label: "primer apellido" });
  }
  if (registro.edad == null) faltantes.push({ id: "edad", label: "edad" });
  if (!registro.sexo) faltantes.push({ id: "sexo", label: "sexo" });
  if (esMenor) {
    if (!registro.parentesco_jefe.trim()) {
      faltantes.push({ id: "parentesco_jefe", label: "parentesco con el jefe" });
    }
    if (conoceCedulaJefe && !registro.jefe_documento.trim()) {
      faltantes.push({ id: "jefe_documento", label: "cédula del jefe" });
    }
  }
  return faltantes;
}

function esCampoFaltante(id: CampoFaltante["id"], faltantes: CampoFaltante[]): boolean {
  return faltantes.some((c) => c.id === id);
}

const claseInputFaltante =
  "border-amber-500/45 ring-1 ring-amber-500/15 focus-visible:border-amber-500/60 focus-visible:ring-amber-500/25";

const claseGrupoFaltante = "rounded-lg ring-1 ring-amber-500/20 ring-offset-0";

function LabelCampoCenso({
  htmlFor,
  resaltar,
  className,
  children,
}: {
  htmlFor?: string;
  resaltar?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Label
      htmlFor={htmlFor}
      className={cn(
        resaltar && "text-amber-800 dark:text-amber-300",
        className,
      )}
    >
      {children}
      {resaltar && (
        <span
          className="ml-1.5 inline-block size-1.5 rounded-full bg-amber-500 align-middle"
          aria-hidden
        />
      )}
    </Label>
  );
}

function AvisoCamposFaltantes({
  campos,
  visible,
}: {
  campos: CampoFaltante[];
  visible: boolean;
}) {
  if (!visible || campos.length === 0) return null;
  return (
    <p className="text-xs leading-snug text-amber-700 dark:text-amber-400" role="status">
      Faltan {campos.length} campo{campos.length === 1 ? "" : "s"} obligatorio
      {campos.length === 1 ? "" : "s"}: {campos.map((c) => c.label).join(", ")}.
    </p>
  );
}

interface SesionCenso {
  centroId: string;
  funcionario: FuncionarioCenso;
}

function cargarSesionGuardada(): SesionCenso | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as SesionCenso;
    if (typeof s?.centroId !== "string" || typeof s?.funcionario?.nombre !== "string") return null;
    return s;
  } catch {
    return null;
  }
}

export function CensoView() {
  const guardada = useMemo(cargarSesionGuardada, []);
  // Preselección por enlace (/censo?centro=<id>, p. ej. desde /terreno): el
  // enlace gana sobre el centro recordado en localStorage; se valida contra
  // la lista real de campamentos cuando esta llega.
  const centroParam = useMemo(
    () => new URLSearchParams(window.location.search).get("centro")?.trim() ?? "",
    [],
  );
  // Token de terreno del QR (?t=): fija y autoriza el campamento sin sesión.
  // Sin token, la planilla solo funciona con sesión autenticada (admin).
  const token = useMemo(tokenTerrenoActual, []);

  const [mostrarInstrucciones, setMostrarInstrucciones] = useState(() =>
    debeMostrarInstrucciones(INSTRUCCIONES_CENSO_KEY),
  );
  /** Censo por cédula (Nexus), planilla manual (staging) o lista de censados. */
  const [modoCenso, setModoCenso] = useState<"nexus" | "manual" | "lista">("nexus");
  /** Planilla manual solo si Nexus no está en línea (null = comprobando). */
  const [nexusEnLinea, setNexusEnLinea] = useState<NexusEnLinea>(null);
  const mostrarCensoManual = nexusEnLinea === false;
  const [paso, setPaso] = useState<1 | 2 | 3>(1);
  /** Incrementa al pulsar «Inicio del censo» en la cabecera (reset del panel Nexus). */
  const [reinicioKey, setReinicioKey] = useState(0);
  /** Botón "Verificar" desde "Registrados": precarga una cédula en el panel Nexus. */
  const [cedulaPrecarga, setCedulaPrecarga] = useState<{
    letra: "V" | "E";
    cedula: string;
    key: number;
  } | null>(null);
  function verificarEnNominal(letra: "V" | "E", cedula: string) {
    setModoCenso("nexus");
    setCedulaPrecarga((prev) => ({ letra, cedula, key: (prev?.key ?? 0) + 1 }));
  }
  /** Botón "Editar familia" desde "Censados": abre ese hogar directo en el panel Nexus. */
  const [familiaPrecarga, setFamiliaPrecarga] = useState<{
    familiaId: string;
    key: number;
  } | null>(null);
  function abrirFamiliaEnNominal(familiaId: string) {
    setModoCenso("nexus");
    setFamiliaPrecarga((prev) => ({ familiaId, key: (prev?.key ?? 0) + 1 }));
  }
  const [paso1Seccion, setPaso1Seccion] = useState<"centro" | "funcionario">(
    token || centroParam || guardada?.centroId ? "funcionario" : "centro",
  );
  const [centros, setCentros] = useState<CentroCenso[]>([]);
  const [cargandoCentros, setCargandoCentros] = useState(true);
  const [errorCentros, setErrorCentros] = useState("");

  const [centroId, setCentroId] = useState(centroParam || guardada?.centroId || "");
  const [funcionario, setFuncionario] = useState<FuncionarioCenso>(
    guardada?.funcionario ?? { jerarquia: "", nombre: "", institucion: "", telefono: "" },
  );

  const [ubicacion, setUbicacion] = useState<UbicacionCensador>(ubicacionCensadorVacia);
  const [geoEstado, setGeoEstado] = useState<"idle" | "cargando" | "ok" | "error">("idle");
  const [geoError, setGeoError] = useState("");

  const [registro, setRegistro] = useState<RegistroCenso>(registroVacio);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState("");
  const [resaltarFaltantesPaso1, setResaltarFaltantesPaso1] = useState(false);
  const [resaltarFaltantesPaso2, setResaltarFaltantesPaso2] = useState(false);
  const [registrados, setRegistrados] = useState(0);
  const [flashExito, setFlashExito] = useState(false);

  const refPrimerNombre = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelado = false;
    const carga = token
      ? // Con token del QR el campamento queda fijado por el servidor: no hay
        // lista que elegir y el token autoriza las RPC del censo.
        obtenerCentroTerreno(token).then((centroDelToken) => {
          if (cancelado) return;
          setCargandoCentros(false);
          if (centroDelToken) {
            setCentros([centroDelToken]);
            setCentroId(centroDelToken.id);
          } else {
            setErrorCentros(
              "El enlace o código QR no es válido o fue revocado. Solicite el vigente de su campamento.",
            );
            setCentroId("");
            setPaso1Seccion("centro");
          }
        })
      : listarCentrosCenso().then((lista) => {
          if (cancelado) return;
          setCentros(lista);
          setCargandoCentros(false);
          // Enlace con un centro que no existe en la red: se descarta la
          // preselección y el funcionario elige manualmente.
          if (centroParam && !lista.some((c) => c.id === centroParam)) {
            setCentroId((actual) => {
              if (actual !== centroParam) return actual;
              const respaldo = guardada?.centroId ?? "";
              if (!respaldo) setPaso1Seccion("centro");
              return respaldo;
            });
          }
        });
    carga.catch((err) => {
      if (cancelado) return;
      setErrorCentros(
        err instanceof Error && !err.message.includes("permission denied")
          ? err.message
          : "Acceso restringido: entre con el enlace o código QR de su campamento.",
      );
      setCargandoCentros(false);
      setPaso1Seccion("centro");
    });
    return () => {
      cancelado = true;
    };
  }, [token]);

  const centroNombre = centros.find((c) => c.id === centroId)?.nombre ?? "";

  // Sondeo inicial: la pestaña Manual depende de esto aunque aún no se abra el panel Nexus.
  useEffect(() => {
    let cancelado = false;
    void (async () => {
      const r = await consultarEstadoNexusApi();
      if (cancelado) return;
      if (r.estado === "online") setNexusEnLinea(true);
      else if (r.estado === "offline" || r.estado === "degraded") setNexusEnLinea(false);
      else setNexusEnLinea(null);
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  // Si Nexus vuelve, la planilla manual deja de ser la vía: salir de esa pestaña.
  useEffect(() => {
    if (nexusEnLinea === true && modoCenso === "manual") {
      setModoCenso("nexus");
    }
  }, [nexusEnLinea, modoCenso]);

  const paso1Completo =
    Boolean(centroId) &&
    funcionario.jerarquia.trim() !== "" &&
    funcionario.nombre.trim() !== "" &&
    funcionario.institucion.trim() !== "" &&
    funcionario.telefono.trim() !== "";

  const esMenor = registro.edad != null && registro.edad < 18;
  const conoceCedulaJefe = registro.jefe_documento !== CEDULA_JEFE_NO_SE;

  const paso2Completo =
    registro.primer_nombre.trim() !== "" &&
    registro.primer_apellido.trim() !== "" &&
    registro.edad != null &&
    registro.sexo !== "" &&
    (!esMenor ||
      (registro.parentesco_jefe.trim() !== "" &&
        (registro.jefe_documento === CEDULA_JEFE_NO_SE || registro.jefe_documento.trim() !== "")));

  const faltantesPaso2 = useMemo(
    () => camposFaltantesRegistro(registro, esMenor, conoceCedulaJefe),
    [registro, esMenor, conoceCedulaJefe],
  );

  const formularioPaso1Iniciado = useMemo(
    () =>
      funcionario.jerarquia.trim() !== "" ||
      funcionario.nombre.trim() !== "" ||
      funcionario.institucion.trim() !== "" ||
      funcionario.telefono.trim() !== "",
    [funcionario],
  );

  const formularioPaso2Iniciado = useMemo(() => {
    const r = registro;
    return (
      r.primer_nombre.trim() !== "" ||
      r.primer_apellido.trim() !== "" ||
      r.segundo_nombre.trim() !== "" ||
      r.segundo_apellido.trim() !== "" ||
      r.edad != null ||
      r.sexo !== "" ||
      r.documento.trim() !== "" ||
      r.telefono.trim() !== "" ||
      r.parentesco_jefe.trim() !== "" ||
      (r.jefe_documento.trim() !== "" && r.jefe_documento !== CEDULA_JEFE_NO_SE)
    );
  }, [registro]);

  const mostrarFaltantesPaso1 =
    resaltarFaltantesPaso1 || (!paso1Completo && formularioPaso1Iniciado);
  const mostrarFaltantesPaso2 =
    resaltarFaltantesPaso2 || (!paso2Completo && formularioPaso2Iniciado);

  function inicioDelCenso() {
    if (modoCenso === "lista") {
      setModoCenso("nexus");
      setReinicioKey((k) => k + 1);
      return;
    }
    if (modoCenso === "manual") {
      setEditandoId(null);
      setRegistro(registroVacio());
      setErrorGuardar("");
      setResaltarFaltantesPaso2(false);
      setPaso(2);
      return;
    }
    setReinicioKey((k) => k + 1);
  }

  function continuarAPaso2() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ centroId, funcionario }));
    setResaltarFaltantesPaso2(false);
    setPaso(2);
  }

  function cambiarRegistro(parcial: Partial<RegistroCenso>) {
    setRegistro((r) => ({ ...r, ...parcial }));
  }

  function iniciarEdicion(fila: RegistroCensoGuardado) {
    setRegistro(registroDesdeGuardado(fila));
    setEditandoId(fila.id);
    setErrorGuardar("");
    setResaltarFaltantesPaso2(false);
    setPaso(2);
  }

  function cancelarEdicion(destino: 2 | 3 = 2) {
    setEditandoId(null);
    setRegistro(registroVacio());
    setErrorGuardar("");
    setResaltarFaltantesPaso2(false);
    if (destino === 3) setPaso(3);
  }

  function cambiarEnRefugio(v: boolean) {
    if (v) {
      setUbicacion((u) => ({ ...u, en_refugio: true }));
    } else {
      // Al responder No se descarta la captura previa.
      setUbicacion({ en_refugio: false, lat: null, lng: null, precision: null });
      setGeoEstado("idle");
      setGeoError("");
    }
  }

  function capturarUbicacion() {
    if (!("geolocation" in navigator)) {
      setGeoEstado("error");
      setGeoError("Este dispositivo no soporta geolocalización. Puede continuar sin ella.");
      return;
    }
    setGeoEstado("cargando");
    setGeoError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUbicacion((u) => ({
          ...u,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          precision: pos.coords.accuracy,
        }));
        setGeoEstado("ok");
      },
      (err) => {
        setGeoEstado("error");
        setGeoError(
          err.code === err.PERMISSION_DENIED
            ? "El navegador no tiene permiso de ubicación. No es obligatorio: puede continuar sin geolocalizar."
            : "No se pudo obtener la ubicación. No es obligatorio: puede continuar sin ella.",
        );
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  }

  async function guardarRegistro(e: React.FormEvent) {
    e.preventDefault();
    if (guardando) return;
    if (!paso2Completo) {
      setResaltarFaltantesPaso2(true);
      return;
    }
    setErrorGuardar("");
    setGuardando(true);
    try {
      // Los datos del jefe de familia solo aplican a menores de edad.
      const datos = esMenor
        ? registro
        : { ...registro, jefe_tipo_doc: "" as const, jefe_documento: "", parentesco_jefe: "" };
      if (editandoId) {
        await actualizarCenso(editandoId, datos);
        setEditandoId(null);
        setRegistro(registroVacio());
        setResaltarFaltantesPaso2(false);
        setFlashExito(true);
        window.setTimeout(() => setFlashExito(false), 2500);
        setPaso(3);
      } else {
        await registrarCenso(centroId, funcionario, datos, ubicacion);
        setRegistrados((n) => n + 1);
        // Conserva la zona geográfica: familias de la misma zona se registran
        // seguidas y así se evita re-seleccionar la cascada.
        setRegistro((r) => ({
          ...registroVacio(),
          pais: r.pais,
          estado_federativo: r.estado_federativo,
          municipio: r.municipio,
          parroquia: r.parroquia,
        }));
        setFlashExito(true);
        window.setTimeout(() => setFlashExito(false), 2500);
        window.scrollTo({ top: 0, behavior: "smooth" });
        refPrimerNombre.current?.focus();
      }
    } catch (err) {
      setErrorGuardar(err instanceof Error ? err.message : "No se pudo guardar el registro");
    } finally {
      setGuardando(false);
    }
  }

  const fechaHoy = new Date().toLocaleDateString("es-VE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  function continuarDesdeInstrucciones() {
    marcarInstruccionesVistas(INSTRUCCIONES_CENSO_KEY);
    setMostrarInstrucciones(false);
  }

  const bloquearScrollPagina =
    !mostrarInstrucciones &&
    modoCenso === "manual" &&
    paso === 1 &&
    paso1Seccion === "centro";

  return (
    <div
      className={cn(
        "min-h-[100dvh] bg-muted/40 pb-10",
        bloquearScrollPagina && "flex h-[100dvh] flex-col overflow-hidden pb-0",
      )}
    >
      {/* Encabezado */}
      <header className="bg-primary px-4 pb-6 pt-5 text-primary-foreground">
        <div className="mx-auto flex w-full max-w-xl items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-foreground/15">
            <Tent className="size-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold leading-tight">
              Planilla de Registro y Verificación de Damnificados
            </h1>
            <p className="text-xs opacity-80">Fecha: {fechaHoy}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={inicioDelCenso}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-primary-foreground/25 bg-primary-foreground/10 px-2.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary-foreground/20 sm:px-3 sm:text-sm"
              aria-label="Iniciar registro: registrar otra persona"
              title="Iniciar registro"
            >
              <RotateCcw className="size-3.5 shrink-0" aria-hidden />
              <span className="hidden sm:inline">Iniciar registro</span>
              <span className="sm:hidden">Inicio</span>
            </button>
            <a
              href="/"
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-primary-foreground/25 bg-primary-foreground/10 px-2.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary-foreground/20 sm:px-3 sm:text-sm"
              aria-label="Volver al sistema"
              title="Volver al sistema"
            >
              <LayoutGrid className="size-3.5 shrink-0" aria-hidden />
              <span>Volver</span>
            </a>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl border border-primary-foreground/25 bg-primary-foreground/10 text-primary-foreground transition-colors hover:bg-primary-foreground/20"
                  aria-label="Más opciones"
                  title="Más opciones"
                >
                  <MoreHorizontal className="size-4" aria-hidden />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <MenuItemActualizarApp />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        {!mostrarInstrucciones && modoCenso === "manual" && (
          <div className="mx-auto mt-4 flex w-full max-w-xl items-center gap-2 text-xs">
            <PasoChip
              activo={paso === 1}
              completado={paso > 1}
              numero={1}
              label="Campamento"
              onClick={() => {
                setPaso(1);
                setPaso1Seccion(centroId ? "funcionario" : "centro");
              }}
            />
            <div className="h-px flex-1 bg-primary-foreground/30" />
            <PasoChip
              activo={paso === 2}
              completado={false}
              numero={2}
              label="Registro"
              onClick={paso1Completo ? () => setPaso(2) : undefined}
            />
            <div className="h-px flex-1 bg-primary-foreground/30" />
            <PasoChip
              activo={paso === 3}
              completado={false}
              numero={3}
              label="Registrados"
              onClick={centroId ? () => setPaso(3) : undefined}
            />
          </div>
        )}
        {!mostrarInstrucciones && (
          <div className="mx-auto mt-3 flex w-full max-w-xl gap-1 rounded-lg bg-primary-foreground/10 p-1">
            <button
              type="button"
              className={cn(
                "flex-1 rounded-md px-1.5 py-1.5 text-[11px] font-medium transition-colors sm:text-xs",
                modoCenso === "nexus"
                  ? "bg-primary-foreground text-primary"
                  : "text-primary-foreground/80 hover:bg-primary-foreground/10",
              )}
              onClick={() => setModoCenso("nexus")}
            >
              Registro
            </button>
            {mostrarCensoManual ? (
              <button
                type="button"
                className={cn(
                  "flex-1 rounded-md px-1.5 py-1.5 text-[11px] font-medium transition-colors sm:text-xs",
                  modoCenso === "manual"
                    ? "bg-primary-foreground text-primary"
                    : "text-primary-foreground/80 hover:bg-primary-foreground/10",
                )}
                onClick={() => setModoCenso("manual")}
              >
                Registro manual
              </button>
            ) : null}
            <button
              type="button"
              className={cn(
                "flex-1 rounded-md px-1.5 py-1.5 text-[11px] font-medium transition-colors sm:text-xs",
                modoCenso === "lista"
                  ? "bg-primary-foreground text-primary"
                  : "text-primary-foreground/80 hover:bg-primary-foreground/10",
              )}
              onClick={() => setModoCenso("lista")}
            >
              Registrados
            </button>
          </div>
        )}
      </header>

      <main
        className={cn(
          "mx-auto w-full max-w-xl px-4 pb-[max(2.5rem,env(safe-area-inset-bottom))]",
          bloquearScrollPagina && "flex min-h-0 flex-1 flex-col overflow-hidden pb-4",
        )}
      >
        {mostrarInstrucciones && <CensoInstrucciones onContinuar={continuarDesdeInstrucciones} />}

        {!mostrarInstrucciones && modoCenso === "nexus" && (
          <div className="-mt-3 space-y-3">
            {!centroId ? (
              <Card className="shadow-lg">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <MapPin className="size-4 text-primary" />
                    Campamento
                  </CardTitle>
                  <CardDescription>
                    Elija el campamento donde registra el hogar.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {errorCentros ? (
                    <p className="text-sm text-destructive">{errorCentros}</p>
                  ) : null}
                  <div className="min-h-[16rem]">
                    <SelectorCentroLista
                      centros={centros}
                      centroId={centroId}
                      onSelect={setCentroId}
                      cargando={cargandoCentros}
                      onContinuar={() => {
                        /* en modo nexus basta con elegir el centro */
                      }}
                    />
                  </div>
                </CardContent>
              </Card>
            ) : (
              <CensoNexusPanel
                centroId={centroId}
                centroNombre={centroNombre || centroId}
                tokenTerreno={token}
                onCambiarCentro={!token ? () => setCentroId("") : undefined}
                onEstadoNexus={setNexusEnLinea}
                reinicioKey={reinicioKey}
                cedulaPrecarga={cedulaPrecarga}
                familiaPrecarga={familiaPrecarga}
              />
            )}
          </div>
        )}

        {!mostrarInstrucciones && modoCenso === "lista" && (
          <div className={cn("space-y-3", centroId ? "mt-3" : "-mt-3")}>
            {!centroId ? (
              <Card className="shadow-lg">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <MapPin className="size-4 text-primary" />
                    Campamento
                  </CardTitle>
                  <CardDescription>
                    Elija el campamento para ver a las personas registradas.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {errorCentros ? (
                    <p className="text-sm text-destructive">{errorCentros}</p>
                  ) : null}
                  <div className="min-h-[16rem]">
                    <SelectorCentroLista
                      centros={centros}
                      centroId={centroId}
                      onSelect={setCentroId}
                      cargando={cargandoCentros}
                      onContinuar={() => {
                        /* basta con elegir el centro */
                      }}
                    />
                  </div>
                </CardContent>
              </Card>
            ) : (
              <>
                {!token ? (
                  <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-card px-3 py-2.5 shadow-lg">
                    <MapPin className="size-4 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Consultando en
                      </p>
                      <p className="truncate text-sm font-semibold">
                        {centroNombre || centroId}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => setCentroId("")}
                    >
                      Cambiar
                    </Button>
                  </div>
                ) : null}
                <CensoListaCensadosPanel
                  centroId={centroId}
                  centroNombre={centroNombre || centroId}
                  onVerificarEnNominal={verificarEnNominal}
                  onAbrirFamilia={abrirFamiliaEnNominal}
                />
              </>
            )}
          </div>
        )}

        {!mostrarInstrucciones && modoCenso === "manual" && paso === 1 && paso1Seccion === "centro" && (
          <Card className="-mt-3 flex min-h-0 flex-1 flex-col overflow-hidden shadow-lg">
            <CardHeader className="shrink-0 pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <MapPin className="size-4 text-primary" />
                Seleccione el campamento
              </CardTitle>
              <CardDescription>
                Elija el campamento transitorio donde realiza el registro. Toque un nombre de la
                lista o búsquelo por escrito.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden pb-4">
              <SelectorCentroLista
                centros={centros}
                centroId={centroId}
                onSelect={setCentroId}
                cargando={cargandoCentros}
                onContinuar={() => setPaso1Seccion("funcionario")}
              />
              {errorCentros && <p className="mt-2 text-xs text-destructive">{errorCentros}</p>}
            </CardContent>
          </Card>
        )}

        {!mostrarInstrucciones && modoCenso === "manual" && paso === 1 && paso1Seccion === "funcionario" && (
          <div className="-mt-3">
            <FormularioIdentificacionFuncionario
              funcionario={funcionario}
              onChange={setFuncionario}
              onConfirmar={continuarAPaso2}
              centroNombre={centroNombre}
              titulo="Datos del funcionario"
              descripcion={
                <>
                  Identifique al funcionario que realiza el registro en{" "}
                  <span className="font-medium text-foreground">{centroNombre}</span>.
                </>
              }
              etiquetaContinuar={
                geoEstado === "ok" ? "Confirmar y continuar al registro" : "Continuar al registro"
              }
              resaltarFaltantes={mostrarFaltantesPaso1}
              onResaltarFaltantes={() => setResaltarFaltantesPaso1(true)}
              accionCentro={
                !token ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => setPaso1Seccion("centro")}
                  >
                    Cambiar
                  </Button>
                ) : undefined
              }
            >
              <CampoSiNo
                label="¿Está usted en el campamento?"
                valor={ubicacion.en_refugio}
                onChange={cambiarEnRefugio}
              >
                <div className="space-y-2">
                  {geoEstado === "ok" && ubicacion.lat != null && ubicacion.lng != null ? (
                    <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2">
                      <div className="flex min-w-0 items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400">
                        <CheckCircle2 className="size-4 shrink-0" />
                        <span className="truncate font-mono">
                          {ubicacion.lat.toFixed(5)}, {ubicacion.lng.toFixed(5)}
                          {ubicacion.precision != null && ` (±${Math.round(ubicacion.precision)} m)`}
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 shrink-0 text-xs"
                        onClick={capturarUbicacion}
                      >
                        <RefreshCw className="size-3.5" />
                        Recapturar
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      className={CENSO_BOTON_SECUNDARIO}
                      onClick={capturarUbicacion}
                      disabled={geoEstado === "cargando"}
                    >
                      {geoEstado === "cargando" ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          Obteniendo ubicación…
                        </>
                      ) : (
                        <>
                          <LocateFixed className="size-4" />
                          Geolocalizar
                        </>
                      )}
                    </Button>
                  )}
                  {geoEstado === "error" && (
                    <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                      {geoError}
                    </p>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    La ubicación valida que el registro se hace desde el campamento. Es importante,
                    pero no obligatoria.
                  </p>
                </div>
              </CampoSiNo>
            </FormularioIdentificacionFuncionario>
          </div>
        )}

        {!mostrarInstrucciones && modoCenso === "manual" && paso === 2 && (
          <div className="-mt-3 space-y-4">
            {/* Nexus caído: la cédula es el dato que permite re-verificar todo
                automáticamente cuando el servicio vuelva. */}
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <p>
                <strong>Registre la cédula con especial cuidado.</strong> Los
                servicios NEXUS/SAIME están caídos: cuando vuelvan, cada cédula
                registrada aquí se verificará automáticamente contra el registro
                de identidad.
              </p>
            </div>
            {/* Resumen del paso 1 */}
            <Card className="shadow-lg">
              <CardContent className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0 text-sm">
                  <p className="truncate font-medium">{centroNombre}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {funcionario.jerarquia} {funcionario.nombre} · {funcionario.institucion}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => {
                    setPaso(1);
                    setPaso1Seccion("funcionario");
                  }}
                >
                  <ArrowLeft className="size-4" />
                  Cambiar
                </Button>
              </CardContent>
            </Card>

            {flashExito && (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="size-4 shrink-0" />
                {editandoId
                  ? "Cambios guardados."
                  : "Registro guardado. Puede registrar a la siguiente persona."}
              </div>
            )}

            {editandoId && (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm text-sky-800 dark:text-sky-300">
                <span>Corrigiendo un registro existente</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 shrink-0"
                  onClick={() => cancelarEdicion(3)}
                >
                  Cancelar
                </Button>
              </div>
            )}

            <Card className="shadow-lg">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between gap-2 text-base">
                  <span className="flex items-center gap-2">
                    {editandoId ? (
                      <Pencil className="size-4 text-primary" />
                    ) : (
                      <UserPlus className="size-4 text-primary" />
                    )}
                    {editandoId ? "Corregir registro" : "Datos del damnificado"}
                  </span>
                  {registrados > 0 && (
                    <button
                      type="button"
                      onClick={() => setPaso(3)}
                      className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
                    >
                      {registrados} registrado{registrados === 1 ? "" : "s"}
                    </button>
                  )}
                </CardTitle>
                <CardDescription>Complete los datos de una persona y guarde.</CardDescription>
              </CardHeader>
              <CardContent>
                <form className="space-y-4" onSubmit={guardarRegistro}>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <LabelCampoCenso
                        htmlFor="censo-pn"
                        resaltar={
                          mostrarFaltantesPaso2 && esCampoFaltante("primer_nombre", faltantesPaso2)
                        }
                      >
                        Primer nombre
                      </LabelCampoCenso>
                      <Input
                        id="censo-pn"
                        ref={refPrimerNombre}
                        value={registro.primer_nombre}
                        onChange={(e) => cambiarRegistro({ primer_nombre: e.target.value })}
                        className={cn(
                          "h-11",
                          mostrarFaltantesPaso2 &&
                            esCampoFaltante("primer_nombre", faltantesPaso2) &&
                            claseInputFaltante,
                        )}
                        autoComplete="off"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="censo-sn" className="text-muted-foreground">
                        Segundo nombre
                      </Label>
                      <Input
                        id="censo-sn"
                        value={registro.segundo_nombre}
                        onChange={(e) => cambiarRegistro({ segundo_nombre: e.target.value })}
                        className="h-11"
                        autoComplete="off"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <LabelCampoCenso
                        htmlFor="censo-pa"
                        resaltar={
                          mostrarFaltantesPaso2 && esCampoFaltante("primer_apellido", faltantesPaso2)
                        }
                      >
                        Primer apellido
                      </LabelCampoCenso>
                      <Input
                        id="censo-pa"
                        value={registro.primer_apellido}
                        onChange={(e) => cambiarRegistro({ primer_apellido: e.target.value })}
                        className={cn(
                          "h-11",
                          mostrarFaltantesPaso2 &&
                            esCampoFaltante("primer_apellido", faltantesPaso2) &&
                            claseInputFaltante,
                        )}
                        autoComplete="off"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="censo-sa" className="text-muted-foreground">
                        Segundo apellido
                      </Label>
                      <Input
                        id="censo-sa"
                        value={registro.segundo_apellido}
                        onChange={(e) => cambiarRegistro({ segundo_apellido: e.target.value })}
                        className="h-11"
                        autoComplete="off"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Documento de identificación</Label>
                    <div className="flex gap-2">
                      <div className="flex overflow-hidden rounded-lg border">
                        {TIPOS_DOC.map((t, i) => (
                          <button
                            key={t.valor}
                            type="button"
                            className={cn(
                              "h-11 px-3 text-sm font-semibold transition-colors",
                              i > 0 && "border-l",
                              registro.tipo_doc === t.valor
                                ? "bg-primary text-primary-foreground"
                                : "bg-background text-muted-foreground hover:bg-muted",
                            )}
                            onClick={() => cambiarRegistro({ tipo_doc: t.valor })}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                      <Input
                        aria-label="Número de documento"
                        inputMode={registro.tipo_doc === "P" ? "text" : "numeric"}
                        value={registro.documento}
                        onChange={(e) => cambiarRegistro({ documento: e.target.value })}
                        placeholder={registro.tipo_doc === "P" ? "N.º de pasaporte" : "N.º de cédula"}
                        className="h-11 flex-1"
                        autoComplete="off"
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Deje el número vacío si la persona no posee documento.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <LabelCampoCenso
                        htmlFor="censo-edad"
                        resaltar={mostrarFaltantesPaso2 && esCampoFaltante("edad", faltantesPaso2)}
                      >
                        Edad
                      </LabelCampoCenso>
                      <Input
                        id="censo-edad"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={120}
                        value={registro.edad != null ? String(registro.edad) : ""}
                        onChange={(e) =>
                          cambiarRegistro({
                            edad: e.target.value === "" ? null : Math.max(0, Number(e.target.value)),
                          })
                        }
                        className={cn(
                          "h-11",
                          mostrarFaltantesPaso2 &&
                            esCampoFaltante("edad", faltantesPaso2) &&
                            claseInputFaltante,
                        )}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <LabelCampoCenso
                        resaltar={mostrarFaltantesPaso2 && esCampoFaltante("sexo", faltantesPaso2)}
                      >
                        Sexo
                      </LabelCampoCenso>
                      <div
                        className={cn(
                          "grid grid-cols-2 gap-2",
                          mostrarFaltantesPaso2 &&
                            esCampoFaltante("sexo", faltantesPaso2) &&
                            claseGrupoFaltante,
                        )}
                      >
                        {SEXOS.map((s) => (
                          <Button
                            key={s.valor}
                            type="button"
                            variant={registro.sexo === s.valor ? "default" : "outline"}
                            className="h-11 px-2 text-sm"
                            onClick={() => cambiarRegistro({ sexo: s.valor })}
                          >
                            {s.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {esMenor && (
                    <div className="space-y-3 rounded-lg border border-sky-500/40 bg-sky-500/5 p-3">
                      <div>
                        <p className="text-sm font-medium">Menor de edad — jefe de familia</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          Indique el parentesco. La cédula del jefe es opcional (marque «No se
                          conoce» si es huérfano o no la tiene).
                        </p>
                      </div>
                      <div className="space-y-1.5">
                        <LabelCampoCenso
                          resaltar={
                            mostrarFaltantesPaso2 &&
                            esCampoFaltante("parentesco_jefe", faltantesPaso2)
                          }
                        >
                          Parentesco con el jefe de familia
                        </LabelCampoCenso>
                        <Select
                          value={registro.parentesco_jefe || undefined}
                          onValueChange={(v) => cambiarRegistro({ parentesco_jefe: v })}
                        >
                          <SelectTrigger
                            className={cn(
                              CENSO_SELECT_TRIGGER,
                              "h-11 w-full",
                              mostrarFaltantesPaso2 &&
                                esCampoFaltante("parentesco_jefe", faltantesPaso2) &&
                                claseInputFaltante,
                            )}
                          >
                            <SelectValue placeholder="Seleccionar parentesco…" />
                          </SelectTrigger>
                          <SelectContent>
                            {PARENTESCOS_MENOR.map((p) => (
                              <SelectItem key={p} value={p}>
                                {p}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <CampoSiNo
                        label="¿Se conoce la cédula del jefe de familia?"
                        valor={conoceCedulaJefe}
                        onChange={(conoce) =>
                          cambiarRegistro({
                            jefe_documento: conoce ? "" : CEDULA_JEFE_NO_SE,
                          })
                        }
                      >
                        <div className="space-y-1.5">
                          <LabelCampoCenso
                            resaltar={
                              mostrarFaltantesPaso2 &&
                              esCampoFaltante("jefe_documento", faltantesPaso2)
                            }
                          >
                            Cédula del jefe de familia
                          </LabelCampoCenso>
                          <div
                            className={cn(
                              "flex gap-2",
                              mostrarFaltantesPaso2 &&
                                esCampoFaltante("jefe_documento", faltantesPaso2) &&
                                claseGrupoFaltante,
                            )}
                          >
                            <div className="flex overflow-hidden rounded-lg border">
                              {TIPOS_DOC.map((t, i) => (
                                <button
                                  key={t.valor}
                                  type="button"
                                  className={cn(
                                    "h-11 px-3 text-sm font-semibold transition-colors",
                                    i > 0 && "border-l",
                                    registro.jefe_tipo_doc === t.valor
                                      ? "bg-primary text-primary-foreground"
                                      : "bg-background text-muted-foreground hover:bg-muted",
                                  )}
                                  onClick={() => cambiarRegistro({ jefe_tipo_doc: t.valor })}
                                >
                                  {t.label}
                                </button>
                              ))}
                            </div>
                            <Input
                              aria-label="Cédula del jefe de familia"
                              inputMode={registro.jefe_tipo_doc === "P" ? "text" : "numeric"}
                              value={registro.jefe_documento}
                              onChange={(e) => cambiarRegistro({ jefe_documento: e.target.value })}
                              placeholder="N.º de cédula del jefe"
                              className={cn(
                                "h-11 flex-1",
                                mostrarFaltantesPaso2 &&
                                  esCampoFaltante("jefe_documento", faltantesPaso2) &&
                                  claseInputFaltante,
                              )}
                              autoComplete="off"
                            />
                          </div>
                        </div>
                      </CampoSiNo>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label htmlFor="censo-tel-ref">Teléfono</Label>
                    <Input
                      id="censo-tel-ref"
                      type="tel"
                      inputMode="tel"
                      value={registro.telefono}
                      onChange={(e) => cambiarRegistro({ telefono: e.target.value })}
                      placeholder="Teléfono de contacto (opcional)"
                      className="h-11"
                      autoComplete="off"
                    />
                  </div>

                  {errorGuardar && (
                    <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                      {errorGuardar}
                    </div>
                  )}

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                    <div className="min-w-0 flex-1">
                      <AvisoCamposFaltantes
                        campos={faltantesPaso2}
                        visible={mostrarFaltantesPaso2}
                      />
                    </div>
                    <Button
                      type="submit"
                      className={cn(CENSO_BOTON_ACCION, "shrink-0 sm:w-auto sm:min-w-[15rem]")}
                      disabled={!paso2Completo || guardando}
                    >
                      {guardando ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          Guardando…
                        </>
                      ) : editandoId ? (
                        <>
                          <Check className="size-4" />
                          Guardar cambios
                        </>
                      ) : (
                        <>
                          <UserPlus className="size-4" />
                          Guardar y registrar siguiente
                        </>
                      )}
                    </Button>
                  </div>

                  {!editandoId && (
                    <Button
                      type="button"
                      variant="outline"
                      className={CENSO_BOTON_SECUNDARIO}
                      onClick={() => setPaso(3)}
                    >
                      <BarChart3 className="size-4" />
                      Ver registrados del campamento
                    </Button>
                  )}
                </form>
              </CardContent>
            </Card>
          </div>
        )}

        {!mostrarInstrucciones && modoCenso === "manual" && paso === 3 && (
          <PasoRegistrados
            centroId={centroId}
            centroNombre={centroNombre}
            funcionario={funcionario}
            onVolver={() => {
              cancelarEdicion();
              setPaso(2);
            }}
            onEditar={iniciarEdicion}
            onVerificar={verificarEnNominal}
          />
        )}
      </main>
    </div>
  );
}

// ============================================================================
// Paso 2: campo Sí/No con contenido condicional
// ============================================================================

function CampoSiNo({
  label,
  valor,
  onChange,
  children,
}: {
  label: string;
  valor: boolean;
  onChange: (v: boolean) => void;
  /** Campo adicional que se muestra cuando la respuesta es Sí. */
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-3">
        <Label className="text-sm">{label}</Label>
        <div className="flex overflow-hidden rounded-lg border">
          <button
            type="button"
            className={cn(
              "h-9 px-4 text-sm font-semibold transition-colors",
              !valor
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-muted",
            )}
            onClick={() => onChange(false)}
          >
            No
          </button>
          <button
            type="button"
            className={cn(
              "h-9 border-l px-4 text-sm font-semibold transition-colors",
              valor
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-muted",
            )}
            onClick={() => onChange(true)}
          >
            Sí
          </button>
        </div>
      </div>
      {valor && children}
    </div>
  );
}

// ============================================================================
// Paso 3: estadística y lista de registrados del refugio
// ============================================================================

/** Normaliza texto para búsqueda sin exigir tildes exactas. */
function normalizarBusqueda(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function filtrarRegistrosCenso(
  filas: RegistroCensoGuardado[],
  termino: string,
): RegistroCensoGuardado[] {
  const q = normalizarBusqueda(termino.trim());
  if (!q) return filas;
  return filas.filter((f) => {
    const nombreCompleto = [
      f.primer_nombre,
      f.segundo_nombre,
      f.primer_apellido,
      f.segundo_apellido,
    ]
      .filter(Boolean)
      .join(" ");
    const doc = [f.tipo_doc, f.documento].filter(Boolean).join("");
    const campos = [nombreCompleto, f.primer_nombre, f.primer_apellido, doc, f.telefono];
    return campos.some((c) => normalizarBusqueda(c).includes(q));
  });
}

function PasoRegistrados({
  centroId,
  centroNombre,
  funcionario,
  onVolver,
  onEditar,
  onVerificar,
}: {
  centroId: string;
  centroNombre: string;
  funcionario: FuncionarioCenso;
  onVolver: () => void;
  onEditar: (fila: RegistroCensoGuardado) => void;
  onVerificar: (letra: "V" | "E", cedula: string) => void;
}) {
  const [filas, setFilas] = useState<RegistroCensoGuardado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [eliminarTarget, setEliminarTarget] = useState<RegistroCensoGuardado | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState("");
  const [cierre, setCierre] = useState<CierreCenso | null>(null);
  const [confirmarCompletar, setConfirmarCompletar] = useState(false);
  const [completando, setCompletando] = useState(false);
  const [errorCompletar, setErrorCompletar] = useState("");
  /** Ids ya verificados en el censo nominal (badge "✓ Nominal" por fila). */
  const [procesadosIds, setProcesadosIds] = useState<Set<string>>(new Set());

  const cargar = useCallback(() => {
    setCargando(true);
    setError("");
    Promise.all([
      listarRegistrosCenso(centroId),
      obtenerCierreCenso(centroId),
      listarIdsCensoProcesados(centroId).catch(() => new Set<string>()),
    ])
      .then(([lista, ultimoCierre, procesados]) => {
        setFilas(lista);
        setCierre(ultimoCierre);
        setProcesadosIds(procesados);
        setCargando(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "No se pudo cargar el listado");
        setCargando(false);
      });
  }, [centroId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const filasFiltradas = useMemo(
    () => filtrarRegistrosCenso(filas, busqueda),
    [filas, busqueda],
  );

  async function confirmarEliminar() {
    if (!eliminarTarget) return;
    setEliminando(true);
    setErrorEliminar("");
    try {
      await eliminarCenso(eliminarTarget.id);
      setEliminarTarget(null);
      cargar();
    } catch (err) {
      setErrorEliminar(err instanceof Error ? err.message : "No se pudo eliminar el registro");
    } finally {
      setEliminando(false);
    }
  }

  async function confirmarCensoCompletado() {
    setCompletando(true);
    setErrorCompletar("");
    try {
      const total = await completarCenso(centroId, funcionario);
      setConfirmarCompletar(false);
      setCierre({
        creado_en: new Date().toISOString(),
        funcionario_nombre: funcionario.nombre,
        funcionario_institucion: funcionario.institucion,
        total_registrados: total,
      });
      cargar();
    } catch (err) {
      setErrorCompletar(err instanceof Error ? err.message : "No se pudo registrar el cierre");
    } finally {
      setCompletando(false);
    }
  }

  const stats = useMemo(() => {
    const total = filas.length;
    const mujeres = filas.filter((f) => f.sexo === "F").length;
    const hombres = filas.filter((f) => f.sexo === "M").length;
    const menores = filas.filter((f) => f.edad != null && f.edad < 18).length;
    const adultosMayores = filas.filter((f) => f.edad != null && f.edad >= 60).length;
    const procesados = filas.filter((f) => procesadosIds.has(f.id)).length;
    return {
      total,
      mujeres,
      hombres,
      menores,
      adultosMayores,
      procesados,
    };
  }, [filas, procesadosIds]);

  const fechaCierre = cierre
    ? new Date(cierre.creado_en).toLocaleString("es-VE", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="-mt-3 space-y-4">
      <Card className="shadow-lg">
        <CardContent className="flex items-center justify-between gap-3 py-3">
          <div className="min-w-0 text-sm">
            <p className="truncate font-medium">{centroNombre}</p>
            <p className="text-xs text-muted-foreground">Registrados en este campamento</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button type="button" variant="outline" size="sm" onClick={cargar} disabled={cargando}>
              <RefreshCw className={cn("size-4", cargando && "animate-spin")} />
              Actualizar
            </Button>
            <Button type="button" size="sm" onClick={onVolver}>
              <ArrowLeft className="size-4" />
              Registrar
            </Button>
          </div>
        </CardContent>
      </Card>

      {cierre && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-800 dark:text-emerald-300">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          <div className="min-w-0">
            <p className="font-medium">Registro completado</p>
            <p className="text-xs opacity-90">
              {fechaCierre} · {cierre.funcionario_nombre} ({cierre.funcionario_institucion}) ·{" "}
              {cierre.total_registrados} persona{cierre.total_registrados === 1 ? "" : "s"}
            </p>
            <p className="mt-0.5 text-[11px] opacity-75">
              Puede seguir registrando o corrigiendo personas; el cierre es una constancia
              declarativa.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {/* Estadística */}
      <Card className="shadow-lg">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="size-4 text-primary" />
            Estadística del registro
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <TarjetaStat valor={stats.total} label="Total" destacada />
            <TarjetaStat valor={stats.mujeres} label="Mujeres" />
            <TarjetaStat valor={stats.hombres} label="Hombres" />
            <TarjetaStat valor={stats.menores} label="Menores de 18" />
            <TarjetaStat valor={stats.adultosMayores} label="Adultos 60+" />
            <TarjetaStat valor={stats.procesados} label="Verificados en nominal" />
          </div>
        </CardContent>
      </Card>

      {/* Lista */}
      <Card className="shadow-lg">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="size-4 text-primary" />
            Personas registradas
          </CardTitle>
          <CardDescription>
            {cargando
              ? "Cargando…"
              : `${filas.length} registro${filas.length === 1 ? "" : "s"} · busque por nombre, cédula o teléfono`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 p-4 pt-0">
          {!cargando && filas.length > 0 && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre, apellido, cédula o teléfono…"
                className="h-10 pl-9"
                autoComplete="off"
              />
            </div>
          )}

          {cargando ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Cargando registros…
            </div>
          ) : filas.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Aún no hay personas registradas en este campamento.
            </p>
          ) : filasFiltradas.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Ninguna persona coincide con «{busqueda.trim()}». Verifique la cédula o el nombre e
              intente de nuevo.
            </p>
          ) : (
            <div className="-mx-4 overflow-x-auto">
              <Table className="text-xs">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-8 w-8 px-2 text-center">#</TableHead>
                    <TableHead className="h-8 px-2">Nombre</TableHead>
                    <TableHead className="h-8 px-2">Documento</TableHead>
                    <TableHead className="h-8 px-2 text-center">Edad</TableHead>
                    <TableHead className="h-8 px-2 text-center">Sexo</TableHead>
                    <TableHead className="h-8 px-2">Parroquia</TableHead>
                    <TableHead className="h-8 px-2 text-right">Hora</TableHead>
                    <TableHead className="h-8 w-16 px-1 text-center" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filasFiltradas.map((f, i) => (
                    <FilaTabla
                      key={f.id}
                      fila={f}
                      numero={filasFiltradas.length - i}
                      procesado={procesadosIds.has(f.id)}
                      onEditar={() => onEditar(f)}
                      onEliminar={() => setEliminarTarget(f)}
                      onVerificar={
                        f.documento && (f.tipo_doc === "V" || f.tipo_doc === "E")
                          ? () => onVerificar(f.tipo_doc as "V" | "E", f.documento)
                          : undefined
                      }
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cierre declarativo del censo */}
      {!cargando && (
        <Card className="shadow-lg">
          <CardContent className="space-y-3 py-4">
            {filas.length > 0 ? (
              <p className="text-sm text-muted-foreground">
                Cuando haya registrado a todas las personas del campamento, confirme el cierre del
                censo. Esto no impide seguir agregando o corrigiendo registros después.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Si el campamento no tiene personas damnificadas todavía (vacío o en adecuación), puede
                declarar el registro completado con 0 ocupantes.
              </p>
            )}
            <Button
              type="button"
              className={cn(
                CENSO_BOTON_ACCION,
                filas.length === 0 &&
                  "border border-violet-500/40 bg-violet-500/10 text-violet-800 hover:bg-violet-500/15 dark:text-violet-300",
              )}
              variant={filas.length === 0 ? "outline" : "default"}
              onClick={() => {
                setErrorCompletar("");
                setConfirmarCompletar(true);
              }}
            >
              <Flag className="size-4" />
              {filas.length === 0 ? "Completado (sin damnificados)" : "Registro completado"}
            </Button>
          </CardContent>
        </Card>
      )}

      <AlertDialog
        open={eliminarTarget != null}
        onOpenChange={(abierto) => {
          if (!abierto) {
            setEliminarTarget(null);
            setErrorEliminar("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este registro?</AlertDialogTitle>
            <AlertDialogDescription>
              {eliminarTarget
                ? `Se borrará permanentemente a ${[
                    eliminarTarget.primer_nombre,
                    eliminarTarget.primer_apellido,
                  ]
                    .filter(Boolean)
                    .join(" ")}. Esta acción no se puede deshacer.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {errorEliminar && (
            <p className="text-sm text-destructive">{errorEliminar}</p>
          )}
          <AlertDialogFooter className="gap-2 sm:flex-col sm:space-x-0">
            <AlertDialogAction
              variant="destructive"
              className={CENSO_BOTON_ACCION}
              disabled={eliminando}
              onClick={(e) => {
                e.preventDefault();
                void confirmarEliminar();
              }}
            >
              {eliminando ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Eliminando…
                </>
              ) : (
                "Eliminar"
              )}
            </AlertDialogAction>
            <AlertDialogCancel
              className={CENSO_BOTON_SECUNDARIO}
              disabled={eliminando}
            >
              Cancelar
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirmarCompletar}
        onOpenChange={(abierto) => {
          if (!abierto) {
            setConfirmarCompletar(false);
            setErrorCompletar("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Confirmar registro completado?</AlertDialogTitle>
            <AlertDialogDescription>
              {stats.total === 0 ? (
                <>
                  Declara que en <strong>{centroNombre}</strong> no hay personas damnificadas por
                  censar (campamento vacío o en adecuación). Podrá registrar personas después si
                  llegan.
                </>
              ) : (
                <>
                  Declara que se registró la totalidad de las personas presentes en{" "}
                  <strong>{centroNombre}</strong> ({stats.total} persona
                  {stats.total === 1 ? "" : "s"} al momento). Podrá seguir registrando o corrigiendo
                  después si hace falta.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {errorCompletar && (
            <p className="text-sm text-destructive">{errorCompletar}</p>
          )}
          <AlertDialogFooter className="gap-2 sm:flex-col sm:space-x-0">
            <AlertDialogAction
              className={CENSO_BOTON_ACCION}
              disabled={completando}
              onClick={(e) => {
                e.preventDefault();
                void confirmarCensoCompletado();
              }}
            >
              {completando ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Guardando…
                </>
              ) : (
                "Sí, registro completado"
              )}
            </AlertDialogAction>
            <AlertDialogCancel
              className={CENSO_BOTON_SECUNDARIO}
              disabled={completando}
            >
              Cancelar
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TarjetaStat({
  valor,
  label,
  destacada,
  alerta,
}: {
  valor: number;
  label: string;
  destacada?: boolean;
  alerta?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-2.5 text-center",
        destacada && "border-primary/40 bg-primary/10",
        alerta && "border-amber-500/40 bg-amber-500/10",
      )}
    >
      <p className={cn("text-xl font-bold", destacada && "text-primary", alerta && "text-amber-600 dark:text-amber-400")}>
        {valor}
      </p>
      <p className="text-[11px] leading-tight text-muted-foreground">{label}</p>
    </div>
  );
}

function FilaTabla({
  fila,
  numero,
  procesado,
  onEditar,
  onEliminar,
  onVerificar,
}: {
  fila: RegistroCensoGuardado;
  numero: number;
  /** Ya verificado en el censo nominal (RPC censo_marcar_procesado). */
  procesado: boolean;
  onEditar: () => void;
  onEliminar: () => void;
  /** Undefined si el registro no tiene cédula V/E utilizable en Nexus. */
  onVerificar?: () => void;
}) {
  const nombre = [fila.primer_nombre, fila.segundo_nombre, fila.primer_apellido, fila.segundo_apellido]
    .filter(Boolean)
    .join(" ");
  const doc = fila.documento
    ? `${fila.tipo_doc === "P" ? "PP " : (fila.tipo_doc ?? "V") + "-"}${fila.documento}`
    : "—";
  const hora = new Date(fila.creado_en).toLocaleTimeString("es-VE", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <TableRow>
      <TableCell className="px-2 py-1.5 text-center text-muted-foreground">{numero}</TableCell>
      <TableCell className="max-w-40 px-2 py-1.5">
        <span className="flex min-w-0 items-center gap-1">
          <span className="truncate font-medium" title={nombre}>
            {nombre}
          </span>
          {procesado && (
            <Badge
              variant="outline"
              className="h-4 shrink-0 gap-0.5 border-emerald-500/50 px-1 text-[9px] text-emerald-600 dark:text-emerald-400"
              title="Ya verificado en el registro nominal (Por cédula)"
            >
              <Check className="size-2.5" />
              Nominal
            </Badge>
          )}
        </span>
        {fila.parentesco_jefe && (
          <span
            className="block truncate text-[10px] text-muted-foreground"
            title={
              fila.jefe_documento === CEDULA_JEFE_NO_SE
                ? `${fila.parentesco_jefe} — cédula del jefe no conocida`
                : `${fila.parentesco_jefe} del jefe de familia ${fila.jefe_documento}${fila.jefe_registro_id ? " (asociado a su registro)" : fila.jefe_documento ? " (jefe aún no registrado)" : ""}`
            }
          >
            {fila.parentesco_jefe}
            {fila.jefe_documento === CEDULA_JEFE_NO_SE ? (
              " · cédula no conocida"
            ) : fila.jefe_documento ? (
              <>
                {" de "}
                {fila.jefe_tipo_doc === "P" ? "PP " : `${fila.jefe_tipo_doc ?? "V"}-`}
                {fila.jefe_documento}
                {fila.jefe_registro_id ? " ✓" : ""}
              </>
            ) : null}
          </span>
        )}
      </TableCell>
      <TableCell className="px-2 py-1.5 font-mono text-[11px]">{doc}</TableCell>
      <TableCell className="px-2 py-1.5 text-center">{fila.edad ?? "—"}</TableCell>
      <TableCell className="px-2 py-1.5 text-center">{fila.sexo ?? "—"}</TableCell>
      <TableCell className="max-w-28 truncate px-2 py-1.5" title={[fila.parroquia, fila.municipio].filter(Boolean).join(", ")}>
        {fila.parroquia || fila.municipio || "—"}
      </TableCell>
      <TableCell className="px-2 py-1.5 text-right text-muted-foreground">{hora}</TableCell>
      <TableCell className="px-1 py-1.5">
        <div className="flex items-center justify-center gap-0.5">
          {onVerificar ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 text-primary hover:text-primary"
              title="Verificar en el registro nominal (Por cédula)"
              onClick={onVerificar}
            >
              <UserCheck className="size-3.5" />
            </Button>
          ) : null}
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
    </TableRow>
  );
}

// ============================================================================
// Encabezado: chip de paso
// ============================================================================

function PasoChip({
  activo,
  completado,
  numero,
  label,
  onClick,
}: {
  activo: boolean;
  completado: boolean;
  numero: number;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "flex items-center gap-1.5",
        activo || completado ? "opacity-100" : "opacity-60",
        onClick && "cursor-pointer",
      )}
    >
      <span
        className={cn(
          "flex size-5 items-center justify-center rounded-full text-[11px] font-bold",
          activo
            ? "bg-primary-foreground text-primary"
            : "border border-primary-foreground/50 text-primary-foreground",
        )}
      >
        {completado ? <CheckCircle2 className="size-3.5" /> : numero}
      </span>
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}
