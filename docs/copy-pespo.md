# Voz e copy do Pespo Hub

Guia curto do que a interface fala. Escrito em 02/11/2026, junto com a revisão dos estados vazios.

## Princípios

1. **Título diz o estado; descrição diz o próximo passo.** Nunca as duas dizendo a mesma coisa.
2. **Sem ponto final no título.** Título é rótulo, não frase.
3. **Sem exclamação, sem emoji, sem "Ops".** O app não é amigo, é ferramenta.
4. **Voz ativa e direta.** "Crie o primeiro", não "o primeiro pode ser criado".
5. **Sem "por favor" e sem "você pode".** Instrução é instrução.
6. **Nada de metáfora de marketing.** "Mapeie as metas do seu projeto para Módulos" vira "Nenhum módulo ainda".

## O antes e o depois (amostra real)

| Onde | Antes | Depois |
|---|---|---|
| Item de trabalho (projeto vazio) | "Comece com seu primeiro item de trabalho." | "Nenhum item de trabalho ainda" |
| descrição | "...os blocos de construção do seu projeto — atribua proprietários..." | "Crie o primeiro para começar. Cada item guarda responsável, prazo, prioridade e o histórico do que mudou." |
| busca sem resultado | "Nenhum resultado correspondente." / "Nenhum resultado encontrado. Tente ajustar..." | "Nada encontrado" / "Tente outras palavras, remova os filtros ou busque pelo identificador do item." |
| ciclos | "Agrupe e defina prazos para seu trabalho em Ciclos." | "Nenhum ciclo ainda" / "Ciclos agrupam o trabalho num período com começo e fim." |
| rascunhos | "...deixe-o no meio do caminho... 😉" | "Rascunhos são itens começados e não enviados. Ficam aqui até você terminar." |
| projetos arquivados | "Parece que todos os seus projetos ainda estão ativos — ótimo trabalho!" | "Todos os seus projetos estão ativos." |

31 textos reescritos em `packages/i18n/src/locales/pt-BR/empty-state.json`.

## Vocabulário

- **item de trabalho** é o termo dominante na interface (284 ocorrências contra 56 de "peça").
  "Peça" fica para o contexto de produção de conteúdo (o que aPespo entrega ao cliente).
- **Ciclo** e **Módulo** ficam em maiúscula quando são a funcionalidade, minúscula no texto corrido.
- Não traduzir nome de funcionalidade pela metade: "Visualizações", "Intake" → "Entrada".

## Onde mexer

- Textos de estado vazio: `packages/i18n/src/locales/pt-BR/empty-state.json`.
- Textos gerais: `packages/i18n/src/locales/pt-BR/common.json`.
- **Nunca hardcodar texto em componente.** Se o texto não tem chave, crie a chave.

## Verificação obrigatória

O `pnpm run sync:check` em `packages/i18n` exige pt-BR em 100% e as outras línguas incompletas de
propósito. Ao mexer em chaves:

1. Não renomeie nem apague chave existente — só o valor.
2. Confira a paridade com `en`: o número de chaves tem que ser igual (142 em `empty-state.json` em 02/11).
3. Se precisar de chave nova, crie nos dois (`en` e `pt-BR`).

## O que falta

O mesmo tratamento para: mensagens de erro, textos de permissão negada, e-mails ao cliente e os textos
internos do Acervo. Todos seguem os princípios acima.
