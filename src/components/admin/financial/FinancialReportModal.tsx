import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FinancialSummary } from "@/types/financial";
import { formatCurrency, formatDateTime } from "@/utils/financialCalculations";
import { Printer, FileText, CheckCircle2, Shield } from "lucide-react";

interface FinancialReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  summary: FinancialSummary;
  periodLabel: string;
}

export const FinancialReportModal: React.FC<FinancialReportModalProps> = ({
  open,
  onOpenChange,
  summary,
  periodLabel,
}) => {
  const handlePrint = () => {
    window.print();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="print:hidden">
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileText className="w-5 h-5 text-primary" />
            Relatório de Fechamento Financeiro
          </DialogTitle>
          <DialogDescription className="text-xs">
            Consolidado oficial das movimentações de caixa e receita operacional.
          </DialogDescription>
        </DialogHeader>

        {/* Printable document area */}
        <div id="financial-print-sheet" className="space-y-6 py-4 text-foreground">
          {/* Header */}
          <div className="border-b pb-4 flex justify-between items-start">
            <div>
              <h2 className="text-xl font-bold tracking-tight">Duarte Entregas</h2>
              <p className="text-xs text-muted-foreground">
                Demonstrativo e Fechamento Financeiro
              </p>
            </div>
            <div className="text-right text-xs">
              <p className="font-semibold">Período: {periodLabel}</p>
              <p className="text-muted-foreground">
                Emitido em: {formatDateTime(new Date().toISOString())}
              </p>
            </div>
          </div>

          {/* Core Metrics Table */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              1. Fluxo de Caixa (Entradas e Saídas Efetivas)
            </h3>
            <div className="border rounded-lg overflow-hidden text-xs">
              <div className="grid grid-cols-2 p-2.5 border-b bg-muted/30 font-semibold">
                <span>Indicador de Caixa</span>
                <span className="text-right">Valor Efetivo</span>
              </div>
              <div className="grid grid-cols-2 p-2.5 border-b">
                <span className="text-muted-foreground">Total de Recargas Pagas (Códigos)</span>
                <span className="text-right font-mono font-medium">
                  {formatCurrency(summary.totalRecharges)}
                </span>
              </div>
              <div className="grid grid-cols-2 p-2.5 border-b">
                <span className="text-muted-foreground">Recargas Diretas (Admin)</span>
                <span className="text-right font-mono font-medium">
                  {formatCurrency(summary.totalDirectRecharges)}
                </span>
              </div>
              <div className="grid grid-cols-2 p-2.5 border-b bg-emerald-500/5 font-bold">
                <span className="text-emerald-800 dark:text-emerald-300">TOTAL DE ENTRADAS NO CAIXA</span>
                <span className="text-right font-mono text-emerald-700 dark:text-emerald-400">
                  {formatCurrency(summary.totalEntries)}
                </span>
              </div>
              <div className="grid grid-cols-2 p-2.5 border-b">
                <span className="text-muted-foreground">
                  Valores Efetivamente Pagos aos Motoristas (Saques PIX)
                </span>
                <span className="text-right font-mono font-medium text-amber-600 dark:text-amber-400">
                  -{formatCurrency(summary.paidToDriversTotal)}
                </span>
              </div>
              <div className="grid grid-cols-2 p-2.5 bg-primary/10 font-extrabold text-sm">
                <span className="text-primary">SALDO DE CAIXA DISPONÍVEL</span>
                <span className="text-right font-mono text-primary">
                  {formatCurrency(summary.cashBalance)}
                </span>
              </div>
            </div>

            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground pt-2">
              2. Movimentação Operacional de Corridas
            </h3>
            <div className="border rounded-lg overflow-hidden text-xs">
              <div className="grid grid-cols-2 p-2.5 border-b bg-muted/30 font-semibold">
                <span>Operação de Entregas</span>
                <span className="text-right">Valor</span>
              </div>
              <div className="grid grid-cols-2 p-2.5 border-b">
                <span className="text-muted-foreground">Valor Bruto das Corridas Concluídas</span>
                <span className="text-right font-mono font-medium">
                  {formatCurrency(summary.grossDeliveryTotal)}
                </span>
              </div>
              <div className="grid grid-cols-2 p-2.5 border-b">
                <span className="text-muted-foreground">Valor Gerado para os Motoristas</span>
                <span className="text-right font-mono font-medium">
                  {formatCurrency(summary.driverEarningsTotal)}
                </span>
              </div>
              <div className="grid grid-cols-2 p-2.5 border-b font-semibold bg-blue-500/5">
                <span className="text-blue-800 dark:text-blue-300">
                  Comissão da Plataforma sobre Corridas
                </span>
                <span className="text-right font-mono text-blue-600 dark:text-blue-400">
                  {formatCurrency(summary.deliveryCommissionTotal)}
                </span>
              </div>
              <div className="grid grid-cols-2 p-2.5 border-b">
                <span className="text-muted-foreground">Taxas de Antecipação de Saques</span>
                <span className="text-right font-mono font-medium text-violet-600 dark:text-violet-400">
                  {formatCurrency(summary.earlyWithdrawalFeesTotal)}
                </span>
              </div>
              <div className="grid grid-cols-2 p-2.5 bg-violet-500/10 font-bold">
                <span className="text-violet-900 dark:text-violet-200">
                  RECEITA OPERACIONAL DA PLATAFORMA
                </span>
                <span className="text-right font-mono text-violet-700 dark:text-violet-300">
                  {formatCurrency(summary.platformRevenueTotal)}
                </span>
              </div>
            </div>

            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground pt-2">
              3. Passivos e Saldos Circulantes
            </h3>
            <div className="border rounded-lg overflow-hidden text-xs">
              <div className="grid grid-cols-2 p-2.5 border-b">
                <span className="text-muted-foreground">
                  Valores Pendentes de Repasse aos Motoristas (Saques + Ganhos)
                </span>
                <span className="text-right font-mono font-medium text-orange-600 dark:text-orange-400">
                  {formatCurrency(summary.totalPendingToDrivers)}
                </span>
              </div>
              <div className="grid grid-cols-2 p-2.5">
                <span className="text-muted-foreground">
                  Saldo de Créditos Ativos nas Carteiras das Lojas
                </span>
                <span className="text-right font-mono font-medium text-indigo-600 dark:text-indigo-400">
                  {formatCurrency(summary.activeStoreCreditsTotal)}
                </span>
              </div>
            </div>
          </div>

          {/* Legal / Audit Note */}
          <div className="p-3 bg-muted/30 rounded-lg text-[11px] text-muted-foreground flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary shrink-0" />
            <span>
              Relatório gerado automaticamente através da base de dados do Duarte Entregas. Valores
              separados rigorosamente entre entrada real de caixa e faturamento operacional.
            </span>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t print:hidden">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button size="sm" onClick={handlePrint} className="gap-1.5">
            <Printer className="w-4 h-4" />
            Imprimir / Salvar PDF
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
