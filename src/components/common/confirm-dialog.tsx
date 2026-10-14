"use client";

import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Spinner } from "@/components/ui/spinner";

/** 破坏性或不可逆操作的确认（SHADCN-006）：确认键是普通 Button，异步时保持打开 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  desc,
  confirmText,
  destructive,
  pending,
  onConfirm,
  children,
  confirmDisabled,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  desc: React.ReactNode;
  confirmText: string;
  destructive?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  children?: React.ReactNode;
  confirmDisabled?: boolean;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div>{desc}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>取消</AlertDialogCancel>
          <Button variant={destructive ? "destructive" : "default"} disabled={pending || confirmDisabled} onClick={onConfirm}>
            {pending && <Spinner />}
            {confirmText}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
