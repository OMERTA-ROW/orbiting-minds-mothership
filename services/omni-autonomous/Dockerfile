FROM node:26-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends bubblewrap util-linux python3 \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY executor.mjs ./
ENV OMNI_AUTONOMOUS_ENABLED=false NODE_ENV=production
EXPOSE 8080
CMD ["node", "executor.mjs"]
