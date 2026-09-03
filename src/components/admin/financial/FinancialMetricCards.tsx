import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { FinancialSummary } from "@/types/financial";
import { formatCurrency } from "@/utils/financialCalculations";
import {
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  Truck,
  DollarSign,
  Percent,
  PiggyBank,
  CheckCircle2,
  Clock,
  Coins,
  Receipt,
  HelpCircle,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface FinancialMetricCardsProps {
  summary: FinancialSummary;
}

export const FinancialMetricCards: React.FC<FinancialMetricCardsProps> = ({ summary }) => {
  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-6">
        {/* GRUPO 1: ENTRADAS REAIS DE DINHEIRO NO CAIXA */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Entradas Reais de Dinheiro no Caixa
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Card 1: Total de Recargas */}
            <Card className="border-border/60 hover:border-emerald-500/50 transition-colors shadow-sm">
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">Total de Recargas</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button className="text-muted-foreground hover:text-foreground">
                        <HelpCircle className="w-3.5 h-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-xs">
                      Soma das recargas pré-pagas via código efetivamente pagas e resgatadas pelas lojas.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                    {formatCurrency(summary.totalRecharges)}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium">
                    {summary.rechargesCount} recargas
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Recargas via código resgatadas
                </p>
              </CardContent>
            </Card>

            {/* Card 2: Recarga Direta */}
            <Card className="border-border/60 hover:border-emerald-500/50 transition-colors shadow-sm">
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">Recarga Direta</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button className="text-muted-foreground hover:text-foreground">
                        <HelpCircle className="w-3.5 h-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-xs">
                      Soma dos créditos lançados diretamente pelo Admin para as lojas no sistema.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                    {formatCurrency(summary.totalDirectRecharges)}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-600 dark:text-teal-400 font-medium">
                    {summary.directRechargesCount} lançamentos
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Créditos diretos via Admin
                </p>
              </CardContent>
            </Card>

            {/* Card 3: Total de Entradas (DESTAQUE) */}
            <Card className="border-emerald-500/40 bg-emerald-500/5 transition-colors shadow-sm sm:col-span-2 lg:col-span-1">
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <ArrowDownLeft className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                      Total de Entradas
                    </span>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button className="text-emerald-600 hover:text-emerald-800">
                        <HelpCircle className="w-3.5 h-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-xs">
                      Total de Entradas = Recargas Pagas + Recargas Diretas Efetivadas. Representa todo o dinheiro novo que entrou no caixa.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-emerald-700 dark:text-emerald-300">
                    {formatCurrency(summary.totalEntries)}
                  </span>
                  <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    Entrada Real
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-emerald-800/80 dark:text-emerald-300/80">
                  Recargas pagas + Recargas diretas
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* GRUPO 2: MOVIMENTAÇÃO DAS CORRIDAS */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Movimentação das Corridas Concluídas
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Card 4: Valor Bruto das Corridas */}
            <Card className="border-border/60 hover:border-blue-500/50 transition-colors shadow-sm">
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">Valor Bruto das Corridas</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button className="text-muted-foreground hover:text-foreground">
                        <HelpCircle className="w-3.5 h-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-xs">
                      Soma do valor cheio cobrado dos lojistas pelas corridas entregues (consumo de créditos, não nova entrada em dinheiro).
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                    {formatCurrency(summary.grossDeliveryTotal)}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium">
                    {summary.completedDeliveriesCount} corridas
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Consumo do saldo pré-pago das lojas
                </p>
              </CardContent>
            </Card>

            {/* Card 5: Valor Gerado para Motoristas */}
            <Card className="border-border/60 hover:border-blue-500/50 transition-colors shadow-sm">
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">Valor Gerado para Motoristas</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button className="text-muted-foreground hover:text-foreground">
                        <HelpCircle className="w-3.5 h-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-xs">
                      Soma dos valores atribuídos aos motoristas para recebimento pelas corridas realizadas.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                    {formatCurrency(summary.driverEarningsTotal)}
                  </span>
                  <span className="text-xs font-semibold text-muted-foreground">
                    Repasse Bruto
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Ganhos creditados aos entregadores
                </p>
              </CardContent>
            </Card>

            {/* Card 6: Comissão das Corridas */}
            <Card className="border-border/60 hover:border-blue-500/50 transition-colors shadow-sm">
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">Comissão das Corridas</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button className="text-muted-foreground hover:text-foreground">
                        <HelpCircle className="w-3.5 h-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-xs">
                      Comissão das Corridas = Valor Bruto das Corridas - Valor Gerado para os Motoristas.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-xl sm:text-2xl font-bold tracking-tight text-blue-600 dark:text-blue-400">
                    {formatCurrency(summary.deliveryCommissionTotal)}
                  </span>
                  <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                    Retenção
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Taxa retida na intermediação
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* GRUPO 3: FATURAMENTO & RECEITA DA PLATAFORMA */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2.5 h-2.5 rounded-full bg-violet-500" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Receita Operacional da Plataforma
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Card 7: Taxas de Antecipação */}
            <Card className="border-border/60 hover:border-violet-500/50 transition-colors shadow-sm">
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">Taxas de Antecipação</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button className="text-muted-foreground hover:text-foreground">
                        <HelpCircle className="w-3.5 h-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-xs">
                      Soma das taxas retidas quando os motoristas solicitam saques antecipados aprovados.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                    {formatCurrency(summary.earlyWithdrawalFeesTotal)}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400 font-medium">
                    {summary.approvedWithdrawalsCount} saques aprovados
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Tarifas cobradas em saques rápidos
                </p>
              </CardContent>
            </Card>

            {/* Card 8: Receita Operacional da Plataforma (DESTAQUE) */}
            <Card className="border-violet-500/40 bg-violet-500/5 transition-colors shadow-sm">
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Percent className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                    <span className="text-xs font-bold text-violet-800 dark:text-violet-300">
                      Receita Operacional da Plataforma
                    </span>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button className="text-violet-600 hover:text-violet-800">
                        <HelpCircle className="w-3.5 h-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-xs">
                      Receita Operacional = Comissão das Corridas + Taxas de Antecipação. Representa o faturamento líquido da empresa.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-violet-700 dark:text-violet-300">
                    {formatCurrency(summary.platformRevenueTotal)}
                  </span>
                  <span className="text-xs font-semibold text-violet-600 dark:text-violet-400">
                    Faturamento Líquido
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-violet-800/80 dark:text-violet-300/80">
                  Comissão das Corridas + Taxas de Antecipação
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* GRUPO 4: SAÍDAS & DISPONIBILIDADE DE CAIXA */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Saídas Efetivas e Disponibilidade de Caixa
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 9: Efetivamente Pago aos Motoristas */}
            <Card className="border-border/60 hover:border-amber-500/50 transition-colors shadow-sm">
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <ArrowUpRight className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    <span className="text-xs font-medium text-muted-foreground">
                      Pago aos Motoristas
                    </span>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button className="text-muted-foreground hover:text-foreground">
                        <HelpCircle className="w-3.5 h-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-xs">
                      Soma dos saques em status Aprovado/Pago transferidos aos motoristas via PIX (líquido).
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                    {formatCurrency(summary.paidToDriversTotal)}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium">
                    Saídas PIX
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Valores já transferidos aos entregadores
                </p>
              </CardContent>
            </Card>

            {/* Card 10: Saldo de Caixa (DESTAQUE MÁXIMO) */}
            <Card className="border-primary/50 bg-primary/5 transition-colors shadow-md">
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <PiggyBank className="w-4 h-4 text-primary" />
                    <span className="text-xs font-bold text-primary">
                      Saldo de Caixa
                    </span>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button className="text-primary hover:opacity-80">
                        <HelpCircle className="w-3.5 h-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-xs">
                      Saldo de Caixa = Total de Entradas - Valores Efetivamente Pagos aos Motoristas. Representa a disponibilidade em conta corrente, não confundir com lucro da plataforma.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-2xl sm:text-3xl font-black tracking-tight text-primary">
                    {formatCurrency(summary.cashBalance)}
                  </span>
                  <span className="text-xs font-bold text-primary">
                    Disponível
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-primary/80">
                  Total de Entradas - Valores Pagos
                </p>
              </CardContent>
            </Card>

            {/* Card 11: Pendente de Repasse aos Motoristas */}
            <Card className="border-border/60 hover:border-slate-400 transition-colors shadow-sm">
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-orange-500" />
                    <span className="text-xs font-medium text-muted-foreground">
                      Pendente a Motoristas
                    </span>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button className="text-muted-foreground hover:text-foreground">
                        <HelpCircle className="w-3.5 h-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-xs">
                      Saques solicitados aguardando aprovação ({formatCurrency(summary.pendingWithdrawalsTotal)}) + saldos de corridas realizadas ainda não solicitados para saque ({formatCurrency(summary.pendingDriverBalanceTotal)}).
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-xl sm:text-2xl font-bold tracking-tight text-orange-600 dark:text-orange-400">
                    {formatCurrency(summary.totalPendingToDrivers)}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 font-medium">
                    {summary.pendingWithdrawalsCount} saques pendentes
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Compromisso futuro a pagar
                </p>
              </CardContent>
            </Card>

            {/* Card 12: Saldo em Créditos nas Lojas */}
            <Card className="border-border/60 hover:border-slate-400 transition-colors shadow-sm">
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Coins className="w-4 h-4 text-indigo-500" />
                    <span className="text-xs font-medium text-muted-foreground">
                      Créditos nas Lojas
                    </span>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button className="text-muted-foreground hover:text-foreground">
                        <HelpCircle className="w-3.5 h-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-xs">
                      Soma dos saldos atuais mantidos pelas lojas em suas carteiras, disponíveis para realizar novas entregas.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                    {formatCurrency(summary.activeStoreCreditsTotal)}
                  </span>
                  <span className="text-xs font-semibold text-muted-foreground">
                    Em Carteira
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Créditos pré-pagos a consumir
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};
