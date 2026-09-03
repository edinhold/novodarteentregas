import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowLeft, MapPin, Phone, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import MapErrorBoundary from "@/components/MapErrorBoundary";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const driverIcon = new L.Icon({
  iconUrl: "data:image/svg+xml," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="%233b82f6" stroke="white" stroke-width="2"/><path d="M8 12l2 2 4-4" stroke="white" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`
  ),
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

const destIcon = new L.Icon({
  iconUrl: "data:image/svg+xml," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="%23e53935" stroke="white" stroke-width="1.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3" fill="white"/></svg>`
  ),
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32],
});

const statusLabels: Record<string, { label: string; color: string }> = {
  pending: { label: "Aguardando restaurante", color: "bg-yellow-500" },
  accepted: { label: "Preparando seu pedido", color: "bg-orange-500" },
  picked_up: { label: "Entregador a caminho", color: "bg-blue-500" },
  delivered: { label: "Entregue ✅", color: "bg-green-500" },
  cancelled: { label: "Cancelado", color: "bg-red-500" },
};

const OrderTracking = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [order, setOrder] = useState<any>(null);
  const [deliveryRequest, setDeliveryRequest] = useState<any>(null);
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number; accuracy?: number; speed?: number } | null>(null);
  const [driverProfile, setDriverProfile] = useState<any>(null);
  const [restaurant, setRestaurant] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const driverMarkerRef = useRef<L.Marker | null>(null);
  const accuracyCircleRef = useRef<L.Circle | null>(null);

  // Load order data
  useEffect(() => {
    if (!id || !user) return;

    const fetchOrder = async () => {
      const { data: orderData } = await supabase
        .from("orders")
        .select("*")
        .eq("id", id)
        .eq("user_id", user.id)
        .single();

      if (!orderData) {
        navigate("/");
        return;
      }
      setOrder(orderData);

      // Fetch restaurant
      const { data: rest } = await supabase
        .from("restaurants")
        .select("*")
        .eq("id", orderData.restaurant_id)
        .single();
      setRestaurant(rest);

      // Find delivery request linked to this order
      const { data: dr } = await (supabase as any)
        .from("delivery_requests")
        .select("*")
        .eq("restaurant_id", orderData.restaurant_id)
        .order("created_at", { ascending: false })
        .limit(1);

      if (dr && dr.length > 0) {
        setDeliveryRequest(dr[0]);
        if (dr[0].driver_id) {
          // Get driver profile
          const { data: driverData } = await supabase
            .from("drivers")
            .select("full_name, phone, vehicle_type")
            .eq("user_id", dr[0].driver_id)
            .single();
          setDriverProfile(driverData);
        }
      }

      setLoading(false);
    };

    fetchOrder();
  }, [id, user, navigate]);

  // Real-time driver location
  useEffect(() => {
    if (!deliveryRequest?.driver_id) return;

    const fetchLocation = async () => {
      const { data } = await (supabase as any)
        .from("driver_locations")
        .select("*")
        .eq("user_id", deliveryRequest.driver_id)
        .single();
      if (data) {
        setDriverLocation({ lat: data.latitude, lng: data.longitude, accuracy: data.accuracy, speed: data.speed });
      }
    };

    fetchLocation();

    const channel = supabase
      .channel(`tracking-${deliveryRequest.driver_id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "driver_locations", filter: `user_id=eq.${deliveryRequest.driver_id}` },
        (payload: any) => {
          const d = payload.new;
          if (d) {
            setDriverLocation({ lat: d.latitude, lng: d.longitude, accuracy: d.accuracy, speed: d.speed });
          }
        }
      )
      .subscribe();

    // Also listen for delivery request status changes
    const statusChannel = supabase
      .channel(`delivery-status-${deliveryRequest.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "delivery_requests", filter: `id=eq.${deliveryRequest.id}` },
        (payload: any) => {
          setDeliveryRequest(payload.new);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(statusChannel);
    };
  }, [deliveryRequest?.driver_id, deliveryRequest?.id]);

  // Map
  useEffect(() => {
    if (!containerRef.current) return;

    const center: [number, number] = driverLocation
      ? [driverLocation.lat, driverLocation.lng]
      : restaurant?.latitude && restaurant?.longitude
        ? [restaurant.latitude, restaurant.longitude]
        : [-15.78, -47.93];

    if (!mapRef.current) {
      const map = L.map(containerRef.current).setView(center, 15);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      mapRef.current = map;

      // Restaurant marker
      if (restaurant?.latitude && restaurant?.longitude) {
        L.marker([restaurant.latitude, restaurant.longitude], { icon: destIcon })
          .addTo(map)
          .bindPopup(`<b>${restaurant.name}</b>`);
      }
    }

    const map = mapRef.current;

    // Update driver marker
    if (driverLocation) {
      if (driverMarkerRef.current) {
        driverMarkerRef.current.setLatLng([driverLocation.lat, driverLocation.lng]);
      } else {
        driverMarkerRef.current = L.marker([driverLocation.lat, driverLocation.lng], { icon: driverIcon })
          .addTo(map)
          .bindPopup("🚴 Entregador");
      }

      if (driverLocation.accuracy) {
        if (accuracyCircleRef.current) {
          accuracyCircleRef.current.setLatLng([driverLocation.lat, driverLocation.lng]).setRadius(driverLocation.accuracy);
        } else {
          accuracyCircleRef.current = L.circle([driverLocation.lat, driverLocation.lng], {
            radius: driverLocation.accuracy,
            fillColor: "#3b82f6",
            fillOpacity: 0.1,
            color: "#3b82f6",
            opacity: 0.2,
            weight: 1,
          }).addTo(map);
        }
      }

      map.setView([driverLocation.lat, driverLocation.lng]);
    }
  }, [driverLocation, restaurant]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        driverMarkerRef.current = null;
        accuracyCircleRef.current = null;
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const status = deliveryRequest?.status || order?.status || "pending";
  const statusInfo = statusLabels[status] || statusLabels.pending;
  const speedKmh = driverLocation?.speed ? Math.round(driverLocation.speed * 3.6) : null;

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b px-4 py-3 flex items-center gap-3 sticky top-0 z-20">
        <button onClick={() => navigate("/")}><ArrowLeft className="w-5 h-5" /></button>
        <h1 className="font-bold text-lg">Rastreio do Pedido</h1>
      </header>

      {/* Map */}
      <div className="h-[50vh]">
        <MapErrorBoundary fallbackHeight="50vh">
          <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
        </MapErrorBoundary>
      </div>

      {/* Status & Info */}
      <div className="px-4 py-4 space-y-4 max-w-2xl mx-auto">
        {/* Status bar */}
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${statusInfo.color} animate-pulse`} />
          <span className="font-bold text-lg">{statusInfo.label}</span>
        </div>

        {/* Progress steps */}
        <div className="flex items-center justify-between">
          {["pending", "accepted", "picked_up", "delivered"].map((s, i) => {
            const active = ["pending", "accepted", "picked_up", "delivered"].indexOf(status) >= i;
            return (
              <div key={s} className="flex items-center flex-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                  {i + 1}
                </div>
                {i < 3 && <div className={`flex-1 h-1 mx-1 rounded ${active ? "bg-primary" : "bg-muted"}`} />}
              </div>
            );
          })}
        </div>

        {/* Driver info */}
        {driverProfile && (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold">{driverProfile.full_name}</p>
                  <p className="text-sm text-muted-foreground capitalize">{driverProfile.vehicle_type}</p>
                  {speedKmh !== null && speedKmh > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">🚗 {speedKmh} km/h</p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  onClick={() => window.open(`tel:${driverProfile.phone}`, "_self")}
                >
                  <Phone className="w-4 h-4" /> Ligar
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Order summary */}
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Entrega em: {order?.address || "Endereço não informado"}</span>
            </div>
            <div className="border-t pt-2 mt-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total do pedido</span>
                <span className="font-bold">R$ {Number(order?.total || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span className="text-muted-foreground">Pagamento</span>
                <Badge variant="outline">{order?.payment_method}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {!driverLocation && status !== "delivered" && status !== "cancelled" && (
          <div className="text-center py-4 text-muted-foreground text-sm">
            <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
            Aguardando entregador aceitar o pedido...
          </div>
        )}
      </div>
    </div>
  );
};

export default OrderTracking;
