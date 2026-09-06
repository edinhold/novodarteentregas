import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FinancialSummary, UnifiedTransaction } from "@/types/financial";
import { formatCurrency, formatDateTime } from "@/utils/financialCalculations";
import { Printer, FileText, Filter, CheckSquare, Layers } from "lucide-react";

export type PrintScope = "current_page" | "all_filtered" | "selected_only";

interface FinancialPrintModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  summary: FinancialSummary;
  periodLabel: string;
  transactions: UnifiedTransaction[];
  selectedTxIds?: Set<string>;
  appliedFilters?: {
    search?: string;
    type?: string;
    status?: string;
    storeId?: string;
    driverId?: string;
  };
  currentPageTransactions?: UnifiedTransaction[];
}

export const FinancialPrintModal: React.FC<FinancialPrintModalProps> = ({
  open,
  onOpenChange,
  summary,
  periodLabel,
  transactions = [],
  selectedTxIds = new Set(),
  appliedFilters = {},
  currentPageTransactions = [],
}) => {
  const [printScope, setPrintScope] = useState<PrintScope>("all_filtered");

  // Determine list of transactions to print based on selected scope
  const getTransactionsToPrint = () => {
    if (printScope === "selected_only" && selectedTxIds.size > 0) {
      return transactions.filter((t) => selectedTxIds.has(t.id));
    }
    if (printScope === "current_page" && currentPageTransactions.length > 0) {
      return currentPageTransactions;
    }
    return transactions;
  };

  const txToPrint = getTransactionsToPrint();

  // Calculate dynamic totals for the printed list
  const totalCashIn = txToPrint.reduce((acc, t) => acc + (t.cashIn || 0), 0);
  const totalCashOut = txToPrint.reduce((acc, t) => acc + (t.cashOut || 0), 0);
  const totalPlatformRevenue = txToPrint.reduce((acc, t) => acc + (t.platformRevenue || 0), 0);

  const filterSummaryText = () => {
    const parts = [];
    if (appliedFilters.search) parts.push(`Busca: "${appliedFilters.search}"`);
    if (appliedFilters.type && appliedFilters.type !== "all") parts.push(`Tipo: ${appliedFilters.type}`);
    if (appliedFilters.status && appliedFilters.status !== "all") parts.push(`Status: ${appliedFilters.status}`);
    return parts.length > 0 ? parts.join(" | ") : "Nenhum filtro adicional aplicado";
  };

  const handleTriggerPrint = () => {
    window.print();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto print:max-w-full print:max-h-none print:m-0 print:p-0 print:border-none print:shadow-none">
        <DialogHeader className="print:hidden">
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <Printer className="w-5 h-5 text-primary" />
            Imprimir Informações Financeiras
          </DialogTitle>
          <DialogDescription className="text-xs">
            Configure o escopo de impressão, confira a pré-visualização e envie para a impressora ou salve em PDF.
          </DialogDescription>
        </DialogHeader>

        {/* Print Configuration Controls (Hidden during printing) */}
        <div className="space-y-4 print:hidden border-b pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-muted/40 p-3 rounded-lg border">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-primary" />
                Escopo dos Registros para Impressão
              </Label>
              <Select value={printScope} onValueChange={(v) => setPrintScope(v as PrintScope)}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Selecione o escopo..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all_filtered" className="text-xs">
                    Todos os registros filtrados ({transactions.length} itens)
                  </SelectItem>
                  <SelectItem value="current_page" className="text-xs" disabled={currentPageTransactions.length === 0}>
                    Somente a página atual ({currentPageTransactions.length} itens)
                  </SelectItem>
                  <SelectItem value="selected_only" className="text-xs" disabled={selectedTxIds.size === 0}>
                    Somente os registros selecionados ({selectedTxIds.size} selecionados)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1 text-xs justify-end flex flex-col">
              <span className="font-semibold text-muted-foreground flex items-center gap-1">
                <Filter className="w-3.5 h-3.5" /> Filtros Ativos:
              </span>
              <p className="text-foreground truncate">{filterSummaryText()}</p>
              <p className="text-[11px] text-muted-foreground">
                Total a imprimir: <strong>{txToPrint.length} registros</strong>
              </p>
            </div>
          </div>
        </div>

        {/* Official Printable Sheet Area */}
        <div id="financial-print-sheet" className="space-y-6 py-2 text-foreground print:p-6">
          {/* Print Header */}
          <div className="border-b pb-4 flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-black tracking-tight text-primary">Duarte Entregas</h1>
              <h2 className="text-sm font-bold text-foreground mt-0.5">
                Relatório e Extrato do Módulo Financeiro
              </h2>
            </div>
            <div className="text-right text-xs space-y-0.5">
              <p className="font-bold text-foreground">Período: {periodLabel}</p>
              <p className="text-muted-foreground">
                Data da Impressão: <strong>{formatDateTime(new Date().toISOString())}</strong>
              </p>
              <p className="text-[11px] text-muted-foreground">
                Filtros: {filterSummaryText()}
              </p>
            </div>
          </div>

          {/* Core Summary Cards Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 border rounded-lg bg-emerald-500/5 border-emerald-500/20">
              <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 uppercase">
                Total de Entradas
              </span>
              <p className="text-base font-extrabold text-emerald-700 dark:text-emerald-400 mt-1">
                {formatCurrency(summary.totalEntries)}
              </p>
            </div>
            <div className="p-3 border rounded-lg bg-amber-500/5 border-amber-500/20">
              <span className="text-[11px] font-bold text-amber-800 dark:text-amber-300 uppercase">
                Pago a Motoristas (Saques)
              </span>
              <p className="text-base font-extrabold text-amber-700 dark:text-amber-400 mt-1">
                {formatCurrency(summary.paidToDriversTotal)}
              </p>
            </div>
            <div className="p-3 border rounded-lg bg-blue-500/5 border-blue-500/20">
              <span className="text-[11px] font-bold text-blue-800 dark:text-blue-300 uppercase">
                Receita Operacional
              </span>
              <p className="text-base font-extrabold text-blue-700 dark:text-blue-400 mt-1">
                {formatCurrency(summary.platformRevenueTotal)}
              </p>
            </div>
            <div className="p-3 border rounded-lg bg-primary/10 border-primary/20">
              <span className="text-[11px] font-bold text-primary uppercase">
                Saldo de Caixa Atual
              </span>
              <p className="text-base font-extrabold text-primary mt-1">
                {formatCurrency(summary.cashBalance)}
              </p>
            </div>
          </div>

          {/* Transactions Detail Table */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Detalhamento dos Registros Financeiros ({txToPrint.length})
              </h3>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <Table className="text-xs">
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="font-bold">Data/Hora</TableHead>
                    <TableHead className="font-bold">Tipo</TableHead>
                    <TableHead className="font-bold">Parte Envolvida / Loja</TableHead>
                    <TableHead className="font-bold">Descrição</TableHead>
                    <TableHead className="font-bold text-right">Entrada (+)</TableHead>
                    <TableHead className="font-bold text-right">Saída (-)</TableHead>
                    <TableHead className="font-bold text-right">Receita App</TableHead>
                    <TableHead className="font-bold">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {txToPrint.map((tx) => (
                    <TableRow key={tx.id} className="border-b">
                      <TableCell className="font-medium whitespace-nowrap">
                        {tx.date ? formatDateTime(tx.date) : "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-semibold">
                        {tx.typeLabel}
                      </TableCell>
                      <TableCell className="max-w-[150px] truncate">
                        {tx.partyName || tx.storeName || "—"}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-muted-foreground">
                        {tx.description || "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium text-emerald-600 dark:text-emerald-400">
                        {tx.cashIn > 0 ? formatCurrency(tx.cashIn) : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium text-amber-600 dark:text-amber-400">
                        {tx.cashOut > 0 ? `-${formatCurrency(tx.cashOut)}` : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium text-blue-600 dark:text-blue-400">
                        {tx.platformRevenue > 0 ? formatCurrency(tx.platformRevenue) : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {tx.statusLabel}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}

                  {txToPrint.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                        Nenhum registro selecionado para impressão.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Subtotals & Totals Banner */}
          {txToPrint.length > 0 && (
            <div className="border rounded-lg bg-muted/30 p-3 space-y-1.5 text-xs">
              <div className="flex justify-between items-center font-semibold text-muted-foreground">
                <span>Subtotal Entradas no Relatório:</span>
                <span className="font-mono text-emerald-600 font-bold">
                  {formatCurrency(totalCashIn)}
                </span>
              </div>
              <div className="flex justify-between items-center font-semibold text-muted-foreground">
                <span>Subtotal Saídas Pagas no Relatório:</span>
                <span className="font-mono text-amber-600 font-bold">
                  -{formatCurrency(totalCashOut)}
                </span>
              </div>
              <div className="flex justify-between items-center font-semibold text-muted-foreground">
                <span>Subtotal Receita Plataforma no Relatório:</span>
                <span className="font-mono text-blue-600 font-bold">
                  {formatCurrency(totalPlatformRevenue)}
                </span>
              </div>
              <div className="border-t pt-2 flex justify-between items-center text-sm font-extrabold">
                <span>Resultado Líquido do Escopo Impresso:</span>
                <span className="font-mono text-primary">
                  {formatCurrency(totalCashIn - totalCashOut)}
                </span>
              </div>
            </div>
          )}

          {/* Footer note */}
          <div className="border-t pt-3 flex justify-between items-center text-[10px] text-muted-foreground">
            <span>Duarte Entregas — Documento de Conferência Financeira Interna</span>
            <span>Página 1 de 1</span>
          </div>
        </div>

        {/* Action Buttons (Hidden during printing) */}
        <div className="flex justify-end gap-2 pt-2 border-t print:hidden">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancelar / Fechar
          </Button>
          <Button size="sm" onClick={handleTriggerPrint} className="gap-1.5 bg-primary font-semibold">
            <Printer className="w-4 h-4" />
            Confirmar e Imprimir / Gerar PDF
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
