import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface ReportLocationButtonProps {
  latitude: number;
  longitude: number;
  address?: string;
  userId: string;
  variant?: "ghost" | "outline" | "default";
  size?: "sm" | "default" | "icon";
  className?: string;
}

const ReportLocationButton = ({
  latitude,
  longitude,
  address,
  userId,
  variant = "ghost",
  size = "sm",
  className = "",
}: ReportLocationButtonProps) => {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [sending, setSending] = useState(false);

  const handleSubmit = async () => {
    if (!description.trim()) {
      toast.error("Descreva o problema encontrado");
      return;
    }
    setSending(true);
    try {
      const { error } = await (supabase as any).from("location_reports").insert({
        reporter_id: userId,
        latitude,
        longitude,
        reported_address: address || null,
        description: description.trim(),
      });
      if (error) throw error;
      toast.success("Problema reportado com sucesso! Obrigado pelo feedback.");
      setDescription("");
      setOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Erro ao enviar reporte");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={`gap-1.5 text-xs text-orange-600 dark:text-orange-400 ${className}`}
        onClick={() => setOpen(true)}
      >
        <AlertTriangle className="w-3.5 h-3.5" />
        Reportar erro de localização
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              Reportar erro de localização
            </DialogTitle>
            <DialogDescription>
              Ajude-nos a melhorar o mapa! Descreva o problema encontrado neste endereço.
            </DialogDescription>
          </DialogHeader>

          {address && (
            <div className="text-sm bg-muted/50 rounded-lg p-3">
              <p className="font-medium">📍 Endereço:</p>
              <p className="text-muted-foreground">{address}</p>
            </div>
          )}

          <div className="text-xs text-muted-foreground bg-muted/30 rounded p-2">
            Coordenadas: {latitude.toFixed(6)}, {longitude.toFixed(6)}
          </div>

          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex: Rua não existe no mapa, endereço marcado no lugar errado, nome da rua incorreto..."
            rows={3}
          />

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={sending || !description.trim()}>
              {sending ? "Enviando..." : "Enviar Reporte"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ReportLocationButton;
