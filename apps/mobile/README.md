# Plane Mobile (interno)

App React Native/Expo para usar issues do Plane self-hosted (Community Edition)
no celular, já que o app mobile oficial só funciona com a Commercial Edition.

Consome a API pública do Plane (`/api/v1/`), autenticada com um token de API
pessoal por workspace (não é login por e-mail/senha).

## Como rodar localmente

```bash
pnpm install
pnpm --filter mobile start
```

Abra no Expo Go (Android/iOS) ou em um simulador. Este ambiente remoto não tem
simulador/dispositivo, então o app ainda não foi executado de fato — só
escrito e revisado estaticamente. Rode localmente antes de confiar nele.

## Gerando o token de API

No app web da sua instância: **Configurações do workspace → API Tokens →
Add API token**. Na tela de login do app, informe:

- URL da instância (ex: `plane.pespo.com.br`)
- Slug do workspace (o que aparece na URL do app web)
- O token gerado

## Escopo atual (fase 1)

- Login com token de API
- Listar projetos do workspace
- Listar issues de um projeto
- Ver detalhe de uma issue + comentários (ler e escrever)
- Criar issue

## Fora do escopo por enquanto

- **Push notifications**: a API pública do Plane (`api/v1`) não expõe
  endpoints de notificação — isso é usado apenas pela API de sessão do app
  web. Pra ter notificações de verdade seria preciso um serviço próprio de
  polling + APNs/FCM. Por ora dá pra usar pull-to-refresh.
- Filtros/busca de issues, múltiplos workspaces na mesma sessão, anexos.

## Build interno (sem loja pública)

Usa [EAS Build](https://docs.expo.dev/build/introduction/) com o profile
`preview` (`eas.json`), que gera um `.ipa`/`.apk` para distribuição interna:

```bash
npx eas login
pnpm --filter mobile build:ios:preview      # sobe pro TestFlight (interno)
pnpm --filter mobile build:android:preview  # gera um .apk instalável direto
```

Precisa de uma conta Expo (grátis) e, pro iOS, de uma conta Apple Developer
(mesmo para TestFlight interno).
