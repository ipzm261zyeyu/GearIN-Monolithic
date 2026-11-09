import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { createApp } from "../src/app.js";
import { CheckoutError } from "../src/errors.js";
import orderModel from "../src/models/orderModel.js";

const PRODUCT = "64b000000000000000000001";
const BUYER = "64b0000000000000000000a1";

let mongo;
let api;
let catalog;
let payments;
let users;

const seedOrder = (overrides = {}) =>
  orderModel.create({
    buyer: BUYER,
    items: [{ productId: PRODUCT, name: "Mouse", price: 10, quantity: 2 }],
    amount: 20,
    transactionId: "tx-1",
    payment: { success: true },
    ...overrides,
  });

const asUser = (pending, id = BUYER) => pending.set("x-user-id", id).set("x-user-role", "0");
const asAdmin = (pending) => pending.set("x-user-id", "admin").set("x-user-role", "1");

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri("gearin_orders"));
});

beforeEach(() => {
  catalog = {
    productsByIds: jest.fn().mockResolvedValue([{ _id: PRODUCT, name: "Mouse", price: 10 }]),
    reserve: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
  };
  payments = {
    charge: jest.fn().mockResolvedValue({ success: true, transactionId: "tx-9", details: {} }),
  };
  users = { namesByIds: jest.fn().mockResolvedValue(new Map([[BUYER, "Olena"]])) };
  api = request(createApp({ catalog, payments, users }));
});

afterEach(async () => {
  jest.restoreAllMocks();
  await orderModel.deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe("headers from the gateway", () => {
  it.each([
    ["get", "/api/v1/auth/orders"],
    ["get", "/api/v1/auth/all-orders"],
    ["put", "/api/v1/auth/order-status/x"],
    ["post", "/api/v1/product/braintree/payment"],
  ])("%s %s answers 401 without x-user-id", async (method, url) => {
    const res = await api[method](url);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, message: "Unauthorized Access" });
  });

  it.each([
    ["get", "/api/v1/auth/all-orders"],
    ["put", "/api/v1/auth/order-status/x"],
  ])("%s %s answers 401 for a regular user", async (method, url) => {
    const res = await asUser(api[method](url));

    expect(res.status).toBe(401);
  });

  it("answers preflight requests for the browser", async () => {
    const res = await api
      .options("/api/v1/product/braintree/payment")
      .set("Origin", "http://localhost:3000")
      .set("Access-Control-Request-Method", "POST");

    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
  });
});

describe("GET /orders", () => {
  it("returns only the orders of the caller in the shape the client reads", async () => {
    const order = await seedOrder();
    await seedOrder({ buyer: "someone-else" });

    const res = await asUser(api.get("/api/v1/auth/orders"));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      _id: String(order._id),
      status: "Not Processed",
      amount: 20,
      transactionId: "tx-1",
      payment: { success: true },
      buyer: { _id: BUYER, name: "Olena" },
      products: [{ _id: PRODUCT, name: "Mouse", price: 10, quantity: 2 }],
    });
  });

  it("still lists orders when the buyer name is unknown", async () => {
    await seedOrder();
    users.namesByIds.mockResolvedValue(new Map());

    const res = await asUser(api.get("/api/v1/auth/orders"));

    expect(res.status).toBe(200);
    expect(res.body[0].buyer).toEqual({ _id: BUYER, name: null });
  });

  it("answers 500 when the database fails", async () => {
    jest.spyOn(orderModel, "find").mockImplementation(() => {
      throw new Error("db down");
    });

    const res = await asUser(api.get("/api/v1/auth/orders"));

    expect(res.status).toBe(500);
    expect(res.body.message).toBe("Error While Getting Orders");
  });
});

describe("GET /all-orders", () => {
  it("returns every order, newest first", async () => {
    const older = await seedOrder({ createdAt: new Date("2024-01-01") });
    const newer = await seedOrder({ createdAt: new Date("2024-06-01") });

    const res = await asAdmin(api.get("/api/v1/auth/all-orders"));

    expect(res.body.map((order) => order._id)).toEqual([String(newer._id), String(older._id)]);
  });

  it("asks for each buyer name once", async () => {
    await seedOrder();
    await seedOrder();
    await seedOrder({ buyer: null });

    await asAdmin(api.get("/api/v1/auth/all-orders"));

    expect(users.namesByIds).toHaveBeenCalledWith([BUYER]);
  });
});

describe("PUT /order-status/:orderId", () => {
  it("updates the status", async () => {
    const order = await seedOrder();

    const res = await asAdmin(api.put(`/api/v1/auth/order-status/${order._id}`)).send({
      status: "Shipped",
    });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("Shipped");
    expect(res.body.buyer.name).toBe("Olena");
  });

  it("answers 200 with null for an unknown order", async () => {
    const res = await asAdmin(
      api.put(`/api/v1/auth/order-status/${new mongoose.Types.ObjectId()}`)
    ).send({ status: "Shipped" });

    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it("answers 500 for a malformed id", async () => {
    const res = await asAdmin(api.put("/api/v1/auth/order-status/bad")).send({ status: "Shipped" });

    expect(res.status).toBe(500);
    expect(res.body.message).toBe("Error While Updating Order");
  });
});

describe("POST /braintree/payment", () => {
  const checkout = (body, id) =>
    asUser(api.post("/api/v1/product/braintree/payment"), id).send(body);

  const VALID = { nonce: "n", items: [{ productId: PRODUCT, quantity: 2 }] };

  it("saves the order for the caller and answers ok", async () => {
    const res = await checkout(VALID);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    const order = await orderModel.findById(res.body.orderId);
    expect(order.toObject()).toMatchObject({
      buyer: BUYER,
      amount: 20,
      transactionId: "tx-9",
      status: "Not Processed",
      items: [{ productId: PRODUCT, name: "Mouse", price: 10, quantity: 2 }],
      payment: { success: true },
    });
  });

  it("takes the buyer only from the gateway header", async () => {
    const res = await checkout({ ...VALID, buyer: "victim", buyerId: "victim" });

    expect((await orderModel.findById(res.body.orderId)).buyer).toBe(BUYER);
  });

  it("answers 400 for invalid input", async () => {
    const res = await checkout({ nonce: "n", items: [] });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("answers with the status and details of a stock problem", async () => {
    catalog.reserve.mockRejectedValue(
      new CheckoutError(409, "Not enough stock", { productId: PRODUCT })
    );

    const res = await checkout(VALID);

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      success: false,
      message: "Not enough stock",
      productId: PRODUCT,
    });
    expect(await orderModel.countDocuments()).toBe(0);
  });

  it("answers 402 and saves nothing for a declined payment", async () => {
    payments.charge.mockResolvedValue({ success: false, message: "Declined" });

    const res = await checkout(VALID);

    expect(res.status).toBe(402);
    expect(catalog.release).toHaveBeenCalledTimes(1);
    expect(await orderModel.countDocuments()).toBe(0);
  });

  it("reports the transaction when the order cannot be saved", async () => {
    jest.spyOn(orderModel, "create").mockRejectedValue(new Error("db down"));

    const res = await checkout(VALID);

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ success: false, transactionId: "tx-9" });
    expect(catalog.release).not.toHaveBeenCalled();
  });

  it("hides unexpected errors", async () => {
    catalog.productsByIds.mockRejectedValue(new Error("secret detail"));

    const res = await checkout(VALID);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, message: "Error While Placing Order" });
  });
});
