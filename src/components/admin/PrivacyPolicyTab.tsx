import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Shield, Lock, Database, UserCheck, Mail, AlertTriangle, FileText, Cookie } from "lucide-react";

const sections = [
  {
    icon: FileText,
    title: "1. Introdução",
    content:
      "Esta Política de Privacidade descreve como o Duarte Entregas coleta, usa, armazena e protege as informações pessoais de clientes, lojistas e motoristas que utilizam nossa plataforma de entregas em Primavera do Leste - MT.",
  },
  {
    icon: Database,
    title: "2. Dados que Coletamos",
    content:
      "Coletamos: (a) Dados cadastrais: nome completo, e-mail, telefone, endereço; (b) Dados de motoristas: CPF, CNH, placa do veículo, dados bancários/PIX; (c) Dados de lojistas: razão social, CNPJ, endereço comercial; (d) Dados de localização em tempo real durante entregas ativas; (e) Histórico de pedidos, avaliações e mensagens de chat.",
  },
  {
    icon: UserCheck,
    title: "3. Finalidade do Tratamento",
    content:
      "Utilizamos seus dados para: viabilizar pedidos e entregas, calcular rotas e frete, processar pagamentos e repasses, comunicar status do pedido, prevenir fraudes, cumprir obrigações legais e melhorar a plataforma.",
  },
  {
    icon: Lock,
    title: "4. Segurança e Proteção",
    content:
      "Aplicamos criptografia, controle de acesso por função (cliente, lojista, motorista, admin) e Row Level Security no banco de dados. Dados sensíveis como CPF e PIX são acessíveis apenas pelo próprio motorista e administradores. Localização em tempo real é restrita ao período da entrega ativa.",
  },
  {
    icon: Cookie,
    title: "5. Cookies e Armazenamento Local",
    content:
      "Utilizamos armazenamento local (localStorage) para manter sua sessão, preferências de tema (claro/escuro) e a última rota acessada. Não usamos cookies de rastreamento de terceiros para publicidade.",
  },
  {
    icon: Mail,
    title: "6. Compartilhamento de Dados",
    content:
      "Compartilhamos somente o necessário para a operação: nome e telefone do cliente são exibidos ao motorista designado; nome e placa do motorista são exibidos ao lojista e cliente da entrega. Não vendemos seus dados a terceiros.",
  },
  {
    icon: Shield,
    title: "7. Direitos do Titular (LGPD)",
    content:
      "Conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018), você pode solicitar: acesso aos seus dados, correção, exclusão, portabilidade, revogação de consentimento e informações sobre compartilhamento. Faça sua solicitação pelo suporte (botão flutuante do WhatsApp).",
  },
  {
    icon: AlertTriangle,
    title: "8. Retenção e Exclusão",
    content:
      "Mantemos seus dados pelo período necessário à prestação do serviço e cumprimento de obrigações legais (fiscais e regulatórias). Ao solicitar exclusão da conta, removemos seus dados pessoais, preservando registros financeiros anonimizados quando exigido por lei.",
  },
  {
    icon: FileText,
    title: "9. Alterações desta Política",
    content:
      "Esta política pode ser atualizada periodicamente. Mudanças relevantes serão notificadas dentro do aplicativo. A versão vigente estará sempre disponível nesta aba.",
  },
  {
    icon: Mail,
    title: "10. Contato",
    content:
      "Para dúvidas sobre privacidade ou exercício de direitos, entre em contato com nosso DPO através do suporte no aplicativo (ícone do WhatsApp) ou pelo e-mail de atendimento informado na página inicial.",
  },
];

const PrivacyPolicyTab = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" />
          Políticas de Privacidade
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Última atualização: 16 de junho de 2026 — Em conformidade com a LGPD (Lei nº 13.709/2018)
        </p>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[70vh] pr-4">
          <div className="space-y-6">
            {sections.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.title} className="border-l-4 border-primary/40 pl-4 py-2">
                  <h3 className="font-semibold text-base flex items-center gap-2 mb-2">
                    <Icon className="w-4 h-4 text-primary" />
                    {s.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{s.content}</p>
                </div>
              );
            })}
            <div className="bg-muted/50 rounded-lg p-4 mt-6">
              <p className="text-xs text-muted-foreground text-center">
                © {new Date().getFullYear()} Duarte Entregas — Primavera do Leste, MT.
                Todos os dados são tratados com segurança e em conformidade com a legislação brasileira.
              </p>
            </div>
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default PrivacyPolicyTab;
