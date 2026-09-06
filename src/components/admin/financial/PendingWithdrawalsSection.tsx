import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { formatCurrency, formatDateTime } from "@/utils/financialCalculations";
import { CheckCircle, XCircle, Clock, Copy, ArrowUpRight, Phone } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

interface PendingWithdrawalsSectionProps {
  withdrawals: any[];
  drivers: any[];
  onRefresh?: () => void;
}

export const PendingWithdrawalsSection: React.FC<PendingWithdrawalsSectionProps> = ({
  withdrawals = [],
  drivers = [],
  onRefresh,
}) => {
  const queryClient = useQueryClient();
  const [processingId, setProcessingId] = useState<string | null>(null);

  const pendingList = withdrawals.filter((w) => w.status === "pending");

  const getDriverInfo = (w: any) => {
    const d = drivers.find(
      (drv: any) => drv.user_id === w.driver_user_id || drv.id === w.driver_id
    );
    return {
      name: d?.full_name || "Motorista",
      phone: d?.phone || "—",
    };
  };

  const copyToClipboard = (text: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  };

  const handleAction = async (id: string, status: "approved" | "rejected") => {
    setProcessingId(id);
    try {
      const { error } = await supabase
        .from("withdrawal_requests")
        .update({
          status,
          processed_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) throw error;

      toast.success(
        status === "approved"
          ? "Saque aprovado com sucesso! Lembre-se de realizar a transferência PIX."
          : "Solicitação de saque recusada."
      );

      queryClient.invalidateQueries({ queryKey: ["admin-withdrawals"] });
      queryClient.invalidateQueries({ queryKey: ["admin-financial-data"] });
      queryClient.invalidateQueries({ queryKey: ["financial-withdrawals"] });
      queryClient.invalidateQueries({ queryKey: ["financial-driver-earnings"] });
      queryClient.invalidateQueries({ queryKey: ["my-withdrawals"] });
      queryClient.invalidateQueries({ queryKey: ["my-earnings"] });
      if (onRefresh) onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Erro ao processar saque");
    } finally {
      setProcessingId(null);
    }
  };

  if (pendingList.length === 0) {
    return null; // When no pending requests, don't clutter the page
  }

  return (
    <Card className="border-orange-500/30 bg-orange-500/5 shadow-sm">
      <CardHeader className="py-4 px-4 sm:px-6 flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-orange-600 dark:text-orange-400" />
          <CardTitle className="text-base font-bold text-orange-900 dark:text-orange-200">
            Solicitações de Saque Pendentes ({pendingList.length})
          </CardTitle>
        </div>
        <Badge variant="outline" className="border-orange-500/40 text-orange-700 dark:text-orange-300">
          Ação do Administrador Necessária
        </Badge>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-orange-500/10">
                <TableHead className="font-semibold text-xs text-orange-950 dark:text-orange-200">
                  Data / Hora
                </TableHead>
                <TableHead className="font-semibold text-xs text-orange-950 dark:text-orange-200">
                  Motorista
                </TableHead>
                <TableHead className="font-semibold text-xs text-orange-950 dark:text-orange-200">
                  Chave PIX
                </TableHead>
                <TableHead className="font-semibold text-xs text-orange-950 dark:text-orange-200 text-right">
                  Valor Bruto
                </TableHead>
                <TableHead className="font-semibold text-xs text-orange-950 dark:text-orange-200 text-right">
                  Taxa Antecipação
                </TableHead>
                <TableHead className="font-semibold text-xs text-orange-950 dark:text-orange-200 text-right">
                  Líquido a Pagar
                </TableHead>
                <TableHead className="font-semibold text-xs text-orange-950 dark:text-orange-200 text-center">
                  Ações
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendingList.map((w) => {
                const driver = getDriverInfo(w);
                const reqAmount = Number(w.amount || 0);
                const feeVal = Number(w.fee_amount || 0);
                const netVal = Number(w.net_amount || reqAmount - feeVal);

                return (
                  <TableRow key={w.id} className="hover:bg-orange-500/10">
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDateTime(w.created_at)}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-xs sm:text-sm text-foreground">
                        {driver.name}
                      </div>
                      <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Phone className="w-3 h-3" /> {driver.phone}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-semibold select-all">
                          {w.pix_key || "—"}
                        </span>
                        {w.pix_key && (
                          <button
                            onClick={() => copyToClipboard(w.pix_key, "Chave PIX")}
                            className="text-muted-foreground hover:text-foreground p-1"
                            title="Copiar Chave PIX"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <span className="text-[10px] uppercase font-semibold text-muted-foreground">
                        {w.pix_key_type || "PIX"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground font-mono">
                      {formatCurrency(reqAmount)}
                    </TableCell>
                    <TableCell className="text-right text-xs text-violet-600 dark:text-violet-400 font-mono font-medium">
                      -{formatCurrency(feeVal)}
                    </TableCell>
                    <TableCell className="text-right text-sm font-bold text-emerald-700 dark:text-emerald-300 font-mono">
                      {formatCurrency(netVal)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-2">
                        <Button
                          size="sm"
                          className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3"
                          disabled={processingId === w.id}
                          onClick={() => handleAction(w.id, "approved")}
                        >
                          <CheckCircle className="w-3.5 h-3.5 mr-1" />
                          Aprovar PIX
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 text-destructive hover:bg-destructive/10 text-xs px-2.5"
                          disabled={processingId === w.id}
                          onClick={() => handleAction(w.id, "rejected")}
                        >
                          <XCircle className="w-3.5 h-3.5 mr-1" />
                          Recusar
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};
