import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  isChunkError: boolean;
  showDetails: boolean;
}

export class GlobalErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    isChunkError: false,
    showDetails: false,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
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
    this.setState({ errorInfo });

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
      if ("caches" in window) {
        caches.keys().then((names) => {
          names.forEach((name) => caches.delete(name));
        }).catch(() => {});
      }
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
      const errorMessage = this.state.error?.message || "Erro desconhecido durante o carregamento do recurso.";

      return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 text-foreground">
          <div className="max-w-lg w-full bg-card rounded-2xl p-6 shadow-xl border border-border text-center space-y-4">
            <div className="w-16 h-16 mx-auto bg-amber-500/10 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-amber-500" />
            </div>

            <h1 className="text-xl font-bold">
              {this.state.isChunkError ? "Nova versão atualizada!" : "Imprevisto ao carregar a página"}
            </h1>

            <p className="text-sm text-muted-foreground">
              {this.state.isChunkError
                ? "Uma nova atualização do Duarte Delivery foi carregada. Clique no botão abaixo para atualizar sua tela."
                : "Não foi possível carregar este recurso completamente. Você pode tentar recarregar ou retornar à página inicial."}
            </p>

            {/* Always provide error detail toggle for troubleshooting */}
            <div className="pt-2 text-left">
              <button
                type="button"
                onClick={() => this.setState({ showDetails: !this.state.showDetails })}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mx-auto underline transition-colors"
              >
                {this.state.showDetails ? (
                  <>
                    <ChevronUp className="w-3.5 h-3.5" /> Ocultar detalhes do erro
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3.5 h-3.5" /> Ver detalhes técnicos
                  </>
                )}
              </button>

              {this.state.showDetails && (
                <div className="mt-3 p-3 bg-muted/80 rounded-xl text-xs font-mono overflow-auto max-h-40 text-destructive border border-destructive/20 space-y-1">
                  <p className="font-semibold break-words">{errorMessage}</p>
                  {this.state.errorInfo?.componentStack && (
                    <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap opacity-75 mt-1">
                      {this.state.errorInfo.componentStack.slice(0, 300)}
                    </pre>
                  )}
                </div>
              )}
            </div>

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
