import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const readEnvFile = (name) => {
  const file = path.join(ROOT, name);
  return fs.existsSync(file) ? dotenv.parse(fs.readFileSync(file)) : {};
};

export const loadEnv = () => ({
  ...readEnvFile(".env.example"),
  ...readEnvFile(".env"),
  ...process.env,
});

export const services = (env) => [
  {
    name: "users",
    cwd: "services/users",
    env: { PORT: env.USERS_PORT, MONGO_DB_NAME: env.USERS_DB_NAME },
    migrate: "scripts/migrate-users.js",
  },
  {
    name: "catalog",
    cwd: "services/catalog",
    env: { PORT: env.CATALOG_PORT, MONGO_DB_NAME: env.CATALOG_DB_NAME },
    migrate: "scripts/migrate-catalog.js",
  },
  {
    name: "payments",
    cwd: "services/payments",
    env: { PORT: env.PAYMENTS_PORT },
  },
  {
    name: "orders",
    cwd: "services/orders",
    env: { PORT: env.ORDERS_PORT, MONGO_DB_NAME: env.ORDERS_DB_NAME },
    migrate: "scripts/migrate-orders.js",
  },
  {
    name: "gateway",
    cwd: "services/gateway",
    env: { PORT: env.GATEWAY_PORT },
  },
];

export const serviceEnv = (env, service) => ({ ...env, ...service.env });
