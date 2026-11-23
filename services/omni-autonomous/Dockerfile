FROM node:26.0.0-bookworm-slim@sha256:3529ef69feecddd94e9c5ecd3d25a96f2f23ea40661f494f932ae2b12ab1977c

LABEL org.opencontainers.image.title="OMNI autonomous executor"
LABEL org.opencontainers.image.description="Disabled-by-default executor; no deployment or autonomy is activated by the image"

RUN apt-get update \
 && apt-get install -y --no-install-recommends bubblewrap util-linux python3 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY executor.mjs isolation-diagnostic.mjs ./

ENV OMNI_AUTONOMOUS_ENABLED=false NODE_ENV=production
USER root
EXPOSE 8080
HEALTHCHECK CMD node -e "fetch('http://127.0.0.1:'+ (process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
STOPSIGNAL SIGTERM
CMD ["node", "executor.mjs"]
