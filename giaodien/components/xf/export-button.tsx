"use client";

import { useState } from "react";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { exportExcel, excelName, type ExcelSheet } from "@/lib/excel";

// Nút "Xuất Excel": build() trả về các sheet tại thời điểm bấm
export function ExportButton({ name, build, label = "Xuất Excel", size = "default" }: {
  name: string; build: () => ExcelSheet[]; label?: string; size?: "default" | "sm";
}) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      await exportExcel(excelName(name), build());
      toast.success("Đã tải file Excel");
    } catch {
      toast.error("Không xuất được file, thử lại");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button variant="secondary" size={size} onClick={run} disabled={busy}>
      {busy ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />} {label}
    </Button>
  );
}
