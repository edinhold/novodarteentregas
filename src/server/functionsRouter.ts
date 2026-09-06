import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Helper to access Supabase in server context
function getSupabaseServer(authHeader?: string | null): SupabaseClient {
  const rawUrl = process.env.VITE_SUPABASE_URL;
  const url =
    typeof rawUrl === "string" && rawUrl.trim().startsWith("http")
      ? rawUrl.trim()
      : "https://qhlunszfcpzsfjjugkus.supabase.co";

  // Prefer service role key if available, otherwise publishable key
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const rawKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const anonKey =
    typeof rawKey === "string" && rawKey.trim().length > 0
      ? rawKey.trim()
      : "sb_publishable_xp0FiNgyQFvsdy9SXeGnSA_iUehC_FO";

  const keyToUse = serviceKey || anonKey;
  const headers: Record<string, string> = {};
  if (authHeader) {
    headers["Authorization"] = authHeader;
  }

  return createClient(url, keyToUse, {
    auth: { persistSession: false },
    global: { headers },
  });
}

// Extract authenticated caller safely
async function getCaller(supabase: SupabaseClient, authHeader?: string | null) {
  try {
    const token = authHeader?.replace(/^Bearer\s+/i, "")?.trim();
    if (token) {
      const { data, error } = await supabase.auth.getUser(token);
      if (!error && data?.user) return data.user;
    }
    const { data } = await supabase.auth.getUser();
    return data?.user || null;
  } catch {
    return null;
  }
}

// Check admin role
async function checkAdmin(supabase: SupabaseClient, userId: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

// OneSignal helper types and functions
const ONESIGNAL_API = "https://api.onesignal.com/notifications?c=push";
const ANDROID_CHANNEL_ID = "novas_entregas_v1";

function getOneSignalConfig() {
  let envAppId = "";
  let envApiKey = "";
  try {
    // Attempt reading from .env to override stale container process.env
    const fs = (globalThis as any).process?.getBuiltinModule
      ? (globalThis as any).process.getBuiltinModule("fs")
      : undefined;
    if (fs && fs.existsSync && fs.existsSync(".env")) {
      const content = fs.readFileSync(".env", "utf8");
      const idMatch = content.match(/^ONESIGNAL_APP_ID=["']?([^"'\r\n]+)["']?/m)
        || content.match(/^VITE_ONESIGNAL_APP_ID=["']?([^"'\r\n]+)["']?/m);
      if (idMatch) envAppId = idMatch[1].trim();
      const keyMatch = content.match(/^ONESIGNAL_APP_API_KEY=["']?([^"'\r\n]+)["']?/m);
      if (keyMatch) envApiKey = keyMatch[1].trim();
    }
  } catch {
    // fallback to process.env
  }

  const appId = (envAppId || process.env.VITE_ONESIGNAL_APP_ID || process.env.ONESIGNAL_APP_ID || "").trim();
  const apiKey = (envApiKey || process.env.ONESIGNAL_APP_API_KEY || "").trim();
  return { appId, apiKey };
}

function mask(value?: string | null): string {
  if (!value) return "";
  return value.length <= 8 ? "***" : `***${value.slice(-8)}`;
}

export interface RouterResponse {
  status: number;
  body: Record<string, any>;
}

export async function handleEdgeFunction(
  functionName: string,
  reqBody: any,
  authHeader?: string | null
): Promise<RouterResponse> {
  const requestId = crypto.randomUUID();
  const supabase = getSupabaseServer(authHeader);

  // 1. push-config
  if (functionName === "push-config") {
    const { appId } = getOneSignalConfig();
    return {
      status: 200,
      body: {
        success: !!appId,
        code: appId ? undefined : "SECRETS_AUSENTES",
        message: appId ? undefined : "ONESIGNAL_APP_ID não configurado no backend.",
        app_id: appId,
        android_channel_id: ANDROID_CHANNEL_ID,
        sdk_version: "web-v16",
        request_id: requestId,
      },
    };
  }

  // 2. push-diagnostics
  if (functionName === "push-diagnostics") {
    const caller = await getCaller(supabase, authHeader);
    if (!caller) {
      return {
        status: 200,
        body: {
          success: false,
          code: "NAO_AUTENTICADO",
          message: "Sessão expirada. Entre novamente.",
          request_id: requestId,
        },
      };
    }

    const isAdmin = await checkAdmin(supabase, caller.id);
    const targetUserId = reqBody?.user_id ?? (isAdmin ? undefined : caller.id);
    if (!isAdmin && targetUserId !== caller.id) {
      return {
        status: 200,
        body: {
          success: false,
          code: "SEM_PERMISSAO",
          message: "Apenas administradores podem visualizar diagnósticos de terceiros.",
          request_id: requestId,
        },
      };
    }

    const { appId, apiKey } = getOneSignalConfig();
    const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    const { data: drivers } = await supabase
      .from("drivers")
      .select("user_id, full_name, is_online, is_active, approval_status, last_seen_at, driver_code, suspended_until")
      .eq("approval_status", "approved")
      .order("full_name");

    const userIds = (drivers ?? []).map((d) => d.user_id);
    const { data: subsRaw } = await supabase
      .from("push_subscriptions")
      .select("*")
      .in("user_id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);

    const byUser = new Map<string, any[]>();
    for (const s of subsRaw ?? []) {
      (byUser.get(s.user_id) ?? byUser.set(s.user_id, []).get(s.user_id)!).push(s);
    }

    const list = (drivers ?? []).map((d) => {
      const devices = (byUser.get(d.user_id) ?? []).map((s) => ({
        id: s.id,
        subscription_id_masked: mask(s.onesignal_subscription_id),
        subscription_id: s.onesignal_subscription_id,
        platform: s.platform,
        device_name: s.device_name,
        permission_status: s.permission_status,
        subscription_status: s.subscription_status,
        active: s.active,
        app_version: s.app_version,
        sdk_version: s.sdk_version,
        last_seen_at: s.last_seen_at,
      }));

      const isSuspended = d.suspended_until && new Date(d.suspended_until) > new Date();
      const online = d.is_active && d.is_online && !isSuspended && !!d.last_seen_at && d.last_seen_at >= cutoff;

      const recommendations: string[] = [];
      if (devices.length === 0) {
        recommendations.push("Nenhum aparelho registrado. Abra o app no dispositivo do motorista para associar automaticamente.");
      }
      if (devices.some((dev) => dev.permission_status === "denied")) {
        recommendations.push("Permissão de notificações bloqueada no aparelho.");
      }
      if (devices.some((dev) => dev.subscription_status !== "subscribed")) {
        recommendations.push("Dispositivo desinscrito das notificações.");
      }
      if (isSuspended) {
        recommendations.push("Motorista suspenso temporariamente.");
      } else if (!online) {
        recommendations.push("Motorista offline ou sem sinal nos últimos 15 min.");
      }
      if (recommendations.length === 0) {
        recommendations.push("Dispositivo online e apto a receber notificações de novas entregas.");
      }

      return {
        user_id: d.user_id,
        full_name: d.full_name,
        driver_code: d.driver_code,
        online,
        available: d.is_active && !isSuspended,
        approval_status: d.approval_status,
        last_seen_at: d.last_seen_at,
        devices,
        recommendations,
      };
    });

    const detail = targetUserId ? list.find((d) => d.user_id === targetUserId) ?? null : null;

    const { data: logs } = await supabase
      .from("notification_delivery_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(25);

    return {
      status: 200,
      body: {
        success: true,
        request_id: requestId,
        config: {
          app_id_masked: mask(appId),
          app_id_present: !!appId,
          api_key_present: !!apiKey,
          android_channel_id: ANDROID_CHANNEL_ID,
          online_window_minutes: 15,
        },
        drivers: list,
        detail,
        logs: logs ?? [],
      },
    };
  }

  // 3. push-test
  if (functionName === "push-test") {
    const caller = await getCaller(supabase, authHeader);
    if (!caller) {
      return {
        status: 200,
        body: {
          success: false,
          code: "NAO_AUTENTICADO",
          message: "Sessão expirada. Entre novamente.",
          request_id: requestId,
        },
      };
    }

    const isAdmin = await checkAdmin(supabase, caller.id);
    if (!isAdmin) {
      return {
        status: 200,
        body: {
          success: false,
          code: "SEM_PERMISSAO",
          message: "Apenas administradores podem enviar testes.",
          request_id: requestId,
        },
      };
    }

    const { appId, apiKey } = getOneSignalConfig();

    if (!appId || !apiKey) {
      return {
        status: 200,
        body: {
          success: false,
          edge_function_ok: true,
          code: "SECRETS_AUSENTES",
          message: "ONESIGNAL_APP_ID ou ONESIGNAL_APP_API_KEY não configurados no servidor.",
          request_id: requestId,
        },
      };
    }

    const mode: string = reqBody?.mode ?? "driver";
    const platformFilter: string = reqBody?.platform ?? "all";

    let subs: any[] = [];
    if (mode === "device" && reqBody?.subscription_id) {
      const { data } = await supabase
        .from("push_subscriptions")
        .select("onesignal_subscription_id, platform, user_id")
        .eq("onesignal_subscription_id", reqBody.subscription_id)
        .maybeSingle();
      if (data) subs = [data];
    } else if (mode === "broadcast") {
      const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const { data: onlineDrivers } = await supabase
        .from("drivers")
        .select("user_id")
        .eq("is_active", true)
        .eq("approval_status", "approved")
        .eq("is_online", true)
        .gte("last_seen_at", cutoff);

      const ids = (onlineDrivers ?? []).map((d) => d.user_id);
      if (ids.length > 0) {
        const { data } = await supabase
          .from("push_subscriptions")
          .select("onesignal_subscription_id, platform, user_id")
          .in("user_id", ids)
          .eq("active", true)
          .eq("subscription_status", "subscribed");
        subs = data ?? [];
      }
    } else if (reqBody?.driver_user_id) {
      const { data } = await supabase
        .from("push_subscriptions")
        .select("onesignal_subscription_id, platform, user_id")
        .eq("user_id", reqBody.driver_user_id)
        .eq("active", true)
        .eq("subscription_status", "subscribed");
      subs = data ?? [];
    }

    if (platformFilter !== "all") {
      subs = subs.filter((s) => (platformFilter === "android_apk" ? s.platform === "android_apk" : s.platform !== "android_apk"));
    }

    if (subs.length === 0) {
      return {
        status: 200,
        body: {
          success: false,
          edge_function_ok: true,
          code: "SEM_INSCRICOES",
          message: "Nenhum dispositivo com notificações ativas encontrado para o teste selecionado.",
          request_id: requestId,
        },
      };
    }

    // Send push via OneSignal REST API
    const subIds = Array.from(new Set(subs.map((s) => s.onesignal_subscription_id))).filter(Boolean);
    const payload = {
      app_id: appId,
      include_subscription_ids: subIds,
      target_channel: "push",
      headings: { pt: "🔔 Teste de Notificação Duarte", en: "Duarte Push Test" },
      contents: { pt: "O sistema de notificações push está funcionando perfeitamente!", en: "Push notifications are working perfectly!" },
      data: { tipo: "teste_push", rota: "/entregador", evento_id: `teste_push:${requestId}` },
      android_channel_id: ANDROID_CHANNEL_ID,
      priority: 10,
      ttl: 120,
    };

    try {
      const osRes = await fetch(ONESIGNAL_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          Authorization: `Key ${apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      const osData = await osRes.json().catch(() => ({}));
      const ok = osRes.ok && !!osData?.id && (!osData.errors || osData.errors.length === 0);

      // Log delivery
      await supabase.from("notification_delivery_logs").insert({
        event_type: "teste_push",
        request_id: requestId,
        recipients_requested: subIds.length,
        recipients_found: osData?.recipients ?? (ok ? subIds.length : 0),
        onesignal_notification_id: osData?.id ? mask(osData.id) : null,
        response_status: osRes.status,
        response_body_sanitized: JSON.stringify(osData).slice(0, 1000),
        error_code: ok ? null : (osData.errors?.[0] ?? `HTTP ${osRes.status}`),
        platform: platformFilter,
      });

      return {
        status: 200,
        body: {
          success: ok,
          edge_function_ok: true,
          onesignal_accepted: ok,
          message: ok
            ? `Notificação de teste enviada com sucesso para ${subIds.length} aparelho(s)!`
            : `OneSignal recusou envio: ${JSON.stringify(osData?.errors || osData)}`,
          request_id: requestId,
          recipients_requested: subIds.length,
          recipients_found: osData?.recipients ?? (ok ? subIds.length : 0),
        },
      };
    } catch (osErr: any) {
      return {
        status: 200,
        body: {
          success: false,
          edge_function_ok: true,
          code: "ERRO_ONESIGNAL",
          message: `Falha ao conectar com OneSignal: ${osErr.message}`,
          request_id: requestId,
        },
      };
    }
  }

  // 4. register-driver-device (Dispositivo exclusivo por motorista)
  if (functionName === "register-driver-device") {
    const caller = await getCaller(supabase, authHeader);
    const motoristaId = reqBody?.motorista_id || caller?.id;
    const subscriptionId = reqBody?.subscription_id || reqBody?.onesignal_subscription_id;
    const platform = reqBody?.platform || reqBody?.plataforma || "web_pwa";
    const permissionStatus = reqBody?.permission_status || "granted";
    const deviceName = reqBody?.device_name || "Dispositivo Motorista";
    const deviceModel = reqBody?.device_model || null;

    if (!motoristaId || !subscriptionId) {
      console.warn("[DeviceRegistration:error]", { motoristaId, subscriptionId, reason: "MISSING_PARAMS" });
      return {
        status: 200,
        body: {
          success: false,
          code: "PARAMETROS_INVALIDOS",
          message: "Informe motorista_id e subscription_id.",
          request_id: requestId,
        },
      };
    }

    console.log("[DeviceRegistration:start]", {
      motorista_id: motoristaId,
      subscription_id: subscriptionId,
      plataforma: platform,
    });

    try {
      // 1. Identificar dispositivos ativos anteriores para desativação automática
      const { data: previousDevices } = await supabase
        .from("driver_push_devices")
        .select("subscription_id")
        .eq("driver_id", motoristaId)
        .eq("active", true)
        .neq("subscription_id", subscriptionId);

      const prevIds = (previousDevices ?? []).map((p) => p.subscription_id).filter(Boolean);
      if (prevIds.length > 0) {
        console.log("[DeviceRegistration:replaced_previous]", {
          motorista_id: motoristaId,
          previous_subscription_ids: prevIds,
        });
      }

      // 2. Desativar quaisquer outros dispositivos do motorista (regra: somente 1 ativo)
      await supabase
        .from("driver_push_devices")
        .update({
          active: false,
          subscription_status: "inactive",
          updated_at: new Date().toISOString(),
        })
        .eq("driver_id", motoristaId)
        .neq("subscription_id", subscriptionId);

      await supabase
        .from("push_subscriptions")
        .update({
          active: false,
          subscription_status: "unsubscribed",
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", motoristaId)
        .neq("onesignal_subscription_id", subscriptionId);

      // 3. Upsert na tabela driver_push_devices
      const { data: existingDev } = await supabase
        .from("driver_push_devices")
        .select("id")
        .eq("subscription_id", subscriptionId)
        .maybeSingle();

      if (existingDev) {
        await supabase
          .from("driver_push_devices")
          .update({
            driver_id: motoristaId,
            external_id: motoristaId,
            platform,
            active: true,
            subscription_status: "active",
            permission_status: permissionStatus,
            last_seen_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingDev.id);
      } else {
        await supabase
          .from("driver_push_devices")
          .insert({
            driver_id: motoristaId,
            external_id: motoristaId,
            subscription_id: subscriptionId,
            platform,
            active: true,
            subscription_status: "active",
            permission_status: permissionStatus,
            last_seen_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
      }

      // 4. Upsert na tabela push_subscriptions
      await supabase
        .from("push_subscriptions")
        .upsert(
          {
            user_id: motoristaId,
            profile_type: "motorista",
            platform,
            device_name: deviceName,
            device_model: deviceModel,
            onesignal_subscription_id: subscriptionId,
            onesignal_external_id: motoristaId,
            permission_status: permissionStatus,
            subscription_status: "subscribed",
            active: true,
            last_seen_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "onesignal_subscription_id" }
        );

      console.log("[DeviceRegistration:success]", {
        motorista_id: motoristaId,
        subscription_id: subscriptionId,
        status: "active",
        platform,
      });

      return {
        status: 200,
        body: {
          success: true,
          message: "Dispositivo registrado e ativado como exclusivo com sucesso.",
          motorista_id: motoristaId,
          subscription_id: subscriptionId,
          status: "active",
          request_id: requestId,
        },
      };
    } catch (err: any) {
      console.warn("[DeviceRegistration:error]", { motorista_id: motoristaId, error: err?.message });
      return {
        status: 200,
        body: {
          success: false,
          code: "ERRO_REGISTRO_DISPOSITIVO",
          message: err?.message || "Erro ao registrar dispositivo.",
          request_id: requestId,
        },
      };
    }
  }

  // 5. delete-driver-device (Exclusão manual pelo motorista ou admin)
  if (functionName === "delete-driver-device") {
    const caller = await getCaller(supabase, authHeader);
    const motoristaId = reqBody?.motorista_id || caller?.id;
    const subscriptionId = reqBody?.subscription_id || reqBody?.onesignal_subscription_id;

    if (!motoristaId && !subscriptionId) {
      return {
        status: 200,
        body: {
          success: false,
          code: "PARAMETROS_INVALIDOS",
          message: "Informe motorista_id ou subscription_id.",
          request_id: requestId,
        },
      };
    }

    try {
      if (subscriptionId) {
        await supabase
          .from("driver_push_devices")
          .update({
            active: false,
            subscription_status: "deleted",
            updated_at: new Date().toISOString(),
          })
          .eq("subscription_id", subscriptionId);

        await supabase
          .from("push_subscriptions")
          .update({
            active: false,
            subscription_status: "unsubscribed",
            updated_at: new Date().toISOString(),
          })
          .eq("onesignal_subscription_id", subscriptionId);
      } else if (motoristaId) {
        await supabase
          .from("driver_push_devices")
          .update({
            active: false,
            subscription_status: "deleted",
            updated_at: new Date().toISOString(),
          })
          .eq("driver_id", motoristaId);

        await supabase
          .from("push_subscriptions")
          .update({
            active: false,
            subscription_status: "unsubscribed",
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", motoristaId);
      }

      console.log("[DeviceDeletion:success]", {
        motorista_id: motoristaId,
        subscription_id: subscriptionId,
        deleted_by: caller?.id || motoristaId,
      });

      return {
        status: 200,
        body: {
          success: true,
          message: "Dispositivo desvinculado com sucesso.",
          request_id: requestId,
        },
      };
    } catch (err: any) {
      return {
        status: 200,
        body: {
          success: false,
          code: "ERRO_DESVINCULAR",
          message: err?.message || "Erro ao desvincular dispositivo.",
          request_id: requestId,
        },
      };
    }
  }

  // 6. accept-delivery (Aceite exclusivo atômico e protegido contra concorrência)
  if (functionName === "accept-delivery") {
    const caller = await getCaller(supabase, authHeader);
    const motoristaId = reqBody?.motorista_id || caller?.id;
    const pedidoId = reqBody?.pedido_id || reqBody?.request_id;

    if (!motoristaId || !pedidoId) {
      return {
        status: 200,
        body: {
          success: false,
          code: "PARAMETROS_INVALIDOS",
          message: "Informe motorista_id e pedido_id.",
          request_id: requestId,
        },
      };
    }

    console.log("[DeliveryAcceptance:attempt]", {
      motorista_id: motoristaId,
      pedido_id: pedidoId,
      timestamp: new Date().toISOString(),
    });

    try {
      // 1. Verificar se pedido existe e se ainda está pendente
      const { data: currentOrder } = await supabase
        .from("delivery_requests")
        .select("id, status, driver_id, driver_fee")
        .eq("id", pedidoId)
        .maybeSingle();

      if (!currentOrder) {
        return {
          status: 200,
          body: {
            success: false,
            accepted: false,
            code: "PEDIDO_NAO_ENCONTRADO",
            message: "Pedido de entrega não encontrado.",
            request_id: requestId,
          },
        };
      }

      if (currentOrder.status !== "pending" || currentOrder.driver_id) {
        console.log("[DeliveryAcceptance:conflict]", {
          motorista_id: motoristaId,
          pedido_id: pedidoId,
          reason: "ALREADY_ACCEPTED_OR_NOT_PENDING",
          current_driver_id: currentOrder.driver_id,
          status: currentOrder.status,
        });

        return {
          status: 200,
          body: {
            success: false,
            accepted: false,
            code: "JA_ACEITO",
            message: "Esta entrega já foi aceita por outro motorista.",
            request_id: requestId,
          },
        };
      }

      // 2. Executar aceite atômico via RPC accept_delivery_request (proteção concorrencial FOR UPDATE)
      const { data: rpcData, error: rpcError } = await supabase.rpc("accept_delivery_request", {
        p_motorista_id: motoristaId,
        p_pedido_id: pedidoId,
      });

      if (rpcError) {
        const rawMsg = rpcError.message || "";
        const isConflict = /já foi assumida|já foi aceita|direcionada|ALREADY_ACCEPTED/i.test(rawMsg);
        if (isConflict) {
          console.log("[DeliveryAcceptance:conflict]", {
            motorista_id: motoristaId,
            pedido_id: pedidoId,
            reason: "RPC_CONFLICT",
            error: rawMsg,
          });
          return {
            status: 200,
            body: {
              success: false,
              accepted: false,
              code: "JA_ACEITO",
              message: "Esta entrega já foi aceita por outro motorista.",
              request_id: requestId,
            },
          };
        }
        throw rpcError;
      }

      if (rpcData && (rpcData as any).accepted === false) {
        console.log("[DeliveryAcceptance:conflict]", {
          motorista_id: motoristaId,
          pedido_id: pedidoId,
          reason: (rpcData as any).reason || "ALREADY_ACCEPTED",
        });
        return {
          status: 200,
          body: {
            success: false,
            accepted: false,
            code: "JA_ACEITO",
            message: (rpcData as any).message || "Esta entrega já foi aceita por outro motorista.",
            request_id: requestId,
          },
        };
      }

      const nowIso = new Date().toISOString();

      // Garantir que accepted_at está preenchido
      await supabase
        .from("delivery_requests")
        .update({ accepted_at: nowIso })
        .eq("id", pedidoId)
        .is("accepted_at", null);

      // 3. Cancelar notificações pendentes deste pedido
      await supabase
        .from("notification_jobs")
        .update({ status: "cancelled", last_error: "Chamado aceito pelo motorista." })
        .eq("pedido_id", pedidoId);

      console.log("[DeliveryAcceptance:success]", {
        motorista_id: motoristaId,
        pedido_id: pedidoId,
        status_before: "pending",
        status_after: "accepted",
        accepted_at: nowIso,
      });

      return {
        status: 200,
        body: {
          success: true,
          accepted: true,
          message: "Entrega aceita com sucesso!",
          driver_fee: (rpcData as any)?.driver_fee || currentOrder.driver_fee,
          accepted_at: nowIso,
          request_id: requestId,
        },
      };
    } catch (err: any) {
      console.warn("[DeliveryAcceptance:error]", { motorista_id: motoristaId, pedido_id: pedidoId, error: err?.message });
      return {
        status: 200,
        body: {
          success: false,
          accepted: false,
          code: "ERRO_ACEITE",
          message: err?.message || "Erro ao processar aceite da entrega.",
          request_id: requestId,
        },
      };
    }
  }

  // 7. notify-available-drivers
  if (functionName === "notify-available-drivers") {
    const pedidoId = reqBody?.pedido_id;
    if (!pedidoId) {
      return {
        status: 200,
        body: { success: false, code: "PARAMETRO_INVALIDO", message: "Informe pedido_id.", request_id: requestId },
      };
    }

    console.log("[DeliveryNotification:start]", { pedidoId, requestId });

    // Check if delivery request is still pending and unassigned
    const { data: order } = await supabase
      .from("delivery_requests")
      .select("id, status, driver_id, pickup_address, delivery_address")
      .eq("id", pedidoId)
      .maybeSingle();

    if (!order || order.status !== "pending" || order.driver_id) {
      console.log("[DeliveryNotification:skip]", {
        pedidoId,
        status: order?.status,
        driver_id: order?.driver_id,
        reason: "CHAMADO_JA_ACEITO_OU_INDISPONIVEL",
      });
      return {
        status: 200,
        body: {
          success: false,
          code: "PEDIDO_INDISPONIVEL",
          message: "O chamado já foi aceito ou não está mais disponível.",
          request_id: requestId,
        },
      };
    }

    // Check idempotency job
    const eventKey = `nova_entrega:${pedidoId}`;
    const { data: existingJob } = await supabase
      .from("notification_jobs")
      .select("id, status")
      .eq("event_key", eventKey)
      .maybeSingle();

    if (existingJob && existingJob.status === "sent") {
      console.log("[DeliveryNotification:duplicate_prevented]", { pedidoId, eventKey });
      return {
        status: 200,
        body: {
          success: true,
          duplicated: true,
          code: "JA_ENVIADO",
          message: "Notificação deste pedido já foi disparada anteriormente.",
          request_id: requestId,
        },
      };
    }

    // Eligible drivers:
    // - is_active = true
    // - approval_status = 'approved'
    // - is_online = true
    // - not suspended (suspended_until is null or < now)
    const { data: drivers } = await supabase
      .from("drivers")
      .select("id, user_id, full_name, suspended_until")
      .eq("is_active", true)
      .eq("approval_status", "approved")
      .eq("is_online", true);

    const nowTime = new Date().getTime();
    const unsuspendedDrivers = (drivers ?? []).filter(
      (d) => !d.suspended_until || new Date(d.suspended_until).getTime() < nowTime
    );

    if (unsuspendedDrivers.length === 0) {
      console.log("[DeliveryNotification:skip]", { pedidoId, reason: "SEM_MOTORISTAS_ONLINE" });
      return {
        status: 200,
        body: {
          success: false,
          code: "SEM_MOTORISTAS_ONLINE",
          message: "Nenhum motorista online e elegível no momento.",
          drivers_online: 0,
          request_id: requestId,
        },
      };
    }

    // Check which drivers are not currently occupied with an active delivery
    const driverIds = unsuspendedDrivers.map((d) => d.id);
    const { data: activeDeliveries } = await supabase
      .from("delivery_requests")
      .select("driver_id")
      .in("driver_id", driverIds)
      .in("status", ["accepted", "in_transit"]);

    const busyDriverIds = new Set((activeDeliveries ?? []).map((d) => d.driver_id));
    const freeDrivers = unsuspendedDrivers.filter((d) => !busyDriverIds.has(d.id));

    if (freeDrivers.length === 0) {
      console.log("[DeliveryNotification:skip]", { pedidoId, reason: "MOTORISTAS_OCUPADOS" });
      return {
        status: 200,
        body: {
          success: false,
          code: "MOTORISTAS_OCUPADOS",
          message: "Todos os motoristas online estão com entregas em andamento.",
          request_id: requestId,
        },
      };
    }

    // Fetch active push subscriptions for free drivers from BOTH driver_push_devices and push_subscriptions
    const freeUserIds = freeDrivers.map((d) => d.user_id);

    const { data: driverDevices } = await supabase
      .from("driver_push_devices")
      .select("driver_id, subscription_id, platform, active, subscription_status, updated_at")
      .in("driver_id", freeUserIds)
      .eq("active", true)
      .not("subscription_id", "is", null);

    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("onesignal_subscription_id, platform, user_id, active, subscription_status, updated_at")
      .in("user_id", freeUserIds)
      .eq("active", true)
      .not("onesignal_subscription_id", "is", null);

    // DEDUPLICAÇÃO E GARANTIA DE 1 DISPOSITIVO ATIVO POR MOTORISTA
    // Dispositivos antigos ou inativos não podem receber notificações
    const driverActiveSubMap = new Map<string, string>(); // motorista_id -> subscription_id

    // Inserir primeiro os da tabela especializada driver_push_devices
    for (const d of driverDevices ?? []) {
      if (d.active && d.subscription_status === "active" && d.subscription_id) {
        driverActiveSubMap.set(d.driver_id, d.subscription_id);
      }
    }

    // Complementar com push_subscriptions apenas se o motorista ainda não tiver dispositivo atribuído
    for (const s of subs ?? []) {
      if (s.active && s.subscription_status !== "unsubscribed" && s.subscription_status !== "deleted" && s.onesignal_subscription_id) {
        if (!driverActiveSubMap.has(s.user_id)) {
          driverActiveSubMap.set(s.user_id, s.onesignal_subscription_id);
        }
      }
    }

    const subIds = Array.from(new Set(Array.from(driverActiveSubMap.values()))).filter(Boolean);

    if (subIds.length === 0) {
      console.log("[DeliveryNotification:skip]", { pedidoId, reason: "SEM_DISPOSITIVOS_ATIVOS" });
      return {
        status: 200,
        body: {
          success: false,
          code: "SEM_INSCRICOES",
          message: "Os motoristas online não possuem aparelhos registrados com notificações ativas.",
          drivers_online: freeDrivers.length,
          subscriptions_found: 0,
          request_id: requestId,
        },
      };
    }

    const { appId, apiKey } = getOneSignalConfig();

    if (!appId || !apiKey) {
      console.warn("[DeliveryNotification:skip]", { pedidoId, reason: "SECRETS_AUSENTES" });
      return {
        status: 200,
        body: {
          success: false,
          code: "SECRETS_AUSENTES",
          message: "Credenciais OneSignal ausentes. Pedido registrado, mas push não pôde ser entregue.",
          drivers_online: freeDrivers.length,
          subscriptions_found: subIds.length,
          request_id: requestId,
        },
      };
    }

    // Send push com dados completos e rota
    const pushPayload = {
      app_id: appId,
      include_subscription_ids: subIds,
      target_channel: "push",
      headings: { pt: "🚚 Nova entrega disponível", en: "New delivery available" },
      contents: {
        pt: "Um novo chamado de entrega foi criado. Abra o aplicativo para visualizar os detalhes.",
        en: "A new delivery request was created. Open the app to view details.",
      },
      data: {
        tipo: "nova_entrega",
        pedido_id: pedidoId,
        rota: `/entregador?pedido=${pedidoId}`,
        evento_id: eventKey,
      },
      url: `/entregador?pedido=${pedidoId}`,
      android_channel_id: ANDROID_CHANNEL_ID,
      priority: 10,
      ttl: 300,
    };

    const osRes = await fetch(ONESIGNAL_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Key ${apiKey}`,
      },
      body: JSON.stringify(pushPayload),
    });

    const osData = await osRes.json().catch(() => ({}));
    const ok = osRes.ok && !!osData?.id && (!osData.errors || osData.errors.length === 0);

    // Structured Log
    console.log("[DeliveryNotification:dispatched]", {
      pedidoId,
      eligibleDriversCount: freeDrivers.length,
      activeDevicesCount: subIds.length,
      notifiedSubscriptionIds: subIds,
      onesignalNotificationId: osData?.id || null,
    });

    // Record job
    await supabase.from("notification_jobs").upsert(
      {
        event_key: eventKey,
        pedido_id: pedidoId,
        event_type: "nova_entrega",
        status: ok ? "sent" : "failed",
        attempts: 1,
        recipients_count: osData?.recipients ?? (ok ? subIds.length : 0),
        onesignal_notification_id: osData?.id || null,
        last_error: ok ? null : JSON.stringify(osData.errors || osData),
        processed_at: new Date().toISOString(),
      },
      { onConflict: "event_key" }
    );

    // Record log
    await supabase.from("notification_delivery_logs").insert({
      pedido_id: pedidoId,
      event_type: "nova_entrega",
      request_id: requestId,
      recipients_requested: subIds.length,
      recipients_found: osData?.recipients ?? (ok ? subIds.length : 0),
      onesignal_notification_id: osData?.id ? mask(osData.id) : null,
      response_status: osRes.status,
      response_body_sanitized: JSON.stringify(osData).slice(0, 1000),
      error_code: ok ? null : (osData.errors?.[0] ?? `HTTP ${osRes.status}`),
    });

    return {
      status: 200,
      body: {
        success: ok,
        code: ok ? undefined : "FALHA_ONESIGNAL",
        message: ok
          ? `Notificação enviada para ${subIds.length} motorista(s) disponível(is).`
          : "Falha ao despachar notificação via OneSignal.",
        drivers_online: freeDrivers.length,
        recipients: subIds.length,
        request_id: requestId,
      },
    };
  }

  // 5. admin-recharge-store (Recarga Direta vinculada à LOJA)
  if (functionName === "admin-recharge-store") {
    const caller = await getCaller(supabase);
    if (!caller) {
      return {
        status: 200,
        body: { success: false, code: "NAO_AUTENTICADO", message: "Sessão expirada.", request_id: requestId },
      };
    }

    const isAdmin = await checkAdmin(supabase, caller.id);
    if (!isAdmin) {
      return {
        status: 200,
        body: { success: false, code: "SEM_PERMISSAO", message: "Apenas administradores podem lançar recargas.", request_id: requestId },
      };
    }

    const { store_id, store_owner_id, amount, apply_promo, idempotency_key } = reqBody || {};

    if (!store_id || !amount || Number(amount) <= 0) {
      return {
        status: 200,
        body: {
          success: false,
          code: "PARAMETROS_INVALIDOS",
          message: "Informe a loja destinatária e um valor maior que zero.",
          request_id: requestId,
        },
      };
    }

    // Resolve store
    const { data: store, error: storeErr } = await supabase
      .from("restaurants")
      .select("id, name, owner_id")
      .eq("id", store_id)
      .maybeSingle();

    if (storeErr || !store) {
      return {
        status: 200,
        body: {
          success: false,
          code: "LOJA_NAO_ENCONTRADA",
          message: "Loja não encontrada no cadastro de restaurantes.",
          request_id: requestId,
        },
      };
    }

    const effectiveOwnerId = store.owner_id || store_owner_id;
    if (!effectiveOwnerId) {
      return {
        status: 200,
        body: {
          success: false,
          code: "LOJA_SEM_USUARIO",
          message: `A loja "${store.name}" não possui um proprietário associado para titularidade dos créditos.`,
          request_id: requestId,
        },
      };
    }

    // Idempotency check: check if code with this idempotency key was already created
    const cleanIdempKey = idempotency_key ? String(idempotency_key).trim() : null;
    if (cleanIdempKey) {
      const { data: existingCode } = await supabase
        .from("credit_codes")
        .select("*")
        .like("code", `%${cleanIdempKey.slice(0, 8).toUpperCase()}%`)
        .maybeSingle();

      if (existingCode) {
        // Already processed
        return {
          status: 200,
          body: {
            success: true,
            duplicated: true,
            message: "Esta recarga já foi processada anteriormente (idempotência garantida).",
            store_id: store.id,
            store_name: store.name,
            credited_amount: existingCode.value,
            request_id: requestId,
          },
        };
      }
    }

    // Calculate promo bonus if requested
    let bonusAmount = 0;
    if (apply_promo) {
      const { data: cfg } = await supabase
        .from("delivery_config")
        .select("promo_credit_percent")
        .limit(1)
        .maybeSingle();
      const pct = Number(cfg?.promo_credit_percent || 0);
      if (pct > 0) {
        bonusAmount = Number(((Number(amount) * pct) / 100).toFixed(2));
      }
    }

    const totalToCredit = Number((Number(amount) + bonusAmount).toFixed(2));

    // Get current balance
    const { data: curCredit } = await supabase
      .from("store_credits")
      .select("balance")
      .eq("user_id", effectiveOwnerId)
      .maybeSingle();

    const previousBalance = Number(curCredit?.balance || 0);
    const newBalance = Number((previousBalance + totalToCredit).toFixed(2));

    // Update or insert store_credits
    const { error: upsertErr } = await supabase
      .from("store_credits")
      .upsert({
        user_id: effectiveOwnerId,
        balance: newBalance,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

    if (upsertErr) {
      return {
        status: 200,
        body: {
          success: false,
          code: "ERRO_SALDO",
          message: `Falha ao atualizar o saldo da loja: ${upsertErr.message}`,
          request_id: requestId,
        },
      };
    }

    // Insert audit record into credit_codes
    const codeSuffix = cleanIdempKey ? cleanIdempKey.slice(0, 8).toUpperCase() : Math.random().toString(36).substring(2, 8).toUpperCase();
    const auditCode = `RECARGA-${store.name.replace(/[^A-Za-z0-9]/g, "").slice(0, 4).toUpperCase()}-${codeSuffix}`;

    await supabase.from("credit_codes").insert({
      code: auditCode,
      value: totalToCredit,
      assigned_to_user_id: effectiveOwnerId,
      used_by: effectiveOwnerId,
      is_used: true,
      used_at: new Date().toISOString(),
    });

    return {
      status: 200,
      body: {
        success: true,
        message: `Recarga de R$ ${Number(amount).toFixed(2)} lançada com sucesso na loja "${store.name}"! Saldo atualizado para R$ ${newBalance.toFixed(2)}.`,
        store_id: store.id,
        store_name: store.name,
        original_amount: Number(amount),
        bonus_amount: bonusAmount,
        total_credited: totalToCredit,
        previous_balance: previousBalance,
        new_balance: newBalance,
        audit_code: auditCode,
        request_id: requestId,
      },
    };
  }

  // 6. generate-credit-codes (Gerar Códigos vinculados à LOJA)
  if (functionName === "generate-credit-codes") {
    const caller = await getCaller(supabase);
    if (!caller) {
      return {
        status: 200,
        body: { success: false, code: "NAO_AUTENTICADO", message: "Sessão expirada.", request_id: requestId },
      };
    }

    const isAdmin = await checkAdmin(supabase, caller.id);
    if (!isAdmin) {
      return {
        status: 200,
        body: { success: false, code: "SEM_PERMISSAO", message: "Apenas administradores podem gerar códigos.", request_id: requestId },
      };
    }

    const { store_id, value, quantity = 1, expiration_days = 30 } = reqBody || {};

    if (!value || Number(value) <= 0) {
      return {
        status: 200,
        body: { success: false, code: "VALOR_INVALIDO", message: "Informe um valor válido maior que zero.", request_id: requestId },
      };
    }

    // If store_id provided, resolve store owner
    let targetOwnerId: string | null = null;
    let storeName = "Geral";
    if (store_id) {
      const { data: store } = await supabase
        .from("restaurants")
        .select("id, name, owner_id")
        .eq("id", store_id)
        .maybeSingle();

      if (store) {
        storeName = store.name;
        targetOwnerId = store.owner_id;
      }
    }

    const qty = Math.min(Math.max(Number(quantity) || 1, 1), 50);
    const codesToInsert: any[] = [];
    const prefix = storeName.replace(/[^A-Za-z0-9]/g, "").slice(0, 4).toUpperCase();

    const expiresAt = new Date(Date.now() + (Number(expiration_days) || 30) * 86400000).toISOString();

    for (let i = 0; i < qty; i++) {
      const randomStr = Math.random().toString(36).substring(2, 7).toUpperCase();
      const code = `${prefix ? `${prefix}-` : ""}CRED-${Math.round(Number(value))}-${randomStr}`;
      codesToInsert.push({
        code,
        value: Number(value),
        assigned_to_user_id: targetOwnerId,
        is_used: false,
        expires_at: expiresAt,
      });
    }

    const { data: inserted, error: insertErr } = await supabase
      .from("credit_codes")
      .insert(codesToInsert)
      .select();

    if (insertErr) {
      return {
        status: 200,
        body: { success: false, code: "ERRO_CRIACAO", message: insertErr.message, request_id: requestId },
      };
    }

    return {
      status: 200,
      body: {
        success: true,
        message: `${qty} código(s) de crédito gerado(s) com sucesso para a loja "${storeName}"!`,
        count: qty,
        store_name: storeName,
        codes: (inserted ?? []).map((c) => c.code),
        request_id: requestId,
      },
    };
  }

  // 7. cancel-delivery-notification
  if (functionName === "cancel-delivery-notification") {
    const pedidoId = reqBody?.pedido_id;
    if (pedidoId) {
      await supabase
        .from("notification_jobs")
        .update({ status: "cancelled", last_error: "Cancelado pela loja ou aceite." })
        .eq("pedido_id", pedidoId);
    }
    return {
      status: 200,
      body: { success: true, message: "Notificação cancelada com sucesso.", request_id: requestId },
    };
  }

  // 8. get-assigned-driver: Retorna dados reais do motorista que aceitou a corrida
  if (functionName === "get-assigned-driver") {
    const targetRequestId = (reqBody?.request_id || reqBody?.pedido_id) as string | undefined;
    const providedDriverId = (reqBody?.driver_id || reqBody?.motorista_id) as string | undefined;

    let targetDriverId = providedDriverId;
    if (targetRequestId && !targetDriverId) {
      const { data: reqData } = await supabase
        .from("delivery_requests")
        .select("driver_id, status")
        .eq("id", targetRequestId)
        .maybeSingle();
      targetDriverId = reqData?.driver_id || undefined;
    }

    if (!targetDriverId) {
      return {
        status: 200,
        body: {
          success: true,
          driver: null,
          message: "Nenhum motorista vinculado a esta corrida ainda.",
          request_id: requestId,
          delivery_request_id: targetRequestId || null,
        },
      };
    }

    // Consulta na tabela drivers
    const { data: driverData, error: driverErr } = await supabase
      .from("drivers")
      .select("id, user_id, full_name, phone, photo_url, driver_code, vehicle_plate, vehicle_type")
      .or(`user_id.eq.${targetDriverId},id.eq.${targetDriverId}`)
      .maybeSingle();

    if (!driverErr && driverData?.full_name) {
      return {
        status: 200,
        body: {
          success: true,
          driver: {
            id: driverData.id,
            user_id: driverData.user_id,
            full_name: driverData.full_name,
            phone: driverData.phone || "",
            photo_url: driverData.photo_url || null,
            driver_code: driverData.driver_code || `MOT-${driverData.id.slice(0, 5).toUpperCase()}`,
            vehicle_plate: driverData.vehicle_plate || null,
            vehicle_type: driverData.vehicle_type || "Moto",
          },
          request_id: requestId,
          delivery_request_id: targetRequestId || null,
        },
      };
    }

    // Fallback na tabela profiles
    const { data: profileData } = await supabase
      .from("profiles")
      .select("id, full_name, phone, avatar_url")
      .eq("id", targetDriverId)
      .maybeSingle();

    if (profileData?.full_name) {
      return {
        status: 200,
        body: {
          success: true,
          driver: {
            id: profileData.id,
            user_id: profileData.id,
            full_name: profileData.full_name,
            phone: profileData.phone || "",
            photo_url: profileData.avatar_url || null,
            driver_code: `MOT-${profileData.id.slice(0, 5).toUpperCase()}`,
            vehicle_plate: null,
            vehicle_type: "Moto",
          },
          request_id: requestId,
          delivery_request_id: targetRequestId || null,
        },
      };
    }

    return {
      status: 200,
      body: {
        success: false,
        driver: null,
        message: "Motorista não encontrado no cadastro.",
        request_id: requestId,
        delivery_request_id: targetRequestId || null,
      },
    };
  }

  // Default fallback for other functions
  return {
    status: 200,
    body: {
      success: true,
      edge_function_ok: true,
      message: `Função ${functionName} executada.`,
      request_id: requestId,
    },
  };
}
