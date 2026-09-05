import { useState, useMemo, useEffect, useRef } from "react";
import logoDuarte from "@/assets/logo-duarte.jpeg";
import { useNavigate } from "react-router-dom";
import { useCategories, useRestaurants } from "@/hooks/useData";
import { useAuth } from "@/contexts/AuthContext";
import CategoryBar from "@/components/CategoryBar";
import RestaurantCard from "@/components/RestaurantCard";
import RestaurantMap from "@/components/RestaurantMap";
import MapErrorBoundary from "@/components/MapErrorBoundary";
import SearchBar from "@/components/SearchBar";
import CartFloatingBar from "@/components/CartFloatingBar";
import WhatsAppButton from "@/components/WhatsAppButton";
import { Button } from "@/components/ui/button";
import { User, LogOut, Map, List, Download } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import { motion } from "framer-motion";
import logoDuarteFull from "@/assets/logo-duarte-full.jpeg";

const ROLE_HOME: Record<string, string> = {
  admin: "/admin",
  store_owner: "/lojista",
  driver: "/entregador",
};

const Index = () => {
  const navigate = useNavigate();
  const { user, signOut, loading, role, roleLoading } = useAuth();
  const redirectedRef = useRef(false);

  // Redirecionamento ÚNICO para o painel correspondente.
  // Só ocorre depois que a sessão e a role foram carregadas, e apenas
  // uma vez por sessão do navegador (evita loop ao voltar para a home).
  useEffect(() => {
    if (loading || roleLoading) return;
    if (!user || !role) return;
    if (redirectedRef.current) return;

    const alreadyRedirected = sessionStorage.getItem("authRedirectDone") === user.id;
    const target = ROLE_HOME[role];
    if (!target || alreadyRedirected) return;

    redirectedRef.current = true;
    sessionStorage.setItem("authRedirectDone", user.id);
    console.log("[Auth] Redirect:", target);
    navigate(target, { replace: true });
  }, [loading, roleLoading, user, role, navigate]);

  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(true);
  const deferredPromptRef = useRef<any>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(standalone);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      deferredPromptRef.current = e;
      setCanInstall(true);
    };
    const onInstalled = () => {
      setIsInstalled(true);
      setCanInstall(false);
      deferredPromptRef.current = null;
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const handleInstallClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const prompt = deferredPromptRef.current;
    if (prompt) {
      setInstalling(true);
      try {
        await prompt.prompt();
        await prompt.userChoice;
      } catch (err) {
        console.error("Install prompt error:", err);
      } finally {
        deferredPromptRef.current = null;
        setCanInstall(false);
        setInstalling(false);
      }
      return;
    }
    navigate("/instalar");
  };

  const { data: categories = [] } = useCategories();
  const { data: restaurants = [] } = useRestaurants();

  const filtered = useMemo(() => {
    let list = restaurants;
    if (selectedCategory) {
      list = list.filter((r) => r.category_id === selectedCategory);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((r) => r.name.toLowerCase().includes(q) || r.category_name.toLowerCase().includes(q));
    }
    return list;
  }, [search, selectedCategory, restaurants]);

  const featured = restaurants.filter((r) => r.is_featured && r.is_open);

  if (loading || (user && roleLoading)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-sm text-muted-foreground">Carregando seu painel...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="bg-primary text-primary-foreground px-4 pt-10 pb-6 rounded-b-3xl">
        <div className="flex items-center justify-between mb-4">
          <img src={logoDuarte} alt="Duarte Delivery" className="h-10 object-contain" />
          <div className="flex items-center gap-1">
            <ThemeToggle />
            {user ? (
              <Button size="icon" variant="ghost" className="text-primary-foreground hover:bg-primary-foreground/20 rounded-full" onClick={signOut}>
                <LogOut className="w-5 h-5" />
              </Button>
            ) : (
              <Button variant="ghost" className="text-primary-foreground hover:bg-primary-foreground/20 rounded-full" onClick={() => navigate("/auth")}>
                <User className="w-5 h-5 mr-1" /> Entrar
              </Button>
            )}
          </div>
        </div>
        <SearchBar value={search} onChange={setSearch} />
      </header>

      <div className="px-4 mt-5 space-y-6 max-w-2xl mx-auto">
        {/* Install App Banner */}
        {!isInstalled && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-card border border-border/50 rounded-2xl p-4 flex items-center gap-4 cursor-pointer shadow-sm hover:shadow-md transition-shadow"
            onClick={() => navigate("/instalar")}
          >
            <img src={logoDuarteFull} alt="Duarte Delivery" className="h-12 object-contain" />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm">Instale o app Duarte Delivery</p>
              <p className="text-xs text-muted-foreground">
                {canInstall ? "Toque em Instalar para adicionar agora" : "Acesse direto da tela inicial do seu celular"}
              </p>
            </div>
            <Button
              size="sm"
              className="rounded-xl shrink-0 gap-1"
              onClick={handleInstallClick}
              disabled={installing}
            >
              <Download className="w-4 h-4" />
              {installing ? "Instalando..." : canInstall ? "Instalar" : "Como instalar"}
            </Button>
          </motion.div>
        )}

        <section>
          <h2 className="text-lg font-bold mb-3">Categorias</h2>
          <CategoryBar categories={categories} selected={selectedCategory} onSelect={setSelectedCategory} />
        </section>

        {!search && !selectedCategory && featured.length > 0 && (
          <section>
            <h2 className="text-lg font-bold mb-3">Destaques</h2>
            <div className="flex gap-4 overflow-x-auto pb-2">
              {featured.map((r, i) => (
                <motion.div key={r.id} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }} className="min-w-[260px]">
                  <RestaurantCard restaurant={r} />
                </motion.div>
              ))}
            </div>
          </section>
        )}

        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold">
              {selectedCategory ? categories.find((c) => c.id === selectedCategory)?.name : "Lojistas"}
            </h2>
            <Button size="sm" variant="outline" className="rounded-xl gap-1.5" onClick={() => setShowMap(!showMap)}>
              {showMap ? <List className="w-4 h-4" /> : <Map className="w-4 h-4" />}
              {showMap ? "Lista" : "Mapa"}
            </Button>
          </div>

          {showMap ? (
            <div className="h-[400px] rounded-2xl overflow-hidden border border-border/50">
              <MapErrorBoundary key={restaurants.length} fallbackHeight="400px">
                <RestaurantMap restaurants={restaurants} />
              </MapErrorBoundary>
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Nenhum lojista encontrado</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filtered.map((r, i) => (
                <motion.div key={r.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                  <RestaurantCard restaurant={r} />
                </motion.div>
              ))}
            </div>
          )}
        </section>

        <footer className="pt-6 mt-4 border-t border-border/50 text-center text-sm text-muted-foreground">
          <button
            onClick={() => navigate("/privacidade")}
            className="underline hover:text-primary transition-colors"
          >
            Políticas de Privacidade
          </button>
          <span className="mx-2">•</span>
          <span>© {new Date().getFullYear()} Duarte Entregas</span>
        </footer>
      </div>

      <WhatsAppButton />
      <CartFloatingBar />
    </div>
  );
};

export default Index;
