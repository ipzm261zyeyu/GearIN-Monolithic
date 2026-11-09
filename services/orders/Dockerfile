FROM node:22-slim
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production
COPY src ./src
COPY scripts ./scripts
USER node
EXPOSE 4004
CMD ["node", "src/server.js"]
