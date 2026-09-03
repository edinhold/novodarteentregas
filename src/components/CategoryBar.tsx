import { Category } from "@/types";
import { motion } from "framer-motion";

interface CategoryBarProps {
  categories: Category[];
  selected: string | null;
  onSelect: (id: string | null) => void;
}

const CategoryBar = ({ categories, selected, onSelect }: CategoryBarProps) => {
  const safeCategories = Array.isArray(categories) ? categories : [];
  if (safeCategories.length === 0) return null;
  return (
    <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide px-1">
      {safeCategories.map((cat, i) => (
        <motion.button
          key={cat.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
          onClick={() => onSelect(selected === cat.id ? null : cat.id)}
          className={`flex flex-col items-center gap-1.5 min-w-[72px] py-3 px-2 rounded-2xl transition-all ${
            selected === cat.id
              ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30"
              : "bg-card hover:bg-muted"
          }`}
        >
          <span className="text-2xl">{cat.icon}</span>
          <span className="text-xs font-semibold whitespace-nowrap">{cat.name}</span>
        </motion.button>
      ))}
    </div>
  );
};

export default CategoryBar;
