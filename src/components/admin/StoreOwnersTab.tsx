import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Trash2, LogIn } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import DeleteConfirm from "./DeleteConfirm";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const StoreOwnersTab = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [deleteId, setDeleteId] = useState<{ id: string; ownerId: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [impersonateTarget, setImpersonateTarget] = useState<{ ownerId: string; name: string } | null>(null);
  const [impersonating, setImpersonating] = useState(false);

  const { data: restaurants = [] } = useQuery({
    queryKey: ["admin-store-owners"],
    queryFn: async () => {
      const { data, error } = await supabase.from("restaurants").select("*").not("owner_id", "is", null).order("name");
      if (error) throw error;
      return data;
    },
  });

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await supabase.functions.invoke("delete-user", {
        body: { user_id: deleteId.ownerId },
      });
      if (res.error) throw new Error(res.error.message || "Erro na função");
      if (res.data?.error) throw new Error(res.data.error);
      toast.success(`${deleteId.name} removido!`);
      queryClient.invalidateQueries({ queryKey: ["admin-store-owners"] });
      queryClient.invalidateQueries({ queryKey: ["admin-restaurants"] });
      setDeleteId(null);
    } catch (e: any) {
      toast.error(e.message || "Erro ao remover");
    } finally {
      setDeleting(false);
    }
  };

  const handleImpersonate = async () => {
    if (!impersonateTarget) return;
    setImpersonating(true);
    try {
      console.log("[Admin:Impersonate] Acessando painel do lojista ID", impersonateTarget.ownerId);
      const res = await supabase.functions.invoke("admin-impersonate", {
        body: { target_user_id: impersonateTarget.ownerId },
      });
      if (res.error) throw new Error(res.error.message || "Erro na função");
      if (res.data?.error) throw new Error(res.data.error);
      const { email, token_hash } = res.data as { email: string; token_hash: string };
      if (!email || !token_hash) throw new Error("Resposta inválida do servidor");

      // Sign out admin, then sign in as the store owner via the magic-link token.
      await supabase.auth.signOut();
      const { error: verifyErr } = await supabase.auth.verifyOtp({
        token_hash,
        type: "magiclink",
      });
      if (verifyErr) throw verifyErr;

      toast.success(`Acessando painel de ${impersonateTarget.name}...`);
      setImpersonateTarget(null);
      navigate("/lojista");
    } catch (e: any) {
      console.error("[Admin:Impersonate] falhou", e);
      toast.error(e.message || "Falha ao acessar o painel do lojista");
    } finally {
      setImpersonating(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lojistas Ativos</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Restaurante</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Endereço</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-40 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {restaurants.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>{r.category_name}</TableCell>
                  <TableCell>{r.address || "—"}</TableCell>
                  <TableCell>
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${r.is_open ? "bg-accent/20 text-accent" : "bg-destructive/20 text-destructive"}`}>
                      {r.is_open ? "Aberto" : "Fechado"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1 text-primary hover:text-primary transition-all duration-200"
                        onClick={() => setImpersonateTarget({ ownerId: r.owner_id!, name: r.name })}
                        aria-label={`Acessar painel de ${r.name}`}
                      >
                        <LogIn className="w-4 h-4" />
                        <span className="hidden sm:inline">Acessar Painel</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteId({ id: r.id, ownerId: r.owner_id!, name: r.name })}
                        aria-label={`Remover ${r.name}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {restaurants.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum lojista cadastrado</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <DeleteConfirm open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)} onConfirm={handleDelete} title={deleteId?.name || "lojista"} loading={deleting} />

      <AlertDialog open={!!impersonateTarget} onOpenChange={(o) => !o && !impersonating && setImpersonateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Acessar painel do lojista?</AlertDialogTitle>
            <AlertDialogDescription>
              Você entrará no painel de <strong>{impersonateTarget?.name}</strong> como se fosse ele.
              Sua sessão de administrador será encerrada e a ação será registrada no log de auditoria.
              Para voltar ao painel admin, faça login novamente com sua conta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={impersonating}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleImpersonate} disabled={impersonating}>
              {impersonating ? "Acessando..." : "Confirmar acesso"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default StoreOwnersTab;
