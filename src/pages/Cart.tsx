import { useCart } from "@/contexts/CartContext";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRestaurant } from "@/hooks/useData";
import { motion } from "framer-motion";

const Cart = () => {
  const { items, total, updateQuantity, removeItem, clearCart, restaurantId } = useCart();
  const navigate = useNavigate();

  const { data: restaurant } = useRestaurant(restaurantId || "");
  const deliveryFee = restaurant ? Number(restaurant.delivery_fee) : 0;

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <span className="text-6xl mb-4">🛒</span>
        <h1 className="text-xl font-bold mb-2">Seu carrinho está vazio</h1>
        <p className="text-muted-foreground text-sm mb-4">Adicione itens de um restaurante</p>
        <Button onClick={() => navigate("/")} className="rounded-xl">Ver restaurantes</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-32">
      <header className="bg-card border-b px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => navigate(-1)}><ArrowLeft className="w-5 h-5" /></button>
        <h1 className="font-bold text-lg">Carrinho</h1>
        <button onClick={clearCart} className="ml-auto text-destructive text-sm font-semibold">Limpar</button>
      </header>

      {restaurant && (
        <div className="px-4 py-3 bg-card border-b">
          <p className="text-sm font-semibold">{restaurant.name}</p>
          <p className="text-xs text-muted-foreground">{restaurant.delivery_time} • {restaurant.distance}</p>
        </div>
      )}

      <div className="px-4 mt-4 space-y-3 max-w-2xl mx-auto">
        {items.map((item, i) => (
          <motion.div key={item.product.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="bg-card rounded-xl p-3 flex gap-3 border border-border/50">
            <img src={item.product.image || "/placeholder.svg"} alt={item.product.name} className="w-16 h-16 rounded-lg object-cover" />
            <div className="flex-1">
              <h3 className="font-bold text-sm">{item.product.name}</h3>
              <p className="text-sm font-extrabold mt-1">R$ {(Number(item.product.price) * item.quantity).toFixed(2)}</p>
              <div className="flex items-center gap-2 mt-2">
                <Button size="icon" variant="outline" className="h-7 w-7 rounded-full" onClick={() => updateQuantity(item.product.id, item.quantity - 1)}>
                  <Minus className="w-3 h-3" />
                </Button>
                <span className="text-sm font-bold w-5 text-center">{item.quantity}</span>
                <Button size="icon" variant="outline" className="h-7 w-7 rounded-full" onClick={() => updateQuantity(item.product.id, item.quantity + 1)}>
                  <Plus className="w-3 h-3" />
                </Button>
                <button onClick={() => removeItem(item.product.id)} className="ml-auto text-destructive">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-card border-t p-4 max-w-2xl mx-auto">
        <div className="space-y-1 text-sm mb-3">
          <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>R$ {total.toFixed(2)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Taxa de entrega</span><span>R$ {deliveryFee.toFixed(2)}</span></div>
          <div className="flex justify-between font-extrabold text-base pt-1 border-t"><span>Total</span><span>R$ {(total + deliveryFee).toFixed(2)}</span></div>
        </div>
        <Button className="w-full rounded-xl h-12 text-base font-bold" onClick={() => navigate("/checkout")}>Finalizar Pedido</Button>
      </div>
    </div>
  );
};

export default Cart;
