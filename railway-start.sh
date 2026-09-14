#!/bin/sh
set -eu

PUBLIC_PORT="${PORT:-8080}"
export DATABASE_URL="${DATABASE_URL:-file:/data/staging.db}"
DB_PATH="${DATABASE_URL#file:}"
mkdir -p "$(dirname "$DB_PATH")"

cd /repo

# Mantener schema actualizado. Sembrar datos demo solo cuando la DB aún no existe.
if [ ! -f "$DB_PATH" ]; then
  echo "[staging] Inicializando SQLite demo en $DB_PATH"
  npm run db:migrate --workspace=apps/api
  npm run db:seed --workspace=apps/api
else
  echo "[staging] SQLite existente; aplicando schema si corresponde"
  npm run db:migrate --workspace=apps/api
fi

cat > /etc/nginx/conf.d/djgabo.conf <<'NGINX'
server {
  listen __PUBLIC_PORT__;
  server_name _;

  root /var/www/djgabo;
  index index.html;

  location /api/ {
    proxy_pass http://127.0.0.1:4000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 300s;
  }

  location / {
    try_files $uri $uri/ /index.html;
  }
}
NGINX
sed -i "s/__PUBLIC_PORT__/${PUBLIC_PORT}/g" /etc/nginx/conf.d/djgabo.conf

cd /repo/apps/api
PORT=4000 node dist/server.js &
API_PID=$!

# Si Railway detiene el contenedor, propagar la señal al API.
trap 'kill "$API_PID" 2>/dev/null || true' TERM INT EXIT

exec nginx -g 'daemon off;'
