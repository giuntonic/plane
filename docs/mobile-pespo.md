# Celular — o que muda no Pespo Hub

A meta é o app ser usável com o polegar. Este documento explica o que já existe, o que foi feito e o que
falta. Escrito em 02/11/2026.

## Navegação inferior

`apps/web/core/components/pespo-mobile-nav/index.tsx`, montada em `apps/web/app/layout.tsx`.

| Posição | Destino | Rota |
|---|---|---|
| 1 | Início | `/:workspace` |
| 2 | Projetos | `/:workspace/projects` |
| 3 | Avisos | `/:workspace/notifications` |
| 4 | Relatórios | `/:workspace/reports` |
| 5 | Mais | `/:workspace/settings` |

**Regras do componente** (se for mexer, mantenha):

- aparece só em tela pequena (`md:hidden`) — em desktop a barra lateral é melhor;
- **só aparece quando há espaço de trabalho na URL**. As páginas de login, convite e onboarding usam o
  mesmo layout; sem essa guarda, a barra vazaria para a tela de login;
- alvo de toque de 44 px (`min-h-[44px]`);
- usa apenas token existente: `border-subtle`, `bg-surface-1`, `text-secondary`, `text-accent-primary`;
- reserva a área segura do iPhone com `var(--pespo-safe-bottom)`, hoje 0 px;
- o `<main>` do layout ganhou `pb-14 md:pb-0` para o conteúdo não ficar atrás da barra.

**Pendência conhecida:** os rótulos estão em português **no código**, não no i18n. É a exceção consciente à
regra de `docs/copy-pespo.md`: criar chaves novas exigiria mexer em `en` e `pt-BR` no mesmo PR, e a barra
ainda vai mudar de destinos. Mover para `pespo_mobile_nav.*` quando os destinos estabilizarem.

## Consertos de casca (já em produção)

Ver `packages/tailwind-config/pespo-mobile.css`:

- **altura real do visor** (`100dvh`): a barra do navegador não esconde mais o rodapé;
- **puxar para atualizar** desligado dentro do app;
- **zoom do iOS** evitado (campos com no mínimo 16 px em tela pequena).

## O que falta

1. **`viewport-fit=cover`** no meta viewport (`apps/web/app/root.tsx`, uma linha). Sem isso a área segura
   vale 0 e a barra fica atrás da barra do iPhone. Fazer junto com a próxima mudança na barra.
2. **Destinos definitivos.** Os cinco atuais são uma proposta; quando houver dados de uso, revisar.
3. **Não há tela de "Peças" global**: peças são por projeto. Se a equipe quiser um destino "Peças", é uma
   tela nova, não uma rota existente.
4. **Aplicar densidade e tipografia fluida** nas telas (as classes existem; falta aplicar uma por vez).
5. **Testar em aparelho real.** O que foi verificado até agora: build, bundle e a barra aparecendo no
   layout. Comportamento em iPhone/Android ainda não foi visto.

## Como publicar para testar

```bash
cd /opt/pespo/plane-integration-homolog
git fetch origin && git checkout --detach origin/pespo-preview-integration
docker build -f apps/web/Dockerfile.web -t plane-web-pespo:homolog .
cd /opt/plane-homolog && docker compose up -d --no-deps homolog-web
```

Atenção: o serviço de homologação se chama **`homolog-web`**, não `web` — o nome do serviço vira alias de
rede e um `web` duplicado derrubaria produção (ver o aviso em `infra/homolog/README.md`).
