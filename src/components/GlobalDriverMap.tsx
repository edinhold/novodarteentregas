import { useMemo, useState } from "react";
import { useAllDriversStatus, type DriverWithLocation } from "@/hooks/useAllDriversStatus";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Card, CardContent } from "./ui/card";
import { Car, IdCard, Layers, MapPin, MessageCircle, Navigation, Phone, X } from "lucide-react";
import MapErrorBoundary from "./MapErrorBoundary";
import MapLibreView, { type MapExtraMarker } from "./maps/MapLibreView";
import { DriverPhoto } from "./DriverPhoto";
import { formatPhoneNumber, normalizeWhatsAppNumber } from "@/lib/phoneUtils";

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const statusLabel = (status: DriverWithLocation["status"]) =>
  status === "available" ? "Disponível" : status === "in_delivery" ? "Em Entrega" : "Inativo";

const GlobalDriverMapContent = () => {
  const { data: drivers = [], isLoading } = useAllDriversStatus();
  const [mapType, setMapType] = useState<"roadmap" | "satellite">("roadmap");
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [focusedCenter, setFocusedCenter] = useState<{ lat: number; lng: number } | null>(null);

  const selectedDriver = useMemo(
    () => drivers.find((d) => d.id === selectedDriverId) || null,
    [drivers, selectedDriverId]
  );

  const driversWithGps = useMemo(
    () => drivers.filter((d) => d.latitude != null && d.longitude != null),
    [drivers]
  );

  const extraMarkers = useMemo<MapExtraMarker[]>(() => {
    return driversWithGps.map((driver) => {
      const color =
        driver.status === "available"
          ? "#22c55e"
          : driver.status === "in_delivery"
          ? "#ef4444"
          : "#94a3b8";
      const safeName = escapeHtml(driver.full_name || "Motorista");
      const safeCode = escapeHtml(driver.driver_code || "-");
      const safePlate = escapeHtml(driver.vehicle_plate || "Não informada");
      const safePhone = driver.phone ? escapeHtml(formatPhoneNumber(driver.phone)) : "Não informado";
      return {
        id: driver.id,
        lat: Number(driver.latitude),
        lng: Number(driver.longitude),
        title: driver.full_name || "Motorista",
        color,
        onClick: () => {
          setSelectedDriverId(driver.id);
          setFocusedCenter({ lat: Number(driver.latitude), lng: Number(driver.longitude) });
        },
        infoHtml: `
          <div style="padding:4px;min-width:170px">
            <p style="font-weight:700;font-size:13px;margin:0">${safeName}</p>
            <p style="font-size:11px;color:#666;margin:2px 0">Credencial: <strong>${safeCode}</strong></p>
            <p style="font-size:11px;margin:2px 0">Placa: <strong>${safePlate}</strong></p>
            <p style="font-size:11px;margin:2px 0">Tel: <strong>${safePhone}</strong></p>
            <p style="font-size:11px;margin:2px 0">Status: <strong>${statusLabel(driver.status)}</strong></p>
          </div>
        `,
      };
    });
  }, [driversWithGps]);

  const handleSelectDriver = (driver: DriverWithLocation) => {
    setSelectedDriverId(driver.id);
    if (driver.latitude != null && driver.longitude != null) {
      setFocusedCenter({ lat: Number(driver.latitude), lng: Number(driver.longitude) });
    }
  };

  return (
    <div className="space-y-4">
      <div className="relative w-full h-[400px] sm:h-[560px] rounded-xl overflow-hidden border">
        <MapLibreView
          extraMarkers={extraMarkers}
          mapType={mapType}
          center={focusedCenter}
          zoom={focusedCenter ? 15 : 12}
          autoFitBounds={!focusedCenter && extraMarkers.length > 0}
          className="w-full h-full z-0"
        />

        <div className="absolute top-3 right-3 z-[400] flex flex-col gap-2">
          <Button
            size="sm"
            variant="secondary"
            className="bg-white/90 dark:bg-slate-800/90 shadow-md backdrop-blur-sm"
            onClick={() => setMapType(mapType === "roadmap" ? "satellite" : "roadmap")}
          >
            <Layers className="w-4 h-4 mr-2" />
            {mapType === "roadmap" ? "Satélite" : "Mapa"}
          </Button>
          {focusedCenter && (
            <Button
              size="sm"
              variant="secondary"
              className="bg-white/90 dark:bg-slate-800/90 shadow-md backdrop-blur-sm"
              onClick={() => setFocusedCenter(null)}
            >
              Ver Todos
            </Button>
          )}
        </div>

        <div className="absolute bottom-3 left-3 z-[400] flex flex-col gap-2 pointer-events-none">
          <Card className="bg-white/90 dark:bg-slate-800/90 shadow-md backdrop-blur-sm border-none pointer-events-auto">
            <CardContent className="p-3 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-[#22c55e]" />
                <span className="text-xs font-medium">Disponível</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-[#ef4444]" />
                <span className="text-xs font-medium">Em Entrega</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-[#94a3b8]" />
                <span className="text-xs font-medium">Inativo / Desativado</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {isLoading && (
          <div className="absolute inset-0 bg-background/50 backdrop-blur-[1px] flex items-center justify-center z-[500]">
            <div className="flex flex-col items-center gap-2">
              <Navigation className="w-8 h-8 animate-bounce text-primary" />
              <p className="text-sm font-medium">Carregando mapa...</p>
            </div>
          </div>
        )}
      </div>

      {/* Card em destaque do motorista selecionado no mapa */}
      {selectedDriver && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <DriverPhoto
                photoUrl={selectedDriver.photo_url}
                driverId={selectedDriver.user_id || selectedDriver.id}
                alt={selectedDriver.full_name}
                className="w-14 h-14 rounded-full border-2 border-primary shadow-sm object-cover shrink-0"
              />
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-base truncate">{selectedDriver.full_name}</span>
                  <Badge
                    variant={
                      selectedDriver.status === "in_delivery"
                        ? "destructive"
                        : selectedDriver.status === "available"
                        ? "default"
                        : "secondary"
                    }
                    className="text-[10px]"
                  >
                    {statusLabel(selectedDriver.status)}
                  </Badge>
                  {selectedDriver.vehicle_type && (
                    <Badge variant="outline" className="text-[10px]">
                      {selectedDriver.vehicle_type}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
                  <span className="flex items-center gap-1 font-mono font-semibold text-foreground">
                    <IdCard className="w-3.5 h-3.5 text-primary" />
                    {selectedDriver.driver_code}
                  </span>
                  <span className="flex items-center gap-1 font-mono font-semibold text-amber-700 dark:text-amber-300">
                    <Car className="w-3.5 h-3.5" />
                    Placa: {selectedDriver.vehicle_plate || "Não informada"}
                  </span>
                  <span className="flex items-center gap-1 font-semibold text-foreground">
                    <Phone className="w-3.5 h-3.5 text-emerald-600" />
                    {selectedDriver.phone ? formatPhoneNumber(selectedDriver.phone) : "Não informado"}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {selectedDriver.phone && (
                <>
                  <a
                    href={`https://wa.me/${normalizeWhatsAppNumber(selectedDriver.phone)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold bg-[#25D366] hover:bg-[#20bd5a] text-white rounded-lg"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    WhatsApp
                  </a>
                  <a
                    href={`tel:${selectedDriver.phone.replace(/\D/g, "")}`}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold bg-background hover:bg-muted border rounded-lg"
                  >
                    <Phone className="w-3.5 h-3.5 text-emerald-600" />
                    Ligar
                  </a>
                </>
              )}
              <Button size="icon" variant="ghost" onClick={() => setSelectedDriverId(null)} aria-label="Fechar detalhes">
                <X className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Grade com credenciais de todos os motoristas para acompanhamento rápido */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {drivers.map((driver) => {
          const isSelected = driver.id === selectedDriverId;
          const hasGps = driver.latitude != null && driver.longitude != null;
          return (
            <Card
              key={driver.id}
              onClick={() => handleSelectDriver(driver)}
              className={`cursor-pointer transition-all hover:border-primary/50 ${
                isSelected ? "border-primary ring-1 ring-primary/30 bg-primary/5" : ""
              }`}
            >
              <CardContent className="p-3.5 flex items-start gap-3">
                <DriverPhoto
                  photoUrl={driver.photo_url}
                  driverId={driver.user_id || driver.id}
                  alt={driver.full_name}
                  className="w-12 h-12 rounded-full border border-border object-cover shrink-0"
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold text-sm truncate">{driver.full_name}</p>
                    <Badge
                      variant={
                        driver.status === "in_delivery"
                          ? "destructive"
                          : driver.status === "available"
                          ? "default"
                          : "secondary"
                      }
                      className="text-[10px] shrink-0"
                    >
                      {statusLabel(driver.status)}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                    <span className="font-mono font-semibold text-foreground">{driver.driver_code}</span>
                    <span>•</span>
                    <span className="font-mono">Placa: {driver.vehicle_plate || "Não informada"}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-muted-foreground truncate">
                      {driver.phone ? formatPhoneNumber(driver.phone) : "Sem telefone"}
                    </span>
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1 shrink-0">
                      <MapPin className="w-3 h-3" />
                      {hasGps
                        ? driver.updated_at
                          ? new Date(driver.updated_at).toLocaleTimeString("pt-BR", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "GPS ativo"
                        : "Sem GPS"}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

const GlobalDriverMap = () => {
  return (
    <MapErrorBoundary fallbackHeight="500px">
      <GlobalDriverMapContent />
    </MapErrorBoundary>
  );
};

export default GlobalDriverMap;
