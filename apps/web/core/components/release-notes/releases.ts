/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Pespo: notas de versão do Pespo Hub, da mais nova para a mais antiga. O botão da versão no rodapé
// da barra lateral mostra a primeira. O texto é conteúdo (como um post), então fica só em português;
// os rótulos da página passam pelo i18n.
//
// Ao publicar uma versão nova: acrescentar uma entrada no topo, com a data do deploy.

export type TPespoRelease = {
  version: string;
  /** Data do deploy, "AAAA-MM-DD". */
  date: string;
  summary: string;
  features: string[];
  fixes: string[];
};

export const PESPO_RELEASES: TPespoRelease[] = [
  {
    version: "1.5.1",
    date: "2026-10-29",
    summary: "Propriedades que se escondem, checklists que recolhem e ajustes de alinhamento.",
    features: [
      "Na página cheia do item (e no painel em modo modal ou tela cheia), um botão no cabeçalho esconde ou mostra a coluna de propriedades; o navegador lembra a escolha.",
      "Cada checklist com nome pode ser recolhida pela seta ao lado do nome; o navegador lembra a escolha.",
    ],
    fixes: [
      "Os ícones no fim da linha da subtarefa (responsável, prazo, transformar em item, adicionar e excluir) ficavam desalinhados.",
      '"Data de vencimento" e outros rótulos longos das propriedades cobriam o campo ao lado.',
      'No painel lateral, mexer no "Repetir", confirmar a exclusão de uma checklist ou usar "Transformar em subtarefa" e "Salvar como modelo" fechava o item.',
    ],
  },
  {
    version: "1.5",
    date: "2026-10-23",
    summary:
      "Modelos, itens recorrentes, várias checklists e capas nos cards, um calendário novo e o painel de peças do cliente dentro do Pespo Hub.",
    features: [
      "Modelos: salve um item de trabalho, módulo, ciclo, página ou projeto como modelo e crie outros a partir dele, com subtarefas e sub-itens.",
      "Copiar um item de trabalho agora leva junto as subtarefas e os sub-itens, com as sublistas.",
      "Uma subtarefa pode virar item de trabalho (sub-item ou item solto), levando as sublinhas, o responsável e o prazo.",
      "O caminho inverso: um item de trabalho vira subtarefa de outro item (o pai, por padrão), com o checklist dele como sublinhas.",
      'Várias checklists com nome no mesmo item (ex.: "Aprovação", "Entrega"), além das Subtarefas, com progresso por lista.',
      "Capa no card do quadro: a primeira imagem anexada vira a capa, e dá para trocar ou tirar pelos anexos.",
      "Itens recorrentes: diário, semanal (com os dias), mensal ou anual. Em cada data nasce uma cópia do item com subtarefas e sub-itens, com prazo naquele dia.",
      "Os cards da lista e do quadro mostram o progresso das subtarefas (ex.: 3/5).",
      "Calendário refeito: agendas do Google escolhidas na própria página, com o nome e a cor de cada uma, visão de mês e de semana, e detalhes do evento com convidados.",
      "Adicionar pessoas a uma reunião direto pelos detalhes do evento (o Google manda o convite).",
      "Painel de peças no projeto: peças contratadas, usadas e saldo por categoria, peças por situação, refações e entregas do mês. Substitui o dashboard do Metabase.",
      "Solicitar novas peças pelo painel, com as mesmas regras de saldo e de urgentes do portal do cliente.",
      "Pedir refação de uma peça pela Marcação da Peça, com o motivo registrado no item.",
      "Sinais do briefing pelo Laya, como no portal: quando o pedido de peças indica urgência ou um cliente insatisfeito, a equipe recebe um comentário de aviso (o cliente não vê).",
      "Esta página de novidades, aberta pelo número da versão no rodapé da barra lateral.",
    ],
    fixes: [
      'Calendário: itens de trabalho apareciam de novo como evento da agenda "Plane" do Google, mesmo filtrados.',
      "Notas adesivas ficavam estreitas demais no menor tamanho do bloco da página inicial.",
      "Calendário: os dias do mês anterior apareciam com números negativos na visão de mês.",
      "Páginas: a lista de páginas e o editor podiam abrir numa tela de erro por causa do menu de ações da página.",
    ],
  },
  {
    version: "1.4.4",
    date: "2026-10-23",
    summary: "Página inicial redimensionável e agenda do Google na home.",
    features: [
      'Página inicial em 4 colunas: cada widget muda de largura e altura, sai da página e volta pelo bloco "Adicionar widget".',
      "Tarefas da página inicial com subtarefas, como o checklist dos itens de trabalho.",
      "Links rápidos aceitam itens de trabalho, além de sites.",
      "Widget Agenda: reuniões e compromissos do Google Calendar dos próximos dias, com botão para entrar na reunião.",
    ],
    fixes: ["O texto de uma subtarefa sumia ao recuar a linha com Tab logo depois de digitar."],
  },
  {
    version: "1.4.3",
    date: "2026-10-22",
    summary: "Subtarefas em árvore, ordem manual e correções de segurança.",
    features: [
      "Subtarefas dentro do item de trabalho, com sublistas, responsável e prazo, no estilo Trello/ClickUp.",
      "Ordem manual (arrastar) passou a ser o padrão nas listas e quadros.",
      "O código do item (PROJ-123) saiu da interface; os links antigos continuam funcionando.",
      "Login pelo Google aceita contas de fora da Pespo; Calendar e Drive seguem no app interno.",
    ],
    fixes: [
      "Correções de segurança do Plane original: escopo por projeto no histórico, comentários, busca, exportação e API; limite de tentativas no login.",
      'Os campos "Agrupar por" e "Dividir por" dos widgets de dashboard apareciam vazios.',
    ],
  },
  {
    version: "1.4.2",
    date: "2026-09-24",
    summary: "Plane atualizado e integrações com Google Calendar e Google Drive.",
    features: [
      "Base atualizada para a versão em desenvolvimento do Plane, com dashboards nativos e campos personalizados.",
      "Google Calendar nos dois sentidos: itens com data viram eventos e mudanças feitas no Google voltam para o item.",
      'Reuniões ligadas ao item de trabalho, com Google Meet e "Meet agora".',
      "Visão de calendário do workspace, com arrastar para mudar as datas.",
      "Google Drive: vincular arquivos ao item, abrir Docs, Sheets e Slides dentro do Pespo Hub e copiar para anexos.",
    ],
    fixes: [
      "Dropdowns abriam no canto da tela e não aceitavam clique nas opções.",
      "Reconectar o Google Calendar falhava depois de desconectar.",
    ],
  },
  {
    version: "1.4.1",
    date: "2026-09-04",
    summary: "Página inicial em blocos.",
    features: [
      "Página inicial em blocos, arrastáveis direto na página.",
      "Widget Tarefas: lista pessoal de tarefas na página inicial.",
    ],
    fixes: [],
  },
  {
    version: "1.4.0",
    date: "2026-08-31",
    summary: "Primeira versão do Pespo Hub, sobre o Plane 1.4.1.",
    features: [
      "Marca Pespo Hub e tradução completa para o português.",
      "Fuso horário de São Paulo e português como padrão.",
      "Marcação da Peça: pins na imagem ou no tempo do vídeo e botão de aprovação.",
      "Vídeos do Clapshot embutidos na descrição (comando /clapshot).",
      "Dashboard do Metabase por projeto.",
      "Sem as telas de planos pagos do Plane.",
    ],
    fixes: [],
  },
];

export const PESPO_HUB_VERSION = PESPO_RELEASES[0].version;
