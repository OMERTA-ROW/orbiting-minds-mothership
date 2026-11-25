# OMNI cloud sandbox — deploy as its OWN Railway service (never the Jackboy/production service).
FROM node:22.21.1-bookworm-slim@sha256:25b3eb23a00590b7499f2a2ce939322727fcce1b15fdd69754fcd09536a3ae2c

LABEL org.opencontainers.image.title="OMNI quarantined workspace sandbox"
LABEL org.opencontainers.image.description="Hardened reference image; workspace execution remains quarantined"

RUN apt-get update \
 && apt-get install -y --no-install-recommends git util-linux procps ca-certificates python3 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY server.mjs cgroup.mjs recovery.mjs nonce-reconciler.mjs stop-nonce-worker.mjs health-evidence.mjs ./

# Starts as root only to drop each command to an unprivileged per-session user.
ENV OMNI_SANDBOX_ROOT=/sandbox NODE_ENV=production
USER root
EXPOSE 8080
HEALTHCHECK CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
STOPSIGNAL SIGTERM
CMD ["node", "server.mjs"]
