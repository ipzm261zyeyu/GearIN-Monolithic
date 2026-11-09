import { afterAll, afterEach, beforeAll, describe, expect, it } from "@jest/globals";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { migrateOrders } from "../src/migrateOrders.js";

const { ObjectId } = mongoose.mongo;

let mongo;
let client;
let source;
let target;

const seedProduct = async (price = 10, name = "Mouse") => {
  const product = { _id: new ObjectId(), name, price };
  await source.collection("products").insertOne(product);
  return product;
};

const seedOrder = async (overrides = {}) => {
  const order = {
    _id: new ObjectId(),
    products: [],
    payment: { success: true, transaction: { id: "tx-1", amount: "60.00" } },
    buyer: new ObjectId(),
    status: "Delivered",
    createdAt: new Date("2023-05-22"),
    updatedAt: new Date("2023-05-23"),
    __v: 0,
    ...overrides,
  };
  await source.collection("orders").insertOne(order);
  return order;
};

const migrated = (order) => target.collection("orders").findOne({ _id: order._id });

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  client = new mongoose.mongo.MongoClient(mongo.getUri());
  await client.connect();
  source = client.db("gearin");
  target = client.db("gearin_orders");
});

afterEach(async () => {
  await Promise.all([source.dropDatabase(), target.dropDatabase()]);
});

afterAll(async () => {
  await client.close();
  await mongo.stop();
});

describe("migrateOrders", () => {
  it("keeps the id, status, payment and dates", async () => {
    const product = await seedProduct();
    const order = await seedOrder({ products: [product._id] });

    const stats = await migrateOrders(source, target);

    expect(stats).toEqual({ copied: 1, skipped: 0 });
    expect(await migrated(order)).toMatchObject({
      _id: order._id,
      status: "Delivered",
      payment: order.payment,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    });
  });

  it("converts the buyer id to a string", async () => {
    const order = await seedOrder();

    await migrateOrders(source, target);

    expect((await migrated(order)).buyer).toBe(String(order.buyer));
  });

  it("builds a snapshot of name and price", async () => {
    const product = await seedProduct(25, "Keyboard");
    const order = await seedOrder({ products: [product._id] });

    await migrateOrders(source, target);

    expect((await migrated(order)).items).toEqual([
      { productId: String(product._id), name: "Keyboard", price: 25, quantity: 1 },
    ]);
  });

  it("turns repeated products into a quantity", async () => {
    const product = await seedProduct();
    const order = await seedOrder({ products: [product._id, product._id, product._id] });

    await migrateOrders(source, target);

    const { items } = await migrated(order);
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(3);
  });

  it("removes the old products field", async () => {
    const product = await seedProduct();
    const order = await seedOrder({ products: [product._id] });

    await migrateOrders(source, target);

    expect((await migrated(order)).products).toBeUndefined();
  });

  it("takes the amount and transaction from the payment", async () => {
    const order = await seedOrder();

    await migrateOrders(source, target);

    expect(await migrated(order)).toMatchObject({ amount: 60, transactionId: "tx-1" });
  });

  it("calculates the amount of an order without a transaction", async () => {
    const product = await seedProduct(7);
    const order = await seedOrder({
      products: [product._id, product._id],
      payment: { success: false, message: "Declined" },
    });

    await migrateOrders(source, target);

    expect(await migrated(order)).toMatchObject({
      amount: 14,
      transactionId: null,
      payment: { success: false },
    });
  });

  it("keeps a line for a product that no longer exists", async () => {
    const ghost = new ObjectId();
    const order = await seedOrder({ products: [ghost] });

    await migrateOrders(source, target);

    expect((await migrated(order)).items).toEqual([
      { productId: String(ghost), name: "Unavailable product", price: 0, quantity: 1 },
    ]);
  });

  it("handles an order without a buyer or products", async () => {
    const { products: _products, ...order } = await seedOrder({ buyer: null });
    await source.collection("orders").deleteMany({});
    await source.collection("orders").insertOne(order);

    await migrateOrders(source, target);

    expect(await migrated(order)).toMatchObject({ buyer: null, items: [] });
  });

  it("can be repeated without overwriting newer data", async () => {
    const order = await seedOrder();
    await migrateOrders(source, target);
    await target.collection("orders").updateOne({ _id: order._id }, { $set: { status: "Cancel" } });

    const stats = await migrateOrders(source, target);

    expect(stats).toEqual({ copied: 0, skipped: 1 });
    expect((await migrated(order)).status).toBe("Cancel");
  });

  it("refuses to use one database as both source and target", async () => {
    await expect(migrateOrders(source, client.db("gearin"))).rejects.toThrow("must be different");
  });
});
