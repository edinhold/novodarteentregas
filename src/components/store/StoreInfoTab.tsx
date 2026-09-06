import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { 
  Store, 
  Save, 
  MapPin, 
  Navigation, 
  Layers, 
  Lock, 
  Upload, 
  Trash2, 
  Eye, 
  EyeOff, 
  ImageIcon, 
  CheckCircle2,
  KeyRound,
  RefreshCw
} from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MAP_LAYERS, GOOGLE_MAPS_API_KEY } from "@/config/maps";
import { getBestLocation } from "@/utils/geolocation";

import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const storePin = new L.Icon({
  iconUrl: "data:image/svg+xml," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="%23e53935" stroke="white" stroke-width="1.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3" fill="white"/></svg>`
  ),
  iconSize: [36, 36],
  iconAnchor: [18, 36],
  popupAnchor: [0, -36],
});

interface StoreInfoTabProps {
  restaurant: any;
  userId: string;
}

const StoreInfoTab = ({ restaurant, userId }: StoreInfoTabProps) => {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    address: "",
    delivery_time: "30-45 min",
    delivery_fee: "0",
    min_order: "0",
    is_open: true,
    latitude: "",
    longitude: "",
  });

  // Logo state
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [removingLogo, setRemovingLogo] = useState(false);

  // Password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const [mapType, setMapType] = useState<keyof typeof MAP_LAYERS>("streets");
  const [gpsLoading, setGpsLoading] = useState(false);

  useEffect(() => {
    if (restaurant) {
      setForm({
        name: restaurant.name || "",
        address: restaurant.address || "",
        delivery_time: restaurant.delivery_time || "30-45 min",
        delivery_fee: String(restaurant.delivery_fee || 0),
        min_order: String(restaurant.min_order || 0),
        is_open: restaurant.is_open ?? true,
        latitude: restaurant.latitude ? String(restaurant.latitude) : "",
        longitude: restaurant.longitude ? String(restaurant.longitude) : "",
      });
    }
  }, [restaurant]);

  const updateMarkerPosition = useCallback((lat: number, lng: number) => {
    setForm(f => ({ ...f, latitude: lat.toFixed(7), longitude: lng.toFixed(7) }));

    if (mapRef.current) {
      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lng]);
      } else {
        markerRef.current = L.marker([lat, lng], { icon: storePin, draggable: true })
          .addTo(mapRef.current)
          .bindPopup("<b>📍 Localização da Loja</b>");

        markerRef.current.on("dragend", () => {
          const pos = markerRef.current!.getLatLng();
          setForm(f => ({ ...f, latitude: pos.lat.toFixed(7), longitude: pos.lng.toFixed(7) }));
          reverseGeocode(pos.lat, pos.lng);
        });
      }
      mapRef.current.setView([lat, lng], 17);
    }
  }, []);

  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    try {
      if (GOOGLE_MAPS_API_KEY) {
        const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}&language=pt-BR`);
        const data = await res.json();
        if (data.status === "OK" && data.results?.[0]) {
          setForm(f => ({ ...f, address: data.results[0].formatted_address }));
          return;
        }
      }
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&zoom=18&accept-language=pt-BR`);
      const data = await res.json();
      if (data?.address) {
        const a = data.address;
        const parts: string[] = [];
        const road = a.road || a.pedestrian || a.footway || a.street || "";
        if (road) parts.push(a.house_number ? `${road}, ${a.house_number}` : road);
        const neighborhood = a.suburb || a.neighbourhood || a.quarter || "";
        if (neighborhood) parts.push(neighborhood);
        const city = a.city || a.town || a.village || a.municipality || "";
        if (city) parts.push(city);
        if (a.state) parts.push(a.state);
        if (parts.length > 0) {
          setForm(f => ({ ...f, address: parts.join(", ") }));
        }
      }
    } catch (err) {
      console.error("Reverse geocode error:", err);
    }
  }, []);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const lat = parseFloat(form.latitude) || -15.5454;
    const lng = parseFloat(form.longitude) || -54.2958;

    const map = L.map(mapContainerRef.current).setView([lat, lng], form.latitude ? 17 : 12);
    mapRef.current = map;

    tileLayerRef.current = L.tileLayer(MAP_LAYERS[mapType].url, {
      attribution: MAP_LAYERS[mapType].attribution,
      maxZoom: mapType === "satellite" ? 18 : 19,
    }).addTo(map);

    if (form.latitude && form.longitude) {
      markerRef.current = L.marker([parseFloat(form.latitude), parseFloat(form.longitude)], { icon: storePin, draggable: true })
        .addTo(map)
        .bindPopup("<b>📍 Localização da Loja</b>");

      markerRef.current.on("dragend", () => {
        const pos = markerRef.current!.getLatLng();
        setForm(f => ({ ...f, latitude: pos.lat.toFixed(7), longitude: pos.lng.toFixed(7) }));
        reverseGeocode(pos.lat, pos.lng);
      });
    }

    map.on("click", (e: L.LeafletMouseEvent) => {
      const { lat: clickLat, lng: clickLng } = e.latlng;
      updateMarkerPosition(clickLat, clickLng);
      reverseGeocode(clickLat, clickLng);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // Update tile layer if mapType changed
  useEffect(() => {
    const map = mapRef.current;
    if (tileLayerRef.current && map) {
      const currentUrl = MAP_LAYERS[mapType].url;
      if ((tileLayerRef.current as any)._url !== currentUrl) {
        map.removeLayer(tileLayerRef.current);
        tileLayerRef.current = L.tileLayer(currentUrl, {
          attribution: MAP_LAYERS[mapType].attribution,
          maxZoom: mapType === "satellite" ? 18 : 19,
        }).addTo(map);
      }
    }
  }, [mapType]);

  // Sync marker when form coords change from restaurant load
  useEffect(() => {
    if (!mapRef.current) return;
    const lat = parseFloat(form.latitude);
    const lng = parseFloat(form.longitude);
    if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
      if (markerRef.current) {
        const cur = markerRef.current.getLatLng();
        if (Math.abs(cur.lat - lat) > 0.0001 || Math.abs(cur.lng - lng) > 0.0001) {
          markerRef.current.setLatLng([lat, lng]);
          mapRef.current.setView([lat, lng], 17);
        }
      } else {
        updateMarkerPosition(lat, lng);
      }
    }
  }, [restaurant?.latitude, restaurant?.longitude]);

  const handleUseGPS = async () => {
    setGpsLoading(true);
    try {
      const loc = await getBestLocation({ highAccuracyTimeoutMs: 6000, coarseTimeoutMs: 7000 });
      const lat = loc.latitude;
      const lng = loc.longitude;
      updateMarkerPosition(lat, lng);
      reverseGeocode(lat, lng);
      setGpsLoading(false);
      toast.success(`📍 Localização GPS obtida (precisão: ${Math.round(loc.accuracy)}m)`);
    } catch (err: any) {
      setGpsLoading(false);
      toast.error(err?.code === 1 || err?.message?.toLowerCase().includes("denied") ? "Permissão GPS negada" : "Erro ao obter localização GPS");
    }
  };

  const handleSaveStoreInfo = async () => {
    if (!form.name.trim()) {
      toast.error("Nome da loja é obrigatório");
      return;
    }
    setSaving(true);
    try {
      const lat = parseFloat(form.latitude);
      const lng = parseFloat(form.longitude);

      const payload: any = {
        name: form.name,
        address: form.address || null,
        delivery_time: form.delivery_time,
        delivery_fee: parseFloat(form.delivery_fee) || 0,
        min_order: parseFloat(form.min_order) || 0,
        is_open: form.is_open,
      };

      if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
        payload.latitude = lat;
        payload.longitude = lng;
      }

      if (restaurant) {
        const { error } = await supabase.from("restaurants").update(payload).eq("id", restaurant.id).eq("owner_id", userId);
        if (error) throw error;
        toast.success("Dados da loja atualizados!");
      } else {
        const { error } = await supabase.from("restaurants").insert({
          ...payload,
          owner_id: userId,
          category_name: "Geral",
        });
        if (error) throw error;
        toast.success("Loja criada com sucesso!");
      }
      queryClient.invalidateQueries({ queryKey: ["my-restaurant", userId] });
      queryClient.invalidateQueries({ queryKey: ["restaurants"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar informações");
    } finally {
      setSaving(false);
    }
  };

  // Logo handlers
  const handleLogoFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validExtensions = ["png", "jpg", "jpeg"];
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    const isImage = file.type.startsWith("image/") || validExtensions.includes(ext);

    if (!isImage || !validExtensions.includes(ext)) {
      toast.error("Formato inválido! Envie apenas imagens nos formatos PNG ou JPG/JPEG.");
      e.target.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("O arquivo é muito grande! Tamanho máximo permitido: 5MB.");
      e.target.value = "";
      return;
    }

    setLogoFile(file);
    const objectUrl = URL.createObjectURL(file);
    setLogoPreview(objectUrl);
  };

  const handleSaveLogo = async () => {
    if (!logoFile) {
      toast.error("Selecione um arquivo de imagem antes de salvar.");
      return;
    }

    if (!restaurant?.id) {
      toast.error("Você precisa salvar o cadastro da loja antes de enviar a logo.");
      return;
    }

    setUploadingLogo(true);
    try {
      const ext = logoFile.name.split(".").pop()?.toLowerCase() || "png";
      const filePath = `${userId}/logo-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("restaurant-images")
        .upload(filePath, logoFile, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from("restaurant-images")
        .getPublicUrl(filePath);

      const publicUrl = publicUrlData.publicUrl;

      const { error: updateError } = await supabase
        .from("restaurants")
        .update({ logo: publicUrl })
        .eq("id", restaurant.id)
        .eq("owner_id", userId);

      if (updateError) throw updateError;

      toast.success("Logo da loja atualizada com sucesso!");
      setLogoFile(null);
      setLogoPreview(null);

      queryClient.invalidateQueries({ queryKey: ["my-restaurant", userId] });
      queryClient.invalidateQueries({ queryKey: ["restaurants"] });
      if (restaurant?.id) {
        queryClient.invalidateQueries({ queryKey: ["restaurant", restaurant.id] });
      }
    } catch (err: any) {
      console.error("Erro ao salvar logo:", err);
      toast.error(err.message || "Não foi possível salvar a logo. Tente novamente.");
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleRemoveLogo = async () => {
    if (!restaurant?.id) return;
    if (!confirm("Deseja realmente remover a logo da sua loja?")) return;

    setRemovingLogo(true);
    try {
      const { error } = await supabase
        .from("restaurants")
        .update({ logo: null })
        .eq("id", restaurant.id)
        .eq("owner_id", userId);

      if (error) throw error;

      toast.success("Logo removida com sucesso!");
      setLogoFile(null);
      setLogoPreview(null);

      queryClient.invalidateQueries({ queryKey: ["my-restaurant", userId] });
      queryClient.invalidateQueries({ queryKey: ["restaurants"] });
      if (restaurant?.id) {
        queryClient.invalidateQueries({ queryKey: ["restaurant", restaurant.id] });
      }
    } catch (err: any) {
      console.error("Erro ao remover logo:", err);
      toast.error(err.message || "Erro ao remover a logo.");
    } finally {
      setRemovingLogo(false);
    }
  };

  // Password change handler
  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentPassword) {
      toast.error("Informe a senha atual");
      return;
    }
    if (!newPassword) {
      toast.error("Informe a nova senha");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("A nova senha deve ter no mínimo 6 caracteres");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("A confirmação de senha não confere com a nova senha");
      return;
    }

    setPasswordLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) {
        throw new Error("Sessão expirada ou usuário não identificado. Faça login novamente.");
      }

      // Validar senha atual re-autenticando no Supabase
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });

      if (authError) {
        toast.error("Senha atual incorreta. Verifique e tente novamente.");
        setPasswordLoading(false);
        return;
      }

      // Atualizar a senha de forma segura no Supabase Auth
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) throw updateError;

      toast.success("Senha alterada com sucesso! Sua sessão continua ativa.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      console.error("Erro ao alterar senha:", err);
      toast.error(err.message || "Erro ao alterar a senha.");
    } finally {
      setPasswordLoading(false);
    }
  };

  const currentLogoDisplay = logoPreview || restaurant?.logo;

  return (
    <div className="space-y-6">
      {/* 1. LOGO DA LOJA */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-primary" /> Identity Visual - Logo da Loja
          </CardTitle>
          <CardDescription>
            Envie a logo do seu estabelecimento em PNG ou JPG/JPEG (máx 5MB). Ela será exibida no painel e na página inicial.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center gap-6 p-4 rounded-xl bg-muted/30 border border-border/50">
            <div className="relative shrink-0">
              <div className="w-28 h-28 rounded-2xl bg-muted border-2 border-dashed border-border overflow-hidden flex items-center justify-center shadow-sm">
                {currentLogoDisplay ? (
                  <img src={currentLogoDisplay} alt="Logo da loja" className="w-full h-full object-cover" />
                ) : (
                  <div className="text-center p-2 text-muted-foreground flex flex-col items-center">
                    <Store className="w-8 h-8 opacity-40 mb-1" />
                    <span className="text-[10px]">Sem logo</span>
                  </div>
                )}
              </div>
              {logoPreview && (
                <span className="absolute -top-2 -right-2 bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow">
                  Prévia
                </span>
              )}
            </div>

            <div className="flex-1 space-y-3 w-full text-center sm:text-left">
              <div>
                <p className="font-semibold text-sm">Logo Oficial da Loja</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Formatos suportados: <strong>PNG, JPG, JPEG</strong>. Recomenda-se imagem quadrada (ex: 500x500px).
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 justify-center sm:justify-start">
                <Label 
                  htmlFor="logo-file-input" 
                  className="cursor-pointer"
                >
                  <div className="h-9 px-4 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-2 text-xs font-semibold shadow-sm">
                    <Upload className="w-4 h-4" />
                    {currentLogoDisplay ? "Substituir Logo" : "Enviar Logo"}
                  </div>
                  <input
                    id="logo-file-input"
                    type="file"
                    accept="image/png, image/jpeg, image/jpg"
                    className="hidden"
                    onChange={handleLogoFileSelect}
                  />
                </Label>

                {logoFile && (
                  <Button 
                    onClick={handleSaveLogo} 
                    disabled={uploadingLogo}
                    size="sm"
                    className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {uploadingLogo ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Confirmar e Salvar Logo
                      </>
                    )}
                  </Button>
                )}

                {logoPreview && !uploadingLogo && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setLogoFile(null);
                      setLogoPreview(null);
                    }}
                    className="text-xs text-muted-foreground"
                  >
                    Cancelar Prévia
                  </Button>
                )}

                {restaurant?.logo && !logoPreview && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRemoveLogo}
                    disabled={removingLogo}
                    className="text-xs text-destructive border-destructive/30 hover:bg-destructive/10 gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {removingLogo ? "Removendo..." : "Remover Logo"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2. DADOS DA LOJA */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Store className="w-5 h-5 text-primary" /> Perfil da Loja & Localização
          </CardTitle>
          <CardDescription>
            Configure os dados principais do seu estabelecimento, horário e endereço no mapa.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Nome da loja *</Label>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Nome do estabelecimento" />
          </div>
          <div className="space-y-2">
            <Label>Endereço</Label>
            <Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="Rua, número, bairro" />
          </div>

          {/* Location Map */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <MapPin className="w-4 h-4" /> Localização no Mapa
              </Label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const types: (keyof typeof MAP_LAYERS)[] = ["streets", "satellite"];
                  const next = types[(types.indexOf(mapType) + 1) % types.length];
                  setMapType(next);
                }}
                className="gap-1 text-xs h-7"
              >
                <Layers className="w-3 h-3" />
                {mapType === "streets" ? "OSM" : "Satélite"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Clique no mapa ou arraste o marcador para definir a posição exata da sua loja. Isso garante precisão nos cálculos de entrega.
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={handleUseGPS} disabled={gpsLoading}>
                <Navigation className="w-4 h-4 mr-1" />
                {gpsLoading ? "Buscando..." : "Usar meu GPS"}
              </Button>
            </div>
            <div
              ref={mapContainerRef}
              className="w-full h-[250px] rounded-lg border border-border overflow-hidden z-0"
            />
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Latitude</Label>
                <Input
                  value={form.latitude}
                  onChange={(e) => {
                    setForm(f => ({ ...f, latitude: e.target.value }));
                    const lat = parseFloat(e.target.value);
                    const lng = parseFloat(form.longitude);
                    if (!isNaN(lat) && !isNaN(lng)) updateMarkerPosition(lat, lng);
                  }}
                  placeholder="-15.5454"
                  className="text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Longitude</Label>
                <Input
                  value={form.longitude}
                  onChange={(e) => {
                    setForm(f => ({ ...f, longitude: e.target.value }));
                    const lat = parseFloat(form.latitude);
                    const lng = parseFloat(e.target.value);
                    if (!isNaN(lat) && !isNaN(lng)) updateMarkerPosition(lat, lng);
                  }}
                  placeholder="-46.6333"
                  className="text-xs"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Tempo de entrega</Label>
              <Input value={form.delivery_time} onChange={(e) => setForm((f) => ({ ...f, delivery_time: e.target.value }))} placeholder="30-45 min" />
            </div>
            <div className="space-y-2">
              <Label>Taxa de entrega (R$)</Label>
              <Input type="number" step="0.01" min="0" value={form.delivery_fee} onChange={(e) => setForm((f) => ({ ...f, delivery_fee: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Pedido mínimo (R$)</Label>
              <Input type="number" step="0.01" min="0" value={form.min_order} onChange={(e) => setForm((f) => ({ ...f, min_order: e.target.value }))} />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Switch checked={form.is_open} onCheckedChange={(v) => setForm((f) => ({ ...f, is_open: v }))} />
              <Label>{form.is_open ? "Aberto" : "Fechado"}</Label>
            </div>
          </div>
          <Button onClick={handleSaveStoreInfo} disabled={saving} className="w-full">
            <Save className="w-4 h-4 mr-2" /> {saving ? "Salvando..." : "Salvar Alterações da Loja"}
          </Button>
        </CardContent>
      </Card>

      {/* 3. TROCA DE SENHA */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-primary" /> Alterar Senha de Acesso
          </CardTitle>
          <CardDescription>
            Atualize sua senha de acesso para manter sua conta do Painel da Loja segura.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current-password">Senha Atual *</Label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="current-password"
                  type={showCurrentPassword ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Sua senha atual"
                  className="pl-9 pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">Nova Senha *</Label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="new-password"
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="pl-9 pr-10"
                    minLength={6}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirmar Nova Senha *</Label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="confirm-password"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repita a nova senha"
                    className="pl-9 pr-10"
                    minLength={6}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            <Button type="submit" disabled={passwordLoading} className="w-full sm:w-auto">
              <KeyRound className="w-4 h-4 mr-2" />
              {passwordLoading ? "Atualizando senha..." : "Alterar Senha"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default StoreInfoTab;
