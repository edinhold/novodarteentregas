import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Helper to access Supabase in server context
function getSupabaseServer(authHeader?: string | null): SupabaseClient {
  const url = process.env.VITE_SUPABASE_URL || "https://qhlunszfcpzsfjjugkus.supabase.co";
  // Prefer service role key if available, otherwise publishable key
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_xp0FiNgyQFvsdy9SXeGnSA_iUehC_FO";

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
async function getCaller(supabase: SupabaseClient) {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) return null;
    return data.user;
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
    const appId = (process.env.ONESIGNAL_APP_ID || "").trim();
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
    const caller = await getCaller(supabase);
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

    const appId = (process.env.ONESIGNAL_APP_ID || "").trim();
    const apiKey = (process.env.ONESIGNAL_APP_API_KEY || "").trim();
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
    const caller = await getCaller(supabase);
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

    const appId = (process.env.ONESIGNAL_APP_ID || "").trim();
    const apiKey = (process.env.ONESIGNAL_APP_API_KEY || "").trim();

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

  // 4. notify-available-drivers
  if (functionName === "notify-available-drivers") {
    const caller = await getCaller(supabase);
    if (!caller) {
      return {
        status: 200,
        body: { success: false, code: "NAO_AUTENTICADO", message: "Sessão expirada.", request_id: requestId },
      };
    }

    const pedidoId = reqBody?.pedido_id;
    if (!pedidoId) {
      return {
        status: 200,
        body: { success: false, code: "PARAMETRO_INVALIDO", message: "Informe pedido_id.", request_id: requestId },
      };
    }

    // Check if delivery request is still pending and unassigned
    const { data: order } = await supabase
      .from("delivery_requests")
      .select("id, status, driver_id, pickup_address, delivery_address")
      .eq("id", pedidoId)
      .maybeSingle();

    if (!order || order.status !== "pending" || order.driver_id) {
      return {
        status: 200,
        body: {
          success: false,
          code: "PEDIDO_INDISPONIVEL",
          message: "O pedido já foi aceito ou cancelado.",
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
    // - last_seen_at within 15 mins
    const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { data: drivers } = await supabase
      .from("drivers")
      .select("id, user_id, full_name, suspended_until")
      .eq("is_active", true)
      .eq("approval_status", "approved")
      .eq("is_online", true)
      .gte("last_seen_at", cutoff);

    const nowTime = new Date().getTime();
    const unsuspendedDrivers = (drivers ?? []).filter(
      (d) => !d.suspended_until || new Date(d.suspended_until).getTime() < nowTime
    );

    if (unsuspendedDrivers.length === 0) {
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

    // Fetch active push subscriptions for free drivers
    const freeUserIds = freeDrivers.map((d) => d.user_id);
    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("onesignal_subscription_id, platform, user_id")
      .in("user_id", freeUserIds)
      .eq("active", true)
      .eq("subscription_status", "subscribed")
      .not("onesignal_subscription_id", "is", null);

    const subIds = Array.from(new Set((subs ?? []).map((s) => s.onesignal_subscription_id))).filter(Boolean);

    if (subIds.length === 0) {
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

    const appId = (process.env.ONESIGNAL_APP_ID || "").trim();
    const apiKey = (process.env.ONESIGNAL_APP_API_KEY || "").trim();

    if (!appId || !apiKey) {
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

    // Send push
    const pushPayload = {
      app_id: appId,
      include_subscription_ids: subIds,
      target_channel: "push",
      headings: { pt: "🚚 Nova entrega disponível", en: "New delivery available" },
      contents: { pt: "Uma nova entrega está aguardando você. Toque para aceitar!", en: "A new delivery is waiting for you. Tap to accept!" },
      data: { tipo: "nova_entrega", pedido_id: pedidoId, rota: `/entregador?pedido=${pedidoId}`, evento_id: eventKey },
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
