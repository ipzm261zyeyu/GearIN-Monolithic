import dotenv from "dotenv";
import { createApp, createPaymentProcessor } from "./app.js";
import { Config } from "./config.js";

dotenv.config({ quiet: true });

const config = Config.getInstance();

createApp(createPaymentProcessor(config)).listen(config.port, () => {
  console.log(
    `Payments service listening on port ${config.port}, provider ${config.paymentProvider}`
  );
});
