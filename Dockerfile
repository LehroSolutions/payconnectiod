FROM oven/bun:1.3.14-alpine AS dependencies
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4106 APP_DATA_FILE=/data/data.json APP_DB_FILE=/data/data.sqlite
RUN mkdir /data && chown node:node /data
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json openapi.yaml ./
COPY --chown=node:node app ./app
COPY --chown=node:node src ./src
USER node
EXPOSE 4106
CMD ["node", "app/server.js"]
