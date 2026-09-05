import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

export type DriverStatus = "available" | "in_delivery" | "inactive";

export interface DriverWithLocation {
  id: string;
  user_id: string;
  full_name: string;
  driver_code: string;
  is_active: boolean;
  latitude: number | null;
  longitude: number | null;
  updated_at: string | null;
  status: DriverStatus;
  active_delivery_id?: string;
}

export const useAllDriversStatus = () => {
  const queryClient = useQueryClient();

  // Realtime subscription for locations and delivery requests
  useEffect(() => {
    const channel = supabase
      .channel("global_driver_status_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "driver_locations" },
        () => queryClient.invalidateQueries({ queryKey: ["all_drivers_status"] })
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "delivery_requests" },
        () => queryClient.invalidateQueries({ queryKey: ["all_drivers_status"] })
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "drivers" },
        () => queryClient.invalidateQueries({ queryKey: ["all_drivers_status"] })
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return useQuery({
    queryKey: ["all_drivers_status"],
    queryFn: async () => {
      // 1. Fetch all drivers
      const { data: drivers, error: driversError } = await supabase
        .from("drivers")
        .select("id, user_id, full_name, driver_code, is_active");
      
      if (driversError) throw driversError;

      // 2. Fetch all latest locations
      const { data: locations, error: locationsError } = await supabase
        .from("driver_locations")
        .select("*");
      
      if (locationsError) throw locationsError;

      // 3. Fetch active deliveries
      const { data: activeDeliveries, error: deliveriesError } = await supabase
        .from("delivery_requests")
        .select("id, driver_id, status")
        .in("status", ["accepted", "picked_up"]);
      
      if (deliveriesError) throw deliveriesError;

      // Create maps for quick lookup
      const locationMap = new Map(locations.map(l => [l.user_id, l]));
      const deliveryMap = new Map(activeDeliveries.map(d => [d.driver_id, d]));

      // Combine everything
      const combined: DriverWithLocation[] = drivers.map(driver => {
        const location = locationMap.get(driver.user_id);
        const activeDelivery = deliveryMap.get(driver.user_id);

        let status: DriverStatus = "inactive";
        if (driver.is_active) {
          status = activeDelivery ? "in_delivery" : "available";
        }

        return {
          id: driver.id,
          user_id: driver.user_id,
          full_name: driver.full_name || "Motorista sem nome",
          driver_code: driver.driver_code || "---",
          is_active: driver.is_active,
          latitude: location?.latitude || null,
          longitude: location?.longitude || null,
          updated_at: location?.updated_at || null,
          status,
          active_delivery_id: activeDelivery?.id
        };
      });

      return combined;
    },
    refetchInterval: 30000, // Refresh every 30s as fallback
  });
};
