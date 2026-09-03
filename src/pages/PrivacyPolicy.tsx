import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Share2, Copy } from "lucide-react";
import { toast } from "sonner";
import PrivacyPolicyTab from "@/components/admin/PrivacyPolicyTab";

const PrivacyPolicy = () => {
  const navigate = useNavigate();
  const url = typeof window !== "undefined" ? `${window.location.origin}/privacidade` : "";

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Políticas de Privacidade - Duarte Entregas",
          text: "Confira as políticas de privacidade do Duarte Entregas",
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copiado!");
      }
    } catch {
      /* user cancelled */
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(url);
    toast.success("Link copiado!");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-border/50">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-1">
            <ArrowLeft className="w-4 h-4" /> Voltar
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1">
              <Copy className="w-4 h-4" /> Copiar link
            </Button>
            <Button size="sm" onClick={handleShare} className="gap-1">
              <Share2 className="w-4 h-4" /> Compartilhar
            </Button>
          </div>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-4 py-6">
        <PrivacyPolicyTab />
      </main>
    </div>
  );
};

export default PrivacyPolicy;
