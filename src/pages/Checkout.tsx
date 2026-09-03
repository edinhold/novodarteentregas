import { useCart } from "@/contexts/CartContext";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useRestaurant } from "@/hooks/useData";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, MapPin, CreditCard, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { toast } from "sonner";

const Checkout = () => {
  const { items, total, clearCart, restaurantId } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isProcessing, setIsProcessing] = useState(false);
  const [address, setAddress] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("PIX");

  const { data: restaurant } = useRestaurant(restaurantId || "");
  const deliveryFee = restaurant ? Number(restaurant.delivery_fee) : 0;

  const handleOrder = async () => {
    if (!user) {
      toast.error("Faça login para realizar o pedido");
      navigate("/auth");
      return;
    }
    if (!restaurantId) return;

    setIsProcessing(true);
    try {
      const { data: orderId, error } = await supabase.rpc("place_order", {
        p_restaurant_id: restaurantId,
        p_items: items.map((i) => ({ product_id: i.product.id, quantity: i.quantity })),
        p_address: address,
        p_payment_method: paymentMethod,
        p_notes: null,
      });
      if (error) throw error;
      const orderData = { id: orderId as unknown as string };
      toast.success("Pedido realizado com sucesso! 🎉");
      clearCart();
      navigate(`/pedido/${orderData.id}/rastreio`);
    } catch (error: any) {
      toast.error(error.message || "Erro ao criar pedido");
    } finally {
      setIsProcessing(false);
    }
  };

  if (items.length === 0) {
    navigate("/");
    return null;
  }

  return (
    <div className="min-h-screen bg-background pb-32">
      <header className="bg-card border-b px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => navigate(-1)}><ArrowLeft className="w-5 h-5" /></button>
        <h1 className="font-bold text-lg">Finalizar Pedido</h1>
      </header>

      <div className="px-4 mt-4 space-y-4 max-w-2xl mx-auto">
        <div className="bg-card rounded-xl p-4 border border-border/50">
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="w-5 h-5 text-primary" />
            <h2 className="font-bold">Endereço de entrega</h2>
          </div>
          <Input placeholder="Rua, número, bairro" value={address} onChange={(e) => setAddress(e.target.value)} className="rounded-lg" />
        </div>

        <div className="bg-card rounded-xl p-4 border border-border/50">
          <div className="flex items-center gap-2 mb-3">
            <CreditCard className="w-5 h-5 text-primary" />
            <h2 className="font-bold">Pagamento</h2>
          </div>
          <div className="space-y-2">
            {["Cartão de Crédito", "Cartão de Débito", "PIX", "Dinheiro"].map((method) => (
              <label key={method} className="flex items-center gap-3 p-3 rounded-lg border border-border/50 hover:bg-muted cursor-pointer">
                <input type="radio" name="payment" className="accent-primary" checked={paymentMethod === method} onChange={() => setPaymentMethod(method)} />
                <span className="text-sm font-medium">{method}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="bg-card rounded-xl p-4 border border-border/50">
          <h2 className="font-bold mb-3">Resumo</h2>
          {items.map((item) => (
            <div key={item.product.id} className="flex justify-between text-sm py-1">
              <span>{item.quantity}x {item.product.name}</span>
              <span>R$ {(Number(item.product.price) * item.quantity).toFixed(2)}</span>
            </div>
          ))}
          <div className="border-t mt-2 pt-2 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>R$ {total.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Entrega</span><span>R$ {deliveryFee.toFixed(2)}</span></div>
            <div className="flex justify-between font-extrabold text-base pt-1 border-t"><span>Total</span><span>R$ {(total + deliveryFee).toFixed(2)}</span></div>
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-card border-t p-4 max-w-2xl mx-auto">
        <Button className="w-full rounded-xl h-12 text-base font-bold" onClick={handleOrder} disabled={isProcessing}>
          {isProcessing ? (
            <span className="flex items-center gap-2"><span className="animate-spin">⏳</span> Processando...</span>
          ) : (
            <span className="flex items-center gap-2"><Check className="w-5 h-5" /> Confirmar Pedido</span>
          )}
        </Button>
      </div>
    </div>
  );
};

export default Checkout;
