import express from "express";
import formidable from "express-formidable";
import { requireAdmin } from "../middlewares/gatewayAuth.js";

export const createProductRoutes = (handlers) => {
  const router = express.Router();

  router.post("/create-product", requireAdmin, formidable(), handlers.create);
  router.put("/update-product/:pid", requireAdmin, formidable(), handlers.update);
  router.post("/clone/:pid", requireAdmin, handlers.clone);
  router.get("/get-product", handlers.list);
  router.get("/get-product/:slug", handlers.single);
  router.get("/product-photo/:pid", handlers.photo);
  router.delete("/delete-product/:pid", requireAdmin, handlers.remove);
  router.post("/product-filters", handlers.filters);
  router.get("/product-count", handlers.count);
  router.get("/product-list/:page", handlers.page);
  router.get("/search/:keyword", handlers.search);
  router.get("/related-product/:pid/:cid", handlers.related);
  router.get("/product-category/:slug", handlers.byCategory);

  return router;
};
