import dotenv from "dotenv";
import { createApp } from "./app.js";
import { Config } from "./config.js";
import { Database } from "./database.js";

dotenv.config({ quiet: true });

const { port, mongoDbName } = Config.getInstance();

try {
  await Database.getInstance().connect();
} catch (error) {
  console.error(`Could not connect to ${mongoDbName}: ${error.message}`);
  process.exit(1);
}

createApp().listen(port, () => {
  console.log(`Users service listening on port ${port}, database ${mongoDbName}`);
});
