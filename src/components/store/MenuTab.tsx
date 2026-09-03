import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { UtensilsCrossed, Plus, Pencil, Trash2 } from "lucide-react";

interface MenuTabProps {
  restaurant: any;
}

const MenuTab = ({ restaurant }: MenuTabProps) => {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [form, setForm] = useState({ name: "", description: "", price: "", category: "", image: "", is_available: true });
  const [saving, setSaving] = useState(false);

  const { data: products = [] } = useQuery({
    queryKey: ["store-products", restaurant?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").eq("restaurant_id", restaurant!.id).order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: !!restaurant?.id,
  });

  const openCreate = () => {
    setEditingProduct(null);
    setForm({ name: "", description: "", price: "", category: "", image: "", is_available: true });
    setFormOpen(true);
  };

  const openEdit = (p: any) => {
    setEditingProduct(p);
    setForm({ name: p.name, description: p.description || "", price: String(p.price), category: p.category || "", image: p.image || "", is_available: p.is_available });
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Nome é obrigatório"); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        description: form.description || null,
        price: parseFloat(form.price) || 0,
        category: form.category,
        image: form.image || null,
        is_available: form.is_available,
        restaurant_id: restaurant.id,
      };
      if (editingProduct) {
        const { error } = await supabase.from("products").update(payload).eq("id", editingProduct.id);
        if (error) throw error;
        toast.success("Produto atualizado!");
      } else {
        const { error } = await supabase.from("products").insert(payload);
        if (error) throw error;
        toast.success("Produto adicionado!");
      }
      setFormOpen(false);
      queryClient.invalidateQueries({ queryKey: ["store-products", restaurant.id] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
      toast.success("Produto removido");
      queryClient.invalidateQueries({ queryKey: ["store-products", restaurant.id] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao remover");
    }
  };

  if (!restaurant) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Cadastre sua loja na aba "Minha Loja" para começar a adicionar produtos.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-base font-semibold flex items-center gap-2"><UtensilsCrossed className="w-4 h-4" /> Cardápio</h2>
        <Button size="sm" onClick={openCreate}><Plus className="w-4 h-4 mr-1" /> Adicionar</Button>
      </div>

      {products.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Nenhum produto cadastrado. Adicione seu primeiro produto!
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {products.map((p: any) => (
            <Card key={p.id}>
              <CardContent className="p-3 flex items-center gap-3">
                {p.image && <img src={p.image} alt={p.name} className="w-14 h-14 rounded-lg object-cover" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-sm truncate">{p.name}</p>
                    {!p.is_available && <span className="text-xs text-muted-foreground">(indisponível)</span>}
                  </div>
                  {p.description && <p className="text-xs text-muted-foreground truncate">{p.description}</p>}
                  <p className="text-sm font-bold text-primary">R$ {p.price.toFixed(2)}</p>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(p)}><Pencil className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => handleDelete(p.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingProduct ? "Editar Produto" : "Novo Produto"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Nome *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div><Label>Descrição</Label><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Preço (R$)</Label><Input type="number" step="0.01" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} /></div>
              <div><Label>Categoria</Label><Input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="Ex: Lanches" /></div>
            </div>
            <div><Label>URL da Imagem</Label><Input value={form.image} onChange={e => setForm(f => ({ ...f, image: e.target.value }))} /></div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_available} onCheckedChange={v => setForm(f => ({ ...f, is_available: v }))} />
              <Label>Disponível</Label>
            </div>
            <Button onClick={handleSave} disabled={saving} className="w-full">{saving ? "Salvando..." : "Salvar"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MenuTab;
