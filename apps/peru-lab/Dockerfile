FROM node:22-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
COPY apps/peru-lab/server.mjs apps/peru-lab/catalog-home.mjs apps/peru-lab/welcome-banner.svg apps/peru-lab/index.html apps/peru-lab/admin.html apps/peru-lab/commerce.mjs apps/peru-lab/mp4-cache-server.mjs apps/peru-lab/admin-video-cache.html apps/peru-lab/checkout.html apps/peru-lab/orders-admin.html apps/peru-lab/demo-pilot-manifest.json ./
COPY apps/peru-lab/mp4 ./mp4
COPY apps/web/public/cdg-player ./public/cdg-player
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node","server.mjs"]
