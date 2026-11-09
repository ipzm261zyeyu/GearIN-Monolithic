import express from "express";

export const createInternalRoutes = (handlers) => {
  const router = express.Router();

  router.post("/products/by-ids", handlers.productsByIds);
  router.post("/stock/reserve", handlers.reserve);
  router.post("/stock/release", handlers.release);

  return router;
};
