import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeStoreDeliveryCancellation } from "../lib/cancelStoreDelivery";

// Mock Supabase
vi.mock("../integrations/supabase/client", () => {
  return {
    supabase: {
      rpc: vi.fn(),
      from: vi.fn(),
    },
  };
});

// Mock Push Notification
vi.mock("../lib/push", () => {
  return {
    cancelDeliveryNotification: vi.fn(),
  };
});

describe("Store Delivery Cancellation Unit Tests", () => {
  let mockQueryClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryClient = {
      invalidateQueries: vi.fn(),
    };
  });

  it("should return false if requestId is empty or null", async () => {
    const result = await executeStoreDeliveryCancellation("", mockQueryClient);
    expect(result).toBe(false);
  });

  it("should execute RPC cancellation successfully and invalidate queries", async () => {
    const { supabase } = await import("../integrations/supabase/client");

    // Mock RPC success
    (supabase.rpc as any).mockResolvedValue({ data: true, error: null });

    const result = await executeStoreDeliveryCancellation("req-123", mockQueryClient, "store-user-1");

    expect(result).toBe(true);
    expect(supabase.rpc).toHaveBeenCalledWith("cancel_delivery_request", { p_request_id: "req-123" });
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["my-delivery-requests"] });
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["my-credits"] });
  });

  it("should append cancellation reason into notes when justification reason is provided", async () => {
    const { supabase } = await import("../integrations/supabase/client");

    const mockSelect = vi.fn().mockReturnThis();
    const mockEq = vi.fn().mockReturnThis();
    const mockMaybeSingle = vi.fn().mockResolvedValue({ data: { notes: "Observação original" } });
    const mockUpdate = vi.fn().mockReturnThis();

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === "delivery_requests") {
        return {
          select: mockSelect,
          eq: mockEq,
          maybeSingle: mockMaybeSingle,
          update: mockUpdate,
        };
      }
      return {};
    });

    (supabase.rpc as any).mockResolvedValue({ data: true, error: null });

    const result = await executeStoreDeliveryCancellation(
      "req-456",
      mockQueryClient,
      "store-user-1",
      "Cliente desistiu do pedido"
    );

    expect(result).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        notes: expect.stringContaining("[MOTIVO DO CANCELAMENTO PELA LOJA: Cliente desistiu do pedido]"),
      })
    );
  });
});
