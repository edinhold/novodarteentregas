import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "driver-1", user_metadata: { full_name: "Motorista Teste" }, phone: "66999999999" },
    loading: false,
    signOut: vi.fn(),
  }),
}));

import DriverPanel from "@/pages/DriverPanel";

describe("DriverPanel render check", () => {
  it("renders DriverPanel without throwing", () => {
    const qc = new QueryClient();
    const html = renderToString(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <DriverPanel />
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(html.length).toBeGreaterThan(0);
  });
});
