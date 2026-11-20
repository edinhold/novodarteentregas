/**
 * Calcula o saldo disponível real do motorista na aba Carteira:
 * considera apenas o que o motorista ainda tem para receber no mês atual,
 * nunca somando valores já recebidos (aprovados) ou já solicitados em saque.
 */
export function calculateDriverAvailableBalance(
  earnings: Array<{
    amount?: number | string | null;
    status?: string | null;
    created_at?: string | null;
  }> = [],
  withdrawals: Array<{
    amount?: number | string | null;
    status?: string | null;
    created_at?: string | null;
  }> = [],
  now: Date = new Date()
): number {
  const isSameMonth = (iso?: string | null) => {
    if (!iso) return false;
    const dt = new Date(iso);
    if (isNaN(dt.getTime())) return false;
    return dt.getFullYear() === now.getFullYear() && dt.getMonth() === now.getMonth();
  };

  const currentMonthEarnings = (earnings || []).filter((e) => isSameMonth(e.created_at));

  // 1. Apenas ganhos estritamente com status 'pending' no mês atual
  const strictlyPending = currentMonthEarnings
    .filter((e) => e.status === "pending")
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);

  // 2. Proteção contábil: abate saques pendentes ou já aprovados no mês atual
  // para impedir que valores já pagos voltem a aparecer como disponíveis
  const monthlyGenerated = currentMonthEarnings.reduce(
    (sum, e) => sum + Number(e.amount || 0),
    0
  );
  const monthlyWithdrawnOrPending = (withdrawals || [])
    .filter(
      (w) =>
        (w.status === "pending" || w.status === "approved") &&
        isSameMonth(w.created_at)
    )
    .reduce((sum, w) => sum + Number(w.amount || 0), 0);

  const ledgerRemaining = Math.max(
    0,
    Number((monthlyGenerated - monthlyWithdrawnOrPending).toFixed(2))
  );

  return Number(Math.max(0, Math.min(strictlyPending, ledgerRemaining)).toFixed(2));
}
