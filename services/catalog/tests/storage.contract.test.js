import { afterAll, beforeAll, beforeEach, describe, expect, it } from "@jest/globals";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { ProductQueryBuilder } from "../src/domain/ProductQueryBuilder.js";
import { isClientError } from "../src/errors.js";
import { generateId } from "../src/helpers/id.js";
import categoryModel from "../src/models/categoryModel.js";
import productModel from "../src/models/productModel.js";
import { InMemoryStorageFactory } from "../src/storage/InMemoryStorageFactory.js";
import { MongoStorageFactory } from "../src/storage/MongoStorageFactory.js";

let mongo;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri("gearin_catalog"));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

const PHOTO = { data: Buffer.from("image"), contentType: "image/png" };
const query = (configure = (b) => b) => configure(new ProductQueryBuilder()).build();
const ids = (records) => records.map((record) => String(record._id));

describe.each([
  ["MongoStorageFactory", () => new MongoStorageFactory()],
  ["InMemoryStorageFactory", () => new InMemoryStorageFactory()],
])("%s", (_name, createFactory) => {
  let products;
  let categories;
  let photos;
  let category;
  let sequence;

  const createProduct = (overrides = {}) => {
    sequence += 1;
    return products.create({
      name: `Product ${sequence}`,
      slug: `product-${sequence}`,
      description: `Description ${sequence}`,
      price: 100,
      quantity: 5,
      category: category._id,
      shipping: true,
      ...overrides,
    });
  };

  beforeEach(async () => {
    await Promise.all([productModel.deleteMany({}), categoryModel.deleteMany({})]);
    const factory = createFactory();
    products = factory.createProductRepository();
    categories = factory.createCategoryRepository();
    photos = factory.createPhotoStorage();
    sequence = 0;
    category = await categories.create({ name: "Mice", slug: "Mice" });
  });

  describe("categories", () => {
    it("stores a lowercase slug", () => {
      expect(category.slug).toBe("mice");
    });

    it("finds by name and by slug", async () => {
      expect(String((await categories.findByName("Mice"))._id)).toBe(String(category._id));
      expect(String((await categories.findBySlug("mice"))._id)).toBe(String(category._id));
    });

    it("returns null for unknown names and slugs", async () => {
      expect(await categories.findByName("x")).toBeNull();
      expect(await categories.findBySlug("x")).toBeNull();
    });

    it("lists categories", async () => {
      await categories.create({ name: "Keys", slug: "keys" });

      expect(await categories.list()).toHaveLength(2);
    });

    it("updates a category", async () => {
      const updated = await categories.update(category._id, { name: "Rats", slug: "RATS" });

      expect(updated).toMatchObject({ name: "Rats", slug: "rats" });
    });

    it("returns null when updating an unknown id", async () => {
      expect(await categories.update(generateId(), { name: "x", slug: "x" })).toBeNull();
    });

    it("deletes a category", async () => {
      await categories.delete(category._id);

      expect(await categories.list()).toEqual([]);
    });

    it.each(["update", "delete"])("%s rejects a malformed id as a client error", async (method) => {
      const error = await categories[method]("bad", { name: "x" }).then(
        () => null,
        (e) => e
      );

      expect(isClientError(error)).toBe(true);
    });
  });

  describe("products", () => {
    it("casts numeric strings", async () => {
      const product = await createProduct({ price: "49", quantity: "7" });

      expect(product).toMatchObject({ price: 49, quantity: 7 });
    });

    it("rejects a non numeric price as a client error", async () => {
      const error = await createProduct({ price: "free" }).then(
        () => null,
        (e) => e
      );

      expect(isClientError(error)).toBe(true);
    });

    it("rejects a missing required field as a client error", async () => {
      const error = await createProduct({ description: undefined }).then(
        () => null,
        (e) => e
      );

      expect(isClientError(error)).toBe(true);
    });

    it("rejects a malformed category as a client error", async () => {
      const error = await createProduct({ category: "bad" }).then(
        () => null,
        (e) => e
      );

      expect(isClientError(error)).toBe(true);
    });

    it("honours a preset id", async () => {
      const id = generateId();

      expect(String((await createProduct({ _id: id }))._id)).toBe(id);
    });

    it("finds by id and slug", async () => {
      const product = await createProduct();

      expect(String((await products.findById(product._id))._id)).toBe(String(product._id));
      expect(String((await products.findBySlug(product.slug))._id)).toBe(String(product._id));
    });

    it("returns null for unknown ids and slugs", async () => {
      expect(await products.findById(generateId())).toBeNull();
      expect(await products.findBySlug("nope")).toBeNull();
    });

    it("hides the photo unless asked and populates the category on request", async () => {
      const product = await createProduct();
      await photos.save(product._id, PHOTO);

      const plain = await products.findById(product._id);
      const full = await products.findById(product._id, {
        includePhoto: true,
        populateCategory: true,
      });

      expect(plain.photo?.data).toBeUndefined();
      expect(full.photo.contentType).toBe("image/png");
      expect(full.category.slug).toBe("mice");
    });

    it("updates fields and keeps the photo", async () => {
      const product = await createProduct();
      await photos.save(product._id, PHOTO);

      const updated = await products.update(product._id, { price: "7" });

      expect(updated.price).toBe(7);
      expect(updated.photo?.data).toBeUndefined();
      expect((await photos.get(product._id)).contentType).toBe("image/png");
    });

    it("returns null when updating an unknown product", async () => {
      expect(await products.update(generateId(), { price: 1 })).toBeNull();
    });

    it("deletes a product", async () => {
      const product = await createProduct();

      await products.delete(product._id);

      expect(await products.findById(product._id)).toBeNull();
      expect(await products.count()).toBe(0);
    });

    it("finds products by a list of ids without photos", async () => {
      const first = await createProduct();
      await createProduct();
      await photos.save(first._id, PHOTO);

      const found = await products.findByIds([String(first._id), generateId()]);

      expect(ids(found)).toEqual([String(first._id)]);
      expect(found[0].photo?.data).toBeUndefined();
    });

    it.each(["findById", "delete"])("%s rejects a malformed id as a client error", async (method) => {
      const error = await Promise.resolve()
        .then(() => products[method]("bad"))
        .then(
          () => null,
          (e) => e
        );

      expect(isClientError(error)).toBe(true);
    });
  });

  describe("search", () => {
    it("returns everything for an open query", async () => {
      await createProduct();
      await createProduct();

      expect(await products.search(query())).toHaveLength(2);
    });

    it("filters by categories", async () => {
      const other = await categories.create({ name: "Keys", slug: "keys" });
      const match = await createProduct();
      await createProduct({ category: other._id });

      const found = await products.search(query((b) => b.inCategories([String(category._id)])));

      expect(ids(found)).toEqual([String(match._id)]);
    });

    it("includes both price bounds", async () => {
      const low = await createProduct({ price: 10 });
      const high = await createProduct({ price: 50 });
      await createProduct({ price: 51 });
      await createProduct({ price: 9 });

      const found = await products.search(query((b) => b.priceBetween(10, 50)));

      expect(ids(found).sort()).toEqual(ids([low, high]).sort());
    });

    it("supports a single price bound", async () => {
      await createProduct({ price: 10 });
      const high = await createProduct({ price: 50 });

      const found = await products.search(query((b) => b.priceBetween(20)));

      expect(ids(found)).toEqual([String(high._id)]);
    });

    it("matches the keyword in name or description, ignoring case", async () => {
      const byName = await createProduct({ name: "Wireless Mouse" });
      const byText = await createProduct({ description: "a WIRELESS thing" });
      await createProduct({ name: "Cable", description: "Plain" });

      const found = await products.search(query((b) => b.matchingKeyword("wireless")));

      expect(ids(found).sort()).toEqual(ids([byName, byText]).sort());
    });

    it("excludes one product", async () => {
      const first = await createProduct();
      const second = await createProduct();

      const found = await products.search(query((b) => b.excluding(String(first._id))));

      expect(ids(found)).toEqual([String(second._id)]);
    });

    it("sorts newest first and pages", async () => {
      const created = [];
      for (let minute = 0; minute < 8; minute += 1) {
        created.push(await createProduct({ createdAt: new Date(Date.UTC(2024, 0, 1, 0, minute)) }));
      }

      const second = await products.search(query((b) => b.page(2).newestFirst()));

      expect(ids(second)).toEqual([String(created[1]._id), String(created[0]._id)]);
    });

    it("limits the result", async () => {
      await createProduct();
      await createProduct();

      expect(await products.search(query((b) => b.limit(1)))).toHaveLength(1);
    });

    it("applies the requested view", async () => {
      const product = await createProduct();
      await photos.save(product._id, PHOTO);

      const [hidden] = await products.search(query());
      const [shown] = await products.search(query((b) => b.withPhoto().withCategory()));

      expect(hidden.photo?.data).toBeUndefined();
      expect(shown.photo.contentType).toBe("image/png");
      expect(shown.category.slug).toBe("mice");
    });

    it("rejects a malformed category as a client error", async () => {
      const error = await Promise.resolve()
        .then(() => products.search(query((b) => b.inCategories(["bad"]))))
        .then(
          () => null,
          (e) => e
        );

      expect(isClientError(error)).toBe(true);
    });
  });

  describe("stock", () => {
    it("decreases while enough is left", async () => {
      const product = await createProduct({ quantity: 2 });

      expect(await products.decreaseQuantity(product._id, 2)).toBe(true);
      expect((await products.findById(product._id)).quantity).toBe(0);
    });

    it("refuses to go below zero", async () => {
      const product = await createProduct({ quantity: 1 });

      expect(await products.decreaseQuantity(product._id, 2)).toBe(false);
      expect((await products.findById(product._id)).quantity).toBe(1);
    });

    it("never oversells under concurrent requests", async () => {
      const product = await createProduct({ quantity: 5 });

      const results = await Promise.all(
        Array.from({ length: 20 }, () => products.decreaseQuantity(product._id, 1))
      );

      expect(results.filter(Boolean)).toHaveLength(5);
      expect((await products.findById(product._id)).quantity).toBe(0);
    });

    it("increases the stock", async () => {
      const product = await createProduct({ quantity: 1 });

      expect(await products.increaseQuantity(product._id, 3)).toBe(true);
      expect((await products.findById(product._id)).quantity).toBe(4);
    });

    it("reports an unknown product", async () => {
      expect(await products.decreaseQuantity(generateId(), 1)).toBe(false);
      expect(await products.increaseQuantity(generateId(), 1)).toBe(false);
    });
  });

  describe("photos", () => {
    it("saves and reads a photo", async () => {
      const product = await createProduct();

      await photos.save(product._id, PHOTO);

      const stored = await photos.get(product._id);
      expect(Buffer.from(stored.data).toString()).toBe("image");
      expect(stored.contentType).toBe("image/png");
    });

    it("replaces a photo", async () => {
      const product = await createProduct();
      await photos.save(product._id, PHOTO);

      await photos.save(product._id, { data: Buffer.from("new"), contentType: "image/jpeg" });

      expect((await photos.get(product._id)).contentType).toBe("image/jpeg");
    });

    it("returns null for a product without a photo", async () => {
      const product = await createProduct();

      expect(await photos.get(product._id)).toBeNull();
    });

    it("returns null for an unknown product", async () => {
      expect(await photos.get(generateId())).toBeNull();
    });

    it("ignores a photo for an unknown product", async () => {
      const id = generateId();

      await photos.save(id, PHOTO);

      expect(await photos.get(id)).toBeNull();
    });

    it("rejects a malformed id as a client error", async () => {
      const error = await photos.get("bad").then(
        () => null,
        (e) => e
      );

      expect(isClientError(error)).toBe(true);
    });
  });
});
