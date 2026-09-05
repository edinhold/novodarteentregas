import { useState, useEffect } from "react";
import { playNotificationSound, playUrgentNotification } from "@/lib/notificationSound";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCategories } from "@/hooks/useData";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Store, Package, ShoppingCart, TrendingUp, ArrowLeft, Pencil, Trash2, Truck, Users, Settings, Ticket, DollarSign, ShieldCheck, MessageSquare, KeyRound, UserCheck, Map as MapIcon, ChevronLeft, ChevronRight, PanelLeft, Shield, Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import RestaurantForm from "@/components/admin/RestaurantForm";
import ThemeToggle from "@/components/ThemeToggle";
import ProductForm from "@/components/admin/ProductForm";
import DeleteConfirm from "@/components/admin/DeleteConfirm";
import DriversTab from "@/components/admin/DriversTab";
import StoreOwnersTab from "@/components/admin/StoreOwnersTab";
import FeesConfigTab from "@/components/admin/FeesConfigTab";
import CreditsTab from "@/components/admin/CreditsTab";
import FinancialTab from "@/components/admin/FinancialTab";
import AdminsTab from "@/components/admin/AdminsTab";
import ChatTab from "@/components/admin/ChatTab";
import PasswordResetTab from "@/components/admin/PasswordResetTab";
import CustomersTab from "@/components/admin/CustomersTab";
import PrivacyPolicyTab from "@/components/admin/PrivacyPolicyTab";
import PushTestTab from "@/components/admin/PushTestTab";


import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import GlobalDriverMap from "@/components/GlobalDriverMap";
import RealtimeMonitorTab from "@/components/admin/RealtimeMonitorTab";
import AppSidebar from "@/components/AppSidebar";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { motion } from "framer-motion";

const statusOptions = [
  { value: "pending", label: "Pendente" },
  { value: "confirmed", label: "Confirmado" },
  { value: "preparing", label: "Em preparo" },
  { value: "delivering", label: "A caminho" },
  { value: "delivered", label: "Entregue" },
  { value: "cancelled", label: "Cancelado" },
];

const AdminDashboard = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: categories = [] } = useCategories();
  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("restaurants");
  const isMobile = useIsMobile();

  // Protect admin route
  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/admin/login", { replace: true });
        return;
      }
      const { data: isAdmin, error: roleError } = await supabase.rpc("has_role", {
        _user_id: session.user.id,
        _role: "admin",
      });
      if (roleError) {
        setAuthError("Não foi possível verificar sua permissão. Tente novamente em instantes.");
        toast.error("Erro ao verificar permissão de administrador.");
        return;
      }
      if (!isAdmin) {
        toast.error("Acesso negado. Sua conta não possui permissão de administrador.", {
          description: `Conta: ${session.user.email}`,
          duration: 6000,
        });
        await supabase.auth.signOut();
        navigate("/admin/login", { replace: true });
        return;
      }
      setAuthChecked(true);
    };
    checkAdmin();
  }, [navigate]);

  // Realtime: notify admin on new withdrawal requests
  useEffect(() => {
    if (!authChecked) return;
    const channel = supabase
      .channel("admin-withdrawal-notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "withdrawal_requests" },
        async (payload) => {
          const w = payload.new as any;
          playUrgentNotification();
          // Fetch driver name for richer notification
          let driverName = "Motorista";
          try {
            const { data: drv } = await supabase
              .from("drivers")
              .select("full_name")
              .eq("user_id", w.driver_user_id)
              .maybeSingle();
            if (drv?.full_name) driverName = drv.full_name;
          } catch {
            /* ignore */
          }
          toast.info(`💰 Nova solicitação de saque`, {
            description: `${driverName} solicitou R$ ${Number(w.amount).toFixed(2)} • PIX: ${w.pix_key}`,
            duration: 15000,
          });
          queryClient.invalidateQueries({ queryKey: ["admin-withdrawals"] });
          queryClient.invalidateQueries({ queryKey: ["admin-drivers-financial"] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [authChecked, queryClient]);

  const [restaurantFormOpen, setRestaurantFormOpen] = useState(false);
  const [editingRestaurant, setEditingRestaurant] = useState<any>(null);
  const [deleteRestaurant, setDeleteRestaurant] = useState<any>(null);
  const [deletingRestaurant, setDeletingRestaurant] = useState(false);
  const [productFormOpen, setProductFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [deleteProduct, setDeleteProduct] = useState<any>(null);
  const [deletingProduct, setDeletingProduct] = useState(false);

  const { data: restaurants = [] } = useQuery({
    queryKey: ["admin-restaurants"],
    queryFn: async () => {
      const { data, error } = await supabase.from("restaurants").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["admin-products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*, restaurants(name)").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: orders = [] } = useQuery({
    queryKey: ["admin-orders"],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select("*, restaurants(name)").order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data;
    },
  });

  const handleDeleteRestaurant = async () => {
    if (!deleteRestaurant) return;
    setDeletingRestaurant(true);
    try {
      const { error } = await supabase.from("restaurants").delete().eq("id", deleteRestaurant.id);
      if (error) throw error;
      toast.success("Restaurante excluído!");
      queryClient.invalidateQueries({ queryKey: ["admin-restaurants"] });
      queryClient.invalidateQueries({ queryKey: ["restaurants"] });
      setDeleteRestaurant(null);
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir");
    } finally {
      setDeletingRestaurant(false);
    }
  };

  const handleDeleteProduct = async () => {
    if (!deleteProduct) return;
    setDeletingProduct(true);
    try {
      const { error } = await supabase.from("products").delete().eq("id", deleteProduct.id);
      if (error) throw error;
      toast.success("Produto excluído!");
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setDeleteProduct(null);
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir");
    } finally {
      setDeletingProduct(false);
    }
  };

  const handleOrderStatus = async (orderId: string, status: string) => {
    try {
      const { error } = await supabase.from("orders").update({ status }).eq("id", orderId);
      if (error) throw error;
      toast.success("Status atualizado!");
      queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao atualizar");
    }
  };

  const stats = [
    { label: "Restaurantes", value: restaurants.length, icon: Store, color: "text-primary" },
    { label: "Produtos", value: products.length, icon: Package, color: "text-secondary" },
    { label: "Pedidos", value: orders.length, icon: ShoppingCart, color: "text-accent" },
    { label: "Faturamento", value: `R$ ${orders.reduce((s: number, o: any) => s + Number(o.total), 0).toFixed(0)}`, icon: TrendingUp, color: "text-primary" },
  ];

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3 px-4">
          <p className="text-muted-foreground">{authError ?? "Verificando permissões..."}</p>
          {authError && (
            <Button variant="outline" onClick={() => window.location.reload()}>
              Tentar novamente
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background overflow-hidden">
        <AppSidebar role="admin" currentTab={activeTab} onTabChange={setActiveTab} />
        
        <SidebarInset className="flex-1 overflow-y-auto">
          <header className="bg-card border-b px-4 py-3 flex items-center gap-3 sticky top-0 z-30">
            <SidebarTrigger />
            <button onClick={() => navigate("/")} className="hover:bg-muted p-1 rounded-full transition-colors ml-1">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="font-bold text-lg flex-1 truncate">Painel Administrativo</h1>
            <ThemeToggle />
          </header>

          <main className="p-4 max-w-6xl mx-auto w-full space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {stats.map((stat) => (
                <Card key={stat.label} className="border-border/50">
                  <CardContent className="p-4 flex items-center gap-3">
                    <stat.icon className={`w-8 h-8 ${stat.color}`} />
                    <div>
                      <p className="text-2xl font-extrabold">{stat.value}</p>
                      <p className="text-xs text-muted-foreground">{stat.label}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              {isMobile && (
                <ScrollArea className="w-full mb-4">
                  <TabsList className="w-max bg-muted/50 p-1 rounded-xl">
                    <TabsTrigger value="restaurants"><Store className="w-4 h-4 mr-1" /></TabsTrigger>
                    <TabsTrigger value="products"><Package className="w-4 h-4 mr-1" /></TabsTrigger>
                    <TabsTrigger value="orders"><ShoppingCart className="w-4 h-4 mr-1" /></TabsTrigger>
                    <TabsTrigger value="map"><MapIcon className="w-4 h-4 mr-1" /></TabsTrigger>
                    <TabsTrigger value="drivers"><Truck className="w-4 h-4 mr-1" /></TabsTrigger>
                    <TabsTrigger value="storeowners"><Users className="w-4 h-4 mr-1" /></TabsTrigger>
                    <TabsTrigger value="fees"><Settings className="w-4 h-4 mr-1" /></TabsTrigger>
                    <TabsTrigger value="credits"><Ticket className="w-4 h-4 mr-1" /></TabsTrigger>
                    <TabsTrigger value="financial"><DollarSign className="w-4 h-4 mr-1" /></TabsTrigger>
                    <TabsTrigger value="admins"><ShieldCheck className="w-4 h-4 mr-1" /></TabsTrigger>
                    <TabsTrigger value="chat"><MessageSquare className="w-4 h-4 mr-1" /></TabsTrigger>
                    <TabsTrigger value="password-reset"><KeyRound className="w-4 h-4 mr-1" /></TabsTrigger>
                    <TabsTrigger value="customers"><UserCheck className="w-4 h-4 mr-1" /></TabsTrigger>
                    <TabsTrigger value="push"><Bell className="w-4 h-4 mr-1" /></TabsTrigger>
                    <TabsTrigger value="privacy"><Shield className="w-4 h-4 mr-1" /></TabsTrigger>

                  </TabsList>
                  <ScrollBar orientation="horizontal" />
                </ScrollArea>
              )}

              <motion.div 
                key={activeTab}
                initial={{ opacity: 0, x: 10 }} 
                animate={{ opacity: 1, x: 0 }} 
                className="mt-0"
              >

          <TabsContent value="restaurants">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-base">Restaurantes</CardTitle>
                <Button size="sm" className="rounded-lg" onClick={() => { setEditingRestaurant(null); setRestaurantFormOpen(true); }}>+ Novo</Button>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Avaliação</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {restaurants.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell>{r.category_name}</TableCell>
                        <TableCell>⭐ {r.rating}</TableCell>
                        <TableCell>
                          <span className={`text-xs font-semibold px-2 py-1 rounded-full ${r.is_open ? "bg-accent/20 text-accent" : "bg-destructive/20 text-destructive"}`}>
                            {r.is_open ? "Aberto" : "Fechado"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setEditingRestaurant(r); setRestaurantFormOpen(true); }}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setDeleteRestaurant(r)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="products">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-base">Produtos</CardTitle>
                <Button size="sm" className="rounded-lg" onClick={() => { setEditingProduct(null); setProductFormOpen(true); }}>+ Novo</Button>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Restaurante</TableHead>
                      <TableHead>Preço</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.map((p: any) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell>{p.restaurants?.name}</TableCell>
                        <TableCell>R$ {Number(p.price).toFixed(2)}</TableCell>
                        <TableCell>{p.category}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setEditingProduct(p); setProductFormOpen(true); }}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setDeleteProduct(p)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="orders">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Pedidos Recentes</CardTitle>
              </CardHeader>
              <CardContent>
                {orders.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">Nenhum pedido ainda</p>
                ) : (
                  <div className="space-y-3">
                    {orders.map((order: any) => (
                      <div key={order.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 gap-3">
                        <div className="min-w-0">
                          <p className="font-bold text-sm">#{order.id.slice(0, 8)}</p>
                          <p className="text-xs text-muted-foreground">{order.restaurants?.name}</p>
                          <p className="font-bold text-sm mt-1">R$ {Number(order.total).toFixed(2)}</p>
                        </div>
                        <Select value={order.status} onValueChange={(v) => handleOrderStatus(order.id, v)}>
                          <SelectTrigger className="w-[140px] h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {statusOptions.map((s) => (
                              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="map">
            <RealtimeMonitorTab />
          </TabsContent>
          <TabsContent value="drivers"><DriversTab /></TabsContent>

          <TabsContent value="storeowners"><StoreOwnersTab /></TabsContent>
          <TabsContent value="fees"><FeesConfigTab /></TabsContent>
          <TabsContent value="credits"><CreditsTab /></TabsContent>
          <TabsContent value="financial"><FinancialTab /></TabsContent>
          <TabsContent value="admins"><AdminsTab /></TabsContent>
          <TabsContent value="chat"><ChatTab /></TabsContent>
          <TabsContent value="password-reset"><PasswordResetTab /></TabsContent>
          <TabsContent value="customers"><CustomersTab /></TabsContent>

          <TabsContent value="push"><PushTestTab /></TabsContent>
          <TabsContent value="privacy"><PrivacyPolicyTab /></TabsContent>

            </motion.div>
          </Tabs>
        </main>
      </SidebarInset>
    </div>

    <RestaurantForm open={restaurantFormOpen} onOpenChange={setRestaurantFormOpen} restaurant={editingRestaurant} categories={categories} />
    <ProductForm open={productFormOpen} onOpenChange={setProductFormOpen} product={editingProduct} restaurants={restaurants} />
    <DeleteConfirm open={!!deleteRestaurant} onOpenChange={(o) => !o && setDeleteRestaurant(null)} onConfirm={handleDeleteRestaurant} title={deleteRestaurant?.name || "restaurante"} loading={deletingRestaurant} />
    <DeleteConfirm open={!!deleteProduct} onOpenChange={(o) => !o && setDeleteProduct(null)} onConfirm={handleDeleteProduct} title={deleteProduct?.name || "produto"} loading={deletingProduct} />
    </SidebarProvider>
  );
};

export default AdminDashboard;
