import {
  ArrowRight,
  Baby,
  BookOpen,
  Camera,
  CheckCircle2,
  Home,
  Send,
  ShieldAlert,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CENSO_BOTON_ACCION } from "@/features/censo/censoFormularioShared";
import { telegramHref } from "@/lib/contacto";

/** Soporte del censo (no mostrar en UI; solo enlace a Telegram). */
const TELEGRAM_SOPORTE_CENSO = "+584129317099";

interface Props {
  onContinuar: () => void;
}

function Consejo({
  icono: Icono,
  titulo,
  children,
}: {
  icono: typeof BookOpen;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icono className="size-4" />
      </div>
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-medium leading-snug">{titulo}</p>
        <div className="text-xs leading-relaxed text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

/** Consejos prácticos de campo antes de empezar el censo por cédula. */
export function CensoInstrucciones({ onContinuar }: Props) {
  const enlaceTelegram = telegramHref(TELEGRAM_SOPORTE_CENSO);

  return (
    <Card className="-mt-3 flex min-h-[calc(100dvh-9rem)] flex-col shadow-lg">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <BookOpen className="size-4 text-primary" />
          Consejos para el registro
        </CardTitle>
        <CardDescription>
          Tips rápidos de campo. La planilla guía el resto paso a paso.
        </CardDescription>
      </CardHeader>

      <CardContent className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-2">
        <Consejo icono={Home} titulo="Ubique al jefe o líder de una familia y empiece por él o ella">
          Esa persona conoce quiénes de su hogar están en el campamento, puede señalarlos y
          confirmar identidades. También ayuda a registrar a los menores y a dar su
          información (nombres, edades, parentesco) cuando no tienen cédula a la mano.
        </Consejo>

        <Consejo icono={Users} titulo="Luego priorice a los adultos con cédula">
          Cónyuge y demás adultos presentes: verifique cada cédula con Nexus. Así el hogar
          queda armado rápido con identidades confirmadas.
        </Consejo>

        <Consejo icono={Baby} titulo="Menores y personas sin documento, al final">
          Agréguelos dentro del hogar ya creado (pestaña «Menores / sin cédula»), con la
          ayuda del jefe o líder. No invente una cédula.
        </Consejo>

        <Consejo icono={Camera} titulo="Individualice a los menores con una foto">
          Sin cédula, la foto es la referencia visual del hogar: tómela en el momento con
          la cámara del teléfono para distinguir a cada niño o persona no documentada.
        </Consejo>

        <Consejo icono={CheckCircle2} titulo="Un hogar a la vez">
          Termine la familia, revise el resumen y cierre el hogar antes de empezar otra.
          Si varios censistas trabajan juntos, coordinen por zona para no duplicar.
        </Consejo>

        <Consejo icono={ShieldAlert} titulo="Si la cédula ya está en otro campamento">
          Confirme con la persona qué pasó. Si de verdad se mudó a este campamento, use
          «Trasladar a este campamento» (solo ella o su familia completa): el registro
          anterior se cierra solo, sin duplicados. Ante la duda, reporte a los analistas.
        </Consejo>

        {enlaceTelegram && (
          <Consejo icono={Send} titulo="¿Problemas técnicos?">
            Si Nexus falla o una cédula no carga,{" "}
            <a
              href={enlaceTelegram}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              escríbanos por Telegram
            </a>
            .
          </Consejo>
        )}
      </CardContent>

      <CardFooter className="border-t border-border pt-4">
        <Button type="button" className={CENSO_BOTON_ACCION} onClick={onContinuar}>
          Entendido, comenzar
          <ArrowRight className="size-4" />
        </Button>
      </CardFooter>
    </Card>
  );
}
