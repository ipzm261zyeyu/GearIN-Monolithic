import cors from "cors";
import express from "express";
import authRoutes from "./routes/authRoutes.js";
import internalRoutes from "./routes/internalRoutes.js";

export const createApp = () => {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use("/api/v1/auth", authRoutes);
  app.use("/internal", internalRoutes);

  return app;
};
