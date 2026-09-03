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
import { DriverEarningItem } from "@/types/financial";
import { formatCurrency } from "@/utils/financialCalculations";
import {
  Search,
  Download,
  Copy,
  Eye,
  Filter,
  Truck,
  Store,
  Clock,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  XCircle,
  DollarSign,
  MapPin,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

interface DriverEarningsTableProps {
  earnings: DriverEarningItem[];
  driversList?: { id: string; full_name?: string }[];
  onRefresh?: () => void;
}

export const DriverEarningsTable: React.FC<DriverEarningsTableProps> = ({
  earnings = [],
  driversList = [],
  onRefresh,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDriverId, setSelectedDriverId] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [selectedItem, setSelectedItem] = useState<DriverEarningItem | null>(null);

  // Extract unique driver options from earnings + driversList
  const driverOptions = useMemo(() => {
    const map = new Map<string, string>();
    driversList.forEach((d) => {
      if (d.id && d.full_name) {
        map.set(d.id, d.full_name);
      }
    });
    earnings.forEach((item) => {
      if (item.driverId && item.driverName && item.driverName !== "Não atribuído") {
        map.set(item.driverId, item.driverName);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [earnings, driversList]);

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  };

  // Filtered dataset
  const filtered = useMemo(() => {
    return earnings.filter((item) => {
      // Driver filter
      if (selectedDriverId !== "all") {
        if (item.driverId !== selectedDriverId && item.driverName !== selectedDriverId) {
          return false;
        }
      }

      // Status filter
      if (statusFilter !== "all") {
        if (statusFilter === "delivered" && item.status !== "delivered") return false;
        if (statusFilter === "pending" && item.status === "delivered") return false;
        if (statusFilter === "cancelled" && item.status !== "cancelled") return false;
      }

      // Specific single-date filter (YYYY-MM-DD)
      if (dateFilter) {
        if (!item.rawTimestamp) return false;
        const itemDateStr = new Date(item.rawTimestamp).toISOString().slice(0, 10);
        if (itemDateStr !== dateFilter) {
          return false;
        }
      }

      // Search term
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchesCorrida = item.corridaId.toLowerCase().includes(q);
        const matchesDriver = item.driverName.toLowerCase().includes(q);
        const matchesStore = item.storeName.toLowerCase().includes(q);
        const matchesOrigin = item.pickupAddress?.toLowerCase().includes(q) || false;
        const matchesDest = item.deliveryAddress?.toLowerCase().includes(q) || false;
        if (!matchesCorrida && !matchesDriver && !matchesStore && !matchesOrigin && !matchesDest) {
          return false;
        }
      }

      return true;
    });
  }, [earnings, selectedDriverId, statusFilter, dateFilter, searchTerm]);

  // Aggregate stats for the filtered dataset
  const aggregateStats = useMemo(() => {
    const totalCount = filtered.length;
    const totalDriverEarnings = filtered.reduce((acc, item) => acc + item.driverValue, 0);
    const totalGross = filtered.reduce((acc, item) => acc + item.grossValue, 0);
    const totalCommission = filtered.reduce((acc, item) => acc + item.platformCommission, 0);
    const avgPerRide = totalCount > 0 ? totalDriverEarnings / totalCount : 0;

    return {
      totalCount,
      totalDriverEarnings,
      totalGross,
      totalCommission,
      avgPerRide,
    };
  }, [filtered]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  // CSV Export for driver earnings
  const handleExportCSV = () => {
    if (filtered.length === 0) {
      toast.error("Nenhuma corrida para exportar com os filtros atuais");
      return;
    }

    const headers = [
      "ID Corrida",
      "Motorista",
      "Loja",
      "Horário",
      "Data",
      "Valor Bruto (R$)",
      "Ganho Motorista (R$)",
      "Comissão App (R$)",
      "Status",
      "Origem",
      "Destino",
    ];

    const rows = filtered.map((item) => [
      `"${item.corridaId}"`,
      `"${item.driverName.replace(/"/g, '""')}"`,
      `"${item.storeName.replace(/"/g, '""')}"`,
      `"${item.rideTime}"`,
      `"${item.formattedDate}"`,
      item.grossValue.toFixed(2),
      item.driverValue.toFixed(2),
      item.platformCommission.toFixed(2),
      `"${item.statusLabel}"`,
      `"${(item.pickupAddress || "").replace(/"/g, '""')}"`,
      `"${(item.deliveryAddress || "").replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `ganhos_motoristas_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`${filtered.length} registro(s) exportado(s) com sucesso!`);
  };

  const getStatusBadge = (status: string, label: string) => {
    if (status === "delivered") {
      return (
        <Badge
          variant="outline"
          className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 gap-1 text-[11px] font-medium"
        >
          <CheckCircle2 className="w-3 h-3" /> {label || "Concluída"}
        </Badge>
      );
    }
    if (status === "cancelled") {
      return (
        <Badge
          variant="outline"
          className="bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30 gap-1 text-[11px] font-medium"
        >
          <XCircle className="w-3 h-3" /> {label || "Cancelada"}
        </Badge>
      );
    }
    return (
      <Badge
        variant="outline"
        className="bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30 gap-1 text-[11px] font-medium"
      >
        <AlertCircle className="w-3 h-3" /> {label || "Em Andamento"}
      </Badge>
    );
  };

  return (
    <Card className="border-border/60 bg-card shadow-sm">
      <CardHeader className="p-4 sm:p-5 border-b border-border/60">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base sm:text-lg font-bold text-foreground flex items-center gap-2">
              <Truck className="w-5 h-5 text-primary" />
              Ganhos do Motorista
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Listagem individual de cada corrida com a loja originária real e o horário correspondente.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {onRefresh && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={onRefresh}
                title="Atualizar registros"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Atualizar
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs font-medium"
              onClick={handleExportCSV}
            >
              <Download className="w-3.5 h-3.5" />
              Exportar CSV
            </Button>
          </div>
        </div>

        {/* Quick summary stat metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-3">
          <div className="p-2.5 rounded-lg bg-muted/40 border border-border/40">
            <span className="text-[10px] uppercase font-bold text-muted-foreground">
              Total de Corridas
            </span>
            <p className="text-base font-extrabold text-foreground mt-0.5">
              {aggregateStats.totalCount}
            </p>
          </div>

          <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <span className="text-[10px] uppercase font-bold text-emerald-800 dark:text-emerald-300">
              Ganhos dos Motoristas
            </span>
            <p className="text-base font-extrabold text-emerald-700 dark:text-emerald-400 mt-0.5">
              {formatCurrency(aggregateStats.totalDriverEarnings)}
            </p>
          </div>

          <div className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <span className="text-[10px] uppercase font-bold text-blue-800 dark:text-blue-300">
              Média por Corrida
            </span>
            <p className="text-base font-extrabold text-blue-700 dark:text-blue-400 mt-0.5">
              {formatCurrency(aggregateStats.avgPerRide)}
            </p>
          </div>

          <div className="p-2.5 rounded-lg bg-violet-500/10 border border-violet-500/20">
            <span className="text-[10px] uppercase font-bold text-violet-800 dark:text-violet-300">
              Comissão do App
            </span>
            <p className="text-base font-extrabold text-violet-700 dark:text-violet-400 mt-0.5">
              {formatCurrency(aggregateStats.totalCommission)}
            </p>
          </div>
        </div>

        {/* Filters Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-3">
          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar motorista, loja, ID..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="h-8 pl-8 text-xs"
            />
          </div>

          {/* Motorista filter */}
          <Select
            value={selectedDriverId}
            onValueChange={(v) => {
              setSelectedDriverId(v);
              setCurrentPage(1);
            }}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Todos os Motoristas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Motoristas</SelectItem>
              {driverOptions.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Status filter */}
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v);
              setCurrentPage(1);
            }}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Todos os Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Status</SelectItem>
              <SelectItem value="delivered">Concluída</SelectItem>
              <SelectItem value="pending">Em Andamento</SelectItem>
              <SelectItem value="cancelled">Cancelada</SelectItem>
            </SelectContent>
          </Select>

          {/* Date filter */}
          <div className="flex items-center gap-1.5">
            <Input
              type="date"
              value={dateFilter}
              onChange={(e) => {
                setDateFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="h-8 text-xs flex-1"
              title="Filtrar por data específica"
            />
            {dateFilter && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setDateFilter("");
                  setCurrentPage(1);
                }}
              >
                Limpar
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {/* Desktop & Tablet Table */}
        <div className="hidden sm:block overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="w-[180px] text-xs font-semibold">Motorista</TableHead>
                <TableHead className="w-[180px] text-xs font-semibold">Loja</TableHead>
                <TableHead className="w-[90px] text-xs font-semibold">Horário</TableHead>
                <TableHead className="w-[100px] text-xs font-semibold">Data</TableHead>
                <TableHead className="w-[120px] text-right text-xs font-semibold">Ganho Motorista</TableHead>
                <TableHead className="w-[110px] text-right text-xs font-semibold">Valor Bruto</TableHead>
                <TableHead className="w-[100px] text-center text-xs font-semibold">Status</TableHead>
                <TableHead className="w-[60px] text-center text-xs font-semibold">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-sm text-muted-foreground">
                    Nenhuma corrida encontrada para os filtros selecionados.
                  </TableCell>
                </TableRow>
              ) : (
                paginated.map((item) => (
                  <TableRow key={item.id} className="hover:bg-muted/30 transition-colors">
                    {/* Motorista */}
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs shrink-0">
                          {item.driverName.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-foreground truncate max-w-[150px]" title={item.driverName}>
                            {item.driverName}
                          </p>
                          {item.driverPhone && (
                            <p className="text-[10px] text-muted-foreground">{item.driverPhone}</p>
                          )}
                        </div>
                      </div>
                    </TableCell>

                    {/* Loja */}
                    <TableCell>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Store className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span
                          className={`text-xs truncate max-w-[150px] ${
                            item.storeName === "Loja não identificada"
                              ? "text-muted-foreground italic"
                              : "font-medium text-foreground"
                          }`}
                          title={item.storeName}
                        >
                          {item.storeName}
                        </span>
                      </div>
                    </TableCell>

                    {/* Horário (HH:mm) */}
                    <TableCell>
                      <div className="flex items-center gap-1 font-mono text-xs text-foreground font-semibold">
                        <Clock className="w-3 h-3 text-muted-foreground" />
                        <span>{item.rideTime}</span>
                      </div>
                    </TableCell>

                    {/* Data */}
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {item.formattedDate}
                    </TableCell>

                    {/* Ganho do Motorista */}
                    <TableCell className="text-right font-mono text-xs">
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(item.driverValue)}
                      </span>
                    </TableCell>

                    {/* Valor Bruto */}
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">
                      {formatCurrency(item.grossValue)}
                    </TableCell>

                    {/* Status */}
                    <TableCell className="text-center">
                      {getStatusBadge(item.status, item.statusLabel)}
                    </TableCell>

                    {/* Ações */}
                    <TableCell className="text-center">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => setSelectedItem(item)}
                        title="Ver detalhes da corrida"
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

        {/* Mobile Responsive Cards (visible on mobile < 640px) */}
        <div className="sm:hidden divide-y divide-border/60">
          {paginated.length === 0 ? (
            <div className="text-center py-10 text-xs text-muted-foreground px-4">
              Nenhuma corrida encontrada para os filtros selecionados.
            </div>
          ) : (
            paginated.map((item) => (
              <div key={item.id} className="p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs shrink-0">
                      {item.driverName.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-xs font-bold text-foreground truncate">
                      {item.driverName}
                    </span>
                  </div>
                  {getStatusBadge(item.status, item.statusLabel)}
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                  <div className="flex items-center gap-1.5 text-muted-foreground min-w-0">
                    <Store className="w-3.5 h-3.5 shrink-0 text-primary" />
                    <span className="truncate font-medium text-foreground" title={item.storeName}>
                      {item.storeName}
                    </span>
                  </div>

                  <div className="flex items-center justify-end gap-1 font-mono text-xs text-foreground font-semibold">
                    <Clock className="w-3 h-3 text-muted-foreground" />
                    <span>{item.rideTime}</span>
                    <span className="text-muted-foreground font-normal ml-1">
                      ({item.formattedDate})
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1 text-xs border-t border-border/40">
                  <span className="text-muted-foreground text-[11px]">
                    Bruto: {formatCurrency(item.grossValue)}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                      {formatCurrency(item.driverValue)}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-[11px]"
                      onClick={() => setSelectedItem(item)}
                    >
                      Detalhes
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
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
              Página {currentPage} de {totalPages} ({filtered.length} corridas)
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

      {/* Ride Detail Modal */}
      {selectedItem && (
        <Dialog open={!!selectedItem} onOpenChange={(o) => !o && setSelectedItem(null)}>
          <DialogContent className="max-w-md sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base font-bold">
                <Truck className="w-5 h-5 text-primary" />
                Detalhes da Corrida
              </DialogTitle>
              <DialogDescription className="text-xs">
                Informações completas da corrida, identificação da loja e repartição financeira.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 text-xs pt-1">
              {/* Identifiers & Status */}
              <div className="p-3 bg-muted/40 rounded-lg space-y-2 border border-border/40">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground font-medium">ID da Corrida:</span>
                  <div className="flex items-center gap-1 font-mono font-bold">
                    <span>{selectedItem.corridaId}</span>
                    <button
                      onClick={() => copyText(selectedItem.corridaId, "ID da Corrida")}
                      className="p-1 hover:text-primary transition-colors"
                      title="Copiar ID"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground font-medium">Motorista:</span>
                  <span className="font-semibold text-foreground">{selectedItem.driverName}</span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground font-medium">Loja Responsável:</span>
                  <span className="font-semibold text-foreground flex items-center gap-1">
                    <Store className="w-3 h-3 text-primary" />
                    {selectedItem.storeName}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground font-medium">Horário da Corrida:</span>
                  <span className="font-mono font-bold text-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3 text-muted-foreground" />
                    {selectedItem.rideTime}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground font-medium">Data:</span>
                  <span>{selectedItem.formattedDate}</span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground font-medium">Status:</span>
                  <span>{getStatusBadge(selectedItem.status, selectedItem.statusLabel)}</span>
                </div>
              </div>

              {/* Financial values overview */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2.5 rounded-lg bg-muted/50 border">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">
                    Valor Bruto
                  </span>
                  <p className="text-sm font-bold text-foreground mt-0.5">
                    {formatCurrency(selectedItem.grossValue)}
                  </p>
                </div>

                <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <span className="text-[10px] uppercase font-bold text-emerald-800 dark:text-emerald-300">
                    Ganho Motorista
                  </span>
                  <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400 mt-0.5">
                    {formatCurrency(selectedItem.driverValue)}
                  </p>
                </div>

                <div className="p-2.5 rounded-lg bg-violet-500/10 border border-violet-500/20">
                  <span className="text-[10px] uppercase font-bold text-violet-800 dark:text-violet-300">
                    Comissão App
                  </span>
                  <p className="text-sm font-bold text-violet-700 dark:text-violet-400 mt-0.5">
                    {formatCurrency(selectedItem.platformCommission)}
                  </p>
                </div>
              </div>

              {/* Addresses */}
              {(selectedItem.pickupAddress || selectedItem.deliveryAddress) && (
                <div className="p-3 bg-card border rounded-lg space-y-2">
                  <h4 className="font-bold text-foreground text-xs uppercase tracking-wider">
                    Trajeto da Entrega
                  </h4>
                  {selectedItem.pickupAddress && (
                    <div className="flex items-start gap-2">
                      <MapPin className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[10px] text-muted-foreground font-semibold">Origem (Retirada):</p>
                        <p className="text-foreground">{selectedItem.pickupAddress}</p>
                      </div>
                    </div>
                  )}
                  {selectedItem.deliveryAddress && (
                    <div className="flex items-start gap-2">
                      <MapPin className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[10px] text-muted-foreground font-semibold">Destino (Entrega):</p>
                        <p className="text-foreground">{selectedItem.deliveryAddress}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
};
