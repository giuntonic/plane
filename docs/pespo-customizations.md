# Customizações Pespo Hub — guia de controle e upgrade

Este arquivo existe pra você (Giuliano) ter uma visão de tudo que foi customizado nesse fork do Plane,
sem precisar vasculhar o histórico do git ou confiar na memória de alguém. Toda vez que uma customização
nova for feita, ela deve ganhar uma entrada aqui.

**Como manter atualizado:** sempre que eu (Claude) fizer uma mudança que se desvie do Plane original —
não é tradução pontual de uma string esquecida, é uma decisão de produto ou uma feature nova — eu devo
adicionar uma seção aqui. Se você mesmo (ou outra pessoa) mexer no código sem mim, vale adicionar uma
linha também, pra esse arquivo continuar sendo a fonte da verdade.

---

## Como funciona nosso fork

```
origin   → https://github.com/giuntonic/plane.git   (nosso fork)
upstream → https://github.com/makeplane/plane.git    (Plane original)
```

A branch de produção é **`pespo-preview-integration`** (desde 2026-09-23): o `preview` do nosso fork
(que acompanha o `main` do upstream, já com React 19) com todas as customizações da Pespo por cima. A
branch anterior, `pespo-branding-v1.4.1` (criada a partir da tag `v1.4.1`), continua no GitHub como
histórico, mas não recebe mais nada. Cada customização vira um commit separado, com mensagem descritiva
em português — isso facilita re-aplicar ou entender uma mudança específica quando um merge de uma versão
nova do Plane gerar conflito nela.

Pra ver a lista de commits que são _só nossos_ (não vêm do Plane original):

```bash
git log --oneline origin/preview..pespo-preview-integration --first-parent   # desde a integração
git log --oneline v1.4.1..pespo-branding-v1.4.1                              # fase v1.4.1
```

### Como produção é buildada e publicada (VPS)

- `/opt/plane` guarda só o **compose de produção** (`docker-compose.yml` com `image: plane-*-pespo:latest`,
  sem `build:`) e o `.env`. O checkout git dessa pasta **não** é o que roda.
- O código fica na worktree `/opt/pespo/plane-integration` (branch `pespo-preview-integration`). As
  imagens são buildadas à mão, sem build-args, a partir dela:
  ```bash
  cd /opt/pespo/plane-integration
  docker build -f apps/api/Dockerfile.api   -t plane-api-pespo:latest   apps/api
  docker build -f apps/web/Dockerfile.web   -t plane-web-pespo:latest   .
  docker build -f apps/space/Dockerfile.space -t plane-space-pespo:latest .
  docker build -f apps/admin/Dockerfile.admin -t plane-admin-pespo:latest .
  docker build -f apps/live/Dockerfile.live -t plane-live-pespo:latest  .
  cd /opt/plane && docker compose run --rm migrator && docker compose up -d
  ```
- O tráfego público passa pelo **Caddy** de `/opt/pespo/portal-cliente` (rede `portal-cliente_proxy`),
  não pelo proxy do Plane. Rotas: `/api*`, `/auth*` → api; `/spaces*` → space; `/god-mode*` → admin;
  `/live*` → live; **`/uploads*` → plane-minio:9000** (sem essa rota todo upload falha: o Plane gera URLs
  pré-assinadas apontando pra `https://<domínio>/uploads/...`); o resto → web.
- MinIO: root em `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD` no `.env` (antes rodava com `minioadmin`); a api
  usa um usuário IAM próprio (`AWS_ACCESS_KEY_ID`). O RabbitMQ tem `hostname: plane-mq` fixo (sem isso cada
  recriação sobe um nó vazio no mesmo volume) e `POSTGRES_*`/`RABBITMQ_*` vêm do `.env`.

---

## Customizações da fase v1.4.1 (commits em `pespo-branding-v1.4.1`, todas integradas)

Do commit mais recente pro mais antigo:

1. **Adiciona botão de aprovação na Marcação da Peça**
2. **Aplica cor de marca da Pespo instância-wide e limpa chrome pra convidados**
3. **Adiciona tela de configuração do dashboard (settings do projeto)** (removida na 1.5)
4. **Adiciona widget nativo de Dashboard (embed do Metabase por projeto)** (removido na 1.5, ver "Versão 1.5")
5. **Força novo hash do entry.client (contorna cache stale do Cloudflare)**
6. **Adiciona widget nativo de Marcação de Peça (pins de imagem / timestamp de vídeo)**
7. **Rebrand: Plane -> Pespo Hub (textos, título, i18n pt-BR/en)**

Essas mudanças tocam principalmente `apps/web` (widgets do dashboard, marcação de peça, rebranding) e
`packages/i18n` (primeira leva de tradução). Se o upstream mexer nessas mesmas áreas (settings do
projeto, dashboard, branding), é aqui que o merge vai reclamar primeiro.

---

## Detalhes das customizações da fase v1.4.1

Essas mudanças começaram como trabalho não commitado e foram commitadas na `pespo-branding-v1.4.1`
(commits "Traduz ...", "Define fuso horário ...", "Remove UI de upgrade ..." etc.). Por categoria:

### 1. Tradução completa para pt-BR

- **Onde:** `packages/i18n/src/locales/{en,pt-BR}/*.json` (quase todos os namespaces) + centenas de
  arquivos em `apps/web/core/components/**` e `apps/web/app/**` trocando strings hardcoded em inglês
  por chamadas a `t(...)`.
- **Risco de upgrade:** médio. Se o upstream adicionar uma tela nova ou reescrever um componente que
  já traduzimos, o texto novo virá em inglês de novo até alguém rodar uma nova varredura. Não quebra
  nada, só volta a aparecer inglês pontualmente.
- **Convenção que seguimos:** existe uma skill própria do repo (`.claude/skills/translate/`) com as
  regras de tradução (termos que nunca traduzem, plurais, pontuação por idioma). Qualquer tradução nova
  deve seguir ela. Decidimos conscientemente **não** seguir a parte de "marcas do produto não traduzem"
  pra termos como Intake/Épico — já estavam traduzidos em produção e preferimos manter (ver decisão
  registrada na conversa em 2026-08-31).

### 2. Fuso horário e idioma padrão = America/Sao_Paulo / pt-BR

- **Onde:** `apps/api/plane/db/models/{cycle,project,user,workspace}.py` (mudança do default de
  `timezone`/`user_timezone`/`language` de `UTC`/`en` pra `America/Sao_Paulo`/`pt-BR`) + 3 migrations
  novas (`apps/api/plane/db/migrations/0124_alter_profile_language.py`, `0125_alter_project_timezone.py`,
  `0126_alter_timezone_defaults.py`) + os mesmos defaults espelhados no frontend
  (`apps/web/core/components/settings/profile/...`).
- **Risco de upgrade:** baixo, mas **exige atenção manual**. Se o upstream adicionar uma migration nova
  que mexa nesses mesmos campos, o número sequencial dela pode colidir com o nosso `0124`-`0126` — é
  preciso renumerar antes de aplicar. Sempre rodar `python manage.py migrate db` num ambiente de teste
  primeiro depois de um merge.
- **Dados já migrados no banco:** todos os workspaces/projetos/ciclos/usuários que estavam em `UTC`
  foram atualizados para `America/Sao_Paulo` diretamente via SQL (não é código, é dado — não volta com
  um merge, mas é bom saber que já foi feito uma vez).

### 3. Remoção de UI de upgrade / planos pagos (2026-08-31)

- **O quê:** removemos todo o chrome de "compre um plano pago" do produto, já que essa instância é
  self-hosted e nunca vai virar cliente pago do Plane.
- **Arquivos deletados** (não existem mais nessa branch):
  - `apps/web/app/(all)/[workspaceSlug]/(settings)/settings/(workspace)/billing/` (página inteira)
  - `apps/web/app/(all)/[workspaceSlug]/(projects)/active-cycles/` (página inteira)
  - `apps/web/core/components/workspace/billing/` (componentes da tabela comparativa de planos)
  - `apps/web/core/components/license/` (modal de upgrade)
  - `apps/web/core/components/active-cycles/` (tela de upsell de "Active Cycles")
  - `apps/web/core/components/auth-screens/footer.tsx` (logos de marketing no login)
  - `apps/web/core/components/issues/bulk-operations/upgrade-banner.tsx`
- **Arquivos editados pra remover a entrada/gatilho dessas telas:**
  `packages/types/src/settings.ts`, `packages/constants/src/settings/workspace.ts`,
  `apps/web/app/routes/core.ts`, `apps/web/core/components/workspace/edition-badge.tsx`,
  `apps/web/core/components/workspace/sidebar/{workspace-menu.tsx,workspace-menu-item.tsx,
extended-sidebar-item.tsx,helper.tsx,help-section/root.tsx}`,
  `apps/web/core/components/settings/workspace/sidebar/item-icon.tsx`,
  `apps/web/core/components/issues/bulk-operations/root.tsx` (agora sempre retorna `null` — comentário
  no código explica o motivo).
- **Risco de upgrade:** **alto** — essa é a área mais provável de dar conflito num merge futuro, porque
  estamos deletando/esvaziando arquivos que o upstream continua desenvolvendo ativamente (é a feature de
  monetização deles). Se o merge reclamar de "arquivo deletado localmente, modificado no upstream", a
  decisão quase sempre vai ser: manter deletado (re-deletar depois do merge), a menos que a mudança do
  upstream traga uma funcionalidade real (não só marketing) que valha a pena reavaliar.

### 4. Fix sistêmico do placeholder de busca (`CustomSearchSelect`)

- **Onde:** `packages/ui/src/dropdowns/custom-search-select.tsx` — adicionamos `@plane/i18n` como
  dependência de `packages/ui` (e também de `packages/propel`, pelo mesmo motivo em
  `packages/propel/src/emoji-icon-picker/icon/icon-root.tsx`) pra poder usar `useTranslation()` dentro
  de um componente compartilhado que antes não tinha acesso a tradução nenhuma.
- **Risco de upgrade:** baixo-médio. Se o upstream reescrever esse componente do zero, é só reaplicar o
  mesmo padrão (import do hook + trocar `"Search"` por `t("search")`). O ponto de atenção real é o
  `pnpm-lock.yaml`: qualquer merge que mexa em dependências desses pacotes vai precisar rodar
  `pnpm install` de novo pra regerar o lockfile (não dá pra editar esse arquivo à mão com segurança).

### 5. Outras mudanças pontuais

- `apps/space/components/issues/filters/{labels,state}.tsx` — mesma varredura de tradução, aplicada ao
  app `space` (portal público de compartilhamento).
- `apps/api/templates/emails/**/*.html` + `apps/api/plane/bgtasks/*.py` — os 12 templates de e-mail
  transacional (convite, redefinição de senha, notificações etc.) traduzidos pra pt-BR, incluindo as
  linhas de assunto geradas em Python.

---

## Atualização para o preview (2026-09-23)

Merge da `pespo-branding-v1.4.1` sobre o `origin/preview` (upstream até #9530 — React 19, React Router 8,
Headless UI v2, tokens de design do `@makeplane/propel` — mais dashboards configuráveis e Custom Fields).
Decisões tomadas nos conflitos, pra repetir num próximo merge:

- **Dashboard do projeto** (na 1.5 o Metabase saiu e a rota virou o painel de peças): o embed do Metabase (nosso) continuava em `/projects/:id/dashboard` com a aba
  "Dashboard"; os dashboards nativos do preview foram movidos pra `/projects/:id/dashboards` com aba
  própria "Dashboards" (rotas em `apps/web/app/routes/core.ts`, itens em `use-navigation-items.ts` e
  `workspace/sidebar/project-navigation.tsx`).
- **Migrations:** nossa cadeia `0123_project_metabase…0128_workspaceusertask` (já aplicada em produção) e
  a do preview `0123…0125_merge` partiam da `0122`. Resolvido com a migration de merge
  `0129_merge_pespo_preview` — **nunca renumerar migrations já aplicadas**; criar outra de merge.
- **Cor de marca:** o preview trocou `packages/tailwind-config/variables.css` pelos tokens do
  `@makeplane/propel`. Nossa paleta agora vive em `packages/tailwind-config/pespo-brand.css`, importado
  logo depois dos tokens do propel em `index.css`.
- **Trackers de analytics (`*_TRACKER_ELEMENTS`, posthog):** removidos no preview; mantivemos só as
  traduções nos componentes que conflitaram.

Correções feitas depois do merge:

- **Patch no Headless UI** (`patches/@headlessui__react@2.2.10.patch`, registrado em
  `pnpm-workspace.yaml` → `patchedDependencies`): o `Frozen` interno do `Combobox.Options` sobrescrevia a
  ref do filho com `null` no React 19, então todo dropdown com `usePopper` abria no canto superior
  esquerdo. **Ao atualizar o `@headlessui/react`, verificar se o bug foi corrigido upstream antes de
  remover o patch** (2.2.10 era a última versão e ainda tinha o bug).
  - **Segunda correção no mesmo patch (2026-09-24): opções dos dropdowns não aceitavam clique.** O
    `Combobox.Options` é "modal" por padrão no Headless UI v2 e marca com `inert` tudo que não seja o
    input, o botão ou a lista (`useInertOthers`). Como o Plane põe o campo de busca (`Combobox.Input`)
    _dentro_ da lista, o laço que sobe a partir do input marcava como `inert` a `<div>` irmã que contém as
    opções — elas apareciam, mas o clique caía no container (só o teclado funcionava). Sintoma relatado:
    "não consigo alterar o status, nem na criação nem no dropdown"; afetava todos os dropdowns com busca
    (estado, prioridade, responsáveis, etiquetas, ciclo, módulo…). O patch agora também pula nós que
    estão _dentro_ de um elemento permitido (`hooks/use-inert-others.js`, `headlessui.dev.cjs`,
    `headlessui.prod.cjs`). Verificado no navegador (Playwright): mudar estado/prioridade no item e
    escolher o estado no formulário de criação. **Ao atualizar o Headless UI, testar abrir um dropdown de
    estado e clicar numa opção.** Pra editar o patch: `pnpm patch @headlessui/react@2.2.10`, editar e
    `pnpm patch-commit <pasta>` (ele parte do patch atual).
- `DashboardWidgetChartEndpoint` aceitava a rota de projeto sem `project_id` (500) — corrigido + teste.
- Erro de hidratação (React #418) no `HydrateFallback` do `apps/web/app/root.tsx` — já existia antes.
- Identificador do projeto: `PROJECT_IDENTIFIER_MAX_LENGTH` (10) em `@plane/constants`, usado no
  `maxLength` do campo, na mensagem de erro (`{max}`) e no tooltip.

### Tradução — varredura completa e convenções

- ~2.000 textos em ~400 arquivos (web, space, admin, ui). Chaves novas em `common.json`:
  `ui.*` (textos gerais), `auth_errors.*` (erros de login/cadastro), `native_dashboards.*`,
  `chart_axis.*`. Como as outras chaves da Pespo, existem só em `en` e `pt-BR`.
- **Admin (god-mode) passou a ter i18n:** depende de `@plane/i18n` e aguarda o `initPromise` no
  `entry.client.tsx`, como web e space.
- **Fora de componentes** (helpers, `meta`, stores) usar `i18nInstance.t(...)`. **Em objetos/arrays
  constantes de módulo** usar getter (`get label() { return i18nInstance.t("…"); }`) — um valor direto
  seria avaliado no carregamento do módulo, antes das traduções existirem.
- Não traduzir: frases que o usuário precisa digitar ("delete my project", "delete my workspace" — o código
  compara o texto), identificadores internos e marcas (ver skill `translate`).
- Pra achar texto em inglês que sobrou, o método que funcionou foi percorrer os nós `JsxText` com o parser
  do TypeScript (regex perde palavras soltas e frases partidas em volta de elementos).
- Corrigidos na mesma leva: 37 usos de chaves inexistentes (apareciam como texto cru), 34 textos em
  polonês no `pt-BR/template.json` e traduções pt-BR que ainda diziam "Plane".

---

## Checklist antes de atualizar pra uma versão nova do Plane

1. **Commitar (ou pelo menos anotar) tudo que estiver pendente.** Rodar `git status --short` — se
   aparecer uma lista grande, ou é hora de commitar em blocos lógicos, ou pelo menos gerar um
   `git diff > backup-pre-upgrade.patch` antes de mexer em qualquer coisa.
2. **Buscar a versão nova do upstream:**
   ```bash
   git fetch upstream
   git log origin/preview..upstream/preview --oneline   # ver o que mudou lá
   ```
3. **Criar uma branch de teste** a partir da branch atual antes de fazer o merge/rebase de verdade —
   nunca testar upgrade direto em `pespo-preview-integration`.
4. **Fazer o merge** (não rebase — preserva as migrations e os commits já em produção) e resolver os
   conflitos usando as seções acima (fase v1.4.1 e "Atualização para o preview") como guia.
5. **Rodar a checagem de tradução:**
   ```bash
   pnpm --filter @plane/i18n run sync:check
   ```
6. **Rodar `pnpm install`** (sem `--frozen-lockfile`) se algum `package.json` de `packages/*` mudou, pra
   regerar o `pnpm-lock.yaml`.
7. **Conferir o plano de migrations** antes de aplicar: `python manage.py migrate --plan` rodando a
   imagem nova contra o banco (só leitura). Se houver duas "folhas" no grafo, criar uma migration de merge
   (como a `0129_merge_pespo_preview`) — nunca renumerar as já aplicadas.
8. **Rodar `check:types`, `check:lint` e os testes do backend** (`docker-compose-test.yml`), depois
   **buildar as imagens** (ver "Como produção é buildada") — retaguear as atuais antes
   (`docker tag plane-X-pespo:latest plane-X-pespo:pre-<data>`) pra ter rollback instantâneo.
9. **Conferir visualmente** as áreas da seção 3 acima (planos/billing, active cycles, sidebar) e os
   dropdowns (patch do Headless UI), e procurar texto em inglês novo (varredura de `JsxText`).
10. Só depois de tudo isso, atualizar o `docker compose` de produção e redeployar.

---

## Versão 1.6: revisão de vídeo e imagem no item, no lugar do Clapshot (2026-10-30)

Decisão do Giuliano (30/10): trazer o que o Clapshot fazia para dentro do Hub e desligar o Clapshot, sem
migrar o histórico (era tudo teste). Ficaram de fora: o link de revisão sem conta (os clientes vão ser
convidados do projeto) e a sessão para assistir junto. Esta é a fase 1 (revisão no item); a conversão de
vídeo e os arquivos grandes vêm na fase 2.

- **Modelo:** `MediaReviewComment` (`db/models/media_review.py`, tabela `media_review_comments`, migration
  `0141`), preso a um anexo do item (`asset`, `FileAsset` com `ISSUE_ATTACHMENT`).
  - No vídeo, `timecode` em segundos; na imagem, `x`/`y` em % (como a Marcação da Peça antiga).
  - `drawing`: lista de formas `{tool: pen|arrow|rect, color: #rrggbb, width, points}`, com as coordenadas de
    0 a 1 e a espessura como fração da largura da mídia. O servidor confere e normaliza
    (`clean_drawing` em `app/serializers/media_review.py`: até 100 formas, 2000 pontos por traço).
  - Respostas: `parent`, um nível só (responder a uma resposta responde à marcação de cima). Sem posição nem
    desenho.
  - `resolved_at`/`resolved_by`: só nas marcações de cima.
  - Sem soft delete: apagar leva as respostas.
- **API:** `…/issues/<id>/media-review/comments/` (GET de todas as versões, POST) e `…/comments/<pk>/` (PATCH
  `text`/`resolved`, DELETE), em `app/views/issue/media_review.py`.
  - Convidado comenta só nos itens que criou, a menos que o projeto mostre tudo (`guest_view_all_features`),
    a mesma regra dos comentários.
  - Editar o texto: só o autor. Resolver: o autor ou membro/admin. Apagar: o autor ou admin.
  - O GET esconde os comentários de anexos excluídos.
- **Cópia no feed:** cada comentário da revisão cria um comentário comum (`comment`, OneToOne), com as mesmas
  tarefas do endpoint de comentários (`issue_activity` para histórico e notificações, `model_activity` para o
  webhook), disparadas no `on_commit`.
  - Texto no formato antigo: `🎬 Marcação de X em 0:14: …` e `📍 Marcação de X em (12.3%, 56.7%): …`. As
    respostas viram `💬 Resposta de X à marcação em 0:14: …`. Desenho sem texto vira `(desenho)`.
  - Editar atualiza a cópia; apagar apaga a cópia e as das respostas. Apagar só a cópia no feed não mexe na
    revisão (`SET_NULL`).
- **Tela** (`components/issues/media-review/`): o widget continua com o id `peca-marking`
  (`issue-detail-widgets/peca-marking/root.tsx`), agora com o título "Revisão da peça". Só aparece quando o
  item tem imagem ou vídeo anexado.
  - Versões: as imagens e os vídeos anexados, do mais antigo (v1) ao mais novo, pelo `created_at`
    (`buildVersions`). Enviar um anexo novo (inclusive pelo botão da revisão) passa a mostrar a versão nova.
  - Vídeo (`video-stage.tsx`, `timeline.tsx`): player próprio com marcadores, arrastar para buscar, quadro a
    quadro, velocidade, trecho em repetição (I/O/L), sem som e tela cheia (F).
    - Os quadros por segundo são estimados pelo `requestVideoFrameCallback` enquanto o vídeo toca (padrão
      30). A fase 2 vai mandar o valor real, do ffprobe.
  - Desenho (`drawing-layer.tsx`): SVG em cima da mídia, numa caixa com a proporção exata dela
    (`use-fit-box.ts`), para o desenho não sair do lugar em nenhum tamanho de tela.
    - No vídeo, o desenho só aparece com o vídeo parado. O do comentário escolhido aparece parado no tempo
      dele.
    - Começar a desenhar trava o tempo do comentário no quadro desenhado.
  - Imagem (`image-stage.tsx`): clicar marca o ponto. Um desenho sem ponto usa o começo do primeiro traço.
  - Aprovar e pedir refação (`decision-bar.tsx`) continuam como comentários de texto fixo. O n8n ("Peça
    Aprovada") e o painel de peças leem esse formato, então ele não pode mudar.
    - Cada decisão vale para a versão que era a mais nova quando ela foi feita (`versionAt`).
    - Os botões só aparecem na versão mais nova. Uma versão nova volta a pedir aprovação; antes, a primeira
      aprovação escondia os botões para sempre.
  - Marcações feitas só como comentário (Marcação da Peça antiga, portal do cliente com "do cliente (X)"):
    lidas do feed (`parseLegacyMark`) e penduradas na versão da época, só leitura, como "Marcação antiga".
    As cópias dos comentários novos ficam de fora, pelo id em `comment`.
  - "Ampliar" abre a revisão num `ModalCore` com `preventOutsideClick`, para o clique não fechar o painel
    lateral. Enquanto isso, o widget mostra só um aviso, para não ficarem dois players tocando.
- **Teste local:** o Chromium do Playwright não tem H.264, então os vídeos de teste são WebM, e a resposta
  precisa aceitar `Range` para o vídeo poder buscar (como o MinIO faz).
- **Risco de upgrade:** baixo. É tudo arquivo novo, fora o widget `peca-marking/root.tsx` e as URLs em
  `app/urls/issue.py`.

## Versão 1.5.1: estado nas subtarefas, Peças desligável, propriedades e checklists que recolhem (2026-10-29)

- **Estado na subtarefa:** `IssueChecklistItem.state` (FK opcional para `State`, `SET_NULL`, migration `0140`).
  - O estado tem que ser do fluxo do mesmo projeto, fora a triagem (`_validate_state` em
    `app/views/issue/checklist.py`). Senão a API responde 400.
  - Estado e quadradinho andam juntos, no servidor:
    - Um estado do grupo "completed" marca a linha, e qualquer outro a desmarca.
    - Marcar uma linha que tem estado leva ao primeiro estado de "completed" do projeto (pela `sequence`).
    - Desmarcar uma linha num estado de concluído leva ao estado padrão do projeto, ou a nenhum se o padrão
      também for de concluído (`_state_after_toggle`).
    - Tirar o estado não mexe no quadradinho.
    - Linha sem estado é só o quadradinho, como antes.
  - Na tela, o seletor fica nos extras da linha (`checklist/extras.tsx`), antes do responsável: visível quando
    tem estado, no hover quando não tem.
    - O `StateDropdown` não tem opção "sem estado": escolher de novo o estado atual tira o estado.
    - O frontend manda o `is_completed` junto com o estado, para a linha mudar na hora. Quando a pessoa usa o
      quadradinho, o `state` escolhido pelo servidor volta pelos `serverFields` (`checklist/helper.ts`).
    - `dropdowns/state/base.tsx` passa `null` (não `undefined`) ao Combobox quando não há estado, para não
      alternar entre controlado e não controlado.
  - Conversões (`app/views/issue/structure.py`):
    - Subtarefa → item: o item nasce no estado da linha. Se a linha não tem estado e está concluída, nasce
      no primeiro estado de concluído, como antes.
    - Item → subtarefa: a linha leva o estado do item quando o destino é do mesmo projeto. Em outro projeto, a
      linha e as sublinhas que vão junto ficam sem estado (o fluxo é de cada projeto).
  - Cópia, modelos e recorrência não levam o estado das linhas: o resultado é um começo, como o quadradinho
    desmarcado (`utils/work_item_tree.py` não fotografa o campo).
  - Excluir um estado (`app/views/state/base.py`) deixa sem estado as linhas que estavam nele.
- **Peças como funcionalidade do projeto:** `Project.pieces_view` (padrão `True`, migration `0139`), em
  Configurações do projeto › Funcionalidades › Peças (`settings/projects/[projectId]/features/pieces/`,
  `PROJECT_SETTINGS.features_pieces`).
  - Desligada, a aba some da barra lateral e da navegação do projeto (`project-navigation.tsx`,
    `use-navigation-items.ts`). Quem abre `/projects/<id>/dashboard` vê um aviso com o botão "Gerenciar
    funcionalidades", que leva à configuração (`dashboard/page.tsx`).
  - Também está na lista de funcionalidades da criação de projeto (`project/settings/features-list.tsx`) e nos
    modelos de projeto (`PROJECT_FEATURES` em `utils/entity_templates.py`).
  - A lista de projetos (`app/views/project/base.py`) e o serializer da API pública passaram a mandar o campo.
  - A API do painel não checa a opção, como o upstream faz com ciclos e páginas.
- **Propriedades recolhíveis no peek:** no painel lateral e no modal as propriedades ficam no meio do
  conteúdo, e o título "Propriedades" agora recolhe a seção (`peek-overview/properties.tsx`, prop
  `collapsible`). A preferência fica no `localStorage`, na chave `pespo-hub:work-item-properties-collapsed`.
- **Esconder a coluna de propriedades:** botão no cabeçalho da página cheia do item
  (`browse/[workItem]/work-item-header.tsx`) e do peek em tela cheia (`peek-overview/header.tsx`).
  - A primeira versão também mostrava o botão no modal, onde ele não fazia nada (lá as propriedades não são
    uma coluna). Agora o modal usa a seção recolhível.
  - Esta preferência é outra, guardada no `localStorage` na chave `pespo-hub:work-item-properties-hidden`. As
    duas ficam em `components/issues/properties-panel/store.ts`.
  - Na página cheia a coluna ganha `md:hidden` (`issue-detail/root.tsx`) e o conteúdo ocupa a largura toda.
  - No celular nada muda: a barra continua controlada pelo `issueDetailSidebarCollapsed` do upstream, e o
    botão nem aparece.
- **Rótulos das propriedades:** a coluna de rótulos de `SidebarPropertyListItem` tinha 120 px fixos, e
  "Data de vencimento" (e campos personalizados com nome longo) passava por cima do valor. Agora tem 152 px e,
  se ainda não couber, o rótulo quebra em duas linhas. O placeholder do pai virou "Adicionar item pai", numa
  linha só.

- **Recolher cada checklist com nome:** seta (e clique no nome) no cabeçalho de
  `checklist/named-checklist.tsx`. O estado fica no `localStorage`, na chave
  `pespo-hub:checklist-collapsed:<id>`, por navegador; sem `localStorage`, só não lembra. A área
  "Subtarefas" continua recolhendo inteira pelo cabeçalho dela, como antes.
- **Ícones da linha alinhados:** o fim da linha tem controles de alturas diferentes (progresso da sublista,
  responsável e prazo, ↗ de transformar em item, + e lixeira), e a linha alinha pelo topo. Eles agora
  ficam num contêiner da altura da primeira linha do texto, centralizados
  (`checklist-tree/item.tsx`, que vale também para o widget Tarefas da home). O ↗ ficou do tamanho
  dos outros botões (`checklist/extras.tsx`).
- **Cliques que fechavam o peek:** o peek fecha com qualquer `mousedown` fora dele
  (`hooks/use-peek-overview-outside-click.tsx`), exceto dentro de um elemento com `data-prevent-outside-click`.
  O painel do "Repetir" (Popover num portal), a confirmação de excluir checklist (`AlertModalCore`) e os modais
  globais "Transformar em subtarefa" e "Salvar como modelo" ficam fora do peek e não tinham a marca, então
  qualquer clique neles fechava o item.
  - O painel do "Repetir" ganhou `data-prevent-outside-click`.
  - Os modais passaram `preventOutsideClick` ao `ModalCore`. O `AlertModalCore` (`packages/ui`) ganhou a prop
    `preventOutsideClick`, repassada ao `ModalCore`, desligada por padrão, então o upstream não muda.
  - Enquanto um dos dois modais globais está aberto, o callback do peek (`peek-overview/view.tsx`) também não
    fecha. Isso cobre o seletor de item que abre de dentro do "Transformar em subtarefa".
  - Clicar fora de verdade (fora do peek e sem modal aberto) continua fechando.
- **Textos que ainda estavam em inglês:** varredura no código (literais com cara de frase em inglês) e nas telas
  principais, menus e modais em pt-BR.
  - **Editor (`packages/editor`):** passou a depender de `@plane/i18n` (o `pnpm-lock.yaml` ganhou o link) e usa o
    `i18nInstance` do app. As chaves ficam em `editor.json`, prefixo `editor_ui`: menu "/" (títulos e descrições, que
    também valem para a busca, então "/tab" acha "Tabela"), barra e menu de formatação, cores, fontes, tabela, imagem,
    menu do bloco, link, menções e o placeholder. Listas constantes (cores, alinhamentos, itens da tabela) usam
    getters, para o texto sair no idioma da hora em que o menu abre.
  - **Seletor de emoji e ícone (`packages/propel`):** abas, busca e o aviso de contraste. O frimousse recebe
    `locale` pelo idioma da pessoa (`getEmojiLocale`: "pt-BR" vira "pt"), então categorias e busca vêm do Emojibase em
    português, do mesmo CDN (jsdelivr) que já servia o inglês. Sem resultado, aparece "Nenhum emoji encontrado".
  - **App:** confirmação de excluir item e épico, ações do toast de criação, filtros (títulos, opções de data,
    rótulos e operadores dos filtros novos, em `packages/utils`), notificações e histórico, recepção, páginas,
    favoritos, módulos, ciclo ativo, análises (eixos e os valores de prioridade e grupo de estado que vêm da API
    como chave, em `chart/utils.ts`), títulos de ordenação da planilha, mensagens de validação de formulário
    (`packages/utils/src/validation.ts`) e frases de confirmação ("excluir meu projeto").
  - As chaves novas do app ficam em `common.json`, quase todas no prefixo `ui.`, e `date_filters.*` (a opção "1 mês
    atrás" do upstream apontava para uma chave que não existia).
  - Ficaram de fora telas que a Pespo não usa: planos pagos, integrações do GitHub e do Slack, a IA do Plane ("Pi")
    e mensagens de erro internas que não chegam à tela.
  - Os arquivos tocados que tinham avisos antigos de lint do upstream ganharam um `oxlint-disable` no topo, com o
    motivo, porque o commit roda `oxlint --deny-warnings` neles.
- **Deploy:** rebuildar as imagens do `api` e do `web` e rodar as migrations `0139` e `0140`. As duas só
  acrescentam colunas: `projects.pieces_view`, com padrão verdadeiro, e `issue_checklist_items.state_id`, que
  pode ficar vazio. A mudança em `packages/ui` entra no build do `web`.
- **Junto:** avisos de lint antigos do upstream anotados ou corrigidos nos arquivos tocados
  (`issue-detail/root.tsx`, `peek-overview/header.tsx`, `issue-detail/parent-select.tsx`,
  `packages/ui/src/modals/alert-modal.tsx`).

---

## Versão 1.5: modelos, cópia com estrutura, recorrência, checklists, capas, calendário e painel de peças (2026-10-24)

A partir desta versão o Pespo Hub tem número de versão próprio. Ele fica em `PESPO_HUB_VERSION`, em
`apps/web/core/components/release-notes/releases.ts`. Ao publicar uma versão nova, acrescentar uma
entrada no topo de `PESPO_RELEASES`, com a data do deploy, o resumo, as novidades e as correções.

- **Versão e página de Novidades:**
  - O botão "Community" no rodapé da barra lateral (`workspace/edition-badge.tsx`) virou o número da
    versão ("v1.5").
  - Passar o mouse abre um popover com o resumo da versão e o link "Ver novidades e correções". O
    popover é o `Popover` do propel com `openOnHover`.
  - Um ponto roxo aparece até a pessoa abrir a página. Ele é guardado no `localStorage`, na chave
    `pespo-hub:release-notes-seen`.
  - A página é `/:workspaceSlug/whats-new`, com rota em `app/routes/core.ts` e componentes em
    `components/release-notes/`.
  - O texto das notas é conteúdo, por isso fica só em português. Os rótulos da página passam pelo i18n
    (`common.json`, `release_notes.*`).
  - As versões 1.4.0 a 1.4.4 foram reconstruídas a partir desta documentação e do histórico.
- **Cópia de item leva a estrutura:** "Fazer uma cópia" (nos menus do item, da lista e do quadro) abre o
  modal com "(cópia)" no nome. Depois de criar o item, o modal chama
  `POST …/issues/<novo>/copy-structure/` com `source_issue_id`.
  - **O que vai junto:** a árvore de subtarefas (desmarcadas, com responsável e prazo), os links e os
    sub-itens. Cada sub-item vai com as próprias subtarefas e sub-itens.
  - **Limites:** até 5 níveis e 300 itens e subtarefas (`MAX_TREE_DEPTH` e `MAX_TREE_NODES` em
    `plane/utils/work_item_tree.py`).
  - **Datas:** andam junto com a data de início do item novo. Sem data de início, ficam como estavam.
  - **Etiquetas, responsáveis e estimativa:** etiquetas são achadas pelo id e, em outro projeto, pelo
    nome. Responsáveis só entram se forem membros do projeto de destino.
  - **Imagens:** as imagens da descrição são copiadas no MinIO, como na cópia do upstream.
  - Quem copia precisa ser membro do projeto de origem.
- **Subtarefa vira item:** o ícone ↗ na linha da subtarefa (`checklist/extras.tsx`) chama
  `POST …/checklist-items/<id>/convert/` com `as_sub_item`, e a linha pode virar um "Sub-item deste
  item" ou um "Item solto no projeto".
  - **O que o item novo recebe:** o nome, o responsável, o prazo e as sublinhas, que viram as
    subtarefas dele. Uma linha marcada como feita cria o item já no primeiro estado "Concluído".
  - A linha sai do checklist (é apagada de vez, não vai para a lixeira).
- **Item vira subtarefa (o inverso):** `POST …/issues/<id>/convert-to-checklist/` com
  `target_issue_id` (`IssueConvertToChecklistEndpoint` em `app/views/issue/structure.py`).
  - **O que vai:** o nome, o primeiro responsável (se ainda é membro do projeto do destino), o prazo e
    o "concluído" viram uma linha nova no fim da lista padrão do destino. O checklist do item, com as
    checklists com nome, vira as sublinhas dela, com os mesmos ids e marcações.
  - **O item sai como numa exclusão** (soft delete e activity de exclusão), com descrição, comentários,
    anexos e links. Por isso pede a mesma permissão de excluir: admin do projeto ou quem criou.
  - Item com sub-itens não converte (`HAS_SUB_WORK_ITEMS`). O destino tem que estar num projeto em que
    a pessoa é membro.
  - **Front:** um modal único no workspace (`components/issues/convert-to-checklist/`, montado em
    `modals/workspace-level.tsx`). Abre pelo menu da lista de sub-itens (destino = o pai) e pelos menus
    do item (lista, quadro, detalhe, ciclo e módulo), com o pai como destino padrão e "Trocar". Depois
    tira o item das listas abertas, atualiza o destino e, se o item estava aberto, abre o destino.
- **Várias checklists com nome (estilo Trello):** além da lista padrão ("Subtarefas"), o item pode ter
  checklists como "Aprovação" e "Entrega".
  - **Banco:** modelo `IssueChecklist` (tabela `issue_checklists`, migration `0137`) e FK opcional
    `checklist` em `IssueChecklistItem`; vazio = lista padrão. As sublinhas ficam sempre na checklist da
    linha de cima, e mudar uma linha de lista leva as sublinhas. A ordem conta por lista.
  - **API:** `…/issues/<id>/checklists/` (listar, criar) e `…/checklists/<id>/` (renomear, excluir com
    as linhas). As linhas aceitam `checklist` no POST e no PATCH, validado contra o próprio item.
  - **Cópia e modelos** levam as checklists com nome (campo `checklists` da fotografia). Subtarefa que
    vira item leva as sublinhas para a lista padrão do item novo.
  - **Front:** botão "Checklist" na fileira de ações e "Nova checklist" no fim da seção
    (`checklist/named-checklist.tsx`, `named-action-button.tsx`). O hook compartilhado da árvore
    (`checklist-tree/use-checklist-tree-operations.ts`) ganhou `scope` (filtro + payload), para várias
    listas usarem a mesma chave do SWR sem misturar irmãs, Tab e Alt+↑/↓.
- **Capa no card do quadro (estilo Trello):**
  - A capa é um anexo de imagem do item com `attributes["pespo_cover"]` (`plane/utils/issue_cover.py`).
    Não tem tabela nova, e apagar o anexo tira a capa junto.
  - A primeira imagem de um item sem capa vira a capa quando o upload termina. É uma linha no `patch` de
    `IssueAttachmentV2Endpoint`, upstream.
  - `POST …/issues/<id>/cover/` com `attachment_id`, ou `null` para tirar; só imagem do próprio item.
  - **Front:** a capa no topo do card do quadro (`kanban/card-cover.tsx`). Nos anexos, "Usar como capa"
    / "Remover capa" e o selo "Capa" (`attachment/attachment-list-item.tsx`; a lista passa os ids do item
    e do projeto, que o anexo embutido no item não traz).
- **Itens recorrentes (estilo ClickUp):**
  - **Banco:** modelo `IssueRecurrence` (tabela `issue_recurrences`, migration `0138`), ligado ao item
    "original". Guarda a frequência (diária, semanal com dias da semana, mensal ou anual), o intervalo
    "a cada N", a data final opcional, a âncora (o prazo do original) e a próxima data.
  - **Datas:** contas puras em `plane/utils/recurrence.py`, com testes. Dia 31 vira o último dia do mês
    e 29/02 vira 28/02.
  - **Criação das cópias:** task `issue_recurrence_task.create_recurring_issues`, no beat de hora em
    hora (`pespo-create-recurring-issues`, minuto 7, data de Brasília; `plane/utils/issue_recurrence.py`).
    - A cópia tem a estrutura da cópia comum: subtarefas desmarcadas, checklists, links e sub-itens.
    - O prazo é a data da ocorrência e o início anda junto. Entra nos mesmos módulos; ciclo não.
    - Quem cria é quem salvou a regra; se a pessoa saiu do projeto, a série para.
    - Com o worker parado, cria no máximo 10 atrasadas e pula para a próxima.
  - **API:** GET/PUT/DELETE `…/issues/<id>/recurrence/`. A primeira data é a ocorrência seguinte ao
    prazo do original, ou hoje se o prazo já passou.
  - **Front:** "Repetir" nas propriedades do item, na página e no painel lateral
    (`components/issues/recurrence/`), com a próxima cópia e "Parar de repetir".
- **Extras dos cards:** a lista e o quadro mostram o "3/5" das subtarefas (soma de todas as listas), a
  capa e o ícone de repetição.
  - Tudo vem de `GET projects/<id>/card-extras/`, uma consulta só por projeto (`app/views/issue/card.py`).
  - No front, a chave, o hook e os patches do cache ficam em `components/issues/card-extras.ts`.
  - O "3/5" usa a mesma propriedade de exibição da contagem de sub-itens. O cache é atualizado na hora
    quando o checklist, a capa ou a regra mudam no item aberto.
- **Modelos (templates):** modelo de item de trabalho, módulo, ciclo, página e projeto.
  - **Banco:** tabela nova `entity_templates`, modelo `EntityTemplate` em `db/models/template.py`
    (migration `0135`). Guarda o tipo, o nome, a descrição, o projeto (vazio = vale no workspace todo)
    e um JSON com a fotografia do que foi salvo.
  - **API:** `workspaces/<slug>/templates/` (listar e salvar a partir de um objeto existente),
    `…/<id>/` (ler, renomear, abrir para o workspace e excluir) e `…/<id>/apply/`. Ver
    `app/views/workspace/template.py` e `plane/utils/entity_templates.py`.
  - **Permissões:** quem vê é quem é membro do projeto do modelo, ou todo mundo quando o modelo vale no
    workspace. Excluir fica com o autor ou um admin do workspace.
  - **Limite:** o mesmo da cópia (300 itens e subtarefas); acima disso a API responde
    `TEMPLATE_TOO_LARGE`.
  - **Salvar:** "Salvar como modelo" fica no menu do item, do módulo, do ciclo, da página e do projeto
    (na barra lateral). O modal (`components/entity-templates/save-as-template-modal.tsx`) pergunta o
    nome, a descrição e se o modelo vale para um projeto ou para todos.
  - **Usar:** o seletor "Modelo" aparece nos formulários de criação de item, módulo, ciclo e projeto, e
    no cabeçalho da lista de páginas. Ele some quando não há modelo daquele tipo.
    - No item, o modelo preenche o formulário. Depois de criar, as subtarefas e os sub-itens são
      aplicados com o mesmo código da cópia.
    - Módulo e ciclo criam os itens deles, com as datas andando junto com a data de início.
    - A página nasce com o conteúdo do modelo, incluindo as imagens copiadas.
    - Num projeto novo, o modelo traz os estados (os estados padrão que não estão no modelo saem), as
      etiquetas, os módulos com os itens e os itens soltos, quando o modelo foi salvo "com itens".
  - **Configurações → Modelos** (`settings/templates`) lista, renomeia, abre para o workspace e exclui.
  - O modelo é uma fotografia: mudar o objeto original depois não muda o modelo.
- **Calendário refeito** (`components/workspace/calendar-sync/`):
  - **Seletor de agendas na própria página:** é a barra lateral à esquerda, com a cor do Google em cada
    checkbox. A escolha fica salva na conta, no mesmo `overlay_calendar_ids` que as configurações do
    perfil usavam; mês/semana e "Mostrar itens de trabalho" ficam no navegador. A lista de agendas
    saiu das configurações do perfil, que agora só apontam para a página.
  - **Cor, nome e detalhes das agendas:** o `users/me/google-calendar/status/` passou a devolver
    `foreground_color`, `description`, `time_zone` e `is_plane`. Os eventos usam a cor da agenda ou a
    cor própria do evento (`colorId`, paleta em `packages/utils/src/calendar-view.ts`), com texto claro
    ou escuro conforme o contraste.
  - **Visões:** mês (até 3 por dia e "mais N" num popover) e semana (linha de dia inteiro, eventos com
    horário em colunas lado a lado quando se sobrepõem e a linha da hora atual). A conta de layout é
    pura e testada em UTC, São Paulo e Tóquio.
  - **Detalhes do evento:** clicar abre um modal com horário, local, Meet, descrição e convidados (com a
    resposta de cada um).
    - "Adicionar pessoas" sugere membros do workspace e aceita qualquer e-mail.
    - Chama o endpoint novo `POST users/me/google-calendar/events/attendees/` (até 50 e-mails por vez),
      que faz `patch` no evento com `sendUpdates=all`, então o Google manda o convite.
    - Se o Google recusa (só quem organizou pode convidar), aparece "Só quem organizou pode adicionar
      pessoas a este evento".
  - **Bug "compactação de itens de trabalho":** a agenda "Plane" do Google (onde a sincronização
    espelha os itens com data) aparecia de novo como eventos, mesmo com "Mostrar itens de trabalho"
    desligado. Agora os eventos-espelho (`plane_kind = task`) nunca aparecem como evento, e a agenda
    "Plane" nem entra no seletor. Os itens aparecem só pelo próprio toggle.
  - Corrigido junto: os dias do mês anterior apareciam com números negativos na visão de mês.
- **Painel de peças (sai o Metabase):** a aba "Dashboard" do projeto virou "Peças", na mesma rota
  `/projects/:id/dashboard`, com o painel em `components/projects/pieces-panel/`.
  - **O que mostra:** total de peças, peças em produção, entregues no mês e refações (internas e pelo
    cliente). Também mostra o saldo do contrato por categoria (Post, Reels, Artigo, Anúncio), as
    urgentes disponíveis, as peças por situação, as que estão em refação agora, as mais refeitas e as
    entregas do mês.
  - **Avisos:** contrato vencendo (a partir de 14 dias do fim, como no portal) ou vencido.
  - **API:** `GET projects/<id>/pieces/`, em `app/views/project/pieces.py` e `plane/utils/pieces.py`.
  - **Contas:** são as mesmas do portal do cliente.
    - Uma peça é um item com etiqueta de categoria.
    - O que conta como usada e as urgentes (limite do contrato e até 3 abertas ao mesmo tempo) seguem o
      `portal-cliente`.
    - Refação é cada entrada em estado de retrabalho no histórico do item. "Reprovado Interno" conta
      como interna e "Reprovado Cliente" como pelo cliente.
  - **De onde vem o contrato:** o Plane lê o contrato direto do banco do portal, só leitura, pela
    variável nova `PORTAL_DATABASE_URL` (`plane/utils/portal_contracts.py`, psycopg 3, timeout de 3 s).
    - Lê as tabelas `clientes` (por `plane_project_id`), `contratos` e `contrato_categorias`.
    - Sem a variável, ou com o banco fora do ar, o painel mostra as peças e avisa que o contrato não
      está disponível. Nada quebra.
  - **"Solicitar peças":** `POST projects/<id>/pieces/request/`, com até 30 peças por pedido e as
    mesmas validações de saldo e de urgentes do portal.
    - O servidor confere de novo, com um `pg_advisory_xact_lock` por projeto, para dois pedidos ao
      mesmo tempo não passarem do saldo.
    - As peças entram no estado "Fila de Criacao", com a etiqueta da categoria, mais "Urgente" e
      "Precisa Impressao" quando marcadas (esta é criada se não existir). A data desejada vira o prazo e
      o briefing vai na descrição.
  - **"Pedir refação":** botão na Marcação da Peça, para a equipe e para convidados (o cliente).
    - Chama `POST …/issues/<id>/request-rework/`.
    - Move o item para o estado de retrabalho do cliente e registra o motivo como comentário
      ("🔁 Refação pedida por …").
  - **Saiu:** a view e a URL do Metabase, as configurações `METABASE_*`, os campos
    `Project.metabase_dashboard_id` e `Project.metabase_cliente_id` (migration `0136`, que **apaga as
    duas colunas**), a tela de configuração do dashboard nas settings do projeto, o serviço
    `project-metabase.service.ts` e as chaves de i18n.
  - **Sinais do briefing (Laya), como no portal:** depois de "Solicitar peças", a task
    `piece_briefing_signals_task` manda o briefing para o Laya (`LAYA_URL`) e comenta nos itens criados
    quando o sinal é forte. Os limiares são os de `portal-cliente/portal-app/lib/sinaisBriefing.js`:
    urgência ≥ 0,8 sem nenhum item marcado Urgente, ou insatisfação ≥ 0,7. Não mexe em etiqueta nem
    prioridade.
    - O comentário é do usuário-bot "Laya" (`is_bot`, sem login), marcado com
      `external_source="pespo_laya"`.
    - Não gera issue_activity: não notifica ninguém e não dispara o webhook que o n8n ouve.
    - Convidados (o cliente) não veem esses comentários no histórico, na lista de comentários do app
      nem na API v1 (`plane/utils/team_only_comments.py`).
    - Sem `LAYA_URL`, ou com briefing curto, nada é enviado. Laya fora do ar é ignorado.
  - O fluxo do n8n "Peça Aprovada" continua ouvindo o comentário de aprovação, que não mudou.
- **Notas adesivas no bloco estreito da home:** abaixo de 420 px de largura a grade usa uma coluna só
  (`stickies/layout/stickies-list.tsx`), e o cabeçalho do widget encolhe com container queries.
- **Correção junto (bug da varredura de tradução, já em produção):** o `useTranslation()` tinha sido
  colocado dentro de um `useMemo` no menu de ações da página (`pages/dropdowns/actions.tsx`) e em
  `hooks/use-realtime-page-events.tsx`. Quando o memo não recalculava, a ordem dos hooks mudava e a lista
  de páginas abria na tela de erro ("Rendered fewer hooks than expected"). O hook voltou para o topo do
  componente. Na varredura não sobrou outro caso.
- **Correção junto (upstream):** a lista de sub-itens alterna a visibilidade, então duas buscas ao mesmo
  tempo a desligavam de novo. Acontecia sempre com o StrictMode do dev e podia acontecer ao trocar de item
  rápido. Agora só liga se estiver desligada (`sub-issues/content.tsx`).
- **i18n:** chaves novas só em `en` e `pt-BR`:
  - `work-item.json`: `work_item_structure.*` (com `to_checklist`), `issue_checklist.convert*` e
    `issue_checklist.named.*`, `issue_cover.*` e `issue_recurrence.*`.
  - `template.json`: `entity_templates.*`.
  - `integration.json`: `google_calendar_integration.calendar_view.*`.
  - `project.json`: `pieces_panel.*`.
  - `navigation.json`: `sidebar.pieces`.
  - `common.json`: `release_notes.*`.
- **Testes do backend:**
  - `test_work_item_structure_app.py`, com cópia, conversões e card-extras/capa;
  - `test_issue_checklist_app.py` (`TestNamedChecklists`);
  - `test_entity_templates_app.py`;
  - `test_project_pieces_app.py`, com os sinais do Laya;
  - `test_issue_recurrence_app.py` e o unitário `tests/unit/utils/test_recurrence.py`;
  - `TestCalendarPageAttendees` em `test_google_calendar_app.py`.

  No front, testes de `calendar-view.ts` em `packages/utils`.

- **Verificado no navegador** (Playwright, com API e web locais e um banco de portal local):
  - notas adesivas no bloco estreito, popover da versão e página de Novidades;
  - cópia com subtarefas e sub-itens, converter subtarefa e o "1/3" nos cards;
  - modelos de item, módulo e página, e Configurações → Modelos;
  - calendário com o Google simulado: cores, seletor, "mais N", semana com sobreposição, detalhes e
    convite;
  - painel de peças com contrato, aviso de vencimento, saldo, solicitação e refação;
  - item vira subtarefa (pelo menu do sub-item e pela lista, escolhendo o destino);
  - checklists com nome (criar, renomear, linhas e sublinhas, excluir) e o "x/y" somado no card;
  - capa (anexo simulado): "Usar como capa", selo e capa no card do quadro;
  - recorrência semanal pelo "Repetir", ícone no card e a cópia criada na data (rodando a função da
    task no banco local).
- **Deploy:**
  - Rebuildar `api`, `web`, `worker` e `beat` e rodar o `migrator`. Retaguear as imagens antes, como no
    checklist. As migrations:
    - `0135` cria `entity_templates`;
    - `0136` **apaga** `metabase_dashboard_id` e `metabase_cliente_id` de `projects`;
    - `0137` cria `issue_checklists` e a coluna `checklist` nas linhas;
    - `0138` cria `issue_recurrences`.
  - Worker e beat entram porque há tasks novas (sinais do Laya e cópias recorrentes) e uma entrada nova
    no beat.
  - Para o painel de peças ler o contrato:
    1. Criar no `portal-db` um usuário só leitura (ex.: `plane_portal_ro`) com `SELECT` em `clientes`,
       `contratos` e `contrato_categorias`.
    2. Ligar o container da api do Plane à rede do banco do portal (`portal-cliente_backend`).
    3. Pôr `PORTAL_DATABASE_URL=postgresql://plane_portal_ro:<senha>@<host do portal-db>:5432/<banco>`
       no `.env` do Plane.
  - Sem esses três passos, o painel funciona sem a parte do contrato.
  - Para os sinais do Laya: ligar o container do **worker** do Plane à rede `portal-cliente_backend`
    (onde está o `laya`) e pôr `LAYA_URL=http://laya:8000` no `.env` do Plane. Sem isso, a solicitação de
    peças funciona igual, só sem os comentários de sinal.
  - Nada muda no live.
- **Risco de upgrade:** médio a alto.
  - **Pontos que o upstream mexe:**
    - o modal de item (`issue-modal/provider.tsx`, `form.tsx`, `base.tsx`);
    - os formulários de módulo e ciclo, os menus de ações rápidas e `pages/dropdowns/actions.tsx`;
    - a criação de projeto e `project-navigation.tsx`;
    - o card do quadro (`kanban/block.tsx`), os anexos (`attachment-list-item.tsx`, `patch` do
      `IssueAttachmentV2Endpoint`), as propriedades do item (`issue-detail/sidebar.tsx`,
      `peek-overview/properties.tsx`) e a lista de sub-itens (`list-item.tsx`, `content.tsx`);
    - as listas de comentários (`app/views/issue/comment.py`, `activity.py` e `api/views/issue.py`).
  - **Modelos do upstream:** o upstream tem modelos só no plano pago, então os nossos são código nosso.
    Se um dia o upstream abrir os modelos na Community, decidir qual fica. O
    `handleTemplateChange`/`workItemTemplateId` do provider é o ponto onde os dois se encontram.
  - **Migrations:** `0135` a `0138` são nossas. Num merge com o upstream, criar uma migration de merge
    se houver duas folhas.

---

## Home: grade redimensionável, subtarefas nas Tarefas, links de item e Agenda (2026-10-23)

- **Grade:** a home passou de 2 colunas em 800 px para **4 colunas em até 1200 px**. Cada widget guarda
  a largura (1 a 4 colunas) e a altura (px, ou automática) no `config` da `WorkspaceHomePreference`,
  que já existia; o serializer passou a expor e validar o campo (objeto, até 2.000 caracteres), sem
  migration. No cartão:
  - **Alça no canto inferior direito:** arrastar muda o tamanho; a largura encaixa em colunas e a altura
    anda de 20 em 20 px; duplo clique volta para a altura automática.
  - **Menu "⋯" no topo:** largura, altura automática e "Tirar da página inicial".
  - **Bloco "Adicionar widget"** no fim da grade devolve os widgets tirados (o modal "Gerenciar widgets"
    continua igual).
  - A conta de tamanho é pura, em `packages/utils/src/home-widgets.ts` (com testes). Arquivos:
    `home-dashboard-widgets.tsx` (`HOME_WIDGETS_LIST` ganhou `defaultWidth` e `hideForGuests`;
    `useAvailableHomeWidgetKeys`), `widgets/dashboard-block.tsx`, `widgets/add-widget-menu.tsx` e
    `updateWidgetConfig` na store da home.
  - Um widget novo entra no **fim** da home de quem já tem a home montada (antes entrava com 999 e
    podia cair no topo).
- **Tarefas com subtarefas:** `WorkspaceUserTask` ganhou `parent` e `sort_order` (migration `0134`); o
  título pode ficar vazio enquanto a linha é digitada; apagar é definitivo e leva as subtarefas junto.
  - A árvore do checklist dos itens virou um componente compartilhado, `components/checklist-tree/`
    (lista, linha, contexto e `useChecklistTreeOperations`). O checklist do item usa ele, e o
    responsável e o prazo entram por `renderItemExtras` (`checklist/extras.tsx`). O widget Tarefas usa
    o mesmo componente, com o mesmo teclado (Enter, Tab, Shift+Tab, Alt+↑/↓) e o arrastar.
  - A store MobX das tarefas (`store/workspace/task.store.ts`) saiu. O checkbox da linha virou
    `<input type="checkbox">`.
- **Bug corrigido nas duas listas (texto da linha sumindo ao recuar):** o Tab grava o texto e o recuo em
  dois PATCHes seguidos.
  - **Servidor:** o segundo PATCH carregava a linha antes do primeiro terminar e regravava a linha
    inteira, apagando o texto. O `SaveOnlySentFieldsMixin` (`app/serializers/partial_update.py`) faz o
    update gravar só os campos enviados; está nos serializers do checklist e das tarefas.
  - **Navegador:** o `optimisticData` do SWR calcula a segunda mudança a partir do estado anterior à
    primeira e descarta o resultado mais antigo, então o texto sumia da tela. As escritas no cache
    viraram funções síncronas sobre o que está na tela, e as requisições de uma mesma linha saem em
    fila.
  - O 805782a tinha tentado corrigir o mesmo sintoma copiando só os campos alterados da resposta; a
    corrida continuava. Testes: `test_two_patches_at_once_keep_both_fields` (tarefas e checklist).
- **Links rápidos com item de trabalho:** `WorkspaceUserLink.issue` (FK, migration `0134`).
  - **Formulário:** escolhe entre "Site" e "Item de trabalho". O item é buscado em todos os projetos pela
    busca do workspace, com as mesmas regras de convidado.
  - **Servidor:** valida o item (mesmo workspace e visível para a pessoa), monta a URL e devolve o
    `issue_detail` com nome e estado atuais. É `null` se o item foi apagado ou a pessoa perdeu acesso,
    e o link aparece como "Item indisponível".
  - **Clique:** abre o item no painel lateral. O `LinkItemBlock` (`packages/ui`) ganhou `icon`,
    `subtitle` e `muted`, e a área clicável virou um `<button>`, que agora funciona pelo teclado.
    `updateLink` da store passou a guardar a resposta do servidor.
- **Widget Agenda (Google Calendar):** chave `google_calendar`.
  - **Convidados:** pra eles o widget começa desligado e não aparece na lista.
  - **Conexão:** usa a conexão pessoal com o Google Calendar que já existia. O
    `users/me/google-calendar/events/` ganhou `calendar_ids` (até 10); sem o parâmetro, vale o de antes.
  - **O que mostra:** hoje, 3, 7 ou 14 dias. As agendas são escolhidas no próprio widget (padrão: a
    principal, como `primary`). Tem botão "Entrar" (Meet ou outra videochamada do evento) e destaque
    "Agora". Eventos que já passaram ficam apagados; recusados e cancelados não aparecem. O item de
    trabalho vinculado abre no painel. Sem conexão, mostra "Conectar Google Calendar".
  - A lógica de dias e eventos é pura, em `packages/utils/src/home-agenda.ts`, com testes que rodam em
    UTC, São Paulo e Tóquio.
- **i18n:** chaves novas em `home.json` (`home.widget.*`, `home.agenda.*`, `home.quick_links.*` e
  `home.tasks.*`), só `en` e `pt-BR`, como as outras chaves da Pespo.
- **Junto, fora do escopo:** em `workspace/settings/members-list.tsx`, o 4af627c só tinha trocado o
  comentário. O `oxlint --fix` do pre-commit (regra `unicorn/no-array-sort`) troca qualquer `sort()` de
  volta para `toSorted()`. Virou `sortBy` do lodash, e o `check:types` do web voltou a passar.
- **Verificado no navegador** (Playwright, com API e web locais): redimensionar, menu do cartão, tirar e
  devolver widget, Tab/Enter nas Tarefas, link para item de trabalho e Agenda (com os dados do Google
  simulados).
- **Deploy:** rebuildar `api` (migration `0134`) e `web`. Nada muda no worker nem no beat.
- **Risco de upgrade:** médio. A home (`home-dashboard-widgets.tsx`, `dashboard-block.tsx`, `root.tsx`),
  o checklist (`issue-detail-widgets/checklist/`), `packages/ui/src/link/block.tsx` e `link.store.ts`
  são pontos que o upstream mexe. A reestruturação #9884 tira tudo de `apps/web/core/`: reaplicar nos
  caminhos novos.

---

## OAuth do Google separado: login × integrações (2026-10-21)

- **Por quê:** login, Google Calendar e Google Drive usavam o mesmo OAuth client ("Plane Calendar Sync"),
  do tipo **Interno** — só contas `@pespo.com.br` entravam pelo Google; convidados com Gmail levavam
  `403: org_internal`. O client não pode simplesmente virar Externo: o escopo do Drive é _restrito_ (exige
  verificação do Google ou limita a 100 usuários de teste).
- **Como ficou:** o login usa `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (o que o god-mode edita em
  Autenticação → Google) e pode ser um app **Externo** só com `openid email profile`. Calendar e Drive usam
  `GOOGLE_INTEGRATIONS_CLIENT_ID`/`GOOGLE_INTEGRATIONS_CLIENT_SECRET` (o app **Interno** de antes) — pelo
  `get_google_integration_credentials()` em `utils/google_calendar.py`, que vale pro OAuth
  (`provider/oauth/google_calendar.py`, herdado pelo do Drive) e pro refresh/revoke dos tokens. Sem as
  chaves próprias, cai no client do login.
- **Migração:** `license/migrations/0007_google_integrations_client.py` copia o client que já existia pras
  chaves novas (o segredo vai criptografado, como está). Os tokens de quem já conectou Calendar/Drive foram
  emitidos pra esse client e continuam renovando — ninguém precisa reconectar.
- As chaves novas **não aparecem no god-mode** (são editadas pelo banco/`.env`: `GOOGLE_INTEGRATIONS_*`).
- Testes: `tests/unit/utils/test_google_calendar.py` (`TestGoogleIntegrationCredentials`) e
  `tests/unit/test_google_integrations_client_migration.py`.
- **Risco de upgrade:** baixo. Se o upstream mexer em `provider/oauth/google.py` não afeta; o
  `provider/oauth/google_calendar.py` é nosso.

---

## Correções de segurança do upstream trazidas por cherry-pick (2026-10-20)

O `upstream/preview` estava 133 commits à frente, e no meio deles veio a reestruturação **#9884** (remove
`apps/web/core/` — tudo foi pra `apps/web/{components,store,hooks}`) e a **#9719** (achata o pacote do
editor). Um merge de teste deu **480 conflitos, todos no frontend** (a varredura de tradução + os widgets
da Pespo × a mudança de pastas), e nenhum no `apps/api`. Por isso o merge completo foi adiado e só as
correções de segurança do backend vieram, por `git cherry-pick -x` (a mensagem de cada commit cita o hash
original):

- 38 dos 41 commits `fix(security)` que tocam só `apps/api` e não têm migration (escopo por projeto/URL em
  histórico, comentários, módulos/ciclos, favoritos, busca, exportação, assets, API v1, OAuth state,
  cookies `Secure`, campos de sistema só-leitura etc.).
- `c23728e769` (#9899) — o histórico do item sem `activity_type` dava 500 (ordenava objetos como dict); o
  teste novo do #10051 expôs o bug, que já existia aqui.
- **Ficaram de fora** (dependem de commits não-segurança do upstream): `9dc9a013a0` #10048 (campos de
  sistema só-leitura), `77ec6e72be` #10053 (e-mail em tempo linear), `63c35fd6c6` #10059 (throttle de
  auth). Também os que mexem em frontend/deps/migrations (#10032, #10057, bumps do Trivy, Caddy 2.11.7 do
  proxy próprio do Plane — que nós não usamos).
- Suíte do backend: 1101 passaram; `test_list_relational_order_by_injection_does_not_500` falha só com
  `-n 4` (passa em série) — instabilidade de teste paralelo, não bug.
- **2026-10-22 (auditoria da VPS, item P1):** mais três que tinham escapado por não terem
  "(security)" no título ou por mexerem também no frontend: `e30605d419` #9335 (limite de tentativas
  no login e no cadastro por e-mail/senha), `c2b0ecd424` #9709 (recusa `next_path` do tipo
  `//outro-site` depois do login; a parte do web só entra no próximo build do web) e `bae037cfb2`
  #9866 (o project-join só procura o convite do próprio projeto). Suíte do backend: 1129 passaram.
- **Próximo merge completo:** quando fizer, o git vai reconhecer esses commits (mesmo conteúdo); o grosso do
  trabalho é reaplicar as customizações de frontend nos caminhos novos (`apps/web/components/...`). As
  migrations `0123`–`0125` do upstream vão precisar de uma migration de merge com a nossa cadeia (que
  termina em `0133`) — como a `0129_merge_pespo_preview`.

---

## Selects do widget de dashboard mostram a opção escolhida (2026-10-22)

- **Bug (auditoria P12):** no modal de adicionar/editar widget dos dashboards nativos, "Agrupar itens de
  trabalho por" e "Dividir por" apareciam vazios. Só abrindo a lista dava para ver o ✓ da opção salva. O
  `SelectXAxis` (do Analytics) mostra no botão só o que recebe em `label`; a tela de Analytics do
  upstream passa esse `label`, mas o nosso `widget-config-form-modal.tsx` não passava.
- **Correção:** `getAxisLabel()` no próprio modal (nome traduzido via `ANALYTICS_X_AXIS_I18N_KEYS`;
  "Nenhum" em cinza quando "Dividir por" está vazio). O componente do upstream não foi alterado.
- Vai para produção no próximo build do web (onda 2 da auditoria, junto com P8 e P9).

---

## ID do item escondido + ordem manual por padrão (2026-10-20)

- **ID do item (PROJ-123) não aparece mais na interface.** Ele continua existindo por baixo: URLs
  `/browse/PROJ-123/`, API, busca e `sequence_id` seguem iguais, então links antigos funcionam.
  - Ponto central: `IssueIdentifier` (`core/components/issues/issue-detail/issue-identifier.tsx`) retorna
    `null` (constante `PESPO_HIDE_WORK_ITEM_IDENTIFIER`); isso cobre cards de lista/kanban/planilha,
    detalhe, peek, modais e Power K.
  - Onde o ID era montado à mão: se era o único rótulo, virou o nome do item (chip de relação, duplicado
    na intake, pai no formulário da intake, modais de excluir/recusar, breadcrumb, título da aba); se vinha
    junto do nome, só saiu (atividade, notificações, recentes da home, calendário, lista da intake). App
    público (`apps/space`): saiu dos cards e do peek. "Copiar ID" sumiu do Power K (`isVisible: false`).
  - **Identificador do projeto:** some da criação (`project/create/common-attributes.tsx`, gerado a partir
    do nome, `PROJ` se o nome não tiver letras/números) e das configurações (`project/form.tsx`). No
    backend, `ProjectSerializer.validate_identifier` resolve colisão na criação com sufixo numérico
    (`PROJ`, `PROJ2`…) em vez de devolver `PROJECT_IDENTIFIER_ALREADY_EXIST`; na edição continua igual.
- **Ordem manual (arrastar) por padrão.** O arrastar na lista e no kanban já existia, mas só reordena
  quando a ordenação é "Manual" (`sort_order`) — e o padrão era "Mais recentes" (`-created_at`).
  - Defaults de `display_filters.order_by` → `"sort_order"` em `db/models/{project,issue,view,cycle,module}.py`
    (são funções, não geram migration de schema).
  - Migration de dados `0132_default_order_by_manual.py`: preferências salvas com `-created_at` em
    `ProjectUserProperty`/`CycleUserProperties`/`ModuleUserProperties` viram `sort_order`; quem escolheu
    outra ordem fica como está. Reverso é no-op.
  - As views globais do workspace (planilha com vários projetos) continuam sem ordem manual — o
    `sort_order` só faz sentido dentro de um projeto e o próprio store força `-created_at` ali.
- **Deploy:** rebuildar `api` (migration + serializer), `web` e `space`.
- **Risco de upgrade:** baixo-médio. A maior parte é remoção pontual de JSX em arquivos do `core/`; se o
  upstream reescrever um deles, o ID volta a aparecer naquele ponto (não quebra nada). Pra achar de novo:
  `grep -rnE '(identifier|Identifier)\}?-\{?\$?\{?[a-zA-Z_.?]*sequence_id' apps/web apps/space`.

---

## Subtarefas leves com sublistas (checklist em árvore) (2026-10-20)

- **O quê:** dentro de um item de trabalho, uma lista de linhas livres com checkbox (estilo Trello/ClickUp,
  edição estilo Notion), sem criar item de trabalho novo. Qualquer linha pode ganhar uma sublista (Tab),
  e cada linha pode ter **responsável** e **prazo** (prazo vencido fica em vermelho). Não aparece nas
  visualizações nem tem estado; os sub-itens de trabalho do Plane continuam existindo à parte.
- **Uso:** botão "Subtarefa" na fileira de ações do item (cria a primeira linha e põe o cursor nela) e
  seção "Subtarefas" (contador concluídas/total). Teclado: Enter cria linha abaixo, Tab recua (vira
  sublista da linha de cima), Shift+Tab tira o recuo, Alt+↑/↓ move, Backspace numa linha vazia apaga,
  ↑/↓ nas pontas do texto anda entre linhas. Arrastar pela alça reordena e move entre níveis (solta
  acima/abaixo da linha alvo, no nível dela). Sublistas recolhem pela seta e mostram o próprio contador.
  Convidados só leem.
- **Backend:** modelo `IssueChecklistItem` (`db/models/issue_checklist.py`, tabela `issue_checklist_items`:
  `issue`, `parent` (self, CASCADE), `name`, `is_completed`/`completed_at`, `assignee`, `due_date`,
  `sort_order`), migration `0133_issue_checklist_item.py`, serializer `app/serializers/issue_checklist.py`,
  views `app/views/issue/checklist.py`, rotas `…/issues/<id>/checklist-items/` e `…/checklist-items/<id>/`.
  A API devolve a lista plana (o frontend monta a árvore). Valida que o `parent` é do mesmo item e não é a
  própria linha nem uma descendente, e que o responsável é membro ativo do projeto. **Exclusão é
  definitiva** (sem soft delete) e leva as sublistas junto. Não gera atividade no item.
- **Testes:** `tests/contract/app/test_issue_checklist_app.py`; helpers da árvore em
  `packages/utils/src/issue-checklist.ts` com `issue-checklist.test.ts` (vitest).
- **Frontend:** widget em `issue-detail-widgets/checklist/` (`root.tsx` seção, `content.tsx` lista +
  contexto de foco, `item.tsx` linha recursiva, `helper.ts` SWR + operações otimistas,
  `quick-action-button.tsx`), serviço `services/issue-checklist.service.ts`, tipos em
  `packages/types/src/issue-checklist.ts`, widget `"checklist"` em `TWorkItemWidgets` e em `openWidgets`
  (`store/issue/issue-details/root.store.ts`). i18n `issue_checklist.*` em `work-item.json` (en e pt-BR).
  O botão do cabeçalho da seção é um `<span role="button">` (fica dentro do `<button>` do `Collapsible`).
- **Deploy:** rebuildar `api` (migration nova) e `web`.
- **Risco de upgrade:** baixo-médio. Pontos do `core/` tocados: `action-buttons.tsx` e
  `issue-detail-widget-collapsibles.tsx` (botão + seção), `openWidgets` e `TWorkItemWidgets` — os mesmos do
  Google Drive.

---

## Integração com o Google Calendar — sincronização nos dois sentidos, reuniões e calendário (2026-09-24)

A conexão pessoal com o Google Calendar já existia (agenda "Plane" com as tarefas atribuídas, só de ida,
a cada 10 min, e a visão `/calendar` com eventos do Google por cima), mas não estava documentada aqui.
Nesta leva ela foi corrigida e ampliada:

- **Bugs corrigidos:**
  - Desconectar fazia _soft delete_ da conexão: os tokens ficavam no banco e **reconectar falhava sempre**
    (`IntegrityError` no OneToOne do usuário). Agora apaga de verdade; a migration `0131` limpa as
    linhas antigas e o callback revive uma conexão que tenha ficado soft-deleted.
  - Eventos que saíam da agenda (tarefa concluída, sem data) também eram soft-deleted e bloqueavam a
    mesma tarefa de voltar pra agenda depois (restrição única de `SyncedCalendarEvent`).
  - Tirar alguém dos responsáveis não tirava o evento da agenda dessa pessoa (o `IssueAssignee` removido
    é soft-deleted e o filtro `assignees__in` continuava encontrando).
  - IDs de agenda com `#`/`@` (ex.: feriados) iam sem codificar na URL.
  - A visão `/calendar` carregava só os 100 primeiros itens do workspace, sem olhar o mês.
- **Sincronização nos dois sentidos (Google → Plane):** mover ou renomear no Google o evento de uma
  tarefa muda as datas (início/entrega) e o título do item, com registro na atividade em nome da pessoa.
  Só vale pra quem é membro/admin do projeto (edições de convidados são ignoradas). Apagar o evento no
  Google **não** apaga nada no Plane — o evento volta na próxima sincronização (pra tirar da agenda:
  concluir o item ou tirar a data). Pode ser desligada nas configurações.
  - Como chega: o Google avisa via notificações push (`events.watch`) em
    `POST /api/google-calendar/notifications/` (valida o token secreto de cada canal) e o Plane busca as
    mudanças com `syncToken`; um pull a cada 2 min cobre notificações perdidas. As notificações só são
    registradas se `WEB_URL` for **https** (o Google recusa http); canais são renovados sozinhos.
  - Eco: `SyncedCalendarEvent.pushed_*` guarda o que o Plane escreveu por último, então a escrita do
    próprio Plane nunca é lida de volta como edição.
- **Plane → Google imediato:** qualquer atividade de item de trabalho (`issue_activity`) agenda a
  sincronização daquele item pra todos os envolvidos (debounce de 5 s via Redis). A completa a cada 10
  min continua como rede de segurança.
- **Mais completo na agenda:** tarefas com data de início viram eventos de vários dias; cor pela
  prioridade; lembretes (padrão da agenda, nenhum, ou N dias antes às 9h); filtro de projetos; opção de
  uma agenda por projeto ("Plane · Projeto"); eventos marcados como "livre" (não bloqueiam horário);
  a agenda "Plane" é recriada se for apagada no Google.
- **Reuniões ligadas ao item de trabalho:** botão "Agendar reunião" no item → cria o evento no Google
  Calendar de quem agenda, com **Google Meet**, convidados (atalho "Adicionar responsáveis") e link do
  item na descrição; o Google manda os convites. Seção "Reuniões" no item com "Entrar no Meet", abrir no
  Google, desvincular e cancelar (só quem organizou; os convidados são avisados). A lista se atualiza com
  remarcações/cancelamentos feitos no Google.
- **"Meet agora" no item de trabalho:** um clique cria um Google Meet começando na hora (30 min) no
  Google Calendar de quem clicou, convida os responsáveis atuais e abre o Meet numa aba nova (a aba é
  aberta de forma síncrona no clique, senão o navegador bloquearia o popup). Endpoint
  `…/issues/<id>/calendar-events/instant/`; a reunião aparece em "Reuniões".
- **Visão `/calendar`:** busca os itens por período (paginado); tarefas de vários dias aparecem em todos
  os dias; **arrastar um item pra outro dia muda as datas** (início e entrega andam juntos); filtro "Só
  meus itens"; liga/desliga eventos do Google; o detalhe do evento mostra horário, local, convidados,
  botão do Meet e o item vinculado; **"Criar item de trabalho a partir deste evento"** abre o formulário
  preenchido e vincula o evento ao item criado.
- **Configurações → Perfil → Google Calendar:** ganhou as opções acima (dois sentidos, agenda por
  projeto, cor, lembretes, projetos) e mostra se as mudanças chegam em segundos ou em ~2 minutos.
- **Arquivos:**
  - Backend: `db/models/google_calendar.py` (campos novos em `GoogleCalendarConnection` e
    `SyncedCalendarEvent`, modelo `IssueCalendarEvent`), migration `0131_google_calendar_two_way_sync.py`
    (com a limpeza de dados), `utils/google_calendar.py` (cliente da API + regras puras da sincronização),
    `bgtasks/google_calendar_sync_task.py` (motor: push, pull, canais), gancho no fim do
    `bgtasks/issue_activities_task.issue_activity`, beat `pull-google-calendars` em `celery.py`, views
    `app/views/user/google_calendar.py` (conexão, preferências, eventos, receptor de notificações) e
    `app/views/issue/calendar_event.py` (reuniões). Rotas `users/me/google-calendar/…`,
    `google-calendar/notifications/` e `…/issues/<id>/calendar-events/…`.
  - Testes: `tests/unit/utils/test_google_calendar.py`, `tests/contract/app/test_google_calendar_app.py`.
  - Frontend: `components/workspace/calendar-sync/` (visão do calendário), widget
    `issue-detail-widgets/meetings/`, `settings/profile/content/pages/google-calendar.tsx`, serviço
    `services/issue-calendar-event.service.ts`, tipos em `packages/types/src/google-calendar.ts`, i18n
    `google_calendar_integration.*` em `integration.json` (en e pt-BR).
- **Deploy:** rebuildar `api` (migration) e `web`. O **worker e o beat do Celery** precisam estar rodando
  com a imagem nova (o beat tem uma tarefa nova). Conferir que `WEB_URL` no `.env` é o domínio público
  com https — é ele que o Google chama. Quem já estava conectado não precisa reconectar (o escopo
  `calendar` já cobre tudo); eventos antigos passam a sincronizar nos dois sentidos depois do primeiro
  push.
- **Risco de upgrade:** médio. Pontos do upstream tocados: o fim de `issue_activity`
  (`issue_activities_task.py`), a lista `openWidgets` e `TWorkItemWidgets` (widget `"meetings"`),
  `action-buttons.tsx`/`issue-detail-widget-collapsibles.tsx`.

---

## Integração com o Google Drive (2026-09-24)

- **O quê:** conexão real, por usuário, com o Google Drive (OAuth, mesmo client do Google Calendar),
  usada em três lugares:
  1. **Itens de trabalho** — botão "Google Drive" na fileira de ações (ao lado de "Anexar"), com duas
     opções:
     - **Vincular do Drive:** guarda só os metadados no Plane (tabela `issue_google_drive_files`); o
       arquivo continua no Drive, sempre na versão mais recente. Aparece na seção "Google Drive" do item,
       com **Visualizar** e **Editar** (Docs/Sheets/Slides abertos dentro do Plane, num modal com iframe),
       **Abrir no Google** e **Remover**. Entra no histórico de atividade como link.
     - **Copiar para anexos:** baixa o arquivo pelo backend e cria um anexo normal do Plane (Docs e
       Slides viram PDF, Sheets vira XLSX, Drawings vira PNG). Respeita `FILE_SIZE_LIMIT` e
       `ATTACHMENT_MIME_TYPES`. É uma cópia congelada, visível pra quem não tem acesso ao arquivo no Drive.
     - O seletor navega por Meu Drive / Compartilhados comigo / Recentes / Com estrela, pastas, busca, e
       permite criar um Google Docs/Sheets/Slides novo já vinculado.
  2. **Páginas (e descrições)** — bloco `/google-drive` no editor: abre o seletor do Drive (ou aceita um
     link colado) e incorpora o Docs/Sheets/Slides/PDF em iframe, com alternância **Visualizar/Editar**,
     altura ajustável (arrastando a borda de baixo) e "Abrir no Google". Funciona em páginas colaborativas
     (live) e fica só-leitura nas páginas publicadas.
  3. **Configurações → Perfil → Google Drive** — conectar/desconectar.
- **Correções depois do primeiro uso em produção (2026-09-24):**
  - _Anexar pelo painel lateral da tarefa fechava a tarefa sem anexar._ O painel (peek) fecha em
    qualquer `mousedown` fora dele, exceto em modais registrados na store ou em elementos com
    `data-prevent-outside-click`. O seletor do Drive (e os modais do Calendar) não eram nenhum dos
    dois, então clicar no arquivo fechava a tarefa e o seletor sumia junto. `ModalCore`
    (`packages/ui`) ganhou a prop opcional `preventOutsideClick`, que marca o modal inteiro (fundo
    incluso); usada no seletor, no visualizador e no "Agendar reunião". **Qualquer modal novo aberto
    de dentro da tarefa precisa dessa prop.** Verificado no navegador (Playwright).
  - _"Ative os cookies" no embed._ O preview/editor do Google em iframe precisa de cookies de
    terceiros, que muitos navegadores bloqueiam. "Visualizar" agora usa uma prévia do próprio Pespo
    Hub: `GET /api/users/me/google-drive/files/<id>/preview/` busca o arquivo com a conexão Drive de
    **quem está vendo** (as permissões do Drive continuam valendo) e devolve Docs/Sheets/Slides em PDF,
    desenhos em PNG, PDFs e imagens como estão (nunca HTML/SVG), com `X-Frame-Options: SAMEORIGIN` —
    só funciona porque web e API estão no mesmo domínio (`plane.pespo.com.br`). Sem conexão, sem
    acesso ou tipo sem prévia, mostra uma página de aviso com link "Abrir no Google". "Editar"
    continua no editor do Google (precisa dos cookies); o iframe ganhou
    `allow-storage-access-by-user-activation` pra o botão do Google conseguir pedir acesso. Em páginas
    públicas (`space`, sem login) o embed continua usando a prévia do Google.
- **Como a permissão funciona:** o Plane nunca compartilha arquivos. Navegar/vincular/copiar usa o token
  de quem está fazendo a ação; visualizar/editar no iframe usa a sessão Google do próprio navegador de quem
  está olhando — quem não tem acesso ao arquivo no Drive vê a tela de "pedir acesso" do Google. Se o
  navegador bloquear cookies de terceiros (Safari, Chrome com bloqueio ativado), o iframe pode pedir login;
  o botão "Abrir no Google" resolve.
- **Configuração no Google Cloud (obrigatória antes de usar):** no mesmo projeto/client OAuth do Calendar
  (`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`):
  1. Ativar a **Google Drive API** (APIs & Services → Library).
  2. Adicionar o redirect URI `https://<domínio>/api/users/me/google-drive/callback/` no client OAuth.
  3. Adicionar o escopo `https://www.googleapis.com/auth/drive` na tela de consentimento. É um escopo
     "restrito": com o app do tipo **Interno** (Google Workspace) não precisa de verificação do Google; se
     o app for Externo, só funciona pra usuários de teste até passar pela verificação.
- **Arquivos novos:**
  - Backend: modelos `GoogleDriveConnection` (tokens criptografados, igual ao Calendar) e
    `IssueGoogleDriveFile` em `apps/api/plane/db/models/google_drive.py`, migration
    `0130_googledriveconnection_issuegoogledrivefile.py`, provider OAuth
    `authentication/provider/oauth/google_drive.py` (herda do `GoogleCalendarOAuthProvider`, que ganhou o
    atributo `callback_path`), cliente da API `utils/google_drive.py` (reaproveita refresh/revoke de
    `utils/google_calendar.py`), views `app/views/user/google_drive.py` (conexão, navegação, criar arquivo)
    e `app/views/issue/google_drive.py` (vincular, remover, copiar para anexos), serializer
    `app/serializers/google_drive.py`. Rotas `users/me/google-drive/…` e
    `workspaces/<slug>/projects/<id>/issues/<id>/google-drive-files/…`.
  - Testes: `tests/unit/utils/test_google_drive.py` e `tests/contract/app/test_google_drive_app.py`
    (o Google é sempre mockado).
  - Frontend: serviço `apps/web/core/services/google-drive.service.ts`; componentes compartilhados em
    `apps/web/core/components/integration/google-drive/` (seletor, visualizador, `picker-store.ts` +
    `picker-host.tsx` — ponte que deixa o editor abrir o seletor, montada em `GlobalModals`); widget do
    item em `issue-detail-widgets/google-drive/`; página de configurações
    `settings/profile/content/pages/google-drive.tsx`; tipos em `packages/types/src/google-drive.ts`;
    helpers de URL (extrair id, montar URL de preview/edição) em `packages/utils/src/google-drive.ts`,
    com testes vitest (`pnpm --filter @plane/utils test` — primeiro teste desse pacote).
  - Editor: extensão `packages/editor/src/ce/extensions/google-drive-embed/`, registrada nos mesmos
    pontos do Clapshot (`CORE_EXTENSIONS.GOOGLE_DRIVE_EMBED`, `BLOCK_NODE_TYPES`, `TEditorCommands`,
    `ce/extensions/core/extensions.ts`, `without-props.ts`, `slash-commands.tsx`) + o callback
    `onPickGoogleDriveFile` em `IEditorPropsExtended`.
  - **Allowlist do sanitizador** (a pegadinha do Clapshot): `google-drive-embed-component` com os
    atributos `url`, `name`, `mime_type`, `mode`, `height` em `apps/api/plane/utils/content_validator.py`.
  - i18n: bloco `google_drive_integration.*` em `integration.json` e `profile.actions.google-drive` em
    `settings.json` (só `en` e `pt-BR`, como as outras chaves da Pespo). O node do editor usa textos em
    português fixos, como o do Clapshot.
- **Segurança:** o iframe nunca usa a URL crua salva no documento — só o id extraído e validado, sempre em
  domínio do Google (por isso ali `allow-scripts` + `allow-same-origin` é seguro, diferente do Clapshot).
  O backend busca os metadados no próprio Drive (nunca confia em nome/link vindos do navegador), valida
  todo id antes de usar em URL ou query, e o `next_path` do OAuth só aceita caminhos relativos.
- **Deploy:** rebuildar `api` (migration nova), `web`, `space` e `live` (o `live` precisa do node novo
  pra converter páginas).
- **Risco de upgrade:** médio. Pontos do `core/` que um merge pode reescrever: as mesmas duas linhas do
  Clapshot em `core/constants/extension.ts`/`core/types/editor.ts`, `action-buttons.tsx` e
  `issue-detail-widget-collapsibles.tsx` (botão + seção), a lista `openWidgets` em
  `store/issue/issue-details/root.store.ts` e `TWorkItemWidgets` em `packages/types/src/issues/issue.ts`.

---

## Widget de Tarefas + homepage em blocos (2026-09-04)

- **O quê:** a homepage do workspace (`apps/web/core/components/home/`) passou de uma lista de
  widgets empilhados em coluna única pra uma grade de 2 colunas (`grid-cols-2`), cada widget
  virando um "card" (`DashboardWidgetBlock`,
  `apps/web/core/components/home/widgets/dashboard-block.tsx`) que pode ser arrastado e solto
  direto na home (não só reordenado pelo modal "Gerenciar widgets", que continua funcionando do
  jeito que já funcionava). Além disso, um novo widget "Tarefas" foi adicionado — checklist simples
  e privada por usuário (texto + concluída/não concluída), ao lado de Stickies/Quick Links.
- **Por quê:** pedido do usuário pra uma home "personalizável, com os widgets em blocos", mais um
  widget de lista de tarefas simples. Um widget de Calendário está sendo desenvolvido em paralelo
  (rota `/calendar`, fora deste trabalho) e deve entrar nessa mesma grade quando estiver pronto —
  não é preciso mexer no layout de novo pra isso, só registrar a nova chave do widget.
- **Infra reaproveitada, zero mudança:** o sistema de habilitar/desabilitar/reordenar widgets já
  existia inteiro (`WorkspaceHomePreference`, `useHome()` store, modal "Gerenciar widgets") — uma
  chave nova em `THomeWidgetKeys`/`HOME_WIDGETS_LIST` fica automaticamente reordenável e
  liga/desliga sem tocar em nada disso. O drag-and-drop direto na home reusa exatamente o mesmo
  helper (`widgets/manage/widget.helpers.ts`) e a mesma ação de store (`reorderWidget`) que o modal
  já usava — só migrou de lista vertical (`widget-item.tsx`) pra card em grade
  (`dashboard-block.tsx`).
- **Arquivos novos (Tarefas):**
  - Backend: modelo `WorkspaceUserTask` (`apps/api/plane/db/models/workspace.py`, mesmo padrão do
    `WorkspaceUserLink` — por usuário/workspace, sem campos extras), migration
    `0128_workspaceusertask.py`, serializer `WorkspaceUserTaskSerializer`, view
    `WorkspaceUserTaskViewSet` (`apps/api/plane/app/views/workspace/task.py`), rotas
    `workspaces/<slug>/tasks/` em `apps/api/plane/app/urls/workspace.py`.
  - Frontend: `WorkspaceTaskStore` (`apps/web/core/store/workspace/task.store.ts`, aninhado em
    `HomeStore.tasks` do mesmo jeito que `HomeStore.quickLinks`), métodos de serviço em
    `workspace.service.ts`, e o widget em si em
    `apps/web/core/components/home/widgets/tasks/` (`root.tsx`, `task-item.tsx`, `use-tasks.tsx`).
  - Chave nova `"task_list"` em `THomeWidgetKeys` (`packages/types/src/home.ts`) e em
    `WorkspaceHomePreference.HomeWidgetKeys` (backend) — **sem migration pro campo `key`**, porque
    ele é um `CharField` solto sem `choices=` no field (só a classe `TextChoices` documenta os
    valores válidos em Python).
- **Risco de upgrade:** médio — a home é uma área que o upstream mexe com alguma frequência
  (feature de monetização já foi removida daqui antes, ver seção 3 acima). Se o merge reescrever
  `home-dashboard-widgets.tsx`, a grade de 2 colunas e o `DashboardWidgetBlock` provavelmente
  precisam ser reaplicados manualmente.
- **Atualizado em 2026-10-23:** a grade virou 4 colunas redimensionáveis e as Tarefas ganharam
  subtarefas — ver "Home: grade redimensionável, subtarefas nas Tarefas, links de item e Agenda".

## Player de vídeo embutido (Clapshot) (2026-08-31)

- **O quê:** um node customizado no editor de texto rico (Tiptap) que embute uma revisão de vídeo do
  [Clapshot](https://github.com/elonen/clapshot) diretamente na descrição de um item de trabalho, via
  comando `/clapshot`. Resolve o limite de tamanho/duração de vídeo que a instância tinha ao depender só
  de upload direto — o vídeo fica no Clapshot (self-hosted, sem esses limites) e o Plane só embute o
  player em um `<iframe>`.
- **Por quê Clapshot e não outra coisa:** já era a ferramenta usada informalmente pela equipe pra revisão
  de vídeo; é self-hosted e não tem limite de tamanho/duração próprio.
- **Arquivos novos:**
  - `packages/editor/src/ce/extensions/clapshot-embed/` — a extensão Tiptap completa:
    - `types.ts` — tipos/enum do atributo `url`.
    - `extension-config.ts` — definição do node (`Node.create`, atom/block, `parseHTML`/`renderHTML`
      pra tag `<clapshot-embed-component url="...">`, comando `insertClapshotEmbed`, e o
      `addStorage().markdown.serialize` — **obrigatório**: sem isso o `tiptap-markdown` não sabe
      serializar o node e a descrição inteira falha ao salvar como vazia).
    - `extension.tsx` — wrapper que registra o React NodeView via `ReactNodeViewRenderer`.
    - `components/node-view.tsx` — a UI: formulário pra colar o link quando vazio, player em iframe
      (16:9) com toolbar (abrir em nova aba / editar / remover) quando preenchido.
    - `index.ts` — barrel.
- **Arquivos editados (pontos de extensão do `ce/`, propositalmente deixados vazios pelo upstream pra
  esse tipo de customização — ver `packages/editor/tsconfig.json`, alias `@/plane-editor/*` → `./src/ce/*`):**
  - `packages/editor/src/core/constants/extension.ts` — `CLAPSHOT_EMBED` no enum `CORE_EXTENSIONS` e em
    `BLOCK_NODE_TYPES`.
  - `packages/editor/src/core/types/editor.ts` — `"clapshot-embed"` na união `TEditorCommands`.
  - `packages/editor/src/ce/extensions/core/extensions.ts` — registra `ClapshotEmbedExtension()` em
    `CoreEditorAdditionalExtensions` (extensões "vivas", com NodeView React).
  - `packages/editor/src/ce/extensions/core/without-props.ts` — registra `ClapshotEmbedExtensionConfig`
    em `CoreEditorAdditionalExtensionsWithoutProps` (versão só-schema, sem NodeView — usada pelo
    `apps/live` pra conversão HTML↔ProseMirror↔Yjs de **Páginas**, ver abaixo).
  - `packages/editor/src/ce/extensions/slash-commands.tsx` — adiciona a opção "Clapshot" ao menu `/`.
  - `apps/api/plane/utils/content_validator.py` — **a parte que realmente importa e que quebrou duas
    vezes durante o desenvolvimento** (ver "Pegadinha sistêmica" abaixo).
- **Deploy que passou a ser necessário:**
  - `apps/live` (serviço `live` no `docker-compose.yaml`) precisou passar a usar uma imagem própria
    (`plane-live-pespo:latest`, buildada com `apps/live/Dockerfile.live`) em vez da imagem oficial
    `makeplane/plane-live:stable` — porque esse serviço também consome `@plane/editor` (pra sincronização
    colaborativa de **Páginas**, via Hocuspocus/Yjs) e precisa enxergar o node novo no bundle. Mesmo
    padrão de comentário `# Pra voltar ao original: ...` já usado pra `web`/`space`/`api`.
- **Pegadinha sistêmica descoberta (vale pra QUALQUER node customizado novo, não só Clapshot):**
  o Django sanitiza todo `description_html` recebido em PATCH — tanto de itens de trabalho
  (`IssueSerializer.validate()`) quanto de Páginas (`PageBinaryUpdateSerializer.validate_description_html`,
  chamado via `apps/live` → `PATCH .../pages/{id}/description/`) — usando `nh3` (sanitizador HTML em Rust)
  com uma **allowlist explícita** em `apps/api/plane/utils/content_validator.py`:
  - `CUSTOM_TAGS` precisa conter o nome da tag (`clapshot-embed-component`), senão o elemento inteiro é
    removido silenciosamente, sem erro.
  - `ATTRIBUTES` precisa ter uma entrada `"clapshot-embed-component": {"url"}`, senão a **tag sobrevive
    mas o atributo é removido** — sintoma enganoso: o node aparece salvo (com `data-id` do editor), mas
    sempre volta pro estado "cole o link aqui" ao recarregar, porque `url` nunca chega no banco.
  - **Qualquer node Tiptap customizado novo precisa das duas entradas** (tag + atributos) nesse arquivo,
    ou vai parecer "funcionar" no editor e falhar silenciosamente ao persistir. Esse foi o bug mais demorado
    de diagnosticar aqui — network tab/DB precisaram ser inspecionados diretamente pra confirmar.
- **Risco de upgrade:** médio. `content_validator.py` é um arquivo pequeno e isolado — se o upstream
  reescrever a lógica de sanitização por completo, é reaplicar as duas entradas (`CUSTOM_TAGS` +
  `ATTRIBUTES`). Os hooks em `ce/` são o ponto de extensão oficial do Plane pra isso, então tendem a ser
  estáveis entre versões. O ponto mais frágil é `packages/editor/src/core/types/editor.ts`
  (`TEditorCommands`) e `core/constants/extension.ts` (`CORE_EXTENSIONS`/`BLOCK_NODE_TYPES`) — são
  arquivos do `core/` (não do `ce/`), então um merge pode reescrevê-los; só reaplicar as duas linhas
  adicionadas (`"clapshot-embed"` e `CLAPSHOT_EMBED`).
- **Testado e confirmado (2026-08-31):** inserir via `/clapshot`, preencher URL, o PATCH sai com o `url`
  no `description_html`, persiste no Postgres, sobrevive a reload de página, e editar/remover funcionam
  e também persistem corretamente.
