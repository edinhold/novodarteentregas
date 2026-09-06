import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import GlobalErrorBoundary from "@/components/GlobalErrorBoundary";
import "leaflet/dist/leaflet.css";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <GlobalErrorBoundary>
    <App />
  </GlobalErrorBoundary>
);
