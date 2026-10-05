"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Nút bấm có hộp xác nhận cho thao tác quan trọng (đóng lệnh, duyệt hao hụt, khóa nhân viên)
export function ConfirmButton({
  label, title, description, confirmLabel = "Xác nhận", onConfirm, disabled, variant = "default", size = "default",
}: {
  label: React.ReactNode;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  disabled?: boolean;
  variant?: "default" | "secondary" | "outline" | "destructive";
  size?: "default" | "sm";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} disabled={disabled} onClick={() => setOpen(true)}>{label}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif text-lg text-brand">{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="secondary" />}>Hủy</DialogClose>
            <Button onClick={() => { setOpen(false); onConfirm(); }}>{confirmLabel}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
