# syntax=docker/dockerfile:1.7
ARG NODE_IMAGE=node:24-bookworm-slim
ARG RUST_IMAGE=rust:1.100.0-bookworm

FROM ${NODE_IMAGE} AS web-build
WORKDIR /app/web
COPY web/package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY web/ ./
# Public client configuration only. RPC secrets must never be VITE_* values.
ARG VITE_TRADING_MODE=paper
ARG VITE_SOLANA_RPC_URL=https://api.devnet.solana.com
ARG VITE_DEVNET_MANIFEST_URL=/devnet-markets.json
RUN npm run build

FROM ${RUST_IMAGE} AS rust-build
WORKDIR /app
COPY service/ service/
COPY engine/programs/sol_proj/src/curve.rs engine/programs/sol_proj/src/curve.rs
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    cargo test --locked --manifest-path service/Cargo.toml \
    && cargo build --locked --release --manifest-path service/Cargo.toml

# Development targets use source mounts and persistent dependency/build caches.
FROM ${NODE_IMAGE} AS web-dev
WORKDIR /workspace/web
COPY web/package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci && chown -R node:node /workspace
USER node
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

FROM ${RUST_IMAGE} AS rust-dev
RUN rustup component add rustfmt clippy \
    && groupadd --gid 10001 mtl && useradd --uid 10001 --gid mtl --no-create-home mtl \
    && mkdir -p /cargo /data /workspace/service/target \
    && chown -R mtl:mtl /cargo /data /workspace
COPY --chmod=755 deploy/dev-rust.sh /usr/local/bin/mtl-dev
ENV CARGO_HOME=/cargo CARGO_TARGET_DIR=/workspace/service/target \
    MTL_BIND=0.0.0.0:8080 MTL_DATABASE=/data/mtl.sqlite3 MTL_WEB_DIR=/workspace/web/dist
WORKDIR /workspace
USER 10001:10001
EXPOSE 8080
CMD ["mtl-dev"]

FROM debian:bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl sqlite3 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 mtl && useradd --uid 10001 --gid mtl --no-create-home mtl \
    && mkdir /data && chown mtl:mtl /data
COPY --from=rust-build /app/service/target/release/mtl-service /usr/local/bin/mtl-service
COPY --from=rust-build /app/service/target/release/mtl-audit /usr/local/bin/mtl-audit
COPY --from=web-build /app/web/dist /app/web
ENV MTL_BIND=0.0.0.0:8080 MTL_DATABASE=/data/mtl.sqlite3 MTL_WEB_DIR=/app/web
USER 10001:10001
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD curl -fsS http://127.0.0.1:8080/readyz || exit 1
ENTRYPOINT ["mtl-service"]
