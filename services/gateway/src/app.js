import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { createAuthRouter, stripIdentityHeaders } from "./auth.js";
import { Config } from "./config.js";
import { Logger } from "./logger.js";

const USERS_PATH =
  /^\/api\/v1\/auth\/(register|login|forgot-password|profile|user-auth|admin-auth)\/?$/i;

const CATALOG_PATH = /^\/api\/v1\/(category\/|product\/(?!braintree(\/|$)))/i;

const PAYMENTS_PATH = /^\/api\/v1\/product\/braintree\/token\/?$/i;

const ORDERS_PATH =
  /^\/api\/v1\/(auth\/(orders|all-orders|order-status\/[^/]+)|product\/braintree\/payment)\/?$/i;

const isUsersPath = (pathname) => USERS_PATH.test(pathname);

const isOrdersPath = (pathname) => ORDERS_PATH.test(pathname);

const isPaymentsPath = (pathname) => PAYMENTS_PATH.test(pathname);

const isCatalogPath = (pathname) => CATALOG_PATH.test(pathname);

const createProxy = (target, pathFilter) => {
  const logger = Logger.getInstance();

  return createProxyMiddleware({
    target,
    changeOrigin: true,
    pathFilter,
    on: {
      proxyRes: (proxyRes, req) => {
        logger.info("proxied", {
          method: req.method,
          url: req.url,
          target,
          status: proxyRes.statusCode,
        });
      },
      error: (error, req, res) => {
        logger.error("proxy failed", {
          method: req.method,
          url: req.url,
          target,
          error: error.message,
        });
        if (res.headersSent || res.destroyed) {
          return;
        }
        res
          .status(502)
          .set("Access-Control-Allow-Origin", "*")
          .json({
            success: false,
            message: "Upstream service unavailable",
          });
      },
    },
  });
};

export const createApp = () => {
  const { usersUrl, catalogUrl, paymentsUrl, ordersUrl, jwtSecret } = Config.getInstance();
  const app = express();

  app.disable("x-powered-by");
  app.use(stripIdentityHeaders);
  app.use(createAuthRouter(jwtSecret));
  app.use(createProxy(usersUrl, isUsersPath));
  app.use(createProxy(catalogUrl, isCatalogPath));
  app.use(createProxy(paymentsUrl, isPaymentsPath));
  app.use(createProxy(ordersUrl, isOrdersPath));

  return app;
};
