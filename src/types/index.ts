import { Tables } from "@/integrations/supabase/types";

export type Category = Tables<"categories">;
export type Restaurant = Tables<"restaurants">;
export type Product = Tables<"products">;
export type Order = Tables<"orders">;
export type Profile = Tables<"profiles">;

export interface CartItem {
  product: Product;
  quantity: number;
  notes?: string;
}
