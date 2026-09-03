import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { toast } from "sonner";
import { KeyRound, ShieldAlert, History, AlertTriangle, UserCog, Mail } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type Mode = "set_password" | "send_recovery";

const PasswordResetTab = () => {
  // Bulk
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Single
  const [singleUserId, setSingleUserId] = useState<string>("");
  const [singleMode, setSingleMode] = useState<Mode>("set_password");
  const [singleNewPassword, setSingleNewPassword] = useState("");
  const [singleAdminPassword, setSingleAdminPassword] = useState("");
  const [singleLoading, setSingleLoading] = useState(false);

  const { data: logs = [], refetch: refetchLogs } = useQuery({
    queryKey: ["password-reset-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("password_reset_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: users = [] } = useQuery({
    queryKey: ["admin-all-users-basic"],
    queryFn: async () => {
      // Profiles hold display info; join with roles for context
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .order("full_name");
      if (error) throw error;
      return data || [];
    },
  });

  const handleBulkReset = async () => {
    if (!password) {
      toast.error("Digite sua senha para confirmar sua identidade.");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-reset-passwords", {
        body: { admin_password: password },
      });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }
      toast.success(
        `Redefinição concluída! ${data.success_count} e-mails enviados.` +
          (data.failure_count > 0 ? ` ${data.failure_count} falhas.` : "")
      );
      setPassword("");
      setShowConfirm(false);
      refetchLogs();
    } catch (err: any) {
      toast.error(err.message || "Erro ao redefinir senhas");
    } finally {
      setLoading(false);
    }
  };

  const handleSingleReset = async () => {
    if (!singleUserId) return toast.error("Selecione o usuário");
    if (!singleAdminPassword) return toast.error("Confirme sua senha administrativa");
    if (singleMode === "set_password" && singleNewPassword.length < 6)
      return toast.error("A nova senha deve ter pelo menos 6 caracteres");

    setSingleLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-reset-user-password", {
        body: {
          target_user_id: singleUserId,
          mode: singleMode,
          new_password: singleMode === "set_password" ? singleNewPassword : undefined,
          admin_password: singleAdminPassword,
        },
      });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }
      toast.success(
        singleMode === "set_password"
          ? "Senha redefinida com sucesso"
          : "E-mail de recuperação enviado"
      );
      setSingleNewPassword("");
      setSingleAdminPassword("");
      refetchLogs();
    } catch (err: any) {
      toast.error(err.message || "Erro ao redefinir senha");
    } finally {
      setSingleLoading(false);
    }
  };

  const actionLabel = (a: string) =>
    a === "bulk_reset" ? "Redefinição em massa"
    : a === "single_set_password" ? "Nova senha (individual)"
    : a === "single_recovery" ? "E-mail de recuperação (individual)"
    : a;

  return (
    <div className="space-y-4">
      {/* Individual reset */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <UserCog className="w-4 h-4" /> Redefinir Senha de um Usuário
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Usuário</Label>
              <Select value={singleUserId} onValueChange={setSingleUserId}>
                <SelectTrigger><SelectValue placeholder="Selecione o usuário" /></SelectTrigger>
                <SelectContent>
                  {(users as any[]).map((u) => (
                    <SelectItem key={u.user_id} value={u.user_id}>
                      {u.full_name?.trim() || u.user_id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Modo</Label>
              <Select value={singleMode} onValueChange={(v) => setSingleMode(v as Mode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="set_password">Definir nova senha agora</SelectItem>
                  <SelectItem value="send_recovery">Enviar e-mail de recuperação</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {singleMode === "set_password" && (
            <div className="space-y-2">
              <Label>Nova senha do usuário (mínimo 6 caracteres)</Label>
              <Input
                type="text"
                placeholder="Ex.: NovaSenha@2026"
                value={singleNewPassword}
                onChange={(e) => setSingleNewPassword(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label className="flex items-center gap-1">
              <ShieldAlert className="w-3.5 h-3.5" /> Sua senha (confirmação)
            </Label>
            <Input
              type="password"
              placeholder="Senha do administrador"
              value={singleAdminPassword}
              onChange={(e) => setSingleAdminPassword(e.target.value)}
            />
          </div>

          <Button onClick={handleSingleReset} disabled={singleLoading} className="w-full">
            {singleLoading
              ? "Processando..."
              : singleMode === "set_password"
              ? "Definir nova senha"
              : (<><Mail className="w-4 h-4 mr-1" />Enviar e-mail de recuperação</>)}
          </Button>
        </CardContent>
      </Card>

      {/* Bulk reset */}
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="w-4 h-4" /> Redefinir Senha de Todos os Usuários
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-semibold text-destructive">Ação irreversível</p>
              <p className="text-muted-foreground">
                Todos os usuários receberão um e-mail de redefinição de senha. Sua conta não é afetada.
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-1">
              <ShieldAlert className="w-3.5 h-3.5" /> Confirme sua identidade
            </Label>
            <Input
              type="password"
              placeholder="Digite sua senha de administrador"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="w-full" disabled={!password || loading}>
                {loading ? "Processando..." : "Redefinir Senhas de Todos os Usuários"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Tem certeza absoluta?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta ação enviará um e-mail de redefinição de senha para <strong>todos os usuários</strong>.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleBulkReset}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Confirmar Redefinição
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <History className="w-4 h-4" /> Histórico de Redefinições
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Ação</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Sucesso</TableHead>
                <TableHead>Falhas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log: any) => (
                <TableRow key={log.id}>
                  <TableCell className="text-sm">{new Date(log.created_at).toLocaleString("pt-BR")}</TableCell>
                  <TableCell className="text-sm">{actionLabel(log.action)}</TableCell>
                  <TableCell>{log.total_users}</TableCell>
                  <TableCell className="text-green-600">{log.success_count}</TableCell>
                  <TableCell className="text-destructive">{log.failure_count}</TableCell>
                </TableRow>
              ))}
              {logs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                    Nenhuma redefinição registrada
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default PasswordResetTab;
