import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Ticket, Copy, Trash2, Percent, Save, Wallet, Store as StoreIcon } from "lucide-react";

interface StoreCreditOption {
  id: string;
  name: string;
  owner_id: string;
  balance: number;
}

const generateCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
};

const CreditsTab = () => {
  const queryClient = useQueryClient();
  const [quantity, setQuantity] = useState("1");
  const [value, setValue] = useState("10");
  const [assignedToOwnerId, setAssignedToOwnerId] = useState<string>("");
  const [generating, setGenerating] = useState(false);
  const [promoPercent, setPromoPercent] = useState("");
  const [savingPromo, setSavingPromo] = useState(false);

  // Direct recharge state
  const [directStoreOwnerId, setDirectStoreOwnerId] = useState<string>("");
  const [directAmount, setDirectAmount] = useState("50");
  const [directPromo, setDirectPromo] = useState(false);
  const [directLoading, setDirectLoading] = useState(false);

  // Fetch real Stores (restaurants) with owner_id and store_credits balance
  const { data: stores = [] } = useQuery<StoreCreditOption[]>({
    queryKey: ["admin-stores-credits-list"],
    queryFn: async () => {
      // 1. Get all restaurants with valid owner_id
      const { data: restList, error: restErr } = await supabase
        .from("restaurants")
        .select("id, name, owner_id")
        .not("owner_id", "is", null)
        .order("name");
      if (restErr) throw restErr;

      const ownerIds = (restList || []).map((r) => r.owner_id).filter((id): id is string => Boolean(id));
      const creditsMap = new Map<string, number>();

      if (ownerIds.length > 0) {
        const { data: creditsList } = await supabase
          .from("store_credits")
          .select("user_id, balance")
          .in("user_id", ownerIds);

        if (creditsList) {
          creditsList.forEach((c: any) => {
            creditsMap.set(c.user_id, Number(c.balance || 0));
          });
        }
      }

      return (restList || []).map((r: any) => ({
        id: r.id,
        name: r.name,
        owner_id: r.owner_id,
        balance: creditsMap.get(r.owner_id) ?? 0,
      }));
    },
  });

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

  const handleGenerate = async () => {
    const qty = parseInt(quantity) || 1;
    const val = parseFloat(value) || 10;
    if (qty < 1 || qty > 50) {
      toast.error("Gere entre 1 e 50 códigos");
      return;
    }
    if (!assignedToOwnerId) {
      toast.error("Selecione a loja destinatária");
      return;
    }

    const selectedStore = stores.find((s) => s.owner_id === assignedToOwnerId);

    setGenerating(true);
    try {
      const newCodes = Array.from({ length: qty }, () => ({
        code: generateCode(),
        value: val,
        assigned_to_user_id: assignedToOwnerId,
      }));
      const { error } = await supabase.from("credit_codes").insert(newCodes as any);
      if (error) throw error;

      toast.success(`${qty} código(s) gerado(s) para a loja "${selectedStore?.name || "Loja"}"!`);
      queryClient.invalidateQueries({ queryKey: ["admin-credit-codes"] });
      setAssignedToOwnerId("");
    } catch (err: any) {
      toast.error(err.message || "Erro ao gerar códigos");
    } finally {
      setGenerating(false);
    }
  };

  const handleDirectRecharge = async () => {
    const amount = parseFloat(directAmount);
    if (!directStoreOwnerId) {
      toast.error("Selecione a Loja");
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      toast.error("Informe um valor numérico válido maior que R$ 0,00");
      return;
    }

    const selectedStore = stores.find((s) => s.owner_id === directStoreOwnerId);

    setDirectLoading(true);
    try {
      const { data, error } = await supabase.rpc("admin_recharge_store", {
        p_store_owner_id: directStoreOwnerId,
        p_amount: amount,
        p_apply_promo: directPromo,
      });
      if (error) throw error;

      const totalCredited = Number(data || amount);
      toast.success(
        `Recarga concluída! R$ ${totalCredited.toFixed(2)} creditados na loja "${selectedStore?.name || "Loja"}"`
      );

      setDirectAmount("50");
      setDirectStoreOwnerId("");

      queryClient.invalidateQueries({ queryKey: ["admin-stores-credits-list"] });
      queryClient.invalidateQueries({ queryKey: ["admin-credit-codes"] });
      queryClient.invalidateQueries({ queryKey: ["admin-financial-data"] });
      queryClient.invalidateQueries({ queryKey: ["my-credits"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao processar recarga direta na loja");
    } finally {
      setDirectLoading(false);
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
      toast.error(err.message || "Erro ao excluir código");
    }
  };

  const storeNameById = (ownerId?: string | null) => {
    if (!ownerId) return "—";
    const s = stores.find((st) => st.owner_id === ownerId);
    return s ? s.name : ownerId.slice(0, 8);
  };

  return (
    <div className="space-y-4">
      {/* Recarga Direta */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Wallet className="w-4 h-4 text-teal-600 dark:text-teal-400" /> Recarga Direta (crédito imediato no saldo da Loja)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1fr_140px_auto_auto] items-end">
            <div className="space-y-2">
              <Label>Loja *</Label>
              <Select value={directStoreOwnerId} onValueChange={setDirectStoreOwnerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a loja..." />
                </SelectTrigger>
                <SelectContent>
                  {stores.map((s) => (
                    <SelectItem key={s.id} value={s.owner_id}>
                      <span className="font-medium">{s.name}</span>{" "}
                      <span className="text-muted-foreground text-xs">(Saldo: R$ {s.balance.toFixed(2)})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Valor (R$)</Label>
              <Input
                type="number"
                step="10"
                min="1"
                value={directAmount}
                onChange={(e) => setDirectAmount(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer pb-2">
              <Checkbox checked={directPromo} onCheckedChange={(v) => setDirectPromo(Boolean(v))} />
              Aplicar bônus promoção
            </label>
            <Button onClick={handleDirectRecharge} disabled={directLoading || !directStoreOwnerId}>
              {directLoading ? "Creditando..." : "Creditar Loja"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Configuração de Promoção */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Percent className="w-4 h-4" /> Configuração de Promoção
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Porcentagem de crédito extra aplicada em resgates de código e em recargas diretas com bônus ativado.
          </p>
          <div className="flex gap-3 items-end">
            <div className="space-y-2">
              <Label>Porcentagem (%)</Label>
              <Input
                type="number"
                min="0"
                max="100"
                step="1"
                placeholder="Ex: 10"
                value={promoPercent}
                onChange={(e) => setPromoPercent(e.target.value)}
                className="w-32"
              />
            </div>
            <Button onClick={handleSavePromo} disabled={savingPromo}>
              <Save className="w-4 h-4 mr-1" />
              {savingPromo ? "Salvando..." : "Salvar"}
            </Button>
          </div>
          {config && (config as any).promo_credit_percent > 0 && (
            <p className="text-sm text-primary font-medium">
              Promoção ativa: {(config as any).promo_credit_percent}% de crédito extra
            </p>
          )}
        </CardContent>
      </Card>

      {/* Gerar Códigos de Crédito */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Ticket className="w-4 h-4" /> Gerar Códigos de Crédito (vinculados a uma Loja)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1fr_120px_140px_auto] items-end">
            <div className="space-y-2">
              <Label>Loja destinatária *</Label>
              <Select value={assignedToOwnerId} onValueChange={setAssignedToOwnerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a loja..." />
                </SelectTrigger>
                <SelectContent>
                  {stores.map((s) => (
                    <SelectItem key={s.id} value={s.owner_id}>
                      <span className="font-medium">{s.name}</span>{" "}
                      <span className="text-muted-foreground text-xs">(Saldo: R$ {s.balance.toFixed(2)})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Quantidade</Label>
              <Input
                type="number"
                min="1"
                max="50"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Valor (R$)</Label>
              <Input
                type="number"
                step="5"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </div>
            <Button onClick={handleGenerate} disabled={generating || !assignedToOwnerId}>
              {generating ? "Gerando..." : "Gerar Códigos"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Apenas a loja selecionada poderá resgatar estes códigos de crédito.
          </p>
        </CardContent>
      </Card>

      {/* Tabela de Códigos Gerados */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Códigos Gerados</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Loja Vinculada</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {codes.map((c: any) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono font-bold">{c.code}</TableCell>
                  <TableCell>R$ {Number(c.value).toFixed(2)}</TableCell>
                  <TableCell className="text-xs">
                    <div className="flex items-center gap-1 font-medium">
                      <StoreIcon className="w-3.5 h-3.5 opacity-70 text-primary" />
                      {storeNameById(c.assigned_to_user_id)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={c.is_used ? "secondary" : "default"}>
                      {c.is_used ? "Usado" : "Disponível"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {!c.is_used && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => copyCode(c.code)}
                          title="Copiar Código"
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive"
                        onClick={() => handleDelete(c.id)}
                        title="Excluir Código"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {codes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Nenhum código gerado ainda
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
