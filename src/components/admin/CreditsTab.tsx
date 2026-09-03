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
import { Ticket, Copy, Trash2, Percent, Save, Wallet, User } from "lucide-react";

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
  const [assignedTo, setAssignedTo] = useState<string>("");
  const [generating, setGenerating] = useState(false);
  const [promoPercent, setPromoPercent] = useState("");
  const [savingPromo, setSavingPromo] = useState(false);

  // Direct recharge
  const [directStore, setDirectStore] = useState<string>("");
  const [directAmount, setDirectAmount] = useState("50");
  const [directPromo, setDirectPromo] = useState(false);
  const [directLoading, setDirectLoading] = useState(false);

  const { data: storeOwners = [] } = useQuery({
    queryKey: ["admin-store-owners"],
    queryFn: async () => {
      // Try the RPC first (includes emails via auth.users)
      const rpc = await supabase.rpc("admin_list_store_owners");
      if (!rpc.error && Array.isArray(rpc.data) && rpc.data.length > 0) {
        return rpc.data as any[];
      }
      if (rpc.error) {
        console.warn("[CreditsTab] admin_list_store_owners falhou, usando fallback:", rpc.error.message);
      }
      // Fallback: query user_roles + profiles directly (admin RLS allows it)
      const { data: roles, error: rolesErr } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "store_owner");
      if (rolesErr) {
        toast.error("Erro ao carregar lojistas: " + rolesErr.message);
        throw rolesErr;
      }
      const ids = (roles || []).map((r: any) => r.user_id);
      if (ids.length === 0) return [];
      const { data: profiles, error: profErr } = await supabase
        .from("profiles")
        .select("user_id, full_name, phone")
        .in("user_id", ids);
      if (profErr) {
        toast.error("Erro ao carregar perfis: " + profErr.message);
        throw profErr;
      }
      const map = new Map((profiles || []).map((p: any) => [p.user_id, p]));
      return ids.map((id) => {
        const p: any = map.get(id) || {};
        return {
          user_id: id,
          full_name: p.full_name || "",
          email: p.phone || id.slice(0, 8),
        };
      });
    },
  });

  const { data: codes = [] } = useQuery({
    queryKey: ["admin-credit-codes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("credit_codes").select("*").order("created_at", { ascending: false }).limit(100);
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

  const storeLabel = (o: any) => o.full_name?.trim() ? `${o.full_name} — ${o.email}` : o.email;

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
    if (qty < 1 || qty > 50) { toast.error("Gere entre 1 e 50 códigos"); return; }
    if (!assignedTo) { toast.error("Selecione o lojista destinatário"); return; }
    setGenerating(true);
    try {
      const newCodes = Array.from({ length: qty }, () => ({
        code: generateCode(),
        value: val,
        assigned_to_user_id: assignedTo,
      }));
      const { error } = await supabase.from("credit_codes").insert(newCodes as any);
      if (error) throw error;
      toast.success(`${qty} código(s) gerado(s) para o lojista!`);
      queryClient.invalidateQueries({ queryKey: ["admin-credit-codes"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao gerar");
    } finally {
      setGenerating(false);
    }
  };

  const handleDirectRecharge = async () => {
    const amount = parseFloat(directAmount);
    if (!directStore) { toast.error("Selecione o lojista"); return; }
    if (isNaN(amount) || amount <= 0) { toast.error("Valor inválido"); return; }
    setDirectLoading(true);
    try {
      const { data, error } = await supabase.rpc("admin_recharge_store", {
        p_store_owner_id: directStore,
        p_amount: amount,
        p_apply_promo: directPromo,
      });
      if (error) throw error;
      toast.success(`Recarga concluída: R$ ${Number(data).toFixed(2)} creditados`);
      setDirectAmount("50");
    } catch (err: any) {
      toast.error(err.message || "Erro na recarga");
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
      toast.error(err.message || "Erro ao excluir");
    }
  };

  const storeNameById = (id?: string | null) => {
    if (!id) return "—";
    const o = (storeOwners as any[]).find((s) => s.user_id === id);
    return o ? storeLabel(o) : id.slice(0, 8);
  };

  return (
    <div className="space-y-4">
      {/* Recarga Direta */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Wallet className="w-4 h-4" /> Recarga Direta (crédito imediato no lojista)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1fr_140px_auto_auto] items-end">
            <div className="space-y-2">
              <Label>Lojista *</Label>
              <Select value={directStore} onValueChange={setDirectStore}>
                <SelectTrigger><SelectValue placeholder="Selecione o lojista" /></SelectTrigger>
                <SelectContent>
                  {(storeOwners as any[]).map((o) => (
                    <SelectItem key={o.user_id} value={o.user_id}>{storeLabel(o)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Valor (R$)</Label>
              <Input type="number" step="10" value={directAmount} onChange={(e) => setDirectAmount(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={directPromo} onCheckedChange={(v) => setDirectPromo(Boolean(v))} />
              Aplicar promoção
            </label>
            <Button onClick={handleDirectRecharge} disabled={directLoading}>
              {directLoading ? "Creditando..." : "Creditar agora"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Seção Promoção */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Percent className="w-4 h-4" /> Configuração de Promoção
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Porcentagem extra aplicada em resgates de código e (opcionalmente) em recargas diretas.
          </p>
          <div className="flex gap-3 items-end">
            <div className="space-y-2">
              <Label>Porcentagem (%)</Label>
              <Input type="number" min="0" max="100" step="1" placeholder="Ex: 10" value={promoPercent} onChange={(e) => setPromoPercent(e.target.value)} className="w-32" />
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

      {/* Gerar Códigos vinculados */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Ticket className="w-4 h-4" /> Gerar Códigos de Crédito (vinculados a um lojista)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1fr_120px_140px_auto] items-end">
            <div className="space-y-2">
              <Label>Lojista destinatário *</Label>
              <Select value={assignedTo} onValueChange={setAssignedTo}>
                <SelectTrigger><SelectValue placeholder="Selecione o lojista" /></SelectTrigger>
                <SelectContent>
                  {(storeOwners as any[]).map((o) => (
                    <SelectItem key={o.user_id} value={o.user_id}>{storeLabel(o)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Quantidade</Label>
              <Input type="number" min="1" max="50" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Valor (R$)</Label>
              <Input type="number" step="5" value={value} onChange={(e) => setValue(e.target.value)} />
            </div>
            <Button onClick={handleGenerate} disabled={generating}>
              {generating ? "Gerando..." : "Gerar"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Apenas o lojista selecionado poderá resgatar estes códigos.
          </p>
        </CardContent>
      </Card>

      {/* Tabela de Códigos */}
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
                <TableHead>Vinculado a</TableHead>
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
                    <div className="flex items-center gap-1">
                      <User className="w-3 h-3 opacity-60" />
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
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => copyCode(c.code)}>
                          <Copy className="w-4 h-4" />
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => handleDelete(c.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {codes.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum código gerado</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default CreditsTab;
