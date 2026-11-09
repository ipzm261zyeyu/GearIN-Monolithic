FROM node:22-slim
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production
COPY src ./src
USER node
EXPOSE 8080
CMD ["node", "src/server.js"]
