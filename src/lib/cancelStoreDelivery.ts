import { supabase } from "@/integrations/supabase/client";
import { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cancelDeliveryNotification } from "@/lib/push";

export async function executeStoreDeliveryCancellation(
  requestId: string,
  queryClient: QueryClient,
  activeUserId?: string,
  cancellationReason?: string
): Promise<boolean> {
  if (!requestId) return false;

  try {
    // Prepend/append cancellation reason into notes for traceability
    if (cancellationReason && cancellationReason.trim()) {
      try {
        const { data: currentReq } = await supabase
          .from("delivery_requests")
          .select("notes")
          .eq("id", requestId)
          .maybeSingle();

        const reasonTag = `[MOTIVO DO CANCELAMENTO PELA LOJA: ${cancellationReason.trim()}]`;
        const updatedNotes = currentReq?.notes 
          ? `${currentReq.notes} ${reasonTag}`
          : reasonTag;

        await supabase
          .from("delivery_requests")
          .update({ notes: updatedNotes, updated_at: new Date().toISOString() })
          .eq("id", requestId);
      } catch (err) {
        console.warn("[cancelStoreDelivery] Could not update cancellation notes:", err);
      }
    }
    // 1. Try RPC cancellation first
    const { error: rpcError } = await (supabase as any).rpc("cancel_delivery_request", {
      p_request_id: requestId,
    });

    if (rpcError) {
      console.warn("[cancelStoreDelivery] RPC failed, falling back to direct table update:", rpcError);

      // 2. Direct Fallback: Fetch request details
      const { data: request, error: fetchError } = await supabase
        .from("delivery_requests")
        .select("id, status, credit_cost, group_id, store_owner_id, restaurant_id")
        .eq("id", requestId)
        .maybeSingle();

      if (fetchError || !request) {
        throw new Error(fetchError?.message || "Solicitação de entrega não encontrada");
      }

      if (request.status === "delivered") {
        toast.error("Esta entrega já foi concluída e não pode ser cancelada.");
        return false;
      }

      if (request.status !== "cancelled") {
        // If part of a group, cancel group
        if (request.group_id) {
          await supabase
            .from("delivery_groups")
            .update({ status: "cancelled", updated_at: new Date().toISOString() })
            .eq("id", request.group_id);

          await supabase
            .from("delivery_requests")
            .update({ status: "cancelled", updated_at: new Date().toISOString() })
            .eq("group_id", request.group_id)
            .neq("status", "delivered");
        } else {
          await supabase
            .from("delivery_requests")
            .update({ status: "cancelled", updated_at: new Date().toISOString() })
            .eq("id", requestId);
        }

        // Delete pending driver earnings
        await supabase
          .from("driver_earnings")
          .delete()
          .eq("delivery_request_id", requestId)
          .eq("status", "pending");

        // Refund credits back to store owner wallet
        const refundAmount = Number(request.credit_cost) || 0;
        const targetOwnerId = request.store_owner_id || activeUserId;

        if (refundAmount > 0 && targetOwnerId) {
          const { data: currentCredits } = await supabase
            .from("store_credits")
            .select("balance")
            .eq("user_id", targetOwnerId)
            .maybeSingle();

          const newBalance = (Number(currentCredits?.balance) || 0) + refundAmount;

          await supabase.from("store_credits").upsert(
            {
              user_id: targetOwnerId,
              balance: newBalance,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" }
          );
        }
      }
    }

    // 3. Trigger backend push notification cancellation (non-blocking)
    void cancelDeliveryNotification(requestId);

    // 4. Invalidate all store and driver queries
    queryClient.invalidateQueries({ queryKey: ["my-delivery-requests"] });
    queryClient.invalidateQueries({ queryKey: ["my-credits"] });
    queryClient.invalidateQueries({ queryKey: ["my-delivery-groups"] });
    queryClient.invalidateQueries({ queryKey: ["assigned-driver-info"] });
    queryClient.invalidateQueries({ queryKey: ["pending-reassignable"] });
    queryClient.invalidateQueries({ queryKey: ["store-deliveries"] });

    toast.success("Corrida cancelada com sucesso. Créditos devolvidos!");
    return true;
  } catch (err: any) {
    console.error("[cancelStoreDelivery] Error cancelling request:", err);
    toast.error(err.message || "Erro ao cancelar corrida");
    return false;
  }
}
