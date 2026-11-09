import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import mongoose from "mongoose";
import {
  BraintreeGateway,
  expectNoResponse,
  gateway,
  startApp,
  tokenFor,
  waitFor,
} from "./helpers/harness.js";

let ctx;
let buyer;
let token;
let category;
let gatewayCallsAtImport;

const pay = (cart) =>
  ctx.api
    .post("/api/v1/product/braintree/payment")
    .set("Authorization", token)
    .send({ nonce: "fake-nonce", cart });

const approveSale = () =>
  gateway.transaction.sale.mockImplementation((_args, callback) =>
    callback(null, { success: true, transaction: { id: "tx-1" } })
  );

const savedOrder = () => waitFor(() => ctx.orderModel.findOne({}));

beforeAll(async () => {
  ctx = await startApp();
  gatewayCallsAtImport = BraintreeGateway.mock.calls.map(([config]) => config);
});

beforeEach(async () => {
  buyer = await ctx.createUser();
  token = tokenFor(buyer);
  category = await ctx.createCategory();
});

afterEach(() => ctx.reset());
afterAll(() => ctx.stop());

describe("payment gateway construction", () => {
  // KNOWN-DEFECT-8
  it("builds the Braintree client while the controller module is imported", () => {
    expect(gatewayCallsAtImport).toEqual([
      {
        environment: "sandbox",
        merchantId: "merchant-id",
        publicKey: "public-key",
        privateKey: "private-key",
      },
    ]);
  });

  // KNOWN-DEFECT-8
  it("relies on a client that refuses to be built without keys", () => {
    const real = jest.requireActual("braintree");

    expect(
      () => new real.BraintreeGateway({ environment: real.Environment.Sandbox })
    ).toThrow();
  });
});

describe("GET /api/v1/product/braintree/token", () => {
  it("returns the generated client token without authentication", async () => {
    gateway.clientToken.generate.mockImplementation((_options, callback) =>
      callback(null, { success: true, clientToken: "client-token" })
    );

    const res = await ctx.api.get("/api/v1/product/braintree/token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, clientToken: "client-token" });
  });

  it("answers 500 with the gateway error", async () => {
    gateway.clientToken.generate.mockImplementation((_options, callback) =>
      callback({ type: "authenticationError" })
    );

    const res = await ctx.api.get("/api/v1/product/braintree/token");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ type: "authenticationError" });
  });

  it("never responds when the gateway call throws", async () => {
    gateway.clientToken.generate.mockImplementation(() => {
      throw new Error("gateway down");
    });

    await expectNoResponse(ctx.api.get("/api/v1/product/braintree/token"));
  });
});

describe("POST /api/v1/product/braintree/payment", () => {
  it("charges the gateway, answers ok and saves the order for the caller", async () => {
    const product = await ctx.createProduct(category, { price: 40 });
    approveSale();

    const res = await pay([{ _id: String(product._id), price: 40 }]);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(gateway.transaction.sale.mock.calls[0][0]).toEqual({
      amount: 40,
      paymentMethodNonce: "fake-nonce",
      options: { submitForSettlement: true },
    });

    const order = await savedOrder();
    expect(order.products.map(String)).toEqual([String(product._id)]);
    expect(String(order.buyer)).toBe(String(buyer._id));
    expect(order.payment).toEqual({ success: true, transaction: { id: "tx-1" } });
    expect(order.status).toBe("Not Processed");
  });

  // KNOWN-DEFECT-5
  it("charges the sum of the prices sent by the client", async () => {
    const product = await ctx.createProduct(category, { price: 999 });
    approveSale();

    const res = await pay([
      { _id: String(product._id), price: 1 },
      { _id: String(product._id), price: 2 },
    ]);

    expect(res.status).toBe(200);
    expect(gateway.transaction.sale.mock.calls[0][0].amount).toBe(3);
    await savedOrder();
  });

  // KNOWN-DEFECT-6
  it("leaves the stock untouched after a sale", async () => {
    const product = await ctx.createProduct(category, { quantity: 5 });
    approveSale();

    await pay([{ _id: String(product._id), price: 100 }]);
    await savedOrder();

    expect((await ctx.productModel.findById(product._id)).quantity).toBe(5);
  });

  // KNOWN-DEFECT-6
  it("sells a product that is out of stock", async () => {
    const product = await ctx.createProduct(category, { quantity: 0 });
    approveSale();

    const res = await pay([{ _id: String(product._id), price: 100 }]);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    await savedOrder();
    expect((await ctx.productModel.findById(product._id)).quantity).toBe(0);
  });

  it("still saves an order when the gateway reports a declined sale", async () => {
    const product = await ctx.createProduct(category);
    gateway.transaction.sale.mockImplementation((_args, callback) =>
      callback(null, { success: false, message: "Declined" })
    );

    const res = await pay([{ _id: String(product._id), price: 100 }]);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    const order = await savedOrder();
    expect(order.payment).toEqual({ success: false, message: "Declined" });
  });

  it("accepts a product id that does not exist in the catalog", async () => {
    const ghost = String(new mongoose.Types.ObjectId());
    approveSale();

    const res = await pay([{ _id: ghost, price: 5 }]);

    expect(res.status).toBe(200);
    const order = await savedOrder();
    expect(order.products.map(String)).toEqual([ghost]);
  });

  it("answers 500 with the gateway error when the sale fails", async () => {
    const product = await ctx.createProduct(category);
    gateway.transaction.sale.mockImplementation((_args, callback) =>
      callback({ type: "unexpectedError" }, null)
    );

    const res = await pay([{ _id: String(product._id), price: 100 }]);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ type: "unexpectedError" });
    expect(await ctx.orderModel.countDocuments()).toBe(0);
  });

  it("never responds when the cart is missing", async () => {
    await expectNoResponse(
      ctx.api
        .post("/api/v1/product/braintree/payment")
        .set("Authorization", token)
        .send({ nonce: "fake-nonce" })
    );
    expect(gateway.transaction.sale).not.toHaveBeenCalled();
  });
});
