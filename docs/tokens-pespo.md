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

## O que falta para a 1.9 terminar

1. ~~Tokens~~ (este documento).
2. **Movimento** — os tokens existem; falta o padrão de uso (`framer-motion` já está no catálogo).
3. **Shell adaptativo** — container queries e tipografia fluida. É o item com risco de mudar layout, e
   por isso vai para a homologação antes.

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
