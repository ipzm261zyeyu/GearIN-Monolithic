import express from "express";
import {
  forgotPasswordController,
  loginController,
  registerController,
  updateProfileController,
} from "../controllers/authController.js";
import { requireAdmin, requireUser } from "../middlewares/gatewayAuth.js";

const router = express.Router();

router.post("/register", registerController);
router.post("/login", loginController);
router.post("/forgot-password", forgotPasswordController);
router.put("/profile", requireUser, updateProfileController);
router.get("/user-auth", requireUser, (req, res) => {
  res.status(200).send({ ok: true });
});
router.get("/admin-auth", requireUser, requireAdmin, (req, res) => {
  res.status(200).send({ ok: true });
});

export default router;
