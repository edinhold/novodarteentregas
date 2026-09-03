import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { formatDateTime } from "@/utils/financialCalculations";
import { Settings, Trash2, Calendar, ShieldAlert, AlertTriangle, Loader2, History } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient, useQuery } from "@tanstack/react-query";

interface FinancialMaintenanceSectionProps {
  deliveryConfig: any;
}

const DAYS_OF_WEEK = [
  { value: "0", label: "Domingo" },
  { value: "1", label: "Segunda-feira" },
  { value: "2", label: "Terça-feira" },
  { value: "3", label: "Quarta-feira" },
  { value: "4", label: "Quinta-feira" },
  { value: "5", label: "Sexta-feira" },
  { value: "6", label: "Sábado" },
];

export const FinancialMaintenanceSection: React.FC<FinancialMaintenanceSectionProps> = ({
  deliveryConfig,
}) => {
  const queryClient = useQueryClient();
  const [paymentDay, setPaymentDay] = useState<string>(
    deliveryConfig?.payment_day !== undefined ? String(deliveryConfig.payment_day) : "1"
  );
  const [savingPaymentDay, setSavingPaymentDay] = useState(false);

  // Cleanup state
  const [cleanupModalOpen, setCleanupModalOpen] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [reason, setReason] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [incDeliveries, setIncDeliveries] = useState(true);
  const [incEarnings, setIncEarnings] = useState(true);
  const [incWithdrawals, setIncWithdrawals] = useState(true);
  const [cleaning, setCleaning] = useState(false);

  // Query cleanup logs
  const { data: cleanupLogs = [] } = useQuery({
    queryKey: ["financial-cleanup-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_cleanup_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) return [];
      return data;
    },
  });

  const handleSavePaymentDay = async () => {
    if (!deliveryConfig?.id) return;
    setSavingPaymentDay(true);
    try {
      const dayNum = parseInt(paymentDay, 10);
      const { error } = await supabase
        .from("delivery_config")
        .update({ payment_day: dayNum } as any)
        .eq("id", deliveryConfig.id);

      if (error) throw error;
      toast.success("Dia oficial de repasse semanal atualizado!");
      queryClient.invalidateQueries({ queryKey: ["delivery-config"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar dia de pagamento");
    } finally {
      setSavingPaymentDay(false);
    }
  };

  const handleExecuteCleanup = async () => {
    if (confirmText !== "CONFIRMAR") {
      toast.error("Digite CONFIRMAR em maiúsculas para prosseguir.");
      return;
    }

    setCleaning(true);
    try {
      const { data, error } = await supabase.rpc("admin_cleanup_financials", {
        p_from: fromDate ? new Date(fromDate).toISOString() : null,
        p_to: toDate ? new Date(toDate).toISOString() : null,
        p_include_withdrawals: incWithdrawals,
        p_include_earnings: incEarnings,
        p_include_delivered_requests: incDeliveries,
        p_include_delivered_orders: incDeliveries,
        p_reason: reason || "Limpeza manual autorizada pelo Admin",
      });

      if (error) throw error;

      toast.success(
        `Limpeza executada com sucesso! ${data?.total || 0} registros removidos de forma auditada.`
      );

      setCleanupModalOpen(false);
      setConfirmText("");
      setReason("");
      queryClient.invalidateQueries({ queryKey: ["admin-financial-data"] });
      queryClient.invalidateQueries({ queryKey: ["financial-cleanup-logs"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao executar limpeza de registros");
    } finally {
      setCleaning(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4">
      {/* Configuration: Payment day */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            <CardTitle className="text-base font-bold">
              Repasse Semanal de Motoristas
            </CardTitle>
          </div>
          <CardDescription className="text-xs">
            Dia da semana em que os motoristas podem solicitar saques regulares sem retenção de taxa de antecipação.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-5 pt-0 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="space-y-1.5 flex-1">
              <Label className="text-xs font-semibold">Dia Oficial de Pagamento</Label>
              <Select value={paymentDay} onValueChange={setPaymentDay}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Selecione o dia" />
                </SelectTrigger>
                <SelectContent>
                  {DAYS_OF_WEEK.map((d) => (
                    <SelectItem key={d.value} value={d.value} className="text-xs">
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              size="sm"
              onClick={handleSavePaymentDay}
              disabled={savingPaymentDay}
              className="h-9 text-xs font-semibold"
            >
              {savingPaymentDay ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
              ) : null}
              Salvar Dia
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Saques solicitados fora deste dia são considerados antecipações e aplicam a taxa de{" "}
            <strong>{deliveryConfig?.early_withdrawal_fee_percent || 0}%</strong>.
          </p>
        </CardContent>
      </Card>

      {/* Safe Cleanup Tool */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-destructive" />
            <CardTitle className="text-base font-bold">
              Manutenção e Limpeza Auditada
            </CardTitle>
          </div>
          <CardDescription className="text-xs">
            Exclusão controlada de registros financeiros antigos com gravação compulsória em log de auditoria.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-5 pt-0 space-y-4">
          <div className="p-3 bg-muted/40 rounded-lg text-xs text-muted-foreground">
            Permite limpar corridas entregues e saques passados para arquivamento do banco de dados, registrando o ID do administrador executor.
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCleanupModalOpen(true)}
            className="h-9 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
          >
            <ShieldAlert className="w-3.5 h-3.5 mr-1.5" />
            Abrir Ferramenta de Limpeza por Período
          </Button>

          {/* Recent logs */}
          {cleanupLogs.length > 0 && (
            <div className="pt-2">
              <span className="text-[11px] font-bold text-muted-foreground uppercase flex items-center gap-1">
                <History className="w-3 h-3" /> Últimas Limpezas Registradas:
              </span>
              <div className="mt-1.5 space-y-1">
                {cleanupLogs.slice(0, 2).map((log: any) => (
                  <div key={log.id} className="text-[11px] p-2 bg-muted/30 rounded border text-muted-foreground">
                    <span>{formatDateTime(log.created_at)}:</span>{" "}
                    <strong>
                      {log.deleted_earnings + log.deleted_withdrawals + log.deleted_delivered_requests} itens excluídos
                    </strong>{" "}
                    ({log.reason || "Sem justificativa"})
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cleanup Confirmation Dialog */}
      <Dialog open={cleanupModalOpen} onOpenChange={setCleanupModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive text-base">
              <AlertTriangle className="w-5 h-5" />
              Limpeza Auditada de Histórico Financeiro
            </DialogTitle>
            <DialogDescription className="text-xs">
              Atenção: Os registros selecionados serão apagados permanentemente das tabelas ativas.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">A partir de (opcional)</Label>
                <Input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="text-xs h-8"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Até a data (opcional)</Label>
                <Input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="text-xs h-8"
                />
              </div>
            </div>

            <div className="space-y-2 p-3 bg-muted/40 rounded-lg">
              <span className="font-semibold text-foreground">Incluir na limpeza:</span>
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="incDeliv"
                    checked={incDeliveries}
                    onCheckedChange={(c) => setIncDeliveries(!!c)}
                  />
                  <label htmlFor="incDeliv" className="cursor-pointer">
                    Corridas concluídas e entregues
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="incEarn"
                    checked={incEarnings}
                    onCheckedChange={(c) => setIncEarnings(!!c)}
                  />
                  <label htmlFor="incEarn" className="cursor-pointer">
                    Ganhos calculados de motoristas
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="incWith"
                    checked={incWithdrawals}
                    onCheckedChange={(c) => setIncWithdrawals(!!c)}
                  />
                  <label htmlFor="incWith" className="cursor-pointer">
                    Histórico de saques processados
                  </label>
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Justificativa obrigatória para auditoria *</Label>
              <Input
                placeholder="Ex: Arquivamento do fechamento anual..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="text-xs h-8"
              />
            </div>

            <div className="space-y-1 p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
              <Label className="text-destructive font-bold">
                Para confirmar, digite exatamente CONFIRMAR abaixo:
              </Label>
              <Input
                placeholder="CONFIRMAR"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                className="text-xs h-8 border-destructive/40 font-mono font-bold"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCleanupModalOpen(false)}
              disabled={cleaning}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleExecuteCleanup}
              disabled={cleaning || confirmText !== "CONFIRMAR" || !reason.trim()}
            >
              {cleaning ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" /> Executando...
                </>
              ) : (
                "Executar Limpeza Auditada"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
