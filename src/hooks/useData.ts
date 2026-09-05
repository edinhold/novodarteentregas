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
      if (error) throw error;
      return data;
    },
  });

const RESTAURANT_PUBLIC_COLUMNS =
  "id,name,image,logo,address,latitude,longitude,category_id,category_name,rating,delivery_time,delivery_fee,min_order,distance,is_open,is_featured,created_at,updated_at";

export const useRestaurants = () =>
  useQuery({
    queryKey: ["restaurants"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("restaurants_public")
        .select(RESTAURANT_PUBLIC_COLUMNS)
        .order("name");
      if (error) throw error;
      return (data ?? []).map((r: any) => ({ ...r, owner_id: r.owner_id ?? "" }));
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
        .single();
      if (error) throw error;
      return { ...(data as any), owner_id: (data as any)?.owner_id ?? "" };
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
      if (error) throw error;
      return data;
    },
    enabled: !!restaurantId,
  });
