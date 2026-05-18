FROM node:alpine AS build

RUN npm i -g pnpm

WORKDIR /app
COPY package.json ./
COPY pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./
RUN pnpm i --frozen-lockfile

COPY . .
ENV NODE_ENV=production
ENV ALLOW_MISSING_CONFIG=true
RUN pnpm exec svelte-kit sync
RUN pnpm build
RUN pnpm check


FROM node:alpine AS run

RUN npm i -g pnpm

WORKDIR /app
COPY package.json ./
COPY pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./
RUN pnpm i --frozen-lockfile -P --ignore-scripts

COPY --from=build /app/build ./build

# Copy default config file
COPY config.example.yaml ./config/config.yaml

# Set default config file path (can be overridden)
ENV CONFIG_FILE_PATH=/app/config/config.yaml
ENV NODE_ENV=production

CMD ["node", "build"]
EXPOSE 3000