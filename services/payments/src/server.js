import dotenv from "dotenv";
import { createApp } from "./app.js";
import { Config } from "./config.js";
import { ProviderFactory } from "./providers/ProviderFactory.js";

dotenv.config({ quiet: true });

const config = Config.getInstance();

createApp(ProviderFactory.create(config)).listen(config.port, () => {
  console.log(
    `Payments service listening on port ${config.port}, provider ${config.paymentProvider}`
  );
});
