import { afterAll, afterEach, beforeAll, describe, expect, it } from "@jest/globals";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { migrateCatalog } from "../src/migrateCatalog.js";

const { ObjectId, Binary } = mongoose.mongo;

let mongo;
let client;
let source;
let target;

const seed = async () => {
  const category = { _id: new ObjectId(), name: "Mice", slug: "mice", __v: 0 };
  const product = {
    _id: new ObjectId(),
    name: "Mouse",
    slug: "mouse",
    price: 10,
    category: category._id,
    photo: { data: new Binary(Buffer.from("image")), contentType: "image/png" },
  };
  await source.collection("categories").insertOne(category);
  await source.collection("products").insertOne(product);
  return { category, product };
};

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  client = new mongoose.mongo.MongoClient(mongo.getUri());
  await client.connect();
  source = client.db("gearin");
  target = client.db("gearin_catalog");
});

afterEach(async () => {
  await Promise.all([source.dropDatabase(), target.dropDatabase()]);
});

afterAll(async () => {
  await client.close();
  await mongo.stop();
});

describe("migrateCatalog", () => {
  it("copies categories and products with their ids", async () => {
    const { category, product } = await seed();

    const report = await migrateCatalog(source, target);

    expect(report).toEqual({
      categories: { copied: 1, skipped: 0 },
      products: { copied: 1, skipped: 0 },
    });
    expect(await target.collection("categories").findOne({ _id: category._id })).toEqual(category);
    const copied = await target.collection("products").findOne({ _id: product._id });
    expect(copied.category).toEqual(category._id);
    expect(copied.photo.contentType).toBe("image/png");
    expect(Buffer.from(copied.photo.data.buffer).toString()).toBe("image");
  });

  it("does not touch other collections", async () => {
    await source.collection("users").insertOne({ name: "x" });
    await source.collection("orders").insertOne({ name: "y" });
    await seed();

    await migrateCatalog(source, target);

    expect(await target.collection("users").countDocuments()).toBe(0);
    expect(await target.collection("orders").countDocuments()).toBe(0);
  });

  it("can be repeated without overwriting newer data", async () => {
    const { product } = await seed();
    await migrateCatalog(source, target);
    await target.collection("products").updateOne({ _id: product._id }, { $set: { price: 99 } });

    const report = await migrateCatalog(source, target);

    expect(report.products).toEqual({ copied: 0, skipped: 1 });
    expect((await target.collection("products").findOne({ _id: product._id })).price).toBe(99);
  });

  it("does not modify the source", async () => {
    const { product } = await seed();

    await migrateCatalog(source, target);

    expect((await source.collection("products").findOne({ _id: product._id })).price).toBe(10);
  });

  it("refuses to use one database as both source and target", async () => {
    await expect(migrateCatalog(source, client.db("gearin"))).rejects.toThrow("must be different");
  });
});
