import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import mongoose from "mongoose";
import {
  BraintreeGateway,
  describeDirect,
  describeGateway,
  expectNoResponse,
  gateway,
  itDirect,
  itGateway,
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

  itDirect("never responds when the gateway call throws", async () => {
    gateway.clientToken.generate.mockImplementation(() => {
      throw new Error("gateway down");
    });

    await expectNoResponse(ctx.api.get("/api/v1/product/braintree/token"));
  });

  // У services/payments виняток клієнта Braintree перехоплюється, тому 500 замість зависання
  itGateway("answers 500 when the gateway call throws", async () => {
    gateway.clientToken.generate.mockImplementation(() => {
      throw new Error("gateway down");
    });

    const res = await ctx.api.get("/api/v1/product/braintree/token");

    expect(res.status).toBe(500);
  });
});

describeDirect("POST /api/v1/product/braintree/payment", () => {
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

describeGateway("POST /api/v1/product/braintree/payment through services/orders", () => {
  const checkout = (items) =>
    ctx.api
      .post("/api/v1/product/braintree/payment")
      .set("Authorization", token)
      .send({ nonce: "fake-nonce", items });

  const quantityOf = async (product) =>
    (await ctx.productModel.findById(product._id)).quantity;

  // Оформлення перенесено в services/orders: клієнт надсилає id і кількість, замовлення зберігає знімок позицій
  it("charges the gateway, answers ok and saves a snapshot for the caller", async () => {
    const product = await ctx.createProduct(category, { price: 40, name: "Mouse" });
    approveSale();

    const res = await checkout([{ productId: String(product._id), quantity: 1 }]);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(gateway.transaction.sale.mock.calls[0][0]).toEqual({
      amount: "40.00",
      paymentMethodNonce: "fake-nonce",
      options: { submitForSettlement: true },
    });

    const order = await ctx.orderModel.findById(res.body.orderId);
    expect(order.toObject()).toMatchObject({
      buyer: String(buyer._id),
      amount: 40,
      transactionId: "tx-1",
      status: "Not Processed",
      items: [{ productId: String(product._id), name: "Mouse", price: 40, quantity: 1 }],
    });
  });

  // KNOWN-DEFECT-5 виправлено в services/orders: сума рахується за цінами каталогу, ціни від клієнта ігноруються
  it("charges the catalog price and ignores prices sent by the client", async () => {
    const product = await ctx.createProduct(category, { price: 999 });
    approveSale();

    const res = await checkout([{ productId: String(product._id), quantity: 2, price: 1 }]);

    expect(res.status).toBe(200);
    expect(gateway.transaction.sale.mock.calls[0][0].amount).toBe("1998.00");
  });

  // KNOWN-DEFECT-6 виправлено в services/orders: після продажу залишок зменшується
  it("decreases the stock after a sale", async () => {
    const product = await ctx.createProduct(category, { quantity: 5 });
    approveSale();

    await checkout([{ productId: String(product._id), quantity: 2 }]);

    expect(await quantityOf(product)).toBe(3);
  });

  // KNOWN-DEFECT-6 виправлено в services/orders: товар без залишку не продається і оплата не виконується
  it("refuses a product that is out of stock without charging", async () => {
    const product = await ctx.createProduct(category, { quantity: 0 });

    const res = await checkout([{ productId: String(product._id), quantity: 1 }]);

    expect(res.status).toBe(409);
    expect(gateway.transaction.sale).not.toHaveBeenCalled();
    expect(await ctx.orderModel.countDocuments()).toBe(0);
  });

  // Відхилений платіж більше не створює замовлення, а резерв повертається на склад
  it("saves nothing and returns the stock when the payment is declined", async () => {
    const product = await ctx.createProduct(category, { quantity: 5 });
    gateway.transaction.sale.mockImplementation((_args, callback) =>
      callback(null, { success: false, message: "Declined" })
    );

    const res = await checkout([{ productId: String(product._id), quantity: 2 }]);

    expect(res.status).toBe(402);
    expect(res.body).toEqual({ success: false, message: "Declined" });
    expect(await ctx.orderModel.countDocuments()).toBe(0);
    expect(await quantityOf(product)).toBe(5);
  });

  // Ціна береться з каталогу, тому неіснуючий товар купити неможливо
  it("answers 404 for a product that does not exist in the catalog", async () => {
    const ghost = String(new mongoose.Types.ObjectId());

    const res = await checkout([{ productId: ghost, quantity: 1 }]);

    expect(res.status).toBe(404);
    expect(res.body.productId).toBe(ghost);
    expect(gateway.transaction.sale).not.toHaveBeenCalled();
  });

  // Збій платіжного шлюзу тепер 502, резерв повертається, замовлення немає
  it("answers 502 and returns the stock when the sale fails", async () => {
    const product = await ctx.createProduct(category, { quantity: 5 });
    gateway.transaction.sale.mockImplementation((_args, callback) =>
      callback({ type: "unexpectedError" }, null)
    );

    const res = await checkout([{ productId: String(product._id), quantity: 1 }]);

    expect(res.status).toBe(502);
    expect(await ctx.orderModel.countDocuments()).toBe(0);
    expect(await quantityOf(product)).toBe(5);
  });

  // Запит без позицій тепер отримує 400 замість зависання
  it("answers 400 when the items are missing", async () => {
    const res = await ctx.api
      .post("/api/v1/product/braintree/payment")
      .set("Authorization", token)
      .send({ nonce: "fake-nonce" });

    expect(res.status).toBe(400);
    expect(gateway.transaction.sale).not.toHaveBeenCalled();
  });
});
