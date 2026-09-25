import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageSquare, Trash2, Truck, Store, Circle, Clock } from "lucide-react";
import { toast } from "sonner";
import ChatWidget from "@/components/ChatWidget";
import DeleteConfirm from "@/components/admin/DeleteConfirm";
import AdminAddressCorrection from "@/components/admin/AdminAddressCorrection";
import SupportChat from "@/components/SupportChat";
import { useOnlinePresence } from "@/hooks/useOnlinePresence";

const statusLabels: Record<string, string> = {
  pending: "Aguardando",
  accepted: "Aceito",
  picked_up: "Coletado",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

const ChatTab = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [selectedSupportUserId, setSelectedSupportUserId] = useState<string | null>(null);
  const [supportTitle, setSupportTitle] = useState<string>("Conversa");
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { onlineIds, isOnline } = useOnlinePresence("admin");

  const { data: messageCount = 0 } = useQuery({
    queryKey: ["admin-chat-message-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("chat_messages")
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      return count || 0;
    },
  });

  const { data: requests = [] } = useQuery({
    queryKey: ["admin-delivery-requests-chat"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_requests")
        .select("*, restaurants(name)")
        .in("status", ["pending", "accepted", "picked_up"])
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const { data: recentRequests = [] } = useQuery({
    queryKey: ["admin-delivery-requests-chat-recent"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_requests")
        .select("*, restaurants(name)")
        .in("status", ["delivered", "cancelled"])
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  // All drivers + their profile / online status
  const { data: drivers = [] } = useQuery({
    queryKey: ["admin-support-drivers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drivers")
        .select("id, user_id, full_name, driver_code, phone, is_active")
        .order("full_name");
      if (error) throw error;
      return data || [];
    },
  });

  const getDriverName = (driverId: string | null) => {
    if (!driverId) return null;
    const d = drivers.find((drv: any) => drv.user_id === driverId || drv.id === driverId);
    return d?.full_name ? `${d.full_name}${d.driver_code ? ` (${d.driver_code})` : ""}` : null;
  };

  // All store owners via restaurants table (owner_id = user_id of lojista)
  const { data: storeOwners = [] } = useQuery({
    queryKey: ["admin-support-store-owners"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("owner_id, name, address")
        .order("name");
      if (error) throw error;
      // dedupe by owner_id
      const seen = new Set<string>();
      return (data || []).filter((r: any) => {
        if (!r.owner_id || seen.has(r.owner_id)) return false;
        seen.add(r.owner_id);
        return true;
      });
    },
  });

  const allRequests = [...requests, ...recentRequests];

  const handleDeleteAllChats = async () => {
    setDeleting(true);
    try {
      const { count, error: countError } = await supabase
        .from("chat_messages")
        .select("*", { count: "exact", head: true });
      if (countError) throw countError;
      if (!count || count === 0) {
        toast.info("Nenhuma mensagem para apagar.");
        setDeleting(false);
        setShowDeleteAll(false);
        return;
      }
      const { error } = await supabase.rpc("delete_all_chat_messages");
      if (error) throw error;
      toast.success(`${count} mensagem(ns) do chat apagadas com sucesso!`);
      queryClient.invalidateQueries({ queryKey: ["admin-delivery-requests-chat"] });
      queryClient.invalidateQueries({ queryKey: ["admin-delivery-requests-chat-recent"] });
      queryClient.invalidateQueries({ queryKey: ["chat-messages"] });
      queryClient.invalidateQueries({ queryKey: ["admin-chat-message-count"] });
      setSelectedRequestId(null);
    } catch (err: any) {
      console.error("Erro ao apagar mensagens:", err);
      toast.error(err.message || "Erro ao apagar mensagens.");
    } finally {
      setDeleting(false);
      setShowDeleteAll(false);
    }
  };

  const openSupport = (userId: string, title: string) => {
    setSelectedSupportUserId(userId);
    setSupportTitle(title);
  };

  const onlineDrivers = drivers.filter((d: any) => isOnline(d.user_id));
  const onlineStoreOwners = storeOwners.filter((s: any) => isOnline(s.owner_id));

  return (
    <div className="space-y-4">
      <Tabs defaultValue="support" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="support">
            Suporte Direto
            <Badge variant="secondary" className="ml-2 text-[10px]">
              {onlineDrivers.length + onlineStoreOwners.length} online
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="deliveries">Chats de Entregas</TabsTrigger>
        </TabsList>

        {/* ===== Direct support tab ===== */}
        <TabsContent value="support" className="space-y-4 mt-4">
          <div className="grid md:grid-cols-2 gap-4">
            {/* Drivers list */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Truck className="w-4 h-4" /> Motoristas
                  <Badge variant="outline" className="ml-auto">
                    {onlineDrivers.length}/{drivers.length} online
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 max-h-96 overflow-y-auto">
                {drivers.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-3">Nenhum motorista cadastrado</p>
                )}
                {[...drivers]
                  .sort((a: any, b: any) => Number(isOnline(b.user_id)) - Number(isOnline(a.user_id)))
                  .map((d: any) => {
                    const online = isOnline(d.user_id);
                    const active = selectedSupportUserId === d.user_id;
                    return (
                      <button
                        key={d.user_id}
                        onClick={() => openSupport(d.user_id, `Motorista — ${d.full_name || d.driver_code}`)}
                        className={`w-full text-left p-2 rounded-lg flex items-center gap-2 transition-colors ${active ? "bg-primary/10 border border-primary" : "hover:bg-muted/50"}`}
                      >
                        <Circle className={`w-2.5 h-2.5 shrink-0 ${online ? "fill-green-500 text-green-500" : "fill-muted-foreground/30 text-muted-foreground/30"}`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{d.full_name || "Sem nome"}</p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {d.driver_code} {d.phone ? `• ${d.phone}` : ""}
                          </p>
                        </div>
                        {!d.is_active && <Badge variant="outline" className="text-[9px]">Inativo</Badge>}
                      </button>
                    );
                  })}
              </CardContent>
            </Card>

            {/* Store owners list */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Store className="w-4 h-4" /> Lojas
                  <Badge variant="outline" className="ml-auto">
                    {onlineStoreOwners.length}/{storeOwners.length} online
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 max-h-96 overflow-y-auto">
                {storeOwners.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-3">Nenhuma loja cadastrada</p>
                )}
                {[...storeOwners]
                  .sort((a: any, b: any) => Number(isOnline(b.owner_id)) - Number(isOnline(a.owner_id)))
                  .map((s: any) => {
                    const online = isOnline(s.owner_id);
                    const active = selectedSupportUserId === s.owner_id;
                    return (
                      <button
                        key={s.owner_id}
                        onClick={() => openSupport(s.owner_id, `Loja — ${s.name}`)}
                        className={`w-full text-left p-2 rounded-lg flex items-center gap-2 transition-colors ${active ? "bg-primary/10 border border-primary" : "hover:bg-muted/50"}`}
                      >
                        <Circle className={`w-2.5 h-2.5 shrink-0 ${online ? "fill-green-500 text-green-500" : "fill-muted-foreground/30 text-muted-foreground/30"}`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{s.name}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{s.address}</p>
                        </div>
                      </button>
                    );
                  })}
              </CardContent>
            </Card>
          </div>

          {selectedSupportUserId && user ? (
            <SupportChat
              currentUserId={user.id}
              otherUserId={selectedSupportUserId}
              title={supportTitle}
              online={isOnline(selectedSupportUserId)}
            />
          ) : (
            <Card>
              <CardContent className="p-6 text-center text-sm text-muted-foreground">
                Selecione um motorista ou loja acima para iniciar a conversa.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ===== Per-delivery chats tab (existing) ===== */}
        <TabsContent value="deliveries" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="w-4 h-4" /> Conversas de Entregas
              </CardTitle>
              <Button variant="destructive" size="sm" onClick={() => setShowDeleteAll(true)} disabled={messageCount === 0}>
                <Trash2 className="w-4 h-4 mr-1" /> Apagar Tudo {messageCount > 0 && `(${messageCount})`}
              </Button>
            </CardHeader>
            <CardContent>
              {allRequests.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">Nenhuma entrega com chat disponível</p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {allRequests.map((r: any) => {
                    const driverName = getDriverName(r.driver_id);
                    return (
                      <div
                        key={r.id}
                        onClick={() => setSelectedRequestId(r.id === selectedRequestId ? null : r.id)}
                        className={`p-3 rounded-lg cursor-pointer transition-colors ${
                          selectedRequestId === r.id ? "bg-primary/10 border border-primary" : "bg-muted/50 hover:bg-muted"
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-bold text-sm">{(r as any).restaurants?.name || "Loja"}</p>
                            <p className="text-xs text-muted-foreground font-mono">Entrega #{r.id.slice(0, 8)}</p>
                          </div>
                          <Badge variant={
                            r.status === "delivered" ? "default" :
                            r.status === "cancelled" ? "destructive" :
                            "secondary"
                          }>
                            {statusLabels[r.status] || r.status}
                          </Badge>
                        </div>

                        {/* Nome do Motorista que Aceitou */}
                        {driverName ? (
                          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 mt-1.5 flex items-center gap-1.5 bg-emerald-500/10 p-1.5 rounded border border-emerald-500/20">
                            <Truck className="w-3.5 h-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                            <span>Motorista: <strong>{driverName}</strong></span>
                          </p>
                        ) : (
                          <p className="text-xs text-amber-700 dark:text-amber-400 mt-1.5 flex items-center gap-1.5 bg-amber-500/10 p-1.5 rounded border border-amber-500/20">
                            <Clock className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                            <span>Aguardando motorista aceitar</span>
                          </p>
                        )}

                        <p className="text-xs text-muted-foreground mt-1.5 truncate">
                          📍 {r.pickup_address} → {r.delivery_address}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {selectedRequestId && user && (() => {
            const selected = allRequests.find((r: any) => r.id === selectedRequestId);
            const selectedDriver = selected ? getDriverName(selected.driver_id) : null;
            const chatTitle = selectedDriver
              ? `Chat da Entrega #${selectedRequestId.slice(0, 8)} • Motorista: ${selectedDriver}`
              : `Chat da Entrega #${selectedRequestId.slice(0, 8)}`;
            return (
              <>
                {selected && <AdminAddressCorrection request={selected} />}
                <ChatWidget
                  deliveryRequestId={selectedRequestId}
                  currentUserId={user.id}
                  title={chatTitle}
                  maxHeight="max-h-80"
                />
              </>
            );
          })()}
        </TabsContent>
      </Tabs>

      <DeleteConfirm
        open={showDeleteAll}
        onOpenChange={setShowDeleteAll}
        onConfirm={handleDeleteAllChats}
        title="todas as mensagens do chat"
        loading={deleting}
      />
    </div>
  );
};

export default ChatTab;
