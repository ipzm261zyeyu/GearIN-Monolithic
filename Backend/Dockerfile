FROM node:22-slim
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production
COPY . .
USER node
EXPOSE 4000
CMD ["node", "server.js"]
