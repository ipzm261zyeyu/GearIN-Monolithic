import express from "express";
import JWT from "jsonwebtoken";
import { Logger } from "./logger.js";

const USER_ID_HEADER = "x-user-id";
const USER_ROLE_HEADER = "x-user-role";
const ADMIN_ROLE = 1;

const SIGNED_IN_ROUTES = [
  ["get", "/api/v1/auth/user-auth"],
  ["put", "/api/v1/auth/profile"],
  ["get", "/api/v1/auth/orders"],
  ["post", "/api/v1/product/braintree/payment"],
];

const ADMIN_ROUTES = [
  ["get", "/api/v1/auth/test"],
  ["get", "/api/v1/auth/admin-auth"],
  ["get", "/api/v1/auth/all-orders"],
  ["put", "/api/v1/auth/order-status/:orderId"],
  ["post", "/api/v1/category/create-category"],
  ["put", "/api/v1/category/update-category/:id"],
  ["delete", "/api/v1/category/delete-category/:id"],
  ["post", "/api/v1/product/create-product"],
  ["put", "/api/v1/product/update-product/:pid"],
  ["delete", "/api/v1/product/delete-product/:pid"],
  ["post", "/api/v1/product/clone/:pid"],
];

const deny = (req, res, message) => {
  Logger.getInstance().warn("request denied", {
    method: req.method,
    url: req.url,
    reason: message,
  });
  res
    .status(401)
    .set("Access-Control-Allow-Origin", "*")
    .json({ success: false, message });
};

export const stripIdentityHeaders = (req, res, next) => {
  delete req.headers[USER_ID_HEADER];
  delete req.headers[USER_ROLE_HEADER];
  next();
};

export const createAuthRouter = (jwtSecret) => {
  const router = express.Router();

  const authenticate = (allowed) => (req, res, next) => {
    let payload;
    try {
      payload = JWT.verify(req.headers.authorization, jwtSecret, {
        algorithms: ["HS256"],
      });
    } catch {
      return deny(req, res, "Invalid or missing token");
    }
    if (!payload._id) {
      return deny(req, res, "Invalid or missing token");
    }
    if (!allowed(payload)) {
      return deny(req, res, "Unauthorized Access");
    }
    req.headers[USER_ID_HEADER] = String(payload._id);
    if (payload.role !== undefined) {
      req.headers[USER_ROLE_HEADER] = String(payload.role);
    }
    next();
  };

  const anyUser = authenticate(() => true);
  const adminOnly = authenticate((payload) => payload.role === ADMIN_ROLE);

  SIGNED_IN_ROUTES.forEach(([method, path]) => router[method](path, anyUser));
  ADMIN_ROUTES.forEach(([method, path]) => router[method](path, adminOnly));

  return (req, res, next) =>
    req.method === "OPTIONS" ? next() : router(req, res, next);
};
