import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  isChunkError: boolean;
}

export class GlobalErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    isChunkError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    const message = error?.message || "";
    // Detect dynamic chunk load errors caused by app updates/deployments
    const isChunkError =
      /Failed to fetch dynamically imported module/i.test(message) ||
      /Loading chunk .* failed/i.test(message) ||
      /error loading dynamically imported module/i.test(message) ||
      /Importing a module script failed/i.test(message);

    return {
      hasError: true,
      error,
      isChunkError,
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[GlobalErrorBoundary] Exceção capturada:", error, errorInfo);

    // Auto-recovery for chunk load errors on new PWA versions (attempt ONCE per session)
    const isChunkError =
      /Failed to fetch dynamically imported module/i.test(error?.message || "") ||
      /Loading chunk .* failed/i.test(error?.message || "");

    if (isChunkError && !sessionStorage.getItem("chunk_reload_attempted")) {
      sessionStorage.setItem("chunk_reload_attempted", "true");
      console.warn("[GlobalErrorBoundary] Detectada falha de versão/chunk. Recarregando aplicativo...");
      
      // Clear service worker caches if available
      if ("caches" in window) {
        caches.keys().then((names) => {
          names.forEach((name) => caches.delete(name));
        }).catch(() => {});
      }
      
      window.location.reload();
    }
  }

  private handleReload = () => {
    try {
      sessionStorage.removeItem("chunk_reload_attempted");
    } catch {}
    window.location.reload();
  };

  private handleGoHome = () => {
    try {
      sessionStorage.removeItem("chunk_reload_attempted");
    } catch {}
    window.location.href = "/";
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 text-foreground">
          <div className="max-w-md w-full bg-card rounded-2xl p-6 shadow-xl border border-border text-center space-y-4">
            <div className="w-16 h-16 mx-auto bg-amber-500/10 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-amber-500" />
            </div>

            <h1 className="text-xl font-bold">
              {this.state.isChunkError ? "Nova versão carregada!" : "Algo não deu certo"}
            </h1>

            <p className="text-sm text-muted-foreground">
              {this.state.isChunkError
                ? "Uma nova atualização do Duarte Delivery foi instalada. Clique abaixo para atualizar sua tela."
                : "Ocorreu um imprevisto ao carregar este recurso. Você pode tentar recarregar ou voltar para o início."}
            </p>

            {Boolean(import.meta.env?.DEV) && this.state.error?.message && (
              <div className="p-3 bg-muted rounded-xl text-left text-xs font-mono overflow-auto max-h-32 text-destructive">
                {this.state.error.message}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <Button
                onClick={this.handleReload}
                className="flex-1 rounded-xl gap-2 font-semibold h-11"
              >
                <RefreshCw className="w-4 h-4" /> Recarregar Aplicativo
              </Button>

              <Button
                onClick={this.handleGoHome}
                variant="outline"
                className="rounded-xl gap-2 h-11"
              >
                <Home className="w-4 h-4" /> Ir para o Início
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default GlobalErrorBoundary;
