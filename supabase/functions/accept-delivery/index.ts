import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { getCaller, serviceClient } from "../_shared/push-db.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const requestId = crypto.randomUUID();
  const svc = serviceClient();

  try {
    const caller = await getCaller(req);
    const body = await req.json().catch(() => ({}));

    const motoristaId = body?.motorista_id || caller?.id;
    const pedidoId = body?.pedido_id || body?.request_id;

    if (!motoristaId || !pedidoId) {
      return jsonResponse(
        {
          success: false,
          code: "PARAMETROS_INVALIDOS",
          message: "Informe motorista_id e pedido_id.",
          request_id: requestId,
        },
        200
      );
    }

    // Call atomic RPC accept_delivery_request with row locking
    const { data: rpcData, error: rpcError } = await svc.rpc("accept_delivery_request", {
      p_request_id: pedidoId,
      p_pedido_id: pedidoId,
      p_motorista_id: motoristaId,
    });

    if (rpcError) {
      const rawMsg = rpcError.message || "";
      const isConflict = /já foi assumida|já foi aceita|direcionada|ALREADY_ACCEPTED/i.test(rawMsg);
      return jsonResponse(
        {
          success: false,
          accepted: false,
          code: isConflict ? "JA_ACEITO" : "ERRO_ACEITE",
          message: isConflict
            ? "Esta entrega já foi aceita por outro motorista."
            : rawMsg || "Erro ao processar aceite.",
          request_id: requestId,
        },
        200
      );
    }

    if (rpcData && (rpcData as any).accepted === false) {
      return jsonResponse(
        {
          success: false,
          accepted: false,
          code: "JA_ACEITO",
          message: (rpcData as any).message || "Esta entrega já foi aceita por outro motorista.",
          request_id: requestId,
        },
        200
      );
    }

    const nowIso = new Date().toISOString();

    // Cancel pending notification jobs for this order
    await svc
      .from("notification_jobs")
      .update({ status: "cancelled", last_error: "Chamado aceito pelo motorista." })
      .eq("pedido_id", pedidoId);

    return jsonResponse({
      success: true,
      accepted: true,
      message: "Entrega aceita com sucesso!",
      driver_fee: (rpcData as any)?.driver_fee || 0,
      accepted_at: nowIso,
      request_id: requestId,
    });
  } catch (err: any) {
    return jsonResponse(
      {
        success: false,
        accepted: false,
        code: "ERRO_ACEITE",
        message: err?.message || "Erro ao processar aceite da entrega.",
        request_id: requestId,
      },
      200
    );
  }
});
