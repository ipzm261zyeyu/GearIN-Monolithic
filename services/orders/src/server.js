import dotenv from "dotenv";
import { createApp } from "./app.js";
import { createClients } from "./clients/index.js";
import { Config } from "./config.js";
import { Database } from "./database.js";

dotenv.config({ quiet: true });

const config = Config.getInstance();

try {
  await Database.getInstance().connect();
} catch (error) {
  console.error(`Could not connect to ${config.mongoDbName}: ${error.message}`);
  process.exit(1);
}

createApp(createClients(config)).listen(config.port, () => {
  console.log(`Orders service listening on port ${config.port}, database ${config.mongoDbName}`);
});
