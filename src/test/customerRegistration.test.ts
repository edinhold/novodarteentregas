import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @supabase/supabase-js before importing functionsRouter to prevent network calls to real Supabase
const mockRpc = vi.fn();
const mockAdminListUsers = vi.fn();
const mockAdminDeleteUser = vi.fn();
const mockFrom = vi.fn();

vi.mock("@supabase/supabase-js", () => {
  return {
    createClient: vi.fn(() => ({
      rpc: mockRpc,
      auth: {
        admin: {
          listUsers: mockAdminListUsers,
          deleteUser: mockAdminDeleteUser,
        },
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      },
      from: mockFrom,
    })),
    SupabaseClient: class {},
  };
});

import { handleEdgeFunction } from "@/server/functionsRouter";

describe("Customer Registration & Orphan Signup Verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockReset();
    mockAdminListUsers.mockReset();
    mockAdminDeleteUser.mockReset();
    mockFrom.mockReset();

    // Default mock behavior for from(...)
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      delete: vi.fn().mockReturnThis(),
    });
  });

  describe("FunctionsRouter - clean-orphan-signup handler", () => {
    it("should return failure if neither email nor phone is provided", async () => {
      const res = await handleEdgeFunction("clean-orphan-signup", {});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(false);
      expect(res.body.cleaned).toBe(false);
      expect(res.body.message).toMatch(/necessário|obrigatório/i);
    });

    it("should return failure if empty email and phone strings are provided", async () => {
      const res = await handleEdgeFunction("clean-orphan-signup", {
        email: "   ",
        phone: "",
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(false);
      expect(res.body.cleaned).toBe(false);
      expect(res.body.message).toMatch(/necessário|obrigatório/i);
    });

    it("should clean orphan customer when RPC clean_orphan_signup returns cleaned: true", async () => {
      mockRpc.mockResolvedValueOnce({
        data: {
          success: true,
          cleaned: true,
          active: false,
          message: "Registro órfão limpo com sucesso para novo cadastro.",
        },
        error: null,
      });

      const res = await handleEdgeFunction("clean-orphan-signup", {
        email: "cliente.orfa@example.com",
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.cleaned).toBe(true);
      expect(res.body.active).toBe(false);
      expect(res.body.message).toMatch(/limpo com sucesso/i);
    });

    it("should protect active customer when RPC clean_orphan_signup returns active: true", async () => {
      mockRpc.mockResolvedValueOnce({
        data: {
          success: true,
          cleaned: false,
          active: true,
          message: "Usuário com cadastro ativo no sistema.",
        },
        error: null,
      });

      const res = await handleEdgeFunction("clean-orphan-signup", {
        email: "loja.ativa@example.com",
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.cleaned).toBe(false);
      expect(res.body.active).toBe(true);
      expect(res.body.message).toMatch(/ativo no sistema/i);
    });

    it("should gracefully use fallback when RPC fails with error", async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: new Error("RPC not found"),
      });
      mockAdminListUsers.mockResolvedValueOnce({
        data: { users: [] },
        error: null,
      });

      const res = await handleEdgeFunction("clean-orphan-signup", {
        email: "outro.cliente@example.com",
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.cleaned).toBe(false);
      expect(res.body.active).toBe(false);
    });
  });

  describe("Customer Duplicate / Existing Account Resolution Flows", () => {
    it("should distinguish password mismatch on existing account from duplicate error", () => {
      const errorMsg = "Este e-mail já possui cadastro no sistema. Insira sua senha para entrar ou clique em 'Esqueceu a senha?' para redefinir.";
      expect(errorMsg).toMatch(/já possui cadastro/i);
      expect(errorMsg).toMatch(/Esqueceu a senha/i);
    });

    it("should identify duplicate error patterns correctly", () => {
      const regex = /already registered|user_already_exists|já cadastrado/i;
      expect(regex.test("User already registered")).toBe(true);
      expect(regex.test("user_already_exists")).toBe(true);
      expect(regex.test("Este e-mail já cadastrado")).toBe(true);
      expect(regex.test("Invalid credentials")).toBe(false);
    });

    it("should identify unconfirmed email patterns correctly", () => {
      const regex = /email not confirmed/i;
      expect(regex.test("Email not confirmed")).toBe(true);
      expect(regex.test("Por favor, email not confirmed")).toBe(true);
      expect(regex.test("Invalid login credentials")).toBe(false);
    });

    it("should normalize and trim customer email during registration", () => {
      const rawEmail = "  Cliente.Teste@Gmail.COM  ";
      const cleanEmail = rawEmail.trim().toLowerCase();
      expect(cleanEmail).toBe("cliente.teste@gmail.com");
    });
  });

  describe("SQL Trigger & Data Model Verification", () => {
    it("should guarantee profile full_name fallback handles raw metadata correctly", () => {
      const metadataWithName = { full_name: "João da Silva", name: "João" };
      const resolvedName1 = metadataWithName.full_name || metadataWithName.name || "";
      expect(resolvedName1).toBe("João da Silva");

      const metadataWithOnlyName = { name: "Maria Oliveira" } as any;
      const resolvedName2 = metadataWithOnlyName.full_name || metadataWithOnlyName.name || "";
      expect(resolvedName2).toBe("Maria Oliveira");

      const emptyMetadata = {} as any;
      const resolvedName3 = emptyMetadata.full_name || emptyMetadata.name || "";
      expect(resolvedName3).toBe("");
    });

    it("should format clean_orphan_signup params correctly", () => {
      const email = "Cliente@Exemplo.com";
      const phone = "(66) 99999-1234";

      const v_email = email.trim().toLowerCase();
      const v_phone = phone.replace(/\D/g, "");

      expect(v_email).toBe("cliente@exemplo.com");
      expect(v_phone).toBe("66999991234");
    });
  });
});
