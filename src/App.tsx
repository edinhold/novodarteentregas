import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { CartProvider } from "@/contexts/CartContext";
import { AuthProvider } from "@/contexts/AuthContext";

import Index from "./pages/Index";
import RestaurantDetail from "./pages/RestaurantDetail";
import Cart from "./pages/Cart";
import Checkout from "./pages/Checkout";
import Auth from "./pages/Auth";
import AdminLogin from "./pages/admin/AdminLogin";
import AdminDashboard from "./pages/admin/AdminDashboard";
import FinanceiroPage from "./pages/admin/Financeiro";
import StoreOwnerPanel from "./pages/StoreOwnerPanel";
import DriverPanel from "./pages/DriverPanel";

import RegisterDriver from "./pages/register/RegisterDriver";
import RegisterStoreOwner from "./pages/register/RegisterStoreOwner";
import Install from "./pages/Install";
import OrderTracking from "./pages/OrderTracking";
import NotFound from "./pages/NotFound";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import RouteRestorer from "./components/RouteRestorer";
import SplashScreen from "./components/SplashScreen";
import UpdatePrompt from "./components/UpdatePrompt";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <CartProvider>
          <Toaster />
          <SplashScreen />
          <UpdatePrompt />
          <Sonner />
          <BrowserRouter>
            <RouteRestorer />

            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/restaurant/:id" element={<RestaurantDetail />} />
              <Route path="/cart" element={<Cart />} />
              <Route path="/checkout" element={<Checkout />} />
              <Route path="/auth" element={<Auth />} />
              
              <Route path="/cadastro/entregador" element={<RegisterDriver />} />
              <Route path="/cadastro/lojista" element={<RegisterStoreOwner />} />
              <Route path="/admin/login" element={<AdminLogin />} />
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/financeiro" element={<FinanceiroPage />} />
              <Route path="/lojista" element={<StoreOwnerPanel />} />
              <Route path="/entregador" element={<DriverPanel />} />
              <Route path="/pedido/:id/rastreio" element={<OrderTracking />} />
              <Route path="/instalar" element={<Install />} />
              <Route path="/privacidade" element={<PrivacyPolicy />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </CartProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
