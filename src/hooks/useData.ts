import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useCategories = () =>
  useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .order("sort_order");
      if (error) {
        console.warn("[useCategories] Erro ao buscar categorias:", error);
        return [];
      }
      return data ?? [];
    },
  });

const RESTAURANT_PUBLIC_COLUMNS =
  "id,name,image,logo,address,latitude,longitude,category_id,category_name,rating,delivery_time,delivery_fee,min_order,distance,is_open,is_featured,created_at,updated_at";

export const useRestaurants = () =>
  useQuery({
    queryKey: ["restaurants"],
    queryFn: async () => {
      // Tenta consultar a view pública de restaurantes
      const { data, error } = await (supabase as any)
        .from("restaurants_public")
        .select(RESTAURANT_PUBLIC_COLUMNS)
        .order("name");

      if (!error && data) {
        return data.map((r: any) => ({ ...r, owner_id: r.owner_id ?? "" }));
      }

      // Se a view não existir ou retornar erro, consulta a tabela restaurants diretamente
      const fallbackRes = await supabase
        .from("restaurants")
        .select("*")
        .order("name");

      if (fallbackRes.error) {
        console.warn("[useRestaurants] Erro ao buscar restaurantes:", fallbackRes.error);
        return [];
      }

      return (fallbackRes.data ?? []).map((r: any) => ({ ...r, owner_id: r.owner_id ?? "" }));
    },
  });

export const useRestaurant = (id: string) =>
  useQuery({
    queryKey: ["restaurant", id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("restaurants_public")
        .select(RESTAURANT_PUBLIC_COLUMNS)
        .eq("id", id)
        .maybeSingle();

      if (!error && data) {
        return { ...(data as any), owner_id: (data as any)?.owner_id ?? "" };
      }

      const fallbackRes = await supabase
        .from("restaurants")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (fallbackRes.error || !fallbackRes.data) {
        return null;
      }

      return { ...(fallbackRes.data as any), owner_id: (fallbackRes.data as any)?.owner_id ?? "" };
    },
    enabled: !!id,
  });

export const useProducts = (restaurantId: string) =>
  useQuery({
    queryKey: ["products", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .eq("is_available", true)
        .order("sort_order");
      if (error) {
        console.warn("[useProducts] Erro ao buscar produtos:", error);
        return [];
      }
      return data ?? [];
    },
    enabled: !!restaurantId,
  });

