import cors from "cors";
import express from "express";
import { createCategoryHandlers } from "./controllers/categoryController.js";
import { createInternalHandlers } from "./controllers/internalController.js";
import { createProductHandlers } from "./controllers/productController.js";
import { createCategoryRoutes } from "./routes/categoryRoutes.js";
import { createInternalRoutes } from "./routes/internalRoutes.js";
import { createProductRoutes } from "./routes/productRoutes.js";
import { StockService } from "./services/StockService.js";

export const createApp = (storageFactory) => {
  const products = storageFactory.createProductRepository();
  const categories = storageFactory.createCategoryRepository();
  const photos = storageFactory.createPhotoStorage();
  const stock = new StockService(products);

  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(
    "/api/v1/category",
    createCategoryRoutes(createCategoryHandlers(categories))
  );
  app.use(
    "/api/v1/product",
    createProductRoutes(createProductHandlers({ products, categories, photos }))
  );
  app.use("/internal", createInternalRoutes(createInternalHandlers({ products, stock })));

  return app;
};
