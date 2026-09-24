import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Star, UserPlus, Trash2, Search, Code, User, BadgeCheck, Plus, Circle } from "lucide-react";
import { useDriverLocations } from "@/hooks/useDriverLocations";
import { DriverPhoto } from "@/components/DriverPhoto";
import ReassignDriverTab from "./ReassignDriverTab";

interface FavoritesTabProps {
  restaurant: any;
  userId?: string;
}

const FavoritesTab = ({ restaurant, userId }: FavoritesTabProps) => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState<string | null>(null);
  const { data: driverLocations = [] } = useDriverLocations();

  const { data: favorites = [], isLoading } = useQuery({
    queryKey: ["favorite-drivers", restaurant?.id],
    queryFn: async () => {
      if (!restaurant?.id) return [];
      const { data, error } = await supabase
        .from("store_driver_favorites")
        .select(`
          id,
          driver_id,
          is_default,
          driver:drivers(id, user_id, full_name, driver_code, phone, is_active, photo_url)
        `)
        .eq("restaurant_id", restaurant.id);
      
      if (error) {
        console.error("Error fetching favorites:", error);
        return [];
      }
      return data;
    },
    enabled: !!restaurant?.id,
  });

  // Load all active drivers (via SECURITY DEFINER RPC accessible to store_owners)
  const { data: allDrivers = [] } = useQuery({
    queryKey: ["radar-drivers-favorites"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_radar_drivers");
      if (error) {
        console.error("Error loading drivers:", error);
        return [];
      }
      return data || [];
    },
  });

  const isDriverOnline = (uidOrDid: string | null | undefined, driverObj?: any) => {
    if (!uidOrDid && !driverObj) return false;
    const uid = uidOrDid || driverObj?.user_id;
    const did = driverObj?.id || driverObj?.driver_id || uidOrDid;

    const inLoc = driverLocations.some((dl: any) => 
      (uid && dl.user_id === uid) || 
      (did && dl.driver_id === did) ||
      (uid && dl.driver_id === uid) ||
      (did && dl.user_id === did)
    );
    if (inLoc) return true;

    if (driverObj?.is_active === true) return true;
    const matchDriver = allDrivers.find((d: any) => (uid && d.user_id === uid) || (did && d.id === did));
    if (matchDriver?.is_active === true) return true;

    return false;
  };

  const availableCandidates = useMemo(() => {
    const term = search.trim().toLowerCase();
    const favIds = new Set(favorites.map((f: any) => f.driver_id));
    
    let list = allDrivers.filter((d: any) => !favIds.has(d.id));

    if (term) {
      list = list.filter((d: any) =>
        (d.full_name || "").toLowerCase().includes(term) ||
        (d.driver_code || "").toLowerCase().includes(term)
      );
    }

    return list.sort((a: any, b: any) => {
      const aOnline = isDriverOnline(a.user_id || a.id, a) ? 1 : 0;
      const bOnline = isDriverOnline(b.user_id || b.id, b) ? 1 : 0;
      return bOnline - aOnline;
    }).slice(0, 10);
  }, [search, allDrivers, favorites, driverLocations]);

  const handleAddFavorite = async (driver: any) => {
    setAdding(driver.id);
    try {
      const { error: insertError } = await supabase
        .from("store_driver_favorites")
        .insert({
          restaurant_id: restaurant.id,
          driver_id: driver.id
        });

      if (insertError) throw insertError;

      toast.success(`${driver.full_name} adicionado aos favoritos!`);
      setSearch("");
      queryClient.invalidateQueries({ queryKey: ["favorite-drivers", restaurant.id] });
    } catch (err: any) {
      console.error("Error adding favorite:", err);
      toast.error("Erro ao adicionar favorito");
    } finally {
      setAdding(null);
    }
  };

  const handleRemoveFavorite = async (id: string, name: string) => {
    try {
      const { error } = await supabase
        .from("store_driver_favorites")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast.success(`${name} removido dos favoritos`);
      queryClient.invalidateQueries({ queryKey: ["favorite-drivers", restaurant.id] });
    } catch (err: any) {
      console.error("Error removing favorite:", err);
      toast.error("Erro ao remover favorito");
    }
  };

  const handleSetDefault = async (favoriteId: string, name: string) => {
    try {
      const { error } = await (supabase as any).rpc("set_default_favorite_driver", { p_favorite_id: favoriteId });
      if (error) throw error;
      toast.success(`${name} definido como favorito padrão`);
      queryClient.invalidateQueries({ queryKey: ["favorite-drivers", restaurant.id] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao definir padrão");
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-primary" />
            Adicionar Entregador Favorito
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="driver-search">Nome ou Código do Entregador</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="driver-search"
                placeholder="Digite o nome ou código (ex: João, ABC123)"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                autoComplete="off"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {search.trim() ? "Resultados da busca por entregadores:" : "Entregadores cadastrados no sistema (Online em destaque):"}
            </p>

            <div className="mt-2 border border-border rounded-lg divide-y divide-border bg-card">
              {availableCandidates.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground text-center">
                  {search.trim() ? "Nenhum entregador encontrado com este termo." : "Nenhum novo entregador disponível para adicionar."}
                </div>
              ) : (
                availableCandidates.map((d: any) => {
                  const online = isDriverOnline(d.user_id || d.id, d);
                  return (
                    <div key={d.id} className="flex items-center justify-between p-3 hover:bg-muted/40">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative shrink-0">
                          <DriverPhoto
                            photoUrl={d.photo_url}
                            driverId={d.user_id || d.id}
                            alt={d.full_name}
                            className="w-9 h-9 rounded-full border border-border object-cover shrink-0"
                          />
                          <span
                            className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card ${online ? "bg-green-500" : "bg-slate-400"}`}
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium truncate">{d.full_name}</p>
                            <Badge
                              className={`text-[9px] py-0 h-3.5 px-1.5 gap-1 border-0 ${online ? "bg-green-500 text-white" : "bg-slate-400 text-white"}`}
                            >
                              <Circle className={`w-1.5 h-1.5 fill-current ${online ? "animate-pulse" : ""}`} />
                              {online ? "Online" : "Offline"}
                            </Badge>
                          </div>
                          <p className="text-[11px] text-muted-foreground">{d.driver_code}</p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleAddFavorite(d)}
                        disabled={adding === d.id}
                        className="gap-1"
                      >
                        <Plus className="w-4 h-4" />
                        {adding === d.id ? "..." : "Adicionar"}
                      </Button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
            Seus Entregadores Favoritos
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center animate-pulse text-muted-foreground">Carregando seus favoritos...</div>
          ) : favorites.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <div className="bg-muted w-12 h-12 rounded-full flex items-center justify-center mx-auto">
                <Star className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">Nenhum entregador favorito adicionado.</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {favorites.map((fav: any) => {
                const isOnline = isDriverOnline(fav.driver?.user_id || fav.driver_id, fav.driver);
                return (
                <div 
                  key={fav.id} 
                  className="flex items-center justify-between p-4 rounded-xl border border-border bg-card hover:border-primary/30 transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <div className="relative shrink-0">
                      <DriverPhoto
                        photoUrl={fav.driver?.photo_url}
                        driverId={fav.driver?.user_id || fav.driver_id}
                        alt={fav.driver?.full_name}
                        className="w-10 h-10 rounded-full border border-border object-cover shrink-0"
                      />
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-card ${isOnline ? "bg-green-500" : "bg-slate-400"}`}
                        title={isOnline ? "Online" : "Offline"}
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm">{fav.driver?.full_name || "Entregador"}</p>
                        <Badge
                          className={`text-[10px] py-0 h-4 gap-1 border-0 ${isOnline ? "bg-green-500 hover:bg-green-500 text-white" : "bg-slate-400 hover:bg-slate-400 text-white"}`}
                        >
                          <Circle className={`w-2 h-2 fill-current ${isOnline ? "animate-pulse" : ""}`} />
                          {isOnline ? "Online" : "Offline"}
                        </Badge>
                        {fav.is_default && (
                          <Badge className="text-[10px] py-0 h-4 gap-1 bg-yellow-500 hover:bg-yellow-500">
                            <Star className="w-2.5 h-2.5 fill-current" /> Padrão
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="outline" className="text-[10px] py-0 h-4 gap-1">
                          <Code className="w-2.5 h-2.5" />
                          {fav.driver?.driver_code || "Sem código"}
                        </Badge>
                        {fav.driver?.phone && (
                          <span className="text-[10px] text-muted-foreground">{fav.driver.phone}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {!fav.is_default && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-yellow-600 hover:text-yellow-700 hover:bg-yellow-500/10 gap-1"
                        onClick={() => handleSetDefault(fav.id, fav.driver?.full_name)}
                      >
                        <BadgeCheck className="w-4 h-4" />
                        <span className="hidden sm:inline text-xs">Padrão</span>
                      </Button>
                    )}
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      onClick={() => handleRemoveFavorite(fav.id, fav.driver?.full_name)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {userId && (
        <div className="pt-2">
          <ReassignDriverTab restaurant={restaurant} userId={userId} />
        </div>
      )}
    </div>
  );
};

export default FavoritesTab;
