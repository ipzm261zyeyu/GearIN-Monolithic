import cors from "cors";
import express from "express";
import { createPaymentHandlers } from "./controllers/paymentController.js";

export const createApp = (provider) => {
  const handlers = createPaymentHandlers(provider);
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.get("/api/v1/product/braintree/token", handlers.clientToken);
  app.post("/internal/charge", handlers.charge);

  return app;
};
