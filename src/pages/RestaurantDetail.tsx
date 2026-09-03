import { useParams, useNavigate } from "react-router-dom";
import { useRestaurant, useProducts } from "@/hooks/useData";
import { useCart } from "@/contexts/CartContext";
import CartFloatingBar from "@/components/CartFloatingBar";
import { ArrowLeft, Star, Clock, MapPin, Plus, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { useMemo } from "react";
import { Product } from "@/types";

const RestaurantDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addItem, removeItem, items } = useCart();

  const { data: restaurant, isLoading: loadingRestaurant } = useRestaurant(id || "");
  const { data: menuItems = [] } = useProducts(id || "");

  const grouped = useMemo(() => {
    const groups: Record<string, Product[]> = {};
    menuItems.forEach((item) => {
      if (!groups[item.category]) groups[item.category] = [];
      groups[item.category].push(item);
    });
    return groups;
  }, [menuItems]);

  if (loadingRestaurant) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  if (!restaurant) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Restaurante não encontrado</p>
      </div>
    );
  }

  const getQuantity = (productId: string) =>
    items.find((i) => i.product.id === productId)?.quantity || 0;

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="relative h-48 bg-muted">
        <img src={restaurant.image || "/placeholder.svg"} alt={restaurant.name} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-foreground/70 to-transparent" />
        <button onClick={() => navigate(-1)} className="absolute top-4 left-4 bg-card/80 backdrop-blur-sm rounded-full p-2">
          <ArrowLeft className="w-5 h-5" />
        </button>
      </div>

      <div className="px-4 -mt-8 relative max-w-2xl mx-auto">
        <div className="bg-card rounded-2xl p-4 shadow-lg border border-border/50">
          <h1 className="text-xl font-extrabold">{restaurant.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">{restaurant.category_name}</p>
          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-1 text-secondary font-semibold">
              <Star className="w-4 h-4 fill-secondary" /> {restaurant.rating}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-4 h-4" /> {restaurant.delivery_time}
            </span>
            <span className="flex items-center gap-1">
              <MapPin className="w-4 h-4" /> {restaurant.distance}
            </span>
          </div>
          <p className="text-sm mt-2">
            Entrega: <span className="font-semibold">R$ {Number(restaurant.delivery_fee).toFixed(2)}</span>
            {" • "}Pedido mín: <span className="font-semibold">R$ {Number(restaurant.min_order).toFixed(2)}</span>
          </p>
        </div>
      </div>

      <div className="px-4 mt-6 space-y-6 max-w-2xl mx-auto">
        {Object.entries(grouped).map(([category, products]) => (
          <section key={category}>
            <h2 className="text-lg font-bold mb-3">{category}</h2>
            <div className="space-y-3">
              {products.map((product, i) => {
                const qty = getQuantity(product.id);
                return (
                  <motion.div
                    key={product.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="bg-card rounded-xl p-3 flex gap-3 border border-border/50"
                  >
                    <img src={product.image || "/placeholder.svg"} alt={product.name} className="w-20 h-20 rounded-lg object-cover flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-sm">{product.name}</h3>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{product.description}</p>
                      <div className="flex items-center justify-between mt-2">
                        <span className="font-extrabold text-sm">R$ {Number(product.price).toFixed(2)}</span>
                        <div className="flex items-center gap-2">
                          {qty > 0 && (
                            <>
                              <Button size="icon" variant="outline" className="h-7 w-7 rounded-full" onClick={() => removeItem(product.id)}>
                                <Minus className="w-3 h-3" />
                              </Button>
                              <span className="text-sm font-bold w-5 text-center">{qty}</span>
                            </>
                          )}
                          <Button size="icon" className="h-7 w-7 rounded-full bg-primary" onClick={() => addItem(product)}>
                            <Plus className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <CartFloatingBar />
    </div>
  );
};

export default RestaurantDetail;
