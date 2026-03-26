import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { ArrowLeft, Calendar, ExternalLink, FileText, ShieldCheck, Trash2 } from 'lucide-react';

type LegalVariant = 'privacy' | 'terms';

type PublicSettings = {
  business_name: string;
  business_email: string;
  business_phone: string;
  business_address: string;
};

const DEFAULT_SETTINGS: PublicSettings = {
  business_name: 'MA Beard Style',
  business_email: '',
  business_phone: '',
  business_address: '',
};

const LAST_UPDATED = '26 de março de 2026';

const usePublicSettings = () => {
  const [settings, setSettings] = useState<PublicSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    let ignore = false;

    const fetchSettings = async () => {
      try {
        const response = await fetch('/api/settings');
        const data = await response.json();
        if (!response.ok || ignore) return;

        setSettings({
          business_name: data.business_name || DEFAULT_SETTINGS.business_name,
          business_email: data.business_email || '',
          business_phone: data.business_phone || '',
          business_address: data.business_address || '',
        });
      } catch (_error) {
        // Keep the fallback business information if the public settings request fails.
      }
    };

    fetchSettings();
    return () => {
      ignore = true;
    };
  }, []);

  return settings;
};

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 md:p-8">
    <h2 className="text-lg font-semibold text-white md:text-xl">{title}</h2>
    <div className="mt-4 space-y-4 text-sm leading-7 text-gray-300">{children}</div>
  </section>
);

const BulletList = ({ items }: { items: string[] }) => (
  <ul className="space-y-3">
    {items.map((item) => (
      <li key={item} className="flex gap-3">
        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-white/60" />
        <span>{item}</span>
      </li>
    ))}
  </ul>
);

const ContactBlock = ({ settings }: { settings: PublicSettings }) => (
  <div className="rounded-[2rem] border border-white/10 bg-black/40 p-6 text-sm text-gray-300">
    <p className="text-xs font-bold uppercase tracking-[0.24em] text-gray-500">Contato e solicitações</p>
    <div className="mt-4 space-y-2">
      <p className="text-white">{settings.business_name}</p>
      {settings.business_email ? (
        <p>
          E-mail:{' '}
          <a href={`mailto:${settings.business_email}`} className="text-white underline underline-offset-4">
            {settings.business_email}
          </a>
        </p>
      ) : (
        <p>Use os canais oficiais exibidos na página inicial para solicitações sobre privacidade, revogação ou exclusão de dados.</p>
      )}
      {settings.business_phone && <p>Telefone: {settings.business_phone}</p>}
      {settings.business_address && <p>Endereço: {settings.business_address}</p>}
    </div>
  </div>
);

const PrivacyPolicy = ({ settings }: { settings: PublicSettings }) => (
  <>
    <Section title="Resumo">
      <p>
        Esta Política de Privacidade explica como {settings.business_name} coleta, utiliza, armazena e protege dados
        pessoais e dados obtidos por meio da integração com o Google Calendar dentro do sistema de agendamentos,
        assinaturas e gestão operacional da barbearia.
      </p>
      <p>
        Ao usar o sistema ou conectar uma conta Google, você concorda com o tratamento de dados descrito nesta
        política.
      </p>
    </Section>

    <Section title="Dados que podemos tratar">
      <BulletList
        items={[
          'Dados cadastrais e de contato, como nome, e-mail, telefone, CPF e informações de agendamento.',
          'Dados operacionais, como serviços escolhidos, barbeiro, horário, status do atendimento e histórico de movimentações necessárias para a operação do negócio.',
          'Dados do Google Calendar estritamente necessários para sincronizar agenda, evitar conflitos de horário e criar, editar ou remover eventos vinculados aos agendamentos do sistema.',
          'Dados técnicos, como logs básicos de acesso, erros, tokens de integração e identificadores internos de eventos sincronizados.',
        ]}
      />
    </Section>

    <Section title="Como usamos os dados">
      <BulletList
        items={[
          'Executar agendamentos, assinaturas, relatórios e rotinas administrativas da plataforma.',
          'Sincronizar compromissos com o Google Calendar do barbeiro ou da conta conectada.',
          'Consultar horários ocupados para reduzir conflitos entre a agenda interna e o calendário conectado.',
          'Entrar em contato com clientes quando necessário para confirmar, remarcar ou cancelar atendimentos.',
          'Cumprir obrigações legais, prevenir fraudes e manter a segurança técnica do sistema.',
        ]}
      />
    </Section>

    <Section title="Uso do Google Calendar">
      <p>
        Quando uma conta Google é conectada, o sistema solicita a permissão
        <code className="mx-1 rounded bg-black/40 px-1.5 py-0.5 text-xs text-white">https://www.googleapis.com/auth/calendar.events</code>
        para operar a agenda vinculada.
      </p>
      <BulletList
        items={[
          'Criar eventos para novos agendamentos.',
          'Atualizar eventos quando um horário, serviço ou barbeiro for alterado.',
          'Excluir eventos relacionados a agendamentos cancelados.',
          'Ler eventos do calendário principal apenas para verificar disponibilidade e bloquear horários já ocupados.',
          'Armazenar com segurança tokens de acesso e atualização no backend para manter a integração funcionando até a revogação ou desconexão.',
        ]}
      />
      <p>
        Os dados recebidos do Google não são vendidos, não são usados para publicidade e não são compartilhados com
        terceiros para finalidades alheias à operação descrita nesta política.
      </p>
      <p>
        O uso de dados recebidos por APIs do Google segue a Política de Dados do Usuário dos Serviços de API do Google,
        inclusive os requisitos de uso limitado.
      </p>
    </Section>

    <Section title="Compartilhamento de dados">
      <p>Os dados podem ser processados por fornecedores essenciais para a operação do serviço, como:</p>
      <BulletList
        items={[
          'Google, quando a integração com Google Calendar é utilizada.',
          'Supabase, para banco de dados, autenticação e armazenamento operacional.',
          'Prestadores de hospedagem e infraestrutura, para manter o sistema disponível.',
          'Processadores de pagamento, quando houver contratação de planos ou cobranças recorrentes.',
        ]}
      />
      <p>
        Fora dessas hipóteses, não compartilhamos dados pessoais com terceiros sem base legal, necessidade operacional
        ou autorização do titular.
      </p>
    </Section>

    <Section title="Retenção, revogação e exclusão">
      <BulletList
        items={[
          'Tokens do Google podem permanecer armazenados enquanto a integração estiver ativa.',
          'A conta Google pode ser desconectada diretamente no painel do sistema, removendo os tokens salvos localmente.',
          'A autorização também pode ser revogada na conta Google em myaccount.google.com/permissions.',
          'Dados operacionais de agenda, vendas e atendimento podem ser mantidos pelo prazo necessário para operação, auditoria, suporte e cumprimento de obrigações legais.',
          'Solicitações de exclusão ou anonimização podem ser feitas pelos canais de contato informados nesta página.',
        ]}
      />
    </Section>

    <Section title="Segurança">
      <p>
        Adotamos medidas técnicas e administrativas razoáveis para proteger dados contra acesso não autorizado,
        alteração, perda ou divulgação indevida. Nenhum sistema, porém, é totalmente imune a riscos, então a segurança
        absoluta não pode ser garantida.
      </p>
    </Section>

    <Section title="Direitos do titular e alterações">
      <p>
        O titular pode solicitar acesso, correção, atualização, revogação de consentimento e outras medidas cabíveis
        conforme a legislação aplicável. Esta política pode ser atualizada para refletir mudanças operacionais,
        regulatórias ou de integração com serviços de terceiros.
      </p>
    </Section>
  </>
);

const TermsOfService = ({ settings }: { settings: PublicSettings }) => (
  <>
    <Section title="Aceitação">
      <p>
        Estes Termos de Uso regulam o acesso e a utilização do sistema {settings.business_name}. Ao navegar pelo site,
        realizar agendamentos, contratar planos ou conectar integrações como Google Calendar, você concorda com estes
        termos.
      </p>
    </Section>

    <Section title="Objeto do serviço">
      <BulletList
        items={[
          'Divulgação institucional da barbearia e dos planos disponíveis.',
          'Agendamento público de serviços e gestão interna da agenda.',
          'Controle operacional, financeiro, estoque e relacionamento com clientes.',
          'Sincronização opcional com Google Calendar para facilitar a gestão dos horários.',
        ]}
      />
    </Section>

    <Section title="Responsabilidades do usuário">
      <BulletList
        items={[
          'Fornecer informações verdadeiras, atualizadas e completas ao usar o sistema.',
          'Utilizar o serviço de forma lícita, sem tentar comprometer a integridade da plataforma.',
          'Manter sob sua responsabilidade o uso da conta Google conectada e das permissões concedidas.',
          'Revisar a política de privacidade e as informações exibidas antes de autorizar integrações.',
        ]}
      />
    </Section>

    <Section title="Integração com Google Calendar">
      <p>
        A integração com Google Calendar é opcional e depende de autorização expressa do usuário responsável pela conta
        Google conectada.
      </p>
      <BulletList
        items={[
          'A permissão é usada para criar, atualizar, excluir e consultar eventos necessários à sincronização dos agendamentos.',
          'A desconexão da conta pode ser feita no painel administrativo do sistema ou pela revogação diretamente na conta Google.',
          'Falhas temporárias do Google, expiração de credenciais ou bloqueios externos podem afetar a sincronização sem gerar responsabilidade automática para a barbearia.',
        ]}
      />
    </Section>

    <Section title="Planos, pagamentos e disponibilidade">
      <p>
        Alguns recursos podem envolver contratação de assinaturas ou pagamentos recorrentes. Valores, condições,
        benefícios e disponibilidade podem ser alterados, suspensos ou removidos conforme necessidade operacional,
        comercial ou legal.
      </p>
    </Section>

    <Section title="Limitação de responsabilidade">
      <p>
        O sistema é fornecido com esforço comercial razoável de disponibilidade e segurança. Na máxima extensão
        permitida pela legislação aplicável, {settings.business_name} não responde por perdas indiretas, lucros cessantes
        ou danos decorrentes de falhas de terceiros, indisponibilidade de internet, serviços externos ou uso inadequado
        pelo usuário.
      </p>
    </Section>

    <Section title="Privacidade e alterações">
      <p>
        O tratamento de dados pessoais segue a Política de Privacidade desta aplicação. Estes termos podem ser revistos
        periodicamente, sempre com publicação da versão atualizada nesta mesma URL pública.
      </p>
    </Section>
  </>
);

export const LegalPage = ({ variant }: { variant: LegalVariant }) => {
  const settings = usePublicSettings();
  const isPrivacy = variant === 'privacy';

  return (
    <div className="relative min-h-screen overflow-hidden bg-black pt-24 text-white">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute left-[-8%] top-10 h-72 w-72 rounded-full bg-white/5 blur-[120px]" />
        <div className="absolute bottom-0 right-[-8%] h-72 w-72 rounded-full bg-sky-500/10 blur-[140px]" />
      </div>

      <div className="relative mx-auto max-w-5xl px-4 pb-20 sm:px-6 lg:px-8">
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 md:p-8">
          <div className="flex flex-wrap items-center gap-3 text-xs font-bold uppercase tracking-[0.24em] text-gray-500">
            <span className="rounded-full border border-white/10 px-3 py-1">
              {isPrivacy ? 'Transparência de dados' : 'Condições de uso'}
            </span>
            <span>Atualizado em {LAST_UPDATED}</span>
          </div>

          <div className="mt-6 flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="max-w-3xl">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-black">
                {isPrivacy ? <ShieldCheck className="h-7 w-7" /> : <FileText className="h-7 w-7" />}
              </div>
              <h1 className="text-3xl font-light tracking-tight text-white md:text-5xl">
                {isPrivacy ? 'Política de Privacidade' : 'Termos de Uso'}
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-gray-300 md:text-base">
                Documento público de {settings.business_name} para uso no site, no sistema interno e na integração com
                Google Calendar. Esta página pode ser usada como URL oficial no OAuth consent screen do Google.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <a
                href="/"
                className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm text-white transition-colors hover:border-white/30 hover:bg-white/5"
              >
                <ArrowLeft className="h-4 w-4" />
                Voltar ao início
              </a>
              <a
                href={isPrivacy ? '/terms-of-service' : '/privacy-policy'}
                className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-gray-200"
              >
                <ExternalLink className="h-4 w-4" />
                {isPrivacy ? 'Ver Termos de Uso' : 'Ver Política de Privacidade'}
              </a>
            </div>
          </div>

          {isPrivacy && (
            <div className="mt-8 rounded-[1.5rem] border border-sky-400/20 bg-sky-400/10 p-5 text-sm text-sky-50">
              <div className="flex items-start gap-3">
                <Calendar className="mt-0.5 h-5 w-5 shrink-0 text-sky-200" />
                <div className="space-y-3 leading-7">
                  <p>
                    A integração com Google Calendar existe apenas para sincronizar agendamentos, evitar conflitos de
                    horário e manter a agenda operacional atualizada.
                  </p>
                  <p>
                    O usuário pode revogar a autorização a qualquer momento pelo painel do sistema ou em
                    <a
                      href="https://myaccount.google.com/permissions"
                      target="_blank"
                      rel="noreferrer"
                      className="ml-1 underline underline-offset-4"
                    >
                      myaccount.google.com/permissions
                    </a>
                    .
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-8 grid gap-6">
          {isPrivacy ? <PrivacyPolicy settings={settings} /> : <TermsOfService settings={settings} />}

          {isPrivacy && (
            <Section title="Como pedir revogação ou exclusão">
              <div className="flex items-start gap-3">
                <Trash2 className="mt-1 h-5 w-5 shrink-0 text-gray-400" />
                <div className="space-y-3">
                  <p>
                    Se você conectou uma conta Google e quer interromper o uso da integração, pode desconectar a conta
                    no painel administrativo do sistema. Isso remove os tokens armazenados localmente para a integração.
                  </p>
                  <p>
                    Caso também deseje revogar o acesso no Google, utilize a página de permissões da sua conta Google.
                    Para solicitações adicionais relacionadas a dados pessoais, entre em contato pelos canais abaixo.
                  </p>
                </div>
              </div>
            </Section>
          )}

          <ContactBlock settings={settings} />
        </div>
      </div>
    </div>
  );
};
