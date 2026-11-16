import { concurrently } from "concurrently";
import path from "path";
import { ROOT, loadEnv, serviceEnv, services } from "./env.mjs";

const env = loadEnv();

const commands = [
  ...services(env).map((service) => ({
    name: service.name,
    command: "node src/server.js",
    cwd: path.join(ROOT, service.cwd),
    env: serviceEnv(env, service),
  })),
  {
    name: "frontend",
    command: "npm start",
    cwd: path.join(ROOT, "Frontend"),
    env: { ...env, PORT: env.FRONTEND_PORT },
  },
];

const { result } = concurrently(commands, {
  prefixColors: ["blue", "magenta", "yellow", "cyan", "green", "red"],
  killOthersOn: ["failure"],
});

result.catch(() => {
  process.exitCode = 1;
});
