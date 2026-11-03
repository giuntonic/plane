# Camada de tema da Pespo (1.9 → 2.0)

Como a Pespo controla a aparência do Pespo Hub sem brigar com o Plane original. Escrito em 02/11/2026,
para quem pega o trabalho depois — inclusive outra sessão de LLM.

## O problema que este documento resolve

O app é um fork do Plane. O Plane tem um design system próprio (o **Propel**) com **1004 variáveis CSS**.
Se a Pespo sair pintando componente por componente:

- o merge de uma versão nova do Plane vira conflito em cada tela;
- a 2.0 não tem onde ser aplicada de forma global;
- o app do celular não herda a identidade.

A saída é a mesma de qualquer produto grande: **mexer na paleta, não nas paredes**. O app já pinta a tela
por variáveis; a Pespo só precisa decidir quais delas controla.

## O contrato (leia antes de mexer em cor)

Cada utilidade do Tailwind chega numa variável de baixo. **Mexe-se na variável de baixo.**

| Utilidade no código | Alias do `@theme` | Variável que manda | Dono |
|---|---|---|---|
| `text-primary` | `--text-color-primary` | `--txt-primary` | Propel (hoje) → Pespo na 2.0 |
| `text-secondary` | `--text-color-secondary` | `--txt-secondary` | idem |
| `text-tertiary` | `--text-color-tertiary` | `--txt-tertiary` | idem |
| `bg-surface-1` | `--background-color-surface-1` | `--bg-surface-1` | idem |
| `bg-surface-2` | `--background-color-surface-2` | `--bg-surface-2` | idem |
| `bg-layer-1/2/3` | `--background-color-layer-N` | `--bg-layer-1/2/3` | idem |
| `border-subtle` | `--border-color-subtle` | `--border-subtle` | idem |
| `bg-accent-primary` | `--background-color-accent-primary` | `--bg-accent-primary` | **Pespo** (`--brand-*`) |

Se tentar mudar o alias ou a utilidade, não funciona: eles são só ponteiros.

## Onde fica cada coisa

```
packages/tailwind-config/
├── index.css          importa propel → pespo-brand → pespo-theme
├── pespo-brand.css    escala --brand-* em OKLCH (já existia; valor é PLACEHOLDER #6C5CE7)
└── pespo-theme.css    NOVO (1.9): painel de controle + extras (doodles, categorias, movimento)
```

`pespo-theme.css` tem três papéis:

1. **Documentar** o painel de controle — qual variável mudar em cada caso (comentado, inerte).
2. **Declarar os extras** da Pespo, que o Propel não tem:
   - `--pespo-piece-*` — cor por categoria de peça (Post, Artigo, Reels, Anúncio). Identidade
   funcional: o cartão se identifica pela cor.
   - `--pespo-doodle-ink` — tinta dos rabiscos, com versão para tema escuro.
   - `--pespo-surface-warm` — candidata a fundo quente da 2.0, ainda não usada.
   - `--pespo-duration-*` e `--pespo-ease-out` — movimento, com `prefers-reduced-motion` zerando as
     durações.
3. **Não mudar nada visível** na 1.9.

## Regra de ouro

**Nenhuma cor nova entra em componente.** Se um componente precisa de uma cor que não existe, a cor entra
aqui, com nome de papel (`--pespo-piece-post`), nunca com nome de tom (`--azul-500`).

E: **componente de marca não mora dentro de arquivo do upstream.** Componente novo vive em
`packages/pespo-ui` (ainda não criado) e consome os tokens daqui. É o que evita conflito no próximo merge
do Plane.

## Como mudar a aparência (receita)

1. Escolha a variável no painel de controle (`--bg-surface-1`, `--txt-primary`…).
2. Mude o valor em `pespo-theme.css`, **no claro e no escuro**. O Propel redefine as mesmas variáveis em
   `[data-theme*="dark"]`; se esquecer o escuro, o app fica pela metade.
3. Rode o build do web e publique na **homologação** (`/opt/plane-homolog`).
4. Compare lado a lado com produção. A homologação existe para isso.

### Como provar que a camada funciona (teste do verde)

Antes de acreditar que a 2.0 vai ser fácil, faça o teste:

```
--bg-surface-1: lime;
```

Build, homologação: **se o app inteiro ficar verde, a camada funciona**. Depois remova. É o teste mais
convincente que existe e leva 5 minutos — mas faça na homologação, nunca em produção.

## Estado em 02/11/2026

- `pespo-theme.css` criado e importado. **Zero mudança visual** (só tokens novos, sem consumidor).
- Build do web passa.
- Nada em produção ainda: a mudança está em PR.
- Pendente para a 2.0: paleta aprovada, `packages/pespo-ui`, e aplicar nos componentes.

## A 1.9 está completa (02/11/2026)

| Item | O que foi entregue | Visível? |
|---|---|---|
| Tokens | `pespo-theme.css`: painel de controle + extras (categorias, doodle, movimento) | não |
| Movimento | `pespo-motion.css`: três classes de transição, com duas travas de acessibilidade | não |
| Shell | `pespo-shell.css`: tipografia fluida, container query, alvo de toque | não |

**Nada foi aplicado nas telas.** As classes são opt-in e nenhum componente foi alterado — é a definição de
1.9 ("preparar sem quebrar"). A aplicação é a 2.0.

### O que a 2.0 faz com isso

1. Escolher a paleta (a página de amostras existe para isso) e trocar `--brand-*` + os tokens semânticos.
2. Aplicar `.pespo-text-*` e `.pespo-container` no shell principal, uma tela por vez, conferindo no celular
   pela homologação.
3. Ligar as classes de movimento nos pontos que ajudam a entender mudança.

## Arquivo de amostras

`docs/tokens.html` — página autocontida (abre no navegador, sem servidor) com as cores e os nomes, para
escolher a paleta olhando em vez de lendo.

## Verificação executada (02/11/2026, 23:10, na homologação)

O teste do verde foi feito de verdade, não no papel.

1. Troquei `--bg-surface-1` para `lime` dentro do `pespo-theme.css`.
2. Build do web, imagem `:homolog`, publicada em `/opt/plane-homolog`.
3. No CSS final servido, a declaração aparece **três vezes**, nesta ordem:

```
linha  608  --bg-surface-1: var(--neutral-white)   ← Propel, tema claro
linha  879  --bg-surface-1: var(--neutral-100)     ← Propel, tema escuro
linha 1175  --bg-surface-1: lime                   ← nossa camada
```

Como a nossa vem **depois**, ela vence a cascata. Era exatamente isso que precisava ser provado: a
camada não é decorativa, ela manda na tela.

4. Revertido, rebuild, redeploy: `lime` passou a **0** ocorrências no CSS final, os tokens da Pespo
   continuam presentes e a homologação responde `200`.

**Conclusão:** a 2.0 pode trocar a paleta por `pespo-theme.css`. Se um dia o app não reagir a uma mudança
feita ali, o problema é outro (build velho ou cache de CDN), não a camada.

## Onde a homologação é buildada

O stack de homologação usa imagens `plane-*-pespo:homolog`, construídas a partir de
**`/opt/pespo/plane-integration-homolog`** (worktree criada em 02/11/2026). Nunca buildar homologação a
partir da worktree de produção (`/opt/pespo/plane-integration`): as tags são diferentes justamente para
que um build não sobrescreva o outro.

## Movimento (1.9)

`packages/tailwind-config/pespo-motion.css`. Durações e curva vêm de `pespo-theme.css`
(`--pespo-duration-fast/base/slow`, `--pespo-ease-out`).

Três classes, opt-in:

| Classe | Uso |
|---|---|
| `.pespo-transition` | hover, foco, mudança de cor — o caso de 90% |
| `.pespo-transition-enter` | entrada de painel, item aparecendo |
| `.pespo-transition-screen` | troca de tela |

Só `color`, `background`, `border`, `box-shadow`, `opacity` e `transform` animam. Nunca `all` — `all` anima
layout e trava em tela cheia.

**Reduzir movimento tem duas travas:** as variáveis de duração viram `0ms` e as classes recebem
`transition: none !important`. Quem escrever uma duração na mão ainda não escapa.

**Regra de conteúdo:** animar só o que ajuda a entender a mudança (algo entrou, saiu, foi aprovado). Nunca
animar lista longa, tabela ou texto que a pessoa está lendo.

### Usar no React (2.0)

O `framer-motion` 12 já está no catálogo. O padrão:

```tsx
import { motion, useReducedMotion } from "framer-motion";

const semMovimento = useReducedMotion();
<motion.div
  initial={{ opacity: 0, y: semMovimento ? 0 : 6 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: semMovimento ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }}
/>
```

Os números batem com os tokens; se a 2.0 mudar o ritmo, mude aqui e lá.

## Shell responsivo (1.9)

`packages/tailwind-config/pespo-shell.css`. Entrega a **ferramenta**, não o redesenho — nada é aplicado
sozinho.

**1. Tipografia fluida.** Quatro tamanhos com `clamp()` (mínimo, cresce com a largura, máximo):
`--pespo-text-page`, `--pespo-text-section`, `--pespo-text-body`, `--pespo-text-small`. Em tela ≤ 640 px o
mínimo manda; em tela grande, o máximo. Classes `.pespo-text-*`.

**2. Container queries.** `.pespo-container` marca um bloco para os filhos reagirem à largura **dele**, não
da janela. É o que resolve o caso clássico: a mesma tela numa sidebar estreita e num monitor largo.
Utilitário de exemplo: `.pespo-stack@sm` (empilha no estreito, lado a lado no largo).

**3. Alvo de toque.** `.pespo-touch` garante 44 px (WCAG 2.2). O padding que já existe costuma bastar; a
classe existe para não depender de sorte.

### Por que não aplicar já

A 1.9 é invisível de propósito: arrumar o encanamento antes de trocar a louça. Aplicar tipografia fluida no
shell inteiro muda o layout de várias telas de uma vez — sem alguém olhando, é trocar um risco pequeno por
um grande.

**Ordem da 2.0:** shell principal primeiro (uma tela), conferir no celular pela homologação, e só então
propagar. A receita está no fim de `pespo-shell.css`, em comentário.

### O que já existe e não precisa ser criado

O app **já usa** `@container` em 3 lugares (`stickies/widget`, `settings/profile/modal`,
`settings/content-wrapper`). Ou seja, a técnica não é novidade no código — o que faltava era a escala de
texto e o alvo de toque consistentes.

## Casca no celular (02/11/2026)

`packages/tailwind-config/pespo-mobile.css`. Três defeitos reais de uso no celular, corrigidos **só com
CSS**, sem tocar em componente do upstream. As regras ficam **fora de `@layer`** de propósito: CSS sem
camada vence qualquer camada, inclusive as utilidades do Tailwind — e assim não precisa de `!important`.

| Defeito | O que acontecia | Correção |
|---|---|---|
| Altura | `h-screen` = `100vh`, que no celular inclui a barra de endereço: o rodapé ficava atrás dela e a tela "pulava" quando a barra sumia | `100dvh` (altura visível real), com `100vh` de fallback |
| Puxar para atualizar | arrastar o conteúdo recarregava a página no meio de um arrasto de card | `overscroll-behavior-y: none` no container do app |
| Zoom do iOS | ao focar um campo com fonte < 16 px, o Safari amplia e não desfaz — a pessoa precisa pinçar para voltar | `font-size: max(16px, 1em)` em campos, só em tela ≤ 640 px |

Também ficaram prontas as variáveis de **área segura** (`--pespo-safe-top/bottom/left/right`), hoje valendo
0 px.

### O próximo passo de uma linha

Para a área segura valer de verdade (notch e barra inferior do iPhone), falta declarar
`viewport-fit=cover` no meta viewport:

```tsx
// apps/web/app/root.tsx, linha 63
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
```

**Não fiz agora de propósito:** sem barra fixa no rodapé, reservar a área segura só encolhe a tela sem
ganho. Faz sentido junto com a navegação inferior da 2.0 — é uma linha, no mesmo PR.

### O que ainda não foi mexido

- **Navegação inferior no celular.** É componente novo (rotas, ícones, estado ativo), não CSS. Vai para a
  2.0, junto da decisão de marca.
- **Tipografia fluida aplicada nas telas.** As classes `.pespo-text-*` existem, mas aplicar muda o layout de
  várias telas de uma vez — precisa de alguém olhando, uma tela por vez.
