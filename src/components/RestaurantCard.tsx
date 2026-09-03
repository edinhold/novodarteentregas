import { Restaurant } from "@/types";
import { Star, Clock, MapPin } from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";

const RestaurantCard = ({ restaurant }: { restaurant: Restaurant }) => {
  const navigate = useNavigate();

  return (
    <motion.div
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => navigate(`/restaurant/${restaurant.id}`)}
      className="bg-card rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-shadow cursor-pointer border border-border/50"
    >
      <div className="relative h-36 bg-muted overflow-hidden">
        <img src={restaurant.image || "/placeholder.svg"} alt={restaurant.name} className="w-full h-full object-cover" />
        {!restaurant.is_open && (
          <div className="absolute inset-0 bg-foreground/60 flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm bg-destructive px-3 py-1 rounded-full">Fechado</span>
          </div>
        )}
        {restaurant.is_featured && (
          <span className="absolute top-2 left-2 bg-secondary text-secondary-foreground text-xs font-bold px-2 py-1 rounded-full">
            Destaque
          </span>
        )}
      </div>
      <div className="p-3">
        <h3 className="font-bold text-sm truncate">{restaurant.name}</h3>
        <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-0.5 text-secondary font-semibold">
            <Star className="w-3.5 h-3.5 fill-secondary" /> {restaurant.rating}
          </span>
          <span className="flex items-center gap-0.5">
            <Clock className="w-3 h-3" /> {restaurant.delivery_time}
          </span>
          <span className="flex items-center gap-0.5">
            <MapPin className="w-3 h-3" /> {restaurant.distance}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {restaurant.delivery_fee === 0 ? (
            <span className="text-accent font-semibold">Entrega grátis</span>
          ) : (
            `R$ ${Number(restaurant.delivery_fee).toFixed(2)}`
          )}
          {" • "}Pedido mín. R$ {Number(restaurant.min_order).toFixed(2)}
        </p>
      </div>
    </motion.div>
  );
};

export default RestaurantCard;
