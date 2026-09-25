import { useQuery } from "@tanstack/react-query";
import { supabase, createFreshChannel } from "@/integrations/supabase/client";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

export const useDriverLocations = () => {
  const queryClient = useQueryClient();

  // Realtime subscription
  useEffect(() => {
    const channel = createFreshChannel("driver_locations_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "driver_locations" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["driver_locations"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return useQuery({
    queryKey: ["driver_locations"],
    queryFn: async () => {
      // Show drivers active in the last 30 minutes to prevent false offlines
      const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("driver_locations")
        .select("*")
        .gte("updated_at", thirtyMinAgo);
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 15000, // fallback polling every 15s
  });
};
