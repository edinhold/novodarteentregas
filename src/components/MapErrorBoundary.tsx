import React from "react";
import { MapPin } from "lucide-react";

interface Props {
  children: React.ReactNode;
  fallbackHeight?: string;
}

interface State {
  hasError: boolean;
}

class MapErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[MapErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="w-full flex flex-col items-center justify-center bg-muted/30 rounded-2xl gap-2 text-muted-foreground"
          style={{ height: this.props.fallbackHeight || "100%" }}
        >
          <MapPin className="w-8 h-8 opacity-50" />
          <p className="text-sm font-medium">Não foi possível carregar o mapa</p>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="text-xs text-primary hover:underline"
          >
            Tentar novamente
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default MapErrorBoundary;
