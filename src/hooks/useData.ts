import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useCategories = () =>
  useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("categories")
          .select("*")
          .order("sort_order");
        if (error) {
          console.error("[useCategories] error:", error);
          return [];
        }
        return data ?? [];
      } catch (err) {
        console.error("[useCategories] exception:", err);
        return [];
      }
    },
  });

const RESTAURANT_PUBLIC_COLUMNS =
  "id,name,image,logo,address,latitude,longitude,category_id,category_name,rating,delivery_time,delivery_fee,min_order,distance,is_open,is_featured,created_at,updated_at";

export const useRestaurants = () =>
  useQuery({
    queryKey: ["restaurants"],
    queryFn: async () => {
      try {
        const { data, error } = await (supabase as any)
          .from("restaurants_public")
          .select(RESTAURANT_PUBLIC_COLUMNS)
          .order("name");
        if (error) {
          console.error("[useRestaurants] error:", error);
          return [];
        }
        return (data ?? []).map((r: any) => ({ ...r, owner_id: r.owner_id ?? "" }));
      } catch (err) {
        console.error("[useRestaurants] exception:", err);
        return [];
      }
    },
  });

export const useRestaurant = (id: string) =>
  useQuery({
    queryKey: ["restaurant", id],
    queryFn: async () => {
      if (!id) return null;
      try {
        const { data, error } = await (supabase as any)
          .from("restaurants_public")
          .select(RESTAURANT_PUBLIC_COLUMNS)
          .eq("id", id)
          .maybeSingle();
        if (error) {
          console.error("[useRestaurant] error:", error);
          return null;
        }
        return data ? { ...(data as any), owner_id: (data as any)?.owner_id ?? "" } : null;
      } catch (err) {
        console.error("[useRestaurant] exception:", err);
        return null;
      }
    },
    enabled: !!id,
  });

export const useProducts = (restaurantId: string) =>
  useQuery({
    queryKey: ["products", restaurantId],
    queryFn: async () => {
      if (!restaurantId) return [];
      try {
        const { data, error } = await supabase
          .from("products")
          .select("*")
          .eq("restaurant_id", restaurantId)
          .eq("is_available", true)
          .order("sort_order");
        if (error) {
          console.error("[useProducts] error:", error);
          return [];
        }
        return data ?? [];
      } catch (err) {
        console.error("[useProducts] exception:", err);
        return [];
      }
    },
    enabled: !!restaurantId,
  });
