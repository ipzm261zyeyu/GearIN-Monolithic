import cors from "cors";
import express from "express";
import { createPaymentHandlers } from "./controllers/paymentController.js";
import { BraintreePaymentProcessor } from "./processors/BraintreePaymentProcessor.js";
import { FakePaymentProcessor } from "./processors/FakePaymentProcessor.js";

export const createPaymentProcessor = (config) => {
  switch (config.paymentProvider) {
    case "braintree":
      return new BraintreePaymentProcessor(config.braintree);
    case "fake":
      return new FakePaymentProcessor();
    default:
      throw new Error(`Unknown payment provider "${config.paymentProvider}"`);
  }
};

export const createApp = (processor) => {
  const handlers = createPaymentHandlers(processor);
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.get("/api/v1/product/braintree/token", handlers.clientToken);
  app.post("/internal/charge", handlers.charge);

  return app;
};
