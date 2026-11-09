import express from "express";
import { requireAdmin } from "../middlewares/gatewayAuth.js";

export const createCategoryRoutes = (handlers) => {
  const router = express.Router();

  router.post("/create-category", requireAdmin, handlers.create);
  router.put("/update-category/:id", requireAdmin, handlers.update);
  router.get("/get-category", handlers.list);
  router.get("/single-category/:slug", handlers.single);
  router.delete("/delete-category/:id", requireAdmin, handlers.remove);

  return router;
};
