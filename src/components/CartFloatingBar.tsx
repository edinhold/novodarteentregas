import { useCart } from "@/contexts/CartContext";
import { ShoppingBag } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";

const CartFloatingBar = () => {
  const { itemCount, total } = useCart();
  const navigate = useNavigate();

  return (
    <AnimatePresence>
      {itemCount > 0 && (
        <motion.button
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          onClick={() => navigate("/cart")}
          className="fixed bottom-4 left-4 right-4 max-w-lg mx-auto bg-primary text-primary-foreground rounded-2xl p-4 flex items-center justify-between shadow-2xl shadow-primary/40 z-50 hover:brightness-110 transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="bg-primary-foreground/20 rounded-xl p-2">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <span className="font-bold">{itemCount} {itemCount === 1 ? "item" : "itens"}</span>
          </div>
          <span className="font-extrabold text-lg">R$ {total.toFixed(2)}</span>
        </motion.button>
      )}
    </AnimatePresence>
  );
};

export default CartFloatingBar;
