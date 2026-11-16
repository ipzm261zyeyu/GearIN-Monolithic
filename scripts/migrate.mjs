import { spawnSync } from "child_process";
import path from "path";
import { ROOT, loadEnv, serviceEnv, services } from "./env.mjs";

const env = loadEnv();

for (const service of services(env).filter((item) => item.migrate)) {
  console.log(`> ${service.name}: ${service.migrate}`);
  const { status } = spawnSync(process.execPath, [service.migrate], {
    cwd: path.join(ROOT, service.cwd),
    env: serviceEnv(env, service),
    stdio: "inherit",
  });
  if (status !== 0) {
    console.error(`${service.name} migration failed`);
    process.exit(status ?? 1);
  }
}
