import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { DollarSign, CheckCircle, XCircle, Key, CalendarDays, Trash2, Sparkles, History } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import DeleteConfirm from "@/components/admin/DeleteConfirm";

const FinancialTab = () => {
  const queryClient = useQueryClient();
  const [processing, setProcessing] = useState<string | null>(null);
  const [savingPayDay, setSavingPayDay] = useState(false);
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [showDeleteSelected, setShowDeleteSelected] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selectedEarnings, setSelectedEarnings] = useState<Set<string>>(new Set());
  const [selectedWithdrawals, setSelectedWithdrawals] = useState<Set<string>>(new Set());

  // Period cleanup state
  const [cleanFrom, setCleanFrom] = useState<string>("");
  const [cleanTo, setCleanTo] = useState<string>("");
  const [cleanReason, setCleanReason] = useState<string>("");
  const [incEarnings, setIncEarnings] = useState(true);
  const [incWithdrawals, setIncWithdrawals] = useState(true);
  const [incDelivered, setIncDelivered] = useState(true);
  const [incOrders, setIncOrders] = useState(true);
  const [showCleanupConfirm, setShowCleanupConfirm] = useState(false);
  const [cleaning, setCleaning] = useState(false);

  const { data: deliveryConfig } = useQuery({
    queryKey: ["delivery-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_config")
        .select("*")
        .limit(1)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const handlePaymentDayChange = async (day: string) => {
    setSavingPayDay(true);
    try {
      const { error } = await supabase
        .from("delivery_config")
        .update({ payment_day: parseInt(day) } as any)
        .eq("id", deliveryConfig?.id || "");
      if (error) throw error;
      toast.success(`Dia de pagamento atualizado`);
      queryClient.invalidateQueries({ queryKey: ["delivery-config"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar");
    } finally {
      setSavingPayDay(false);
    }
  };

  const weekdayLabels = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];


  const { data: drivers = [] } = useQuery({
    queryKey: ["admin-drivers-financial"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drivers")
        .select("*")
        .order("full_name");
      if (error) throw error;
      return data;
    },
  });

  const { data: withdrawals = [] } = useQuery({
    queryKey: ["admin-withdrawals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("withdrawal_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const { data: earnings = [] } = useQuery({
    queryKey: ["admin-earnings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("driver_earnings")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  const { data: deliveredRequests = [] } = useQuery({
    queryKey: ["admin-delivered-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_requests")
        .select("driver_fee")
        .eq("status", "delivered");
      if (error) throw error;
      return data;
    },
  });

  const handleWithdrawalAction = async (id: string, status: "approved" | "rejected") => {
    setProcessing(id);
    try {
      const { error } = await supabase
        .from("withdrawal_requests")
        .update({ status, processed_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      toast.success(status === "approved" ? "Saque aprovado!" : "Saque rejeitado");
      queryClient.invalidateQueries({ queryKey: ["admin-withdrawals"] });
    } catch (err: any) {
      toast.error(err.message || "Erro");
    } finally {
      setProcessing(null);
    }
  };

  const getDriverByUserId = (userId: string) => {
    return drivers.find((d: any) => d.user_id === userId);
  };

  const statusLabels: Record<string, string> = {
    pending: "Pendente",
    approved: "Aprovado",
    rejected: "Rejeitado",
  };

  const pixTypeLabels: Record<string, string> = {
    cpf: "CPF",
    phone: "Telefone",
    email: "E-mail",
    random: "Aleatória",
  };

  const totalDriverEarnings = earnings.reduce((sum: number, e: any) => sum + Number(e.amount), 0);
  const totalDriverFees = deliveredRequests.reduce((sum: number, r: any) => sum + Number(r.driver_fee || 0), 0);
  const appRevenue = Math.max(totalDriverFees - totalDriverEarnings, 0);
  const pendingWithdrawals = withdrawals.filter((w: any) => w.status === "pending");

  const totalSelected = selectedEarnings.size + selectedWithdrawals.size;

  const toggleEarning = (id: string) => {
    setSelectedEarnings(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleWithdrawal = (id: string) => {
    setSelectedWithdrawals(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAllEarnings = () => {
    if (selectedEarnings.size === earnings.length) {
      setSelectedEarnings(new Set());
    } else {
      setSelectedEarnings(new Set(earnings.map((e: any) => e.id)));
    }
  };

  const toggleAllWithdrawals = () => {
    if (selectedWithdrawals.size === withdrawals.length) {
      setSelectedWithdrawals(new Set());
    } else {
      setSelectedWithdrawals(new Set(withdrawals.map((w: any) => w.id)));
    }
  };

  const handleDeleteSelected = async () => {
    setDeleting(true);
    try {
      const earningIds = Array.from(selectedEarnings);
      const withdrawalIds = Array.from(selectedWithdrawals);

      if (earningIds.length > 0) {
        const { error } = await supabase.from("driver_earnings").delete().in("id", earningIds);
        if (error) throw error;
      }
      if (withdrawalIds.length > 0) {
        const { error } = await supabase.from("withdrawal_requests").delete().in("id", withdrawalIds);
        if (error) throw error;
      }

      toast.success(`${totalSelected} registro(s) excluído(s) com sucesso!`);
      setSelectedEarnings(new Set());
      setSelectedWithdrawals(new Set());
      queryClient.invalidateQueries({ queryKey: ["admin-earnings"] });
      queryClient.invalidateQueries({ queryKey: ["admin-withdrawals"] });
      queryClient.invalidateQueries({ queryKey: ["admin-delivered-requests"] });
    } catch (err: any) {
      console.error("Erro ao apagar registros:", err);
      toast.error(err.message || "Erro ao apagar registros.");
    } finally {
      setDeleting(false);
      setShowDeleteSelected(false);
    }
  };

  const handleDeleteAllFinancial = async () => {
    setDeleting(true);
    try {
      const [c1, c2, c3, c4] = await Promise.all([
        supabase.from("driver_earnings").select("*", { count: "exact", head: true }),
        supabase.from("withdrawal_requests").select("*", { count: "exact", head: true }),
        supabase.from("delivery_requests").select("*", { count: "exact", head: true }).eq("status", "delivered"),
        supabase.from("orders").select("*", { count: "exact", head: true }).eq("status", "delivered"),
      ]);

      const totalRecords = (c1.count || 0) + (c2.count || 0) + (c3.count || 0) + (c4.count || 0);
      if (totalRecords === 0) {
        toast.info("Nenhum registro financeiro para apagar.");
        setDeleting(false);
        setShowDeleteAll(false);
        return;
      }

      // First delete orders to avoid FK issues with delivery_requests
      const orderDelete = await supabase.from("orders").delete().eq("status", "delivered");
      if (orderDelete.error) throw orderDelete.error;

      const [r3, r1, r2] = await Promise.all([
        supabase.from("delivery_requests").delete().eq("status", "delivered"),
        supabase.from("driver_earnings").delete().gte("created_at", "1970-01-01T00:00:00Z"),
        supabase.from("withdrawal_requests").delete().gte("created_at", "1970-01-01T00:00:00Z"),
      ]);
      
      if (r1.error) throw r1.error;
      if (r2.error) throw r2.error;
      if (r3.error) throw r3.error;
      
      toast.success(`${totalRecords} registro(s) financeiro(s) e de faturamento apagados com sucesso!`);
      setSelectedEarnings(new Set());
      setSelectedWithdrawals(new Set());
      queryClient.invalidateQueries({ queryKey: ["admin-earnings"] });
      queryClient.invalidateQueries({ queryKey: ["admin-withdrawals"] });
      queryClient.invalidateQueries({ queryKey: ["admin-delivered-requests"] });
      queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
    } catch (err: any) {
      console.error("Erro ao apagar registros financeiros:", err);
      toast.error(err.message || "Erro ao apagar registros.");
    } finally {
      setDeleting(false);
      setShowDeleteAll(false);
    }
  };

  const { data: cleanupLogs = [], refetch: refetchCleanupLogs } = useQuery({
    queryKey: ["financial-cleanup-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_cleanup_logs" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const handlePeriodCleanup = async () => {
    setCleaning(true);
    try {
      const from = cleanFrom ? new Date(cleanFrom).toISOString() : null;
      const to = cleanTo ? new Date(cleanTo + "T23:59:59").toISOString() : null;
      const { data, error } = await supabase.rpc("admin_cleanup_financials" as any, {
        p_from: from,
        p_to: to,
        p_include_withdrawals: incWithdrawals,
        p_include_earnings: incEarnings,
        p_include_delivered_requests: incDelivered,
        p_include_delivered_orders: incOrders,
        p_reason: cleanReason || null,
      });
      if (error) throw error;
      const r: any = data;
      toast.success(`Limpeza concluída: ${r?.total || 0} registro(s) removido(s)`);
      setCleanReason("");
      refetchCleanupLogs();
      queryClient.invalidateQueries({ queryKey: ["admin-earnings"] });
      queryClient.invalidateQueries({ queryKey: ["admin-withdrawals"] });
      queryClient.invalidateQueries({ queryKey: ["admin-delivered-requests"] });
    } catch (err: any) {
      toast.error(err.message || "Erro na limpeza");
    } finally {
      setCleaning(false);
      setShowCleanupConfirm(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        {totalSelected > 0 && (
          <Button variant="destructive" size="sm" onClick={() => setShowDeleteSelected(true)}>
            <Trash2 className="w-4 h-4 mr-1" /> Excluir Selecionados ({totalSelected})
          </Button>
        )}
        <Button variant="destructive" size="sm" onClick={() => setShowDeleteAll(true)}>
          <Trash2 className="w-4 h-4 mr-1" /> Apagar Tudo
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-extrabold text-green-600">R$ {appRevenue.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">Faturamento do App</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-extrabold text-primary">R$ {totalDriverEarnings.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">Pago aos Motoristas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-extrabold text-orange-500">{pendingWithdrawals.length}</p>
            <p className="text-xs text-muted-foreground">Saques Pendentes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-extrabold">{drivers.length}</p>
            <p className="text-xs text-muted-foreground">Motoristas</p>
          </CardContent>
        </Card>
      </div>

      {/* Payment Day Config */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarDays className="w-4 h-4" /> Dia de Pagamento
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            Defina o dia da semana em que os motoristas podem solicitar saque.
            Será cobrada uma taxa fixa de <strong>R$ 1,00</strong> por saque.
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <Select
              value={String((deliveryConfig as any)?.payment_day ?? 5)}
              onValueChange={handlePaymentDayChange}
              disabled={savingPayDay}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Dia da semana" />
              </SelectTrigger>
              <SelectContent>
                {weekdayLabels.map((label, idx) => (
                  <SelectItem key={idx} value={String(idx)}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge variant="secondary">
              Atual: {weekdayLabels[(deliveryConfig as any)?.payment_day ?? 5] || "—"}
            </Badge>
            <Badge variant="outline">Taxa: R$ 1,00 por saque</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Period-based Financial Cleanup */}
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4" /> Limpeza Financeira por Período
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Remove ganhos, saques e entregas/pedidos concluídos dentro do período selecionado.
            Deixe as datas em branco para considerar todo o histórico. A ação é registrada.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>De</Label>
              <Input type="date" value={cleanFrom} onChange={(e) => setCleanFrom(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Até</Label>
              <Input type="date" value={cleanTo} onChange={(e) => setCleanTo(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-2 text-sm">
            <label className="flex items-center gap-2">
              <Checkbox checked={incEarnings} onCheckedChange={(v) => setIncEarnings(Boolean(v))} />
              Ganhos dos motoristas
            </label>
            <label className="flex items-center gap-2">
              <Checkbox checked={incWithdrawals} onCheckedChange={(v) => setIncWithdrawals(Boolean(v))} />
              Solicitações de saque
            </label>
            <label className="flex items-center gap-2">
              <Checkbox checked={incDelivered} onCheckedChange={(v) => setIncDelivered(Boolean(v))} />
              Entregas concluídas
            </label>
            <label className="flex items-center gap-2">
              <Checkbox checked={incOrders} onCheckedChange={(v) => setIncOrders(Boolean(v))} />
              Pedidos concluídos
            </label>
          </div>
          <div className="space-y-2">
            <Label>Motivo (opcional)</Label>
            <Input
              placeholder="Ex.: Fechamento mensal - novembro"
              value={cleanReason}
              onChange={(e) => setCleanReason(e.target.value)}
            />
          </div>
          <Button
            variant="destructive"
            className="w-full"
            onClick={() => setShowCleanupConfirm(true)}
            disabled={cleaning || (!incEarnings && !incWithdrawals && !incDelivered && !incOrders)}
          >
            {cleaning ? "Executando limpeza..." : "Executar limpeza"}
          </Button>
        </CardContent>
      </Card>

      {/* Cleanup History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <History className="w-4 h-4" /> Histórico de Limpezas
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Período</TableHead>
                <TableHead>Ganhos</TableHead>
                <TableHead>Saques</TableHead>
                <TableHead>Entregas</TableHead>
                <TableHead>Pedidos</TableHead>
                <TableHead>Motivo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cleanupLogs.map((l: any) => (
                <TableRow key={l.id}>
                  <TableCell className="text-xs">{new Date(l.created_at).toLocaleString("pt-BR")}</TableCell>
                  <TableCell className="text-xs">
                    {l.from_date ? new Date(l.from_date).toLocaleDateString("pt-BR") : "início"}
                    {" → "}
                    {l.to_date ? new Date(l.to_date).toLocaleDateString("pt-BR") : "agora"}
                  </TableCell>
                  <TableCell>{l.deleted_earnings}</TableCell>
                  <TableCell>{l.deleted_withdrawals}</TableCell>
                  <TableCell>{l.deleted_delivered_requests}</TableCell>
                  <TableCell>{l.deleted_delivered_orders}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{l.reason || "—"}</TableCell>
                </TableRow>
              ))}
              {cleanupLogs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                    Nenhuma limpeza registrada
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Withdrawal Requests with checkboxes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="w-4 h-4" /> Solicitações de Saque
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {withdrawals.length === 0 ? (
            <p className="text-muted-foreground text-center py-6">Nenhuma solicitação de saque</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={withdrawals.length > 0 && selectedWithdrawals.size === withdrawals.length}
                      onCheckedChange={toggleAllWithdrawals}
                    />
                  </TableHead>
                  <TableHead>Motorista</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Taxa</TableHead>
                  <TableHead>Líquido</TableHead>
                  <TableHead>PIX</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {withdrawals.map((w: any) => {
                  const driver = getDriverByUserId(w.driver_user_id);
                  return (
                    <TableRow key={w.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedWithdrawals.has(w.id)}
                          onCheckedChange={() => toggleWithdrawal(w.id)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{driver?.full_name || "—"}</TableCell>
                      <TableCell>R$ {Number(w.amount).toFixed(2)}</TableCell>
                      <TableCell>{w.fee_percent}% (R$ {Number(w.fee_amount).toFixed(2)})</TableCell>
                      <TableCell className="font-bold">R$ {Number(w.net_amount).toFixed(2)}</TableCell>
                      <TableCell className="text-xs">
                        {w.pix_key ? (
                          <span>{pixTypeLabels[w.pix_key_type] || w.pix_key_type}: {w.pix_key}</span>
                        ) : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={w.status === "approved" ? "default" : w.status === "rejected" ? "destructive" : "secondary"}>
                          {statusLabels[w.status] || w.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {w.status === "pending" && (
                          <div className="flex justify-end gap-1">
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600"
                              onClick={() => handleWithdrawalAction(w.id, "approved")}
                              disabled={processing === w.id}>
                              <CheckCircle className="w-4 h-4" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive"
                              onClick={() => handleWithdrawalAction(w.id, "rejected")}
                              disabled={processing === w.id}>
                              <XCircle className="w-4 h-4" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Earnings with checkboxes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="w-4 h-4" /> Ganhos dos Motoristas
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {earnings.length === 0 ? (
            <p className="text-muted-foreground text-center py-6">Nenhum ganho registrado</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={earnings.length > 0 && selectedEarnings.size === earnings.length}
                      onCheckedChange={toggleAllEarnings}
                    />
                  </TableHead>
                  <TableHead>Motorista</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {earnings.map((e: any) => {
                  const driver = drivers.find((d: any) => d.id === e.driver_id);
                  return (
                    <TableRow key={e.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedEarnings.has(e.id)}
                          onCheckedChange={() => toggleEarning(e.id)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{driver?.full_name || "—"}</TableCell>
                      <TableCell>R$ {Number(e.amount).toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge variant={e.status === "paid" ? "default" : "secondary"}>
                          {e.status === "paid" ? "Pago" : "Pendente"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(e.created_at).toLocaleDateString("pt-BR")}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Drivers PIX Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Key className="w-4 h-4" /> Chaves PIX dos Motoristas
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Motorista</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Tipo PIX</TableHead>
                <TableHead>Chave PIX</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {drivers.map((d: any) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.full_name}</TableCell>
                  <TableCell>{d.phone}</TableCell>
                  <TableCell>{d.pix_key_type ? (pixTypeLabels[d.pix_key_type] || d.pix_key_type) : "—"}</TableCell>
                  <TableCell>{d.pix_key || <span className="text-muted-foreground">Não cadastrada</span>}</TableCell>
                  <TableCell>
                    <Badge variant={d.is_active ? "default" : "secondary"}>
                      {d.is_active ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <DeleteConfirm
        open={showDeleteAll}
        onOpenChange={setShowDeleteAll}
        onConfirm={handleDeleteAllFinancial}
        title="todos os registros financeiros"
        loading={deleting}
      />
      <DeleteConfirm
        open={showDeleteSelected}
        onOpenChange={setShowDeleteSelected}
        onConfirm={handleDeleteSelected}
        title={`${totalSelected} registro(s) selecionado(s)`}
        loading={deleting}
      />
      <DeleteConfirm
        open={showCleanupConfirm}
        onOpenChange={setShowCleanupConfirm}
        onConfirm={handlePeriodCleanup}
        title="registros financeiros do período selecionado"
        loading={cleaning}
      />
    </div>
  );
};

export default FinancialTab;
