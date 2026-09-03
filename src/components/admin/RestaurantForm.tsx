import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Category, Restaurant } from "@/types";

interface RestaurantFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  restaurant?: Restaurant | null;
  categories: Category[];
}

const RestaurantForm = ({ open, onOpenChange, restaurant, categories }: RestaurantFormProps) => {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    category_id: "",
    category_name: "",
    image: "",
    logo: "",
    address: "",
    delivery_fee: "0",
    delivery_time: "30-45 min",
    distance: "1.5 km",
    min_order: "0",
    rating: "0",
    is_open: true,
    is_featured: false,
    latitude: "",
    longitude: "",
  });

  useEffect(() => {
    if (restaurant) {
      setForm({
        name: restaurant.name,
        category_id: restaurant.category_id || "",
        category_name: restaurant.category_name,
        image: restaurant.image || "",
        logo: restaurant.logo || "",
        address: restaurant.address || "",
        delivery_fee: String(restaurant.delivery_fee),
        delivery_time: restaurant.delivery_time,
        distance: restaurant.distance,
        min_order: String(restaurant.min_order),
        rating: String(restaurant.rating),
        is_open: restaurant.is_open,
        is_featured: restaurant.is_featured,
        latitude: restaurant.latitude ? String(restaurant.latitude) : "",
        longitude: restaurant.longitude ? String(restaurant.longitude) : "",
      });
    } else {
      setForm({
        name: "", category_id: "", category_name: "", image: "", logo: "",
        address: "", delivery_fee: "0", delivery_time: "30-45 min",
        distance: "1.5 km", min_order: "0", rating: "0",
        is_open: true, is_featured: false, latitude: "", longitude: "",
      });
    }
  }, [restaurant, open]);

  const handleCategoryChange = (categoryId: string) => {
    const cat = categories.find((c) => c.id === categoryId);
    setForm((f) => ({ ...f, category_id: categoryId, category_name: cat?.name || "" }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error("Nome é obrigatório"); return; }
    setLoading(true);
    try {
      const payload = {
        name: form.name,
        category_id: form.category_id || null,
        category_name: form.category_name,
        image: form.image || null,
        logo: form.logo || null,
        address: form.address || null,
        delivery_fee: parseFloat(form.delivery_fee) || 0,
        delivery_time: form.delivery_time,
        distance: form.distance,
        min_order: parseFloat(form.min_order) || 0,
        rating: parseFloat(form.rating) || 0,
        is_open: form.is_open,
        is_featured: form.is_featured,
        latitude: form.latitude ? parseFloat(form.latitude) : null,
        longitude: form.longitude ? parseFloat(form.longitude) : null,
      };

      if (restaurant) {
        const { error } = await supabase.from("restaurants").update(payload).eq("id", restaurant.id);
        if (error) throw error;
        toast.success("Restaurante atualizado!");
      } else {
        const { error } = await supabase.from("restaurants").insert(payload);
        if (error) throw error;
        toast.success("Restaurante criado!");
      }
      queryClient.invalidateQueries({ queryKey: ["admin-restaurants"] });
      queryClient.invalidateQueries({ queryKey: ["restaurants"] });
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{restaurant ? "Editar Restaurante" : "Novo Restaurante"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Nome *</Label>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
          </div>
          <div className="space-y-2">
            <Label>Categoria</Label>
            <Select value={form.category_id} onValueChange={handleCategoryChange}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.icon} {c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Taxa de entrega</Label>
              <Input type="number" step="0.01" value={form.delivery_fee} onChange={(e) => setForm((f) => ({ ...f, delivery_fee: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Pedido mínimo</Label>
              <Input type="number" step="0.01" value={form.min_order} onChange={(e) => setForm((f) => ({ ...f, min_order: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Tempo de entrega</Label>
              <Input value={form.delivery_time} onChange={(e) => setForm((f) => ({ ...f, delivery_time: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Distância</Label>
              <Input value={form.distance} onChange={(e) => setForm((f) => ({ ...f, distance: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Imagem (URL)</Label>
            <Input value={form.image} onChange={(e) => setForm((f) => ({ ...f, image: e.target.value }))} placeholder="https://..." />
          </div>
          <div className="space-y-2">
            <Label>Endereço</Label>
            <Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Latitude</Label>
              <Input type="number" step="any" value={form.latitude} onChange={(e) => setForm((f) => ({ ...f, latitude: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Longitude</Label>
              <Input type="number" step="any" value={form.longitude} onChange={(e) => setForm((f) => ({ ...f, longitude: e.target.value }))} />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Switch checked={form.is_open} onCheckedChange={(v) => setForm((f) => ({ ...f, is_open: v }))} />
              <Label>Aberto</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_featured} onCheckedChange={(v) => setForm((f) => ({ ...f, is_featured: v }))} />
              <Label>Destaque</Label>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" className="flex-1" disabled={loading}>{loading ? "Salvando..." : "Salvar"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default RestaurantForm;
