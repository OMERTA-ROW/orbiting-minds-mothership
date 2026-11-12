# OMNI cloud sandbox — deploy as its OWN Railway service (never the Jackboy/production service).
FROM node:22-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends git util-linux procps ca-certificates python3 \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY server.mjs ./
# Starts as root only to drop each command to an unprivileged per-session user.
ENV OMNI_SANDBOX_ROOT=/sandbox NODE_ENV=production
EXPOSE 8080
HEALTHCHECK CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "server.mjs"]
