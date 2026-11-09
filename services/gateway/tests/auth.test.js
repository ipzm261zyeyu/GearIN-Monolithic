import { afterAll, beforeAll, beforeEach, describe, expect, it } from "@jest/globals";
import express from "express";
import JWT from "jsonwebtoken";
import request from "supertest";
import { createApp } from "../src/app.js";
import { Config } from "../src/config.js";

const SECRET = "auth-test-secret";

const sign = (payload, options) => JWT.sign(payload, SECRET, options);
const userToken = sign({ _id: "user-1", role: 0 });
const adminToken = sign({ _id: "admin-1", role: 1 });

const listen = (app) =>
  new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });

const close = (server) => {
  server.closeAllConnections();
  return new Promise((resolve) => server.close(resolve));
};

const recordingUpstream = (name, calls) => {
  const app = express();
  app.use((req, res) => {
    calls.push({ upstream: name, method: req.method, url: req.originalUrl, headers: req.headers });
    res.json({ served: name });
  });
  return listen(app);
};

const signedInRoutes = [
  ["get", "/api/v1/auth/user-auth", "users"],
  ["put", "/api/v1/auth/profile", "users"],
  ["get", "/api/v1/auth/orders", "monolith"],
  ["post", "/api/v1/product/braintree/payment", "monolith"],
];

const adminRoutes = [
  ["get", "/api/v1/auth/test", "monolith"],
  ["get", "/api/v1/auth/admin-auth", "users"],
  ["get", "/api/v1/auth/all-orders", "monolith"],
  ["put", "/api/v1/auth/order-status/42", "monolith"],
  ["post", "/api/v1/category/create-category", "monolith"],
  ["put", "/api/v1/category/update-category/42", "monolith"],
  ["delete", "/api/v1/category/delete-category/42", "monolith"],
  ["post", "/api/v1/product/create-product", "monolith"],
  ["put", "/api/v1/product/update-product/42", "monolith"],
];

const protectedRoutes = [...signedInRoutes, ...adminRoutes];

let monolith;
let users;
let gateway;
let calls;

beforeAll(async () => {
  calls = [];
  monolith = await recordingUpstream("monolith", calls);
  users = await recordingUpstream("users", calls);
  Object.assign(process.env, {
    PORT: "8080",
    MONOLITH_URL: `http://127.0.0.1:${monolith.address().port}`,
    USERS_URL: `http://127.0.0.1:${users.address().port}`,
    JWT_SECRET: SECRET,
  });
  Config.reset();
  gateway = await listen(createApp());
});

beforeEach(() => {
  calls.length = 0;
});

afterAll(async () => {
  await Promise.all([close(gateway), close(monolith), close(users)]);
});

const expectDenied = (res, message) => {
  expect(res.status).toBe(401);
  expect(res.body).toEqual({ success: false, message });
  expect(res.headers["access-control-allow-origin"]).toBe("*");
  expect(calls).toHaveLength(0);
};

describe("invalid tokens", () => {
  it.each(protectedRoutes)("%s %s answers 401 without a token", async (method, url) => {
    expectDenied(await request(gateway)[method](url), "Invalid or missing token");
  });

  it.each([
    ["malformed", "garbage"],
    ["signed with another secret", JWT.sign({ _id: "u", role: 1 }, "other-secret")],
    ["expired", sign({ _id: "u", role: 1 }, { expiresIn: -10 })],
    ["unsigned", JWT.sign({ _id: "u", role: 1 }, "", { algorithm: "none" })],
    ["without a user id", sign({ role: 1 })],
    ["prefixed with Bearer", `Bearer ${adminToken}`],
  ])("rejects a token that is %s", async (_case, token) => {
    const res = await request(gateway)
      .get("/api/v1/auth/all-orders")
      .set("Authorization", token);

    expectDenied(res, "Invalid or missing token");
  });
});

describe("roles", () => {
  it.each(adminRoutes)("%s %s answers 401 for a regular user", async (method, url) => {
    const res = await request(gateway)[method](url).set("Authorization", userToken);

    expectDenied(res, "Unauthorized Access");
  });

  it("treats a token issued before roles as not admin", async () => {
    const res = await request(gateway)
      .get("/api/v1/auth/all-orders")
      .set("Authorization", sign({ _id: "old-admin" }));

    expectDenied(res, "Unauthorized Access");
  });

  it("lets a token issued before roles reach signed-in routes without a role header", async () => {
    await request(gateway)
      .get("/api/v1/auth/orders")
      .set("Authorization", sign({ _id: "old-user" }));

    expect(calls[0].headers["x-user-id"]).toBe("old-user");
    expect(calls[0].headers["x-user-role"]).toBeUndefined();
  });

  it.each(protectedRoutes)("%s %s reaches its service with identity headers", async (method, url, upstream) => {
    const res = await request(gateway)[method](url).set("Authorization", adminToken);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ served: upstream });
    expect(calls[0].headers["x-user-id"]).toBe("admin-1");
    expect(calls[0].headers["x-user-role"]).toBe("1");
    expect(calls[0].headers.authorization).toBe(adminToken);
  });

  it("passes the role of a regular user on signed-in routes", async () => {
    await request(gateway).get("/api/v1/auth/user-auth").set("Authorization", userToken);

    expect(calls[0].headers["x-user-id"]).toBe("user-1");
    expect(calls[0].headers["x-user-role"]).toBe("0");
  });
});

describe("spoofed identity headers", () => {
  it("removes them on public routes", async () => {
    await request(gateway)
      .get("/api/v1/category/get-category")
      .set("x-user-id", "victim")
      .set("x-user-role", "1");

    expect(calls[0].headers["x-user-id"]).toBeUndefined();
    expect(calls[0].headers["x-user-role"]).toBeUndefined();
  });

  it("replaces them with the values from the token", async () => {
    await request(gateway)
      .get("/api/v1/auth/user-auth")
      .set("Authorization", userToken)
      .set("x-user-id", "victim")
      .set("x-user-role", "1");

    expect(calls[0].headers["x-user-id"]).toBe("user-1");
    expect(calls[0].headers["x-user-role"]).toBe("0");
  });

  it("does not let them replace a token", async () => {
    const res = await request(gateway)
      .get("/api/v1/auth/all-orders")
      .set("x-user-id", "victim")
      .set("x-user-role", "1");

    expectDenied(res, "Invalid or missing token");
  });
});

describe("spellings of protected paths", () => {
  it.each([
    "/api/v1/auth/all-orders/",
    "/API/V1/AUTH/ALL-ORDERS",
    "/api/v1/auth/all-orders?x=1",
  ])("%s still needs a token", async (url) => {
    expectDenied(await request(gateway).get(url), "Invalid or missing token");
  });
});

describe("public requests", () => {
  it("does not ask for a token on a preflight request", async () => {
    await request(gateway)
      .options("/api/v1/auth/profile")
      .set("Origin", "http://localhost:3000")
      .set("Access-Control-Request-Method", "PUT");

    expect(calls[0]).toMatchObject({ upstream: "users", method: "OPTIONS" });
  });

  it("does not guard delete-product, which the monolith leaves open", async () => {
    const res = await request(gateway).delete("/api/v1/product/delete-product/42");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ served: "monolith" });
  });
});

describe("routing", () => {
  it.each([
    ["post", "/api/v1/auth/register"],
    ["post", "/api/v1/auth/login"],
    ["post", "/api/v1/auth/forgot-password"],
    ["post", "/API/v1/Auth/Login/"],
  ])("%s %s goes to the users service", async (method, url) => {
    const res = await request(gateway)[method](url);

    expect(res.body).toEqual({ served: "users" });
  });

  it.each([
    ["get", "/api/v1/category/get-category"],
    ["get", "/api/v1/product/get-product"],
    ["post", "/api/v1/auth/login-history"],
    ["get", "/"],
  ])("%s %s goes to the monolith", async (method, url) => {
    const res = await request(gateway)[method](url);

    expect(res.body).toEqual({ served: "monolith" });
  });
});
