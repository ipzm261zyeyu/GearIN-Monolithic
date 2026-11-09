import dotenv from "dotenv";
import { createApp } from "./app.js";
import { Config } from "./config.js";
import { Logger } from "./logger.js";

dotenv.config({ quiet: true });

const { port, monolithUrl } = Config.getInstance();

createApp().listen(port, () => {
  Logger.getInstance().info("gateway started", { port, monolithUrl });
});
