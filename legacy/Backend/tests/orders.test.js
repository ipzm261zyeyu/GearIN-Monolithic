import { afterAll, afterEach, beforeAll, describe, expect, it } from "@jest/globals";
import mongoose from "mongoose";
import { VIA_GATEWAY, failing, startApp, tokenFor } from "./helpers/harness.js";

let ctx;

const seedOrder = async (buyer, overrides = {}) => {
  const category = await ctx.createCategory();
  const product = await ctx.createProduct(category, {
    photo: { data: Buffer.from("image"), contentType: "image/png" },
  });
  // У services/orders замовлення зберігає знімок позицій і рядковий id покупця
  if (VIA_GATEWAY) {
    return ctx.orderModel.create({
      items: [
        {
          productId: String(product._id),
          name: product.name,
          price: product.price,
          quantity: 1,
        },
      ],
      amount: product.price,
      transactionId: "tx-seed",
      payment: { success: true },
      buyer: String(buyer._id),
      ...overrides,
    });
  }
  return ctx.orderModel.create({
    products: [product._id],
    payment: { success: true },
    buyer: buyer._id,
    ...overrides,
  });
};

beforeAll(async () => {
  ctx = await startApp();
});

afterEach(() => ctx.reset());
afterAll(() => ctx.stop());

describe("GET /api/v1/auth/orders", () => {
  it("returns only the caller's orders with populated products and buyer name", async () => {
    const buyer = await ctx.createUser();
    const other = await ctx.createUser();
    const order = await seedOrder(buyer);
    await seedOrder(other);

    const res = await ctx.api
      .get("/api/v1/auth/orders")
      .set("Authorization", tokenFor(buyer));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]._id).toBe(String(order._id));
    expect(res.body[0].status).toBe("Not Processed");
    expect(res.body[0].buyer).toEqual({ _id: String(buyer._id), name: buyer.name });
    expect(res.body[0].products[0].name).toBeDefined();
    expect(res.body[0].products[0].photo).toBeUndefined();
  });

  it("answers 500 when the database fails", async () => {
    const buyer = await ctx.createUser();
    failing(ctx.orderModel, "find");

    const res = await ctx.api
      .get("/api/v1/auth/orders")
      .set("Authorization", tokenFor(buyer));

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      success: false,
      message: "Error While Getting Orders",
    });
  });
});

describe("GET /api/v1/auth/all-orders", () => {
  it("returns every order, newest first", async () => {
    const admin = await ctx.createAdmin();
    const buyer = await ctx.createUser();
    const older = await seedOrder(buyer, { createdAt: new Date("2024-01-01") });
    const newer = await seedOrder(admin, { createdAt: new Date("2024-06-01") });

    const res = await ctx.api
      .get("/api/v1/auth/all-orders")
      .set("Authorization", tokenFor(admin));

    expect(res.status).toBe(200);
    expect(res.body.map((order) => order._id)).toEqual([
      String(newer._id),
      String(older._id),
    ]);
    expect(res.body[1].buyer).toEqual({ _id: String(buyer._id), name: buyer.name });
    expect(res.body[0].products[0].photo).toBeUndefined();
  });

  it("answers 500 when the database fails", async () => {
    const admin = await ctx.createAdmin();
    failing(ctx.orderModel, "find");

    const res = await ctx.api
      .get("/api/v1/auth/all-orders")
      .set("Authorization", tokenFor(admin));

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      success: false,
      message: "Error While Getting Orders",
    });
  });
});

describe("PUT /api/v1/auth/order-status/:orderId", () => {
  it("updates the status and returns the order", async () => {
    const admin = await ctx.createAdmin();
    const order = await seedOrder(admin);

    const res = await ctx.api
      .put(`/api/v1/auth/order-status/${order._id}`)
      .set("Authorization", tokenFor(admin))
      .send({ status: "Shipped" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("Shipped");
    expect((await ctx.orderModel.findById(order._id)).status).toBe("Shipped");
  });

  it("accepts a status outside the schema enum", async () => {
    const admin = await ctx.createAdmin();
    const order = await seedOrder(admin);

    const res = await ctx.api
      .put(`/api/v1/auth/order-status/${order._id}`)
      .set("Authorization", tokenFor(admin))
      .send({ status: "Lost" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("Lost");
  });

  it("answers 200 with null for an unknown order", async () => {
    const admin = await ctx.createAdmin();

    const res = await ctx.api
      .put(`/api/v1/auth/order-status/${new mongoose.Types.ObjectId()}`)
      .set("Authorization", tokenFor(admin))
      .send({ status: "Shipped" });

    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it("answers 500 for a malformed order id", async () => {
    const admin = await ctx.createAdmin();

    const res = await ctx.api
      .put("/api/v1/auth/order-status/not-an-id")
      .set("Authorization", tokenFor(admin))
      .send({ status: "Shipped" });

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      success: false,
      message: "Error While Updating Order",
    });
  });
});
