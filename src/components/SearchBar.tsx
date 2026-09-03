import { Search, MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";

interface SearchBarProps {
  value: string;
  onChange: (v: string) => void;
}

const SearchBar = ({ value, onChange }: SearchBarProps) => {
  return (
    <div className="space-y-3">
      <button className="flex items-center gap-2 text-sm text-primary font-semibold">
        <MapPin className="w-4 h-4" />
        <span>Rua Exemplo, 123 - Centro</span>
      </button>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar restaurantes ou pratos..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="pl-10 rounded-xl bg-card border-border/50 h-11"
        />
      </div>
    </div>
  );
};

export default SearchBar;
