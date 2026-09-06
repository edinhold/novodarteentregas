import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FileText, ShieldCheck, History } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDateTime } from "@/utils/financialCalculations";

interface FinancialAuditLogsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export interface FinancialAuditLogRecord {
  id: string;
  admin_user_id: string;
  admin_email: string | null;
  transaction_id: string;
  store_id: string | null;
  store_name: string | null;
  movement_type: string;
  old_value: number;
  new_value: number;
  adjustment_amount: number;
  reason: string;
  created_at: string;
}

export const FinancialAuditLogsModal: React.FC<FinancialAuditLogsModalProps> = ({
  open,
  onOpenChange,
}) => {
  const { data: auditLogs = [], isLoading, refetch } = useQuery({
    queryKey: ["financial-audit-logs"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_adjustment_logs" as any)
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) {
        console.warn("Aviso ao buscar logs de auditoria:", error);
        return [];
      }
      return (data || []) as FinancialAuditLogRecord[];
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground font-black text-lg">
            <History className="w-5 h-5 text-primary" />
            Histórico Permanente de Auditoria Financeira
          </DialogTitle>
          <DialogDescription className="text-xs">
            Registro imutável de todas as correções e edições de valores realizadas por administradores.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="border rounded-lg overflow-hidden bg-background">
            <Table className="text-xs">
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="font-bold">Data / Hora</TableHead>
                  <TableHead className="font-bold">Administrador</TableHead>
                  <TableHead className="font-bold">Loja</TableHead>
                  <TableHead className="font-bold">Tipo</TableHead>
                  <TableHead className="font-bold text-right">Valor Anterior</TableHead>
                  <TableHead className="font-bold text-right">Valor Novo</TableHead>
                  <TableHead className="font-bold text-right">Ajuste</TableHead>
                  <TableHead className="font-bold">Motivo da Alteração</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {auditLogs.map((log) => (
                  <TableRow key={log.id} className="border-b">
                    <TableCell className="font-medium whitespace-nowrap">
                      {formatDateTime(log.created_at)}
                    </TableCell>
                    <TableCell>
                      <span className="font-semibold text-foreground">{log.admin_email || "Admin"}</span>
                    </TableCell>
                    <TableCell className="font-medium max-w-[120px] truncate">
                      {log.store_name || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">
                        {log.movement_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {formatCurrency(log.old_value)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold text-foreground">
                      {formatCurrency(log.new_value)}
                    </TableCell>
                    <TableCell className={`text-right font-mono font-bold ${log.adjustment_amount >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                      {log.adjustment_amount >= 0 ? `+${formatCurrency(log.adjustment_amount)}` : formatCurrency(log.adjustment_amount)}
                    </TableCell>
                    <TableCell className="max-w-[200px] text-muted-foreground italic">
                      "{log.reason}"
                    </TableCell>
                  </TableRow>
                ))}

                {auditLogs.length === 0 && !isLoading && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      Nenhuma edição ou correção financeira registrada no histórico de auditoria.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
