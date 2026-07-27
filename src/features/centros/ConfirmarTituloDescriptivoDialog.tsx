// Confirmación al guardar novedad: el título descriptivo debe bastar por sí solo.

import type { ReactElement } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type Props = {
  children: ReactElement;
  onConfirm: () => void;
};

export function ConfirmarTituloDescriptivoDialog({ children, onConfirm }: Props) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirmar título descriptivo</AlertDialogTitle>
          <AlertDialogDescription>
            ¿Está seguro que el Título descriptivo explica por sí solo y de forma
            clara la novedad?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Revisar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Sí, guardar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
