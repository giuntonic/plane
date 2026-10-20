# Deploy de produção (Pespo Hub)

`docker-compose.example.yml` é o compose de produção de `plane.pespo.com.br`, com os segredos
trocados por `CHANGE_ME`. No servidor ele vive em `/opt/plane/docker-compose.yml` (valores reais, fora do git),
ao lado de `.env` e `apps/api/.env`.

As imagens `plane-*-pespo` são buildadas localmente a partir desta branch (`pespo-preview-integration`).
