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
import { resolveStoreCoordinates, isWithinPrimaveraBounds, DEFAULT_CENTER } from "@/config/maps";
import { geocodeAddress } from "@/services/mapbox";
import { MapPin } from "lucide-react";

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
        name: restaurant.name || "",
        category_id: restaurant.category_id || "",
        category_name: restaurant.category_name || "",
        image: restaurant.image || "",
        logo: restaurant.logo || "",
        address: restaurant.address || "",
        delivery_fee: restaurant.delivery_fee != null ? String(restaurant.delivery_fee) : "0",
        delivery_time: restaurant.delivery_time || "30-45 min",
        distance: restaurant.distance || "1.5 km",
        min_order: restaurant.min_order != null ? String(restaurant.min_order) : "0",
        rating: restaurant.rating != null ? String(restaurant.rating) : "0",
        is_open: restaurant.is_open ?? true,
        is_featured: restaurant.is_featured ?? false,
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

  const [isGeocoding, setIsGeocoding] = useState(false);

  const handleGeocodeAddress = async () => {
    if (!form.address?.trim()) {
      toast.error("Preencha o endereço do estabelecimento primeiro");
      return;
    }
    setIsGeocoding(true);
    try {
      const resolved = resolveStoreCoordinates({ name: form.name, address: form.address });
      if (resolved.lat !== DEFAULT_CENTER.lat || resolved.lng !== DEFAULT_CENTER.lng) {
        setForm((f) => ({ ...f, latitude: String(resolved.lat), longitude: String(resolved.lng) }));
        toast.success("Coordenadas identificadas e validadas em Primavera do Leste!");
        return;
      }

      const res = await geocodeAddress(`${form.address.trim()}, Primavera do Leste - MT`);
      if (res?.coordinates && isWithinPrimaveraBounds(res.coordinates.latitude, res.coordinates.longitude)) {
        setForm((f) => ({
          ...f,
          latitude: String(res.coordinates.latitude),
          longitude: String(res.coordinates.longitude),
        }));
        toast.success("Coordenadas localizadas com precisão!");
      } else {
        toast.error("Não foi possível encontrar as coordenadas exatas dentro de Primavera do Leste.");
      }
    } catch {
      toast.error("Erro ao buscar coordenadas do endereço.");
    } finally {
      setIsGeocoding(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error("Nome é obrigatório"); return; }
    setLoading(true);
    try {
      let finalLat = form.latitude ? parseFloat(form.latitude) : null;
      let finalLng = form.longitude ? parseFloat(form.longitude) : null;

      // Se latitude ou longitude estiverem nulos ou fora do perímetro de Primavera do Leste, resolve automaticamente
      if ((!finalLat || !finalLng || !isWithinPrimaveraBounds(finalLat, finalLng)) && form.address?.trim()) {
        const resolved = resolveStoreCoordinates({ name: form.name, address: form.address });
        if (resolved.lat !== DEFAULT_CENTER.lat || resolved.lng !== DEFAULT_CENTER.lng) {
          finalLat = resolved.lat;
          finalLng = resolved.lng;
        } else {
          try {
            const geocoded = await geocodeAddress(`${form.address.trim()}, Primavera do Leste - MT`);
            if (geocoded?.coordinates && isWithinPrimaveraBounds(geocoded.coordinates.latitude, geocoded.coordinates.longitude)) {
              finalLat = geocoded.coordinates.latitude;
              finalLng = geocoded.coordinates.longitude;
            }
          } catch (e) {
            console.warn("[RestaurantForm] Auto-geocode falhou:", e);
          }
        }
      }

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
        latitude: finalLat,
        longitude: finalLng,
      };

      if (restaurant) {
        const { error } = await supabase.from("restaurants").update(payload).eq("id", restaurant.id);
        if (error) throw error;
        toast.success("Restaurante atualizado com coordenadas precisas!");
      } else {
        const { error } = await supabase.from("restaurants").insert(payload);
        if (error) throw error;
        toast.success("Restaurante criado com sucesso!");
      }
      queryClient.invalidateQueries({ queryKey: ["admin-restaurants"] });
      queryClient.invalidateQueries({ queryKey: ["admin-store-owners"] });
      queryClient.invalidateQueries({ queryKey: ["my-restaurant"] });
      queryClient.invalidateQueries({ queryKey: ["financial-restaurants"] });
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
            <div className="flex items-center justify-between">
              <Label>Endereço</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 text-xs text-primary px-2 hover:bg-primary/10"
                onClick={handleGeocodeAddress}
                disabled={isGeocoding}
              >
                <MapPin className="w-3 h-3 mr-1" />
                {isGeocoding ? "Buscando..." : "Buscar Coordenadas"}
              </Button>
            </div>
            <Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="Rua, número, bairro, Primavera do Leste" />
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
