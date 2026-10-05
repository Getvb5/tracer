import { auth, requestGoogleDocsAccess, getCachedAccessToken } from './firebase';

export interface GoogleDocResult {
  documentId: string;
  title: string;
  documentUrl: string;
}

/**
 * Creates a comprehensive Google Doc Guide for Administrator and Auditor roles.
 */
export async function createGuideGoogleDoc(): Promise<GoogleDocResult> {
  let token = getCachedAccessToken();

  if (!token) {
    const authResult = await requestGoogleDocsAccess();
    token = authResult.accessToken || getCachedAccessToken();
  }

  if (!token) {
    throw new Error('Não foi possível obter a autorização do Google. Por favor, tente novamente.');
  }

  const docTitle = `Guia Ilustrado de Funcionalidades - Tracers Clínicos (${new Date().toLocaleDateString('pt-BR')})`;

  // 1. Create document
  const createRes = await fetch('https://docs.googleapis.com/v1/documents', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: docTitle,
    }),
  });

  if (!createRes.ok) {
    if (createRes.status === 401) {
      // Re-authenticate if token expired
      const reAuth = await requestGoogleDocsAccess();
      token = reAuth.accessToken || getCachedAccessToken();
      if (!token) throw new Error('Sessão expirada. Faça login novamente para continuar.');
      
      const retryRes = await fetch('https://docs.googleapis.com/v1/documents', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: docTitle,
        }),
      });
      if (!retryRes.ok) {
        throw new Error(`Erro ao criar documento no Google Docs: ${retryRes.statusText}`);
      }
      const data = await retryRes.json();
      return populateGoogleDoc(data.documentId, docTitle, token);
    }
    const errData = await createRes.json().catch(() => ({}));
    throw new Error(errData.error?.message || `Erro ao criar documento: ${createRes.statusText}`);
  }

  const docData = await createRes.json();
  const documentId = docData.documentId;

  return populateGoogleDoc(documentId, docTitle, token);
}

async function populateGoogleDoc(documentId: string, title: string, token: string): Promise<GoogleDocResult> {
  const contentText = `MANUAL OFICIAL DO SISTEMA DE AUDITORIAS CLÍNICAS (MONITORAMENTO TRACER)
Secretaria de Saúde do Recife (SESAU) • Núcleo de Segurança do Paciente (NSP)
Data de Emissão: ${new Date().toLocaleDateString('pt-BR')}

================================================================================
1. VISÃO GERAL DO SISTEMA E METAS INTERNACIONAIS
================================================================================
O Sistema de Monitoramento Tracer é a plataforma corporativa oficial de auditorias clínicas da Secretaria de Saúde do Recife. Seu objetivo principal é monitorar de forma sistemática e contínua a adesão das unidades da rede municipal de saúde aos protocolos assistenciais, prevenindo incidentes, eventos adversos e promovendo a cultura de segurança e melhoria assistencial contínua.

O sistema estrutura suas auditorias clínicas com base nas Metas Internacionais de Segurança do Paciente preconizadas pela Organização Mundial da Saúde (OMS) e pelo Ministério da Saúde / ANVISA:
• META 1 (Tracer 01 - Beira Leito): Identificação correta do paciente (uso e legibilidade da pulseira, placa de leito, conferência ativa de no mínimo 2 identificadores - nome e data de nascimento/mãe, riscos assistenciais de alergia e queda).
• META 4 (Tracer 02 - Cirurgia Segura): Checklist cirúrgico nas 3 etapas regulamentares: Sign-In (antes da indução anestésica), Time-Out cirúrgico (antes da incisão na pele) e Sign-Out (antes do paciente deixar a sala operatória).
• META 5 (Tracer 03 - Processos de Medicação e Higiene das Mãos): Prescrição médica segura, dupla checagem na administração, identificação correta de ampolas e equipos, e adesão aos 5 momentos da OMS para a higiene das mãos.

================================================================================
2. MATRIZ DE PERFIS E PERMISSÕES (RBAC)
================================================================================
O sistema opera com dois perfis de acesso distintos e complementares:

A. PERFIL AUDITOR (Operação de Campo & Qualidade Local):
• Focado na coleta de auditorias em tempo real nos setores (enfermarias, UTI, bloco cirúrgico, emergência).
• Interface simplificada e responsiva com preenchimento em smartphones, tablets e notebooks.
• Suporte offline completo: auditorias são salvas no aparelho e transmitidas automaticamente quando a conexão retornar.
• Acompanhamento das metas mensais e consulta aos registros de sua unidade padrão.

B. PERFIL ADMINISTRADOR (Gestão, Governança & Qualidade Central):
• Visão panorâmica e comparativa de todas as 8 unidades da rede municipal de saúde.
• Filtros multidimensionais avançados: Trimestre, Mês, Seletor Modal de Dias, Unidade de Saúde, Setor e Tracer.
• Análise estatística e diagnósticos inteligentes automáticos sobre itens com taxa crítica (<80%).
• Gestão da integridade de dados: edição direta de leitos/respostas e exclusão segura de duplicidades com janela de confirmação.
• Gestão de sincronizações com Google Sheets e cadastro de auditores da rede.

[TABELA DE PERMISSÕES]
Funcionalidade                      | Perfil Auditor       | Perfil Administrador
------------------------------------+----------------------+----------------------
Iniciar Tracer (Coleta Digital)     | Sim (Criar / Editar) | Sim (Total + Exclusão)
Visão Geral (Dashboard Executivo)   | Apenas sua Unidade   | Todas as Unidades + Ranking
Conformidade por Item (Gráficos)    | Sua Unidade          | Global + Exportação CSV
Participação dos Auditores          | Sua Unidade          | Rede Municipal Completa
Explorador de Auditorias            | Consulta da Unidade  | Consulta, Edição, Exclusão & CSV
Sincronização & Fontes de Dados     | Restrito             | Controle Total (Forçar Sync)
Gestão de Cadastros                 | Restrito             | Total (Auditores & Unidades)
Planilha Destino (Webhooks Sheets)  | Envio & Fila Offline | Configuração & Gestão de Fila

================================================================================
3. COMO ACESSAR O SISTEMA
================================================================================
Passo 1: No celular, tablet ou computador, abra o navegador e acesse a URL do sistema.
Passo 2: Na tela de login, clique no botão "Acessar com Google".
Passo 3: Insira suas credenciais da Conta Google (e-mail institucional ou autorizado).
Passo 4: No primeiro acesso como Auditor, confirme seu Nome Completo e selecione sua Unidade de Saúde Padrão na janela automática que for exibida.
Passo 5: Para alterar sua Unidade de Saúde ou realizar Logout a qualquer momento, clique no seu perfil de usuário no canto superior direito da tela.

================================================================================
4. COMO FILTRAR DADOS NO SISTEMA
================================================================================
A Barra Global de Filtros fica localizada no topo da aplicação e sincroniza instantaneamente todas as telas e gráficos:
• Filtro por Trimestre: Permite selecionar 1º Tri (Jan-Mar), 2º Tri (Abr-Jun), 3º Tri (Jul-Set) ou 4º Tri (Out-Dez) para análise de ciclos de melhoria contínua.
• Filtro por Mês: Selecione qualquer mês do ano de monitoramento.
• Seletor Modal de Dias: Ao escolher um mês, o sistema abre automaticamente um pop-up interativo com os dias do mês, permitindo inspecionar dados de um plantão ou data específica.
• Filtro por Unidade de Saúde: Filtre dados de hospitais, maternidades ou policlínicas municipais. Auditores têm sua unidade padrão selecionada automaticamente.
• Filtro por Tracer: Selecione Tracer 01, Tracer 02 ou Tracer 03 para isolar a meta assistencial desejada.
• Busca Dinâmica por Texto: No Explorador de Auditorias e na tela de Itens, utilize o campo de busca textual para localizar pacientes, leitos, auditores ou perguntas específicas.
• Botão "Limpar Filtros": Quando qualquer filtro estiver ativo, o botão "Limpar Filtros" no rodapé do menu lateral restaura a visualização integral com 1 clique.

================================================================================
5. COMO EXTRAIR E EXPORTAR DADOS
================================================================================
O sistema disponibiliza múltiplos recursos de extração e exportação de dados:

A. Exportação Geral em Planilha (Excel / CSV com UTF-8 BOM):
• Onde acessar: Menu "Explorador de Auditorias" > Botão "Exportar Planilha (CSV)" no canto superior direito.
• Formato: Arquivo CSV com codificação UTF-8 BOM (\uFEFF), abrindo automaticamente no Microsoft Excel e Google Planilhas sem quebra de acentuação gráfica.
• Escopo: Respeita os filtros ativos na tela. Se filtrada uma unidade ou período, exportará os registros correspondentes. Sem filtros, exporta o banco municipal completo.
• Conteúdo: ID do Registro, Tracer, Unidade, Leito/Setor, Auditor, Data/Hora, Quantidade de Critérios Conformes/Não Conformes, Taxa de Conformidade (%) e todas as perguntas e respostas preenchidas.

B. Exportação de Conformidade por Item (CSV Pergunta a Pergunta):
• Onde acessar: Menu "Conformidade por Item" > Botão "Exportar CSV" na barra superior dos gráficos.
• Conteúdo: Tabela estatística detalhada contendo o nome de cada critério auditado, o total de avaliações, a quantidade e o percentual de conformidade de Sim (%), Não (%) e Não se Aplica (%).

C. Sincronização em Nuvem com Google Sheets via Webhooks:
• Funcionamento: Cada auditoria salva em campo é transmitida automaticamente para a planilha oficial no Google Drive da SESAU via Webhooks do Google Apps Script.
• Fila Offline: Caso o dispositivo esteja sem internet no momento da coleta, os dados ficam armazenados com segurança em uma fila pendente local e são sincronizados assim que a conexão retornar.
• Centralização: As URLs das planilhas são gerenciadas no Firestore de forma centralizada. Quando um gestor altera a URL de destino, todos os auditores passam a salvar na nova planilha imediatamente.

D. Exportação para Google Docs:
• Onde acessar: Menu lateral > "Manual do Sistema" > Botão "Criar e Editar no Google Docs".
• Cria um documento oficial, formatado e editável na conta Google do usuário com o manual completo.

================================================================================
6. GUIA COMPLETO DE TODAS AS FUNCIONALIDADES DO SISTEMA
================================================================================

1. INICIAR TRACER (COLETA DIGITAL EM CAMPO):
• O primeiro botão em destaque no menu lateral para auditores de campo.
• Escolha entre Tracer 01 (Beira Leito), Tracer 02 (Cirurgia Segura) ou Tracer 03 (Processos de Medicação).
• Respostas padronizadas: "Sim" (Conforme), "Não" (Não Conforme) e "Não se Aplica".
• Justificativa Obrigatória: Ao marcar "Não", o sistema abre automaticamente um campo de texto obrigatório para documentar o motivo do desvio.
• Taxa em Tempo Real: O percentual de conformidade é calculado e exibido em tempo real conforme o preenchimento.
• Histórico de Coletas: Exibe os últimos formulários salvos na sessão, com opções rápidas para editar dados incorretos ou excluir duplicidades.

2. VISÃO GERAL (DASHBOARD EXECUTIVO):
• Painel central de indicadores de conformidade e acompanhamento de metas.
• Cards de Indicadores: Total de auditorias, Taxa Média de Conformidade (%), Quantidade de Unidades Monitoradas e Dias de Auditoria em Campo.
• Diagnósticos Inteligentes Automatizados: Algoritmo que detecta critérios com conformidade crítica (<80%) e emite alertas visuais com propostas de intervenção.
• Comparativo por Unidade: Gráficos de colunas comparando o índice de cada unidade de saúde com a média da rede municipal.
• Monitor de Metas Mensais: Acompanhamento em percentual e barra de progresso da meta estipulada para o mês.

3. CONFORMIDADE POR ITEM (GRÁFICOS EMPILHADOS):
• Análise aprofundada de cada uma das perguntas e critérios avaliados nos Tracers.
• Visualização gráfica em barras empilhadas: Verde (Sim), Vermelho (Não) e Cinza (Não se Aplica).
• Ordenação Inteligente: Ordene por maior conformidade ou por itens críticos (menor conformidade) para definir prioridades em reuniões de qualidade.
• Busca rápida de critérios: Localize qualquer pergunta digitando termos como "pulseira", "alergia", "time-out", "dupla checagem", etc.

4. PARTICIPAÇÃO DOS AUDITORES:
• Tabela de acompanhamento da produtividade e engajamento da equipe de auditoria.
• Métricas por auditor: total de auditorias realizadas, distribuição por tipo de Tracer e conformidade média obtida.
• Apoio na identificação de necessidades de reciclagem metodológica ou reforço de escalas.

5. EXPLORADOR DE AUDITORIAS:
• Repositório analítico completo de todos os registros de auditorias.
• Modos de Visualização: Alternância entre Modo Tabela Executiva compacta e Modo Cards Detalhados.
• Modal de Ficha Completa: Permite visualizar detalhadamente todas as respostas e justificativas de uma auditoria individual.
• Edição Direta: Permite corrigir campos digitados incorretamente (como número do leito ou resposta).
• Exclusão Segura: Botão com ícone de lixeira vermelha na listagem, com confirmação de segurança para evitar exclusões acidentais.

6. SINCRONIZAÇÃO & FONTES DE DADOS (GESTOR):
• Controle da conexão bidirecional entre o banco Firestore e as planilhas consolidadas no Google Sheets.
• Status de integridade da conexão e contagem de registros sincronizados.
• Botão "Forçar Sincronização": Executa uma atualização imediata limpando caches e recalculando hashes criptográficos de cada linha.

7. GESTÃO DE CADASTROS (ADMINISTRADOR):
• Gerenciamento completo de auditores: inclusão de novos profissionais, categoria profissional (Enfermeiro, Médico, etc.), número de registro no conselho e unidade de atuação padrão.
• Mapeamento das Unidades de Saúde do município do Recife atendidas pelo programa.

8. PLANILHA DESTINO (WEBHOOKS):
• Painel de monitoramento da conexão com os Webhooks do Google Apps Script.
• Visualização da fila pendente de coletas offline e botão de reprocessamento manual instantâneo.
• Atualização centralizada das URLs das planilhas para toda a rede de saúde.

================================================================================
7. BOAS PRÁTICAS E RECOMENDAÇÕES PARA A EQUIPE
================================================================================
1. Fidedignidade dos Dados: Registre rigorosamente o que foi observado à beira do leito. Auditorias transparentes são o único caminho para a melhoria dos processos.
2. Justificativas Qualitativas: Sempre que marcar "Não", descreva com clareza o motivo (ex: pulseira rasurada, ausência de identificação do leito, paciente sem acompanhante na checagem).
3. Regularidade de Coletas: Distribua as auditorias uniformemente pelas semanas do mês, evitando concentrar todas as coletas nos últimos dias.
4. Orientação Educativa: Aproveite o momento da auditoria para orientar a equipe de enfermagem e médica sobre os protocolos de segurança do paciente.

---
Documento gerado automaticamente pelo Sistema de Monitoramento Tracer.
Secretaria de Saúde do Recife • Qualidade e Segurança Assistencial
`;

  // 2. Insert formatted text content via batchUpdate
  const updateRes = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [
        {
          insertText: {
            location: {
              index: 1,
            },
            text: contentText,
          },
        },
      ],
    }),
  });

  if (!updateRes.ok) {
    console.warn('Batch update warned:', await updateRes.text());
  }

  const docUrl = `https://docs.google.com/document/d/${documentId}/edit`;

  return {
    documentId,
    title,
    documentUrl: docUrl,
  };
}
