# Supply an immutable official Node image reference at build time:
# --build-arg NODE_BASE_IMAGE=node:22-alpine@sha256:<verified-64-hex-digest>
ARG NODE_BASE_IMAGE
FROM ${NODE_BASE_IMAGE}

ENV NODE_ENV=production \
    NODE_OPTIONS=--disable-proto=throw \
    HOME=/tmp

RUN addgroup -S -g 10001 nexus \
 && adduser -S -D -H -u 10001 -G nexus nexus \
 && mkdir -p /opt/nexusdev /workspace \
 && chown -R 10001:10001 /opt/nexusdev /workspace

COPY --chown=10001:10001 execute.js /opt/nexusdev/execute.js

WORKDIR /workspace
USER 10001:10001

# The image intentionally fails closed until a reviewed evaluator is implemented.
ENTRYPOINT ["node", "/opt/nexusdev/execute.js"]
