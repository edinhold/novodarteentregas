import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { UnifiedTransaction, TransactionType, TransactionStatus } from "@/types/financial";
import { formatCurrency, formatDateTime } from "@/utils/financialCalculations";
import {
  Search,
  Download,
  Copy,
  Eye,
  Filter,
  ArrowDownLeft,
  ArrowUpRight,
  Truck,
  Ticket,
  Wallet,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  Clock,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

interface UnifiedTransactionsTableProps {
  transactions: UnifiedTransaction[];
}

export const UnifiedTransactionsTable: React.FC<UnifiedTransactionsTableProps> = ({
  transactions = [],
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [selectedTx, setSelectedTx] = useState<UnifiedTransaction | null>(null);

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  };

  // Filtered transactions
  const filtered = useMemo(() => {
    return transactions.filter((tx) => {
      // Type filter
      if (typeFilter !== "all" && tx.type !== typeFilter) {
        return false;
      }
      // Status filter
      if (statusFilter !== "all" && tx.status !== statusFilter) {
        return false;
      }
      // Search term
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchesId = tx.id.toLowerCase().includes(q) || tx.rawId.toLowerCase().includes(q);
        const matchesParty = tx.partyName.toLowerCase().includes(q);
        const matchesDesc = tx.description.toLowerCase().includes(q);
        const matchesCode = tx.details?.codigo?.toLowerCase()?.includes(q);
        if (!matchesId && !matchesParty && !matchesDesc && !matchesCode) {
          return false;
        }
      }
      return true;
    });
  }, [transactions, typeFilter, statusFilter, searchTerm]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  // CSV Export
  const handleExportCSV = () => {
    if (filtered.length === 0) {
      toast.error("Nenhuma transação para exportar com os filtros atuais");
      return;
    }

    const headers = [
      "ID",
      "Data/Hora",
      "Tipo",
      "Envolvido",
      "Descrição",
      "Entrada Caixa (R$)",
      "Saída Caixa (R$)",
      "Receita Plataforma (R$)",
      "Valor Bruto (R$)",
      "Status",
    ];

    const rows = filtered.map((tx) => [
      `"${tx.rawId}"`,
      `"${formatDateTime(tx.date)}"`,
      `"${tx.typeLabel}"`,
      `"${tx.partyName.replace(/"/g, '""')}"`,
      `"${tx.description.replace(/"/g, '""')}"`,
      tx.cashIn.toFixed(2),
      tx.cashOut.toFixed(2),
      tx.platformRevenue.toFixed(2),
      (tx.grossAmount || 0).toFixed(2),
      `"${tx.statusLabel}"`,
    ]);

    const csvContent = [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `extrato_financeiro_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`${filtered.length} registro(s) exportado(s) para CSV com sucesso!`);
  };

  const getTypeBadge = (type: TransactionType) => {
    switch (type) {
      case "recarga":
        return (
          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 gap-1 text-[11px] font-medium">
            <Ticket className="w-3 h-3" /> Recarga Código
          </Badge>
        );
      case "recarga_direta":
        return (
          <Badge variant="outline" className="bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/30 gap-1 text-[11px] font-medium">
            <Wallet className="w-3 h-3" /> Recarga Direta
          </Badge>
        );
      case "corrida":
        return (
          <Badge variant="outline" className="bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30 gap-1 text-[11px] font-medium">
            <Truck className="w-3 h-3" /> Corrida
          </Badge>
        );
      case "saque":
        return (
          <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30 gap-1 text-[11px] font-medium">
            <ArrowUpRight className="w-3 h-3" /> Saque PIX
          </Badge>
        );
    }
  };

  const getStatusBadge = (status: TransactionStatus, label: string) => {
    switch (status) {
      case "completed":
        return (
          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 text-[10px]">
            <CheckCircle2 className="w-2.5 h-2.5 mr-1" /> {label}
          </Badge>
        );
      case "pending":
        return (
          <Badge variant="outline" className="bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/30 text-[10px]">
            <Clock className="w-2.5 h-2.5 mr-1" /> {label}
          </Badge>
        );
      case "rejected":
      case "cancelled":
        return (
          <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 text-[10px]">
            <XCircle className="w-2.5 h-2.5 mr-1" /> {label}
          </Badge>
        );
    }
  };

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="py-4 px-4 sm:px-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-base sm:text-lg font-bold">
              Extrato Financeiro Unificado
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Histórico cronológico de recargas, corridas e repasses com auditoria
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              className="h-9 gap-1.5 text-xs font-semibold"
            >
              <Download className="w-3.5 h-3.5" />
              Exportar CSV ({filtered.length})
            </Button>
          </div>
        </div>

        {/* Filters bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 mt-4">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
            <Input
              placeholder="Buscar por ID, loja, motorista ou código..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-9 h-9 text-xs"
            />
          </div>

          <Select
            value={typeFilter}
            onValueChange={(v) => {
              setTypeFilter(v);
              setCurrentPage(1);
            }}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="Tipo de Operação" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Tipos</SelectItem>
              <SelectItem value="recarga">Recarga (Código)</SelectItem>
              <SelectItem value="recarga_direta">Recarga Direta (Admin)</SelectItem>
              <SelectItem value="corrida">Corridas</SelectItem>
              <SelectItem value="saque">Saques / Repasses PIX</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v);
              setCurrentPage(1);
            }}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Status</SelectItem>
              <SelectItem value="completed">Concluídos / Efetivados</SelectItem>
              <SelectItem value="pending">Pendentes</SelectItem>
              <SelectItem value="rejected">Recusados / Cancelados</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center justify-between text-xs text-muted-foreground px-2">
            <span>
              Total: <strong>{filtered.length}</strong> registro(s)
            </span>
            {(typeFilter !== "all" || statusFilter !== "all" || searchTerm) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs px-2"
                onClick={() => {
                  setTypeFilter("all");
                  setStatusFilter("all");
                  setSearchTerm("");
                  setCurrentPage(1);
                }}
              >
                Limpar filtros
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="w-[140px] text-xs font-semibold">Data / Hora</TableHead>
                <TableHead className="w-[110px] text-xs font-semibold">ID</TableHead>
                <TableHead className="w-[150px] text-xs font-semibold">Tipo</TableHead>
                <TableHead className="text-xs font-semibold">Envolvido</TableHead>
                <TableHead className="w-[120px] text-right text-xs font-semibold">
                  Entrada Caixa
                </TableHead>
                <TableHead className="w-[120px] text-right text-xs font-semibold">
                  Saída Caixa
                </TableHead>
                <TableHead className="w-[130px] text-right text-xs font-semibold">
                  Receita Plataforma
                </TableHead>
                <TableHead className="w-[110px] text-center text-xs font-semibold">
                  Status
                </TableHead>
                <TableHead className="w-[80px] text-center text-xs font-semibold">
                  Ações
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-sm text-muted-foreground">
                    Nenhuma movimentação financeira encontrada para os critérios selecionados.
                  </TableCell>
                </TableRow>
              ) : (
                paginated.map((tx) => (
                  <TableRow key={tx.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDateTime(tx.date)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 font-mono text-[11px]">
                        <span>{tx.rawId.slice(0, 8)}...</span>
                        <button
                          onClick={() => copyText(tx.rawId, "ID da Operação")}
                          className="text-muted-foreground hover:text-foreground p-0.5"
                          title="Copiar ID"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                    </TableCell>
                    <TableCell>{getTypeBadge(tx.type)}</TableCell>
                    <TableCell>
                      <div className="text-xs font-medium text-foreground truncate max-w-[200px]" title={tx.partyName}>
                        {tx.partyName}
                      </div>
                      {tx.type === "corrida" && tx.storeName ? (
                        <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                          <span className="font-medium text-foreground/85">Loja: {tx.storeName}</span>
                          {tx.rideTime && (
                            <span className="font-mono bg-muted/80 px-1 py-0.2 rounded text-[10px] font-semibold text-foreground">
                              {tx.rideTime}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="text-[10px] text-muted-foreground truncate max-w-[200px]" title={tx.description}>
                          {tx.description}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {tx.cashIn > 0 ? (
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">
                          +{formatCurrency(tx.cashIn)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {tx.cashOut > 0 ? (
                        <span className="font-bold text-amber-600 dark:text-amber-400">
                          -{formatCurrency(tx.cashOut)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {tx.platformRevenue > 0 ? (
                        <span className="font-bold text-violet-600 dark:text-violet-400">
                          +{formatCurrency(tx.platformRevenue)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {getStatusBadge(tx.status, tx.statusLabel)}
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => setSelectedTx(tx)}
                        title="Ver Auditoria"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination controls */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 border-t border-border/60 bg-muted/20 text-xs">
          <div className="flex items-center gap-2 text-muted-foreground">
            <span>Itens por página:</span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                setPageSize(Number(v));
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="h-7 w-[70px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="15">15</SelectItem>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
            <span className="ml-2">
              Página {currentPage} de {totalPages} ({filtered.length} itens)
            </span>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2.5 text-xs"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="w-4 h-4 mr-1" /> Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2.5 text-xs"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            >
              Próxima <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      </CardContent>

      {/* Transaction Audit Detail Modal */}
      {selectedTx && (
        <Dialog open={!!selectedTx} onOpenChange={(o) => !o && setSelectedTx(null)}>
          <DialogContent className="max-w-md sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="w-5 h-5 text-primary" />
                Auditoria da Operação
              </DialogTitle>
              <DialogDescription className="text-xs">
                Registro detalhado e imutável armazenado no banco de dados.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 text-xs py-2">
              <div className="p-3 bg-muted/40 rounded-lg space-y-2 border border-border/50">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground font-medium">ID da Operação:</span>
                  <div className="flex items-center gap-1">
                    <span className="font-mono font-semibold">{selectedTx.rawId}</span>
                    <button
                      onClick={() => copyText(selectedTx.rawId, "ID")}
                      className="p-1 text-muted-foreground hover:text-foreground"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground font-medium">Data e Hora:</span>
                  <span className="font-semibold">{formatDateTime(selectedTx.date)}</span>
                </div>
                {selectedTx.type === "corrida" && (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground font-medium">Loja Responsável:</span>
                      <span className="font-semibold text-foreground">{selectedTx.storeName || selectedTx.details?.loja || "Loja não identificada"}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground font-medium">Horário da Corrida:</span>
                      <span className="font-mono font-bold text-foreground">{selectedTx.rideTime || selectedTx.details?.horario || "--:--"}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground font-medium">Tipo:</span>
                  <span>{getTypeBadge(selectedTx.type)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground font-medium">Status:</span>
                  <span>{getStatusBadge(selectedTx.status, selectedTx.statusLabel)}</span>
                </div>
              </div>

              {/* Financial flow overview */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <span className="text-[10px] uppercase font-bold text-emerald-800 dark:text-emerald-300">
                    Entrada Caixa
                  </span>
                  <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400 mt-0.5">
                    {formatCurrency(selectedTx.cashIn)}
                  </p>
                </div>
                <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <span className="text-[10px] uppercase font-bold text-amber-800 dark:text-amber-300">
                    Saída Caixa
                  </span>
                  <p className="text-sm font-bold text-amber-700 dark:text-amber-400 mt-0.5">
                    {formatCurrency(selectedTx.cashOut)}
                  </p>
                </div>
                <div className="p-2.5 rounded-lg bg-violet-500/10 border border-violet-500/20">
                  <span className="text-[10px] uppercase font-bold text-violet-800 dark:text-violet-300">
                    Receita Plataforma
                  </span>
                  <p className="text-sm font-bold text-violet-700 dark:text-violet-400 mt-0.5">
                    {formatCurrency(selectedTx.platformRevenue)}
                  </p>
                </div>
              </div>

              {/* Specific breakdown info */}
              <div className="p-3 bg-card border rounded-lg space-y-1.5">
                <h4 className="font-bold text-foreground mb-2 text-xs uppercase tracking-wider">
                  Detalhamento da Operação
                </h4>
                {Object.entries(selectedTx.details || {}).map(([key, val]) => (
                  <div key={key} className="flex justify-between items-start gap-2 py-0.5 border-b border-border/30 last:border-0">
                    <span className="text-muted-foreground capitalize">
                      {key.replace(/_/g, " ")}:
                    </span>
                    <span className="font-medium text-foreground text-right select-all">
                      {typeof val === "number" && (key.includes("valor") || key.includes("taxa"))
                        ? formatCurrency(val)
                        : String(val || "—")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
};
