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

A branch de produção é `pespo-branding-v1.4.1`, criada a partir da tag `v1.4.1` do upstream. Cada
customização vira um commit separado, com mensagem descritiva em português — isso facilita re-aplicar
ou entender uma mudança específica quando um merge de uma versão nova do Plane gerar conflito nela.

Pra ver a lista de commits que são *só nossos* (não vêm do Plane original):

```bash
git log --oneline v1.4.1..HEAD
```

Pra ver o diff completo acumulado contra a versão original que usamos como base:

```bash
git diff v1.4.1..HEAD --stat
```

---

## Customizações já commitadas (histórico em `pespo-branding-v1.4.1`)

Do commit mais recente pro mais antigo:

1. **Adiciona botão de aprovação na Marcação da Peça**
2. **Aplica cor de marca da Pespo instância-wide e limpa chrome pra convidados**
3. **Adiciona tela de configuração do dashboard (settings do projeto)**
4. **Adiciona widget nativo de Dashboard (embed do Metabase por projeto)**
5. **Força novo hash do entry.client (contorna cache stale do Cloudflare)**
6. **Adiciona widget nativo de Marcação de Peça (pins de imagem / timestamp de vídeo)**
7. **Rebrand: Plane -> Pespo Hub (textos, título, i18n pt-BR/en)**

Essas mudanças tocam principalmente `apps/web` (widgets do dashboard, marcação de peça, rebranding) e
`packages/i18n` (primeira leva de tradução). Se o upstream mexer nessas mesmas áreas (settings do
projeto, dashboard, branding), é aqui que o merge vai reclamar primeiro.

---

## Trabalho em andamento (ainda não commitado)

Numa sessão longa de tradução + limpeza de produto, acumulamos mudanças em ~324 arquivos que ainda
não viraram commit. Pra ver a lista exata a qualquer momento:

```bash
git status --short
```

O que essas mudanças representam, por categoria:

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

## Checklist antes de atualizar pra uma versão nova do Plane

1. **Commitar (ou pelo menos anotar) tudo que estiver pendente.** Rodar `git status --short` — se
   aparecer uma lista grande, ou é hora de commitar em blocos lógicos, ou pelo menos gerar um
   `git diff > backup-pre-upgrade.patch` antes de mexer em qualquer coisa.
2. **Buscar a versão nova do upstream:**
   ```bash
   git fetch upstream
   git log v1.4.1..upstream/preview --oneline   # ver o que mudou lá
   ```
3. **Criar uma branch de teste** a partir da branch atual antes de fazer o merge/rebase de verdade —
   nunca testar upgrade direto em `pespo-branding-v1.4.1`.
4. **Fazer o merge/rebase** contra a tag nova (ex: `v1.5.0`) e resolver os conflitos usando a seção
   "Trabalho em andamento" acima como guia de quais decisões tomar em cada área.
5. **Rodar a checagem de tradução:**
   ```bash
   pnpm --filter @plane/i18n run sync:check
   ```
6. **Rodar `pnpm install`** (sem `--frozen-lockfile`) se algum `package.json` de `packages/*` mudou, pra
   regerar o `pnpm-lock.yaml`.
7. **Rodar as migrations do banco** (`python manage.py migrate db`) num ambiente de teste antes de tocar
   no banco de produção — conferir se os números das nossas migrations (`0124`-`0126` até agora) não
   colidiram com migrations novas do upstream.
8. **Buildar as imagens Docker** (`apps/web`, `apps/api`) e subir num ambiente de teste antes de apontar
   pro domínio de produção.
9. **Conferir visualmente** as áreas da seção 3 acima (planos/billing, active cycles, sidebar) — se o
   upstream reintroduziu alguma dessas telas, decidir se remove de novo ou mantém.
10. Só depois de tudo isso, atualizar o `docker compose` de produção e redeployar.

---

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
