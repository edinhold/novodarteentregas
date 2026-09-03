import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Download, Share, Smartphone } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const Install = () => {
  const navigate = useNavigate();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches;
    setIsInstalled(isStandalone);

    const ua = navigator.userAgent;
    setIsIOS(/iPad|iPhone|iPod/.test(ua));

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setIsInstalled(true);
    setDeferredPrompt(null);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-primary text-primary-foreground px-4 pt-10 pb-12 rounded-b-3xl">
        <button onClick={() => navigate("/")} className="mb-4">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-2xl font-bold">Instalar App</h1>
        <p className="text-primary-foreground/80 mt-1">Tenha o Duarte Delivery na tela inicial do seu celular</p>
      </header>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="px-4 -mt-6 max-w-md mx-auto space-y-4"
      >
        {isInstalled ? (
          <Card>
            <CardContent className="p-6 text-center space-y-3">
              <div className="w-16 h-16 mx-auto bg-green-100 rounded-full flex items-center justify-center">
                <Smartphone className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-lg font-bold">App já instalado! 🎉</h2>
              <p className="text-muted-foreground text-sm">
                O Duarte Delivery já está na sua tela inicial.
              </p>
            </CardContent>
          </Card>
        ) : deferredPrompt ? (
          <Card>
            <CardContent className="p-6 text-center space-y-4">
              <div className="w-16 h-16 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
                <Download className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-lg font-bold">Instalar Duarte Delivery</h2>
              <p className="text-muted-foreground text-sm">
                Adicione à tela inicial para acesso rápido, sem ocupar espaço de app.
              </p>
              <Button onClick={handleInstall} className="w-full rounded-xl h-12 font-bold text-base">
                <Download className="w-5 h-5 mr-2" /> Instalar Agora
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Share className="w-4 h-4" />
                {isIOS ? "Como instalar no iPhone" : "Como instalar"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isIOS ? (
                <div className="space-y-3">
                  <Step n={1} text='Toque no botão "Compartilhar" (ícone ⬆️) na barra do Safari' />
                  <Step n={2} text='Role para baixo e toque em "Adicionar à Tela de Início"' />
                  <Step n={3} text='Toque em "Adicionar" no canto superior direito' />
                </div>
              ) : (
                <div className="space-y-3">
                  <Step n={1} text="Abra o menu do navegador (⋮) no canto superior direito" />
                  <Step n={2} text='Toque em "Instalar app" ou "Adicionar à tela inicial"' />
                  <Step n={3} text='Confirme tocando em "Instalar"' />
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-4">
            <h3 className="font-semibold text-sm mb-3">Vantagens do App</h3>
            <div className="space-y-2">
              <Benefit icon="⚡" text="Abertura instantânea, sem precisar abrir o navegador" />
              <Benefit icon="📱" text="Tela cheia, como um app de verdade" />
              <Benefit icon="🔔" text="Receba notificações de pedidos e entregas" />
              <Benefit icon="💾" text="Não ocupa espaço de armazenamento" />
              <Benefit icon="🔄" text="Sempre atualizado automaticamente" />
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

const Step = ({ n, text }: { n: number; text: string }) => (
  <div className="flex items-start gap-3">
    <span className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shrink-0">
      {n}
    </span>
    <p className="text-sm pt-0.5">{text}</p>
  </div>
);

const Benefit = ({ icon, text }: { icon: string; text: string }) => (
  <div className="flex items-center gap-2 text-sm">
    <span>{icon}</span>
    <span className="text-muted-foreground">{text}</span>
  </div>
);

export default Install;
