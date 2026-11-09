import cors from "cors";
import express from "express";
import { createOrderHandlers } from "./controllers/orderController.js";
import { requireAdmin, requireUser } from "./middlewares/gatewayAuth.js";
import orderModel from "./models/orderModel.js";
import { CheckoutService } from "./services/CheckoutService.js";

export const createApp = ({ catalog, payments, users }) => {
  const checkoutService = new CheckoutService({ catalog, payments, orders: orderModel });
  const handlers = createOrderHandlers({ orderModel, checkoutService, users });
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.get("/api/v1/auth/orders", requireUser, handlers.mine);
  app.get("/api/v1/auth/all-orders", requireUser, requireAdmin, handlers.all);
  app.put(
    "/api/v1/auth/order-status/:orderId",
    requireUser,
    requireAdmin,
    handlers.updateStatus
  );
  app.post("/api/v1/product/braintree/payment", requireUser, handlers.checkout);

  return app;
};
