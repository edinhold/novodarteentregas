import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Ticket, Copy, Trash2, Percent, Save, Wallet, Store, ShieldCheck, Loader2 } from "lucide-react";

export interface StoreItem {
  id: string;
  name: string;
  owner_id: string | null;
  phone: string | null;
  balance: number;
}

const CreditsTab = () => {
  const queryClient = useQueryClient();

  // State: Code generation
  const [quantity, setQuantity] = useState("1");
  const [value, setValue] = useState("10");
  const [targetStoreId, setTargetStoreId] = useState<string>("");
  const [generating, setGenerating] = useState(false);

  // State: Promotion config
  const [promoPercent, setPromoPercent] = useState("");
  const [savingPromo, setSavingPromo] = useState(false);

  // State: Direct recharge
  const [directStoreId, setDirectStoreId] = useState<string>("");
  const [directAmount, setDirectAmount] = useState("50");
  const [directPromo, setDirectPromo] = useState(true);
  const [directLoading, setDirectLoading] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => crypto.randomUUID());

  // 1. Query: Registered stores (restaurants table) with current balance
  const { data: stores = [] } = useQuery<StoreItem[]>({
    queryKey: ["admin-stores-list-credits"],
    queryFn: async () => {
      const [{ data: restaurants, error: rErr }, { data: credits, error: cErr }] = await Promise.all([
        supabase.from("restaurants").select("id, name, owner_id, phone").order("name"),
        supabase.from("store_credits").select("user_id, balance"),
      ]);

      if (rErr) throw rErr;
      if (cErr) console.warn("store_credits query warning:", cErr);

      const creditsMap = new Map((credits || []).map((c) => [c.user_id, Number(c.balance || 0)]));
      return (restaurants || []).map((r) => ({
        id: r.id,
        name: r.name,
        owner_id: r.owner_id,
        phone: r.phone,
        balance: r.owner_id ? (creditsMap.get(r.owner_id) ?? 0) : 0,
      }));
    },
  });

  // 2. Query: Credit codes list
  const { data: codes = [] } = useQuery({
    queryKey: ["admin-credit-codes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_codes")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  // 3. Query: Delivery config for promo percent
  const { data: config } = useQuery({
    queryKey: ["delivery-config"],
    queryFn: async () => {
      const { data, error } = await supabase.from("delivery_config").select("*").limit(1).single();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (config && (config as any).promo_credit_percent !== undefined) {
      setPromoPercent(String((config as any).promo_credit_percent));
    }
  }, [config]);

  const activePromoPercent = Number((config as any)?.promo_credit_percent || 0);

  // Direct recharge calculations
  const selectedDirectStore = stores.find((s) => s.id === directStoreId);
  const currentDirectBalance = selectedDirectStore?.balance ?? 0;
  const parsedDirectVal = parseFloat(directAmount) || 0;
  const directBonus = directPromo && activePromoPercent > 0 ? (parsedDirectVal * activePromoPercent) / 100 : 0;
  const directTotalCredited = parsedDirectVal + directBonus;

  // Handler: Save promotion
  const handleSavePromo = async () => {
    const percent = parseFloat(promoPercent);
    if (isNaN(percent) || percent < 0 || percent > 100) {
      toast.error("Informe um valor entre 0 e 100%");
      return;
    }
    if (!config?.id) return;
    setSavingPromo(true);
    try {
      const { error } = await supabase
        .from("delivery_config")
        .update({ promo_credit_percent: percent } as any)
        .eq("id", config.id);
      if (error) throw error;
      toast.success(`Promoção de ${percent}% salva com sucesso!`);
      queryClient.invalidateQueries({ queryKey: ["delivery-config"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar promoção");
    } finally {
      setSavingPromo(false);
    }
  };

  // Handler: Direct Recharge (using LOJAS with Idempotency)
  const handleDirectRecharge = async () => {
    if (!selectedDirectStore) {
      toast.error("Selecione a loja destinatária da recarga");
      return;
    }
    if (parsedDirectVal <= 0) {
      toast.error("Informe um valor numérico válido maior que zero");
      return;
    }
    if (!selectedDirectStore.owner_id) {
      toast.error(`A loja "${selectedDirectStore.name}" não possui usuário proprietário associado.`);
      return;
    }

    setDirectLoading(true);
    try {
      // Invoke Edge Function with store_id and idempotency key
      const { data, error } = await supabase.functions.invoke("admin-recharge-store", {
        body: {
          store_id: selectedDirectStore.id,
          store_owner_id: selectedDirectStore.owner_id,
          amount: parsedDirectVal,
          apply_promo: directPromo,
          idempotency_key: idempotencyKey,
        },
      });

      if (error) {
        // Fallback to RPC
        const { data: rpcData, error: rpcError } = await supabase.rpc("admin_recharge_store", {
          p_store_owner_id: selectedDirectStore.owner_id,
          p_amount: parsedDirectVal,
          p_apply_promo: directPromo,
        });
        if (rpcError) throw rpcError;

        const directCode = `RECARGA-${selectedDirectStore.name.replace(/[^A-Za-z0-9]/g, "").slice(0, 4).toUpperCase()}-${idempotencyKey.slice(0, 6).toUpperCase()}`;
        await supabase.from("credit_codes").insert({
          code: directCode,
          value: directTotalCredited,
          assigned_to_user_id: selectedDirectStore.owner_id,
          used_by: selectedDirectStore.owner_id,
          is_used: true,
          used_at: new Date().toISOString(),
        } as any);

        toast.success(
          `Recarga de R$ ${parsedDirectVal.toFixed(2)} creditada na loja "${selectedDirectStore.name}"! Total creditado: R$ ${Number(rpcData || directTotalCredited).toFixed(2)}`
        );
      } else if (!data?.success) {
        throw new Error(data?.message || "Erro ao realizar recarga");
      } else {
        toast.success(data.message);
      }

      setDirectAmount("50");
      setDirectStoreId("");
      setIdempotencyKey(crypto.randomUUID());
      queryClient.invalidateQueries({ queryKey: ["admin-stores-list-credits"] });
      queryClient.invalidateQueries({ queryKey: ["admin-credit-codes"] });
      queryClient.invalidateQueries({ queryKey: ["admin-financial-data"] });
      queryClient.invalidateQueries({ queryKey: ["admin-store-credits"] });
    } catch (err: any) {
      toast.error(err.message || "Erro na recarga da loja");
    } finally {
      setDirectLoading(false);
    }
  };

  // Handler: Generate Credit Codes (linked to LOJA)
  const handleGenerate = async () => {
    const qty = parseInt(quantity) || 1;
    const val = parseFloat(value) || 10;
    if (qty < 1 || qty > 50) {
      toast.error("Gere entre 1 e 50 códigos");
      return;
    }
    if (!targetStoreId) {
      toast.error("Selecione a loja destinatária dos códigos");
      return;
    }

    const store = stores.find((s) => s.id === targetStoreId);
    if (!store) {
      toast.error("Loja não encontrada");
      return;
    }
    if (!store.owner_id) {
      toast.error(`A loja "${store.name}" não possui usuário associado para resgate.`);
      return;
    }

    setGenerating(true);
    try {
      // Invoke Edge Function
      const { data, error } = await supabase.functions.invoke("generate-credit-codes", {
        body: {
          store_id: store.id,
          store_owner_id: store.owner_id,
          value: val,
          quantity: qty,
          expiration_days: 30,
        },
      });

      if (error) {
        // Fallback to direct insert
        const prefix = store.name.replace(/[^A-Za-z0-9]/g, "").slice(0, 4).toUpperCase();
        const newCodes = Array.from({ length: qty }, () => ({
          code: `${prefix ? `${prefix}-` : ""}CRED-${Math.round(val)}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
          value: val,
          assigned_to_user_id: store.owner_id,
        }));
        const { error: insertErr } = await supabase.from("credit_codes").insert(newCodes as any);
        if (insertErr) throw insertErr;
        toast.success(`${qty} código(s) gerado(s) para a loja "${store.name}"!`);
      } else if (!data?.success) {
        throw new Error(data?.message || "Erro ao gerar códigos");
      } else {
        toast.success(data.message || `${qty} código(s) gerado(s) com sucesso!`);
      }

      setQuantity("1");
      queryClient.invalidateQueries({ queryKey: ["admin-credit-codes"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao gerar códigos");
    } finally {
      setGenerating(false);
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("Código copiado!");
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from("credit_codes").delete().eq("id", id);
      if (error) throw error;
      toast.success("Código excluído!");
      queryClient.invalidateQueries({ queryKey: ["admin-credit-codes"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir");
    }
  };

  // Helper to resolve store name by owner_id or store_id
  const getStoreName = (assignedUserId?: string | null) => {
    if (!assignedUserId) return "Geral (Sem Loja)";
    const match = stores.find((s) => s.owner_id === assignedUserId);
    return match ? match.name : assignedUserId.slice(0, 8);
  };

  return (
    <div className="space-y-4">
      {/* Recarga Direta na Loja */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Store className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            Recarga Direta na Loja (Crédito Imediato no Saldo)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Selecione a loja cadastrada para injetar saldo de créditos diretamente na carteira, com controle de idempotência e auditoria.
          </p>
          <div className="grid gap-3 md:grid-cols-[1fr_140px_auto_auto] items-end">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Loja Destinatária *</Label>
              <Select value={directStoreId} onValueChange={setDirectStoreId}>
                <SelectTrigger className="text-xs">
                  <SelectValue placeholder="Selecione a loja..." />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {stores.map((s) => (
                    <SelectItem key={s.id} value={s.id} className="text-xs">
                      <span className="font-semibold">{s.name}</span>{" "}
                      <span className="text-muted-foreground">(Saldo: R$ {s.balance.toFixed(2)})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Valor (R$) *</Label>
              <Input
                type="number"
                step="5"
                min="1"
                value={directAmount}
                onChange={(e) => setDirectAmount(e.target.value)}
                className="text-xs font-semibold"
              />
            </div>
            <label className="flex items-center gap-2 text-xs cursor-pointer pb-2.5">
              <Checkbox
                checked={directPromo}
                onCheckedChange={(v) => setDirectPromo(Boolean(v))}
              />
              <span>Aplicar bônus ({activePromoPercent}%)</span>
            </label>
            <Button
              onClick={handleDirectRecharge}
              disabled={directLoading || !directStoreId || parsedDirectVal <= 0}
              className="bg-teal-600 hover:bg-teal-700 text-white text-xs h-9"
            >
              {directLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Creditando...
                </>
              ) : (
                "Creditar na Loja"
              )}
            </Button>
          </div>

          {selectedDirectStore && (
            <div className="flex flex-wrap items-center gap-4 p-2.5 rounded-lg bg-muted/40 border text-xs">
              <div>
                Loja: <strong className="text-foreground">{selectedDirectStore.name}</strong>
              </div>
              <div>
                Saldo Atual: <strong className="text-foreground">R$ {currentDirectBalance.toFixed(2)}</strong>
              </div>
              {directBonus > 0 && (
                <div className="text-amber-600 dark:text-amber-400">
                  Bônus: <strong>+ R$ {directBonus.toFixed(2)}</strong>
                </div>
              )}
              <div className="text-teal-600 dark:text-teal-400 font-medium">
                Total Creditado: <strong>+ R$ {directTotalCredited.toFixed(2)}</strong>
              </div>
              <div className="text-primary font-bold ml-auto flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
                Novo Saldo: R$ {(currentDirectBalance + directTotalCredited).toFixed(2)}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Configuração de Promoção */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Percent className="w-4 h-4" /> Configuração de Bônus Promocional
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Porcentagem extra aplicada nas recargas e resgates de códigos pelas lojas.
          </p>
          <div className="flex gap-3 items-end">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Porcentagem (%)</Label>
              <Input
                type="number"
                min="0"
                max="100"
                step="1"
                placeholder="Ex: 10"
                value={promoPercent}
                onChange={(e) => setPromoPercent(e.target.value)}
                className="w-32 text-xs"
              />
            </div>
            <Button onClick={handleSavePromo} disabled={savingPromo} size="sm">
              <Save className="w-4 h-4 mr-1" />
              {savingPromo ? "Salvando..." : "Salvar"}
            </Button>
          </div>
          {activePromoPercent > 0 && (
            <p className="text-xs text-primary font-medium">
              Promoção ativa no sistema: {activePromoPercent}% de crédito extra nas recargas.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Gerar Códigos de Crédito Vinculados à LOJA */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Ticket className="w-4 h-4" /> Gerar Códigos de Crédito (Vinculados a uma Loja)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Gera tíquetes de recarga que só podem ser resgatados pela loja selecionada no painel dela.
          </p>
          <div className="grid gap-3 md:grid-cols-[1fr_120px_140px_auto] items-end">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Loja Destinatária *</Label>
              <Select value={targetStoreId} onValueChange={setTargetStoreId}>
                <SelectTrigger className="text-xs">
                  <SelectValue placeholder="Selecione a loja..." />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {stores.map((s) => (
                    <SelectItem key={s.id} value={s.id} className="text-xs">
                      <span className="font-semibold">{s.name}</span>{" "}
                      <span className="text-muted-foreground">(Saldo: R$ {s.balance.toFixed(2)})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Quantidade</Label>
              <Input
                type="number"
                min="1"
                max="50"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Valor (R$)</Label>
              <Input
                type="number"
                step="5"
                min="1"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="text-xs font-semibold"
              />
            </div>
            <Button
              onClick={handleGenerate}
              disabled={generating || !targetStoreId}
              size="sm"
              className="h-9 text-xs"
            >
              {generating ? "Gerando..." : "Gerar Códigos"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabela de Códigos */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico de Códigos e Recargas</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Loja Vinculada</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {codes.map((c: any) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono font-bold text-xs">{c.code}</TableCell>
                  <TableCell className="text-xs">R$ {Number(c.value).toFixed(2)}</TableCell>
                  <TableCell className="text-xs">
                    <div className="flex items-center gap-1.5">
                      <Store className="w-3.5 h-3.5 text-primary opacity-80" />
                      <span className="font-medium">{getStoreName(c.assigned_to_user_id)}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={c.is_used ? "secondary" : "default"} className="text-[11px]">
                      {c.is_used ? "Utilizado" : "Disponível"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {!c.is_used && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => copyCode(c.code)}
                          title="Copiar código"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive"
                        onClick={() => handleDelete(c.id)}
                        title="Excluir código"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {codes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8 text-xs">
                    Nenhum código gerado até o momento.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default CreditsTab;
