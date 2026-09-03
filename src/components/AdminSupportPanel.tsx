import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import SupportChat from "@/components/SupportChat";
import { useOnlinePresence } from "@/hooks/useOnlinePresence";
import { Card, CardContent } from "@/components/ui/card";

interface AdminSupportPanelProps {
  currentUserId: string;
  role: "driver" | "store_owner";
}

/**
 * Drop-in panel for drivers / store owners to chat with the support admin.
 * Tracks the user as online and renders a SupportChat with the support admin id.
 */
const AdminSupportPanel = ({ currentUserId, role }: AdminSupportPanelProps) => {
  const [adminId, setAdminId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { isOnline } = useOnlinePresence(role);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await (supabase as any).rpc("get_support_admin_id");
      if (cancelled) return;
      if (error) console.warn("get_support_admin_id", error);
      setAdminId((data as string) || null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          Carregando suporte...
        </CardContent>
      </Card>
    );
  }
  if (!adminId) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          Nenhum administrador disponível no momento.
        </CardContent>
      </Card>
    );
  }

  return (
    <SupportChat
      currentUserId={currentUserId}
      otherUserId={adminId}
      title="Suporte (Admin)"
      online={isOnline(adminId)}
      maxHeight="max-h-80"
    />
  );
};

export default AdminSupportPanel;
