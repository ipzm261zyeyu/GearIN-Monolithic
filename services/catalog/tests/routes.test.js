import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import request from "supertest";
import { createApp } from "../src/app.js";
import { generateId } from "../src/helpers/id.js";
import { InMemoryStorageFactory } from "../src/storage/InMemoryStorageFactory.js";

let api;
let products;
let categories;
let photos;
let category;
let sequence;

const PHOTO = { data: Buffer.from("stored"), contentType: "image/png" };

const asAdmin = (pending) => pending.set("x-user-id", "admin").set("x-user-role", "1");

const failing = (repository, method) =>
  jest.spyOn(repository, method).mockImplementation(() => {
    throw new Error("db down");
  });

const createProduct = (overrides = {}) => {
  sequence += 1;
  return products.create({
    name: `Product ${sequence}`,
    slug: `product-${sequence}`,
    description: "Text",
    price: 100,
    quantity: 5,
    category: category._id,
    shipping: true,
    ...overrides,
  });
};

const fields = () => ({
  name: "Gaming Mouse",
  description: "Fast",
  price: "49",
  category: category._id,
  quantity: "7",
});

beforeEach(async () => {
  const factory = new InMemoryStorageFactory();
  products = factory.createProductRepository();
  categories = factory.createCategoryRepository();
  photos = factory.createPhotoStorage();
  jest.spyOn(factory, "createProductRepository").mockReturnValue(products);
  jest.spyOn(factory, "createCategoryRepository").mockReturnValue(categories);
  jest.spyOn(factory, "createPhotoStorage").mockReturnValue(photos);
  api = request(createApp(factory));
  sequence = 0;
  category = await categories.create({ name: "Mice", slug: "mice" });
});

describe("admin routes", () => {
  it.each([
    ["post", "/api/v1/category/create-category"],
    ["put", "/api/v1/category/update-category/x"],
    ["delete", "/api/v1/category/delete-category/x"],
    ["post", "/api/v1/product/create-product"],
    ["put", "/api/v1/product/update-product/x"],
    ["delete", "/api/v1/product/delete-product/x"],
    ["post", "/api/v1/product/clone/x"],
  ])("%s %s requires the admin role header", async (method, url) => {
    const anonymous = await api[method](url);
    const regular = await api[method](url).set("x-user-role", "0");

    expect(anonymous.status).toBe(401);
    expect(regular.status).toBe(401);
    expect(anonymous.body).toEqual({ success: false, message: "Unauthorized Access" });
  });
});

describe("categories", () => {
  it("creates a category", async () => {
    const res = await asAdmin(api.post("/api/v1/category/create-category")).send({
      name: "Gaming Keys",
    });

    expect(res.status).toBe(201);
    expect(res.body.category).toMatchObject({ name: "Gaming Keys", slug: "gaming-keys" });
  });

  it("answers 401 without a name, as the monolith did", async () => {
    const res = await asAdmin(api.post("/api/v1/category/create-category")).send({});

    expect(res.status).toBe(401);
  });

  it("refuses a duplicate", async () => {
    const res = await asAdmin(api.post("/api/v1/category/create-category")).send({ name: "Mice" });

    expect(res.body).toEqual({ success: false, message: "Category Already Exists" });
  });

  it("answers 500 when storage fails on create", async () => {
    failing(categories, "findByName");

    const res = await asAdmin(api.post("/api/v1/category/create-category")).send({ name: "New" });

    expect(res.status).toBe(500);
    expect(res.body.message).toBe("Error In Category");
  });

  it("updates a category", async () => {
    const res = await asAdmin(api.put(`/api/v1/category/update-category/${category._id}`)).send({
      name: "Rats",
    });

    expect(res.status).toBe(200);
    expect(res.body.category.slug).toBe("rats");
  });

  it("answers 400 for a missing name", async () => {
    const res = await asAdmin(api.put(`/api/v1/category/update-category/${category._id}`)).send({});

    expect(res.status).toBe(400);
  });

  it("answers 400 for a malformed id on update", async () => {
    const res = await asAdmin(api.put("/api/v1/category/update-category/bad")).send({ name: "x" });

    expect(res.status).toBe(400);
  });

  it("lists and reads single categories", async () => {
    const list = await api.get("/api/v1/category/get-category");
    const single = await api.get("/api/v1/category/single-category/mice");

    expect(list.body.category).toHaveLength(1);
    expect(single.body.category.name).toBe("Mice");
  });

  it.each([
    ["list", "/api/v1/category/get-category", "Error While Getting All Categories"],
    ["findBySlug", "/api/v1/category/single-category/x", "Error While Getting Single Category"],
  ])("answers 500 when %s fails", async (method, url, message) => {
    failing(categories, method);

    const res = await api.get(url);

    expect(res.status).toBe(500);
    expect(res.body.message).toBe(message);
  });

  it("deletes a category", async () => {
    const res = await asAdmin(api.delete(`/api/v1/category/delete-category/${category._id}`));

    expect(res.status).toBe(200);
    expect(await categories.list()).toEqual([]);
  });

  it("answers 400 for a malformed id on delete and 500 on a storage failure", async () => {
    const malformed = await asAdmin(api.delete("/api/v1/category/delete-category/bad"));
    failing(categories, "delete");
    const broken = await asAdmin(api.delete(`/api/v1/category/delete-category/${category._id}`));

    expect(malformed.status).toBe(400);
    expect(broken.status).toBe(500);
  });
});

describe("POST /create-product", () => {
  const create = (payload) =>
    asAdmin(api.post("/api/v1/product/create-product")).field(payload);

  it("creates a product with a photo", async () => {
    const res = await create(fields()).attach("photo", Buffer.from("img"), {
      filename: "p.png",
      contentType: "image/png",
    });

    expect(res.status).toBe(201);
    expect(res.body.products).toMatchObject({ slug: "Gaming-Mouse", price: 49 });
    expect((await photos.get(res.body.products._id)).contentType).toBe("image/png");
  });

  it("ignores fields that are not editable", async () => {
    const id = generateId();

    const res = await create({ ...fields(), _id: id, slug: "forced" });

    expect(res.body.products._id).not.toBe(id);
    expect(res.body.products.slug).toBe("Gaming-Mouse");
  });

  it.each([
    ["name", "Name is Required"],
    ["description", "Description is Required"],
    ["price", "Price is Required"],
    ["category", "Category is Required"],
    ["quantity", "Quantity is Required"],
  ])("answers 400 without %s", async (field, error) => {
    const payload = fields();
    delete payload[field];

    const res = await create(payload);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error });
  });

  it("answers 400 for an oversized photo", async () => {
    const res = await create(fields()).attach("photo", Buffer.alloc(1000001), {
      filename: "b.png",
      contentType: "image/png",
    });

    expect(res.status).toBe(400);
  });

  it("answers 400 for a bad price and 500 on a storage failure", async () => {
    const bad = await create({ ...fields(), price: "free" });
    failing(products, "create");
    const broken = await create(fields());

    expect(bad.status).toBe(400);
    expect(broken.status).toBe(500);
  });
});

describe("PUT /update-product/:pid", () => {
  const update = (pid, payload) =>
    asAdmin(api.put(`/api/v1/product/update-product/${pid}`)).field(payload);

  it("updates fields and regenerates the slug", async () => {
    const product = await createProduct();

    const res = await update(product._id, fields());

    expect(res.status).toBe(201);
    expect(res.body.products).toMatchObject({ slug: "Gaming-Mouse", price: 49 });
  });

  it("replaces the photo", async () => {
    const product = await createProduct();
    await photos.save(product._id, PHOTO);

    await update(product._id, fields()).attach("photo", Buffer.from("new"), {
      filename: "n.jpg",
      contentType: "image/jpeg",
    });

    expect((await photos.get(product._id)).contentType).toBe("image/jpeg");
  });

  it("answers 400 without a name", async () => {
    const product = await createProduct();
    const payload = fields();
    delete payload.name;

    const res = await update(product._id, payload);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Name is Required" });
  });

  it("answers 400 for an oversized photo", async () => {
    const product = await createProduct();

    const res = await update(product._id, fields()).attach("photo", Buffer.alloc(1000001), {
      filename: "b.png",
      contentType: "image/png",
    });

    expect(res.status).toBe(400);
  });

  it("answers 404 for an unknown product", async () => {
    const res = await update(generateId(), fields());

    expect(res.status).toBe(404);
  });

  it("answers 400 for a malformed id and 500 on a storage failure", async () => {
    const malformed = await update("bad", fields());
    failing(products, "update");
    const broken = await update(generateId(), fields());

    expect(malformed.status).toBe(400);
    expect(broken.status).toBe(500);
  });
});

describe("POST /clone/:pid", () => {
  it("creates a copy with a new id and slug and without the photo", async () => {
    const source = await createProduct({ name: "Mouse", slug: "Mouse" });
    await photos.save(source._id, PHOTO);

    const res = await asAdmin(api.post(`/api/v1/product/clone/${source._id}`)).send({});

    expect(res.status).toBe(201);
    expect(res.body.message).toBe("Product Cloned Successfully");
    expect(res.body.products._id).not.toBe(source._id);
    expect(res.body.products.slug).not.toBe("Mouse");
    expect(res.body.products).toMatchObject({ name: "Mouse", price: 100 });
    expect(await photos.get(res.body.products._id)).toBeNull();
    expect(await photos.get(source._id)).not.toBeNull();
  });

  it("applies overrides from the body but not id or slug", async () => {
    const source = await createProduct();
    const id = generateId();

    const res = await asAdmin(api.post(`/api/v1/product/clone/${source._id}`)).send({
      price: 1,
      name: "Copy",
      _id: id,
      slug: "forced",
    });

    expect(res.body.products).toMatchObject({ price: 1, name: "Copy" });
    expect(res.body.products._id).not.toBe(id);
    expect(res.body.products.slug).not.toBe("forced");
  });

  it("makes the copy reachable by its slug", async () => {
    const source = await createProduct();
    const { body } = await asAdmin(api.post(`/api/v1/product/clone/${source._id}`)).send({});

    const res = await api.get(`/api/v1/product/get-product/${body.products.slug}`);

    expect(res.body.product._id).toBe(body.products._id);
  });

  it("answers 404, 400 and 500 where due", async () => {
    const source = await createProduct();
    const unknown = await asAdmin(api.post(`/api/v1/product/clone/${generateId()}`)).send({});
    const malformed = await asAdmin(api.post("/api/v1/product/clone/bad")).send({});
    const badPrice = await asAdmin(api.post(`/api/v1/product/clone/${source._id}`)).send({
      price: "free",
    });
    failing(products, "create");
    const broken = await asAdmin(api.post(`/api/v1/product/clone/${source._id}`)).send({});

    expect(unknown.status).toBe(404);
    expect(malformed.status).toBe(400);
    expect(badPrice.status).toBe(400);
    expect(broken.status).toBe(500);
  });
});

describe("product reads", () => {
  it("lists at most 12 products with categories", async () => {
    for (let i = 0; i < 13; i += 1) await createProduct();

    const res = await api.get("/api/v1/product/get-product");

    expect(res.body.counTotal).toBe(12);
    expect(res.body.products[0].category.slug).toBe("mice");
  });

  it("reads one product", async () => {
    const product = await createProduct();

    const res = await api.get(`/api/v1/product/get-product/${product.slug}`);

    expect(res.body.product._id).toBe(product._id);
  });

  it("serves a photo", async () => {
    const product = await createProduct();
    await photos.save(product._id, PHOTO);

    const res = await api.get(`/api/v1/product/product-photo/${product._id}`);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("image/png");
  });

  it.each([
    ["without a photo", async () => (await createProduct())._id, 404],
    ["that is unknown", async () => generateId(), 404],
    ["with a malformed id", async () => "bad", 400],
  ])("answers for a product %s", async (_case, resolveId, status) => {
    const res = await api.get(`/api/v1/product/product-photo/${await resolveId()}`);

    expect(res.status).toBe(status);
  });

  it("answers 500 when photo storage fails", async () => {
    failing(photos, "get");

    const res = await api.get(`/api/v1/product/product-photo/${generateId()}`);

    expect(res.status).toBe(500);
  });

  it("counts products", async () => {
    await createProduct();

    const res = await api.get("/api/v1/product/product-count");

    expect(res.body).toEqual({ success: true, total: 1 });
  });

  it("pages products", async () => {
    for (let i = 0; i < 7; i += 1) await createProduct();

    const res = await api.get("/api/v1/product/product-list/2");

    expect(res.body.products).toHaveLength(1);
  });

  it("searches and returns a bare array", async () => {
    await createProduct({ name: "Wireless" });

    const res = await api.get("/api/v1/product/search/wire");

    expect(res.body).toHaveLength(1);
  });

  it("answers 400 for an invalid pattern", async () => {
    const res = await api.get("/api/v1/product/search/%28");

    expect(res.status).toBe(400);
  });

  it("finds related products", async () => {
    const target = await createProduct();
    await createProduct();

    const res = await api.get(`/api/v1/product/related-product/${target._id}/${category._id}`);

    expect(res.body.products).toHaveLength(1);
    expect(res.body.products[0]._id).not.toBe(target._id);
  });

  it("answers 400 for malformed related ids", async () => {
    const res = await api.get("/api/v1/product/related-product/bad/bad");

    expect(res.status).toBe(400);
  });

  it("lists products of a category", async () => {
    await createProduct();

    const res = await api.get("/api/v1/product/product-category/mice");

    expect(res.body.products).toHaveLength(1);
    expect(res.body.category.slug).toBe("mice");
  });

  it("does not return every product for an unknown category", async () => {
    await createProduct();

    const res = await api.get("/api/v1/product/product-category/missing");

    expect(res.body).toEqual({ success: true, category: null, products: [] });
  });

  it.each([
    ["search", "get", "/api/v1/product/get-product", 500],
    ["search", "get", "/api/v1/product/product-list/1", 400],
    ["search", "get", "/api/v1/product/search/x", 400],
    ["search", "get", "/api/v1/product/related-product/a/b", 400],
    ["count", "get", "/api/v1/product/product-count", 400],
    ["findBySlug", "get", "/api/v1/product/get-product/x", 500],
  ])("when %s fails, %s %s answers %i", async (method, verb, url, status) => {
    failing(products, method);

    const res = await api[verb](url);

    expect(res.status).toBe(status);
  });

  it("answers 400 when a category lookup fails", async () => {
    failing(categories, "findBySlug");

    const res = await api.get("/api/v1/product/product-category/mice");

    expect(res.status).toBe(400);
  });
});

describe("POST /product-filters", () => {
  it("returns everything for an empty body", async () => {
    await createProduct();

    const res = await api.post("/api/v1/product/product-filters").send({});

    expect(res.status).toBe(200);
    expect(res.body.products).toHaveLength(1);
  });

  it("filters by category and price", async () => {
    const match = await createProduct({ price: 50 });
    await createProduct({ price: 51 });

    const res = await api
      .post("/api/v1/product/product-filters")
      .send({ checked: [category._id], radio: [0, 50] });

    expect(res.body.products.map((p) => p._id)).toEqual([match._id]);
  });

  it("includes photos", async () => {
    const product = await createProduct();
    await photos.save(product._id, PHOTO);

    const res = await api.post("/api/v1/product/product-filters").send({});

    expect(res.body.products[0].photo.contentType).toBe("image/png");
  });

  it("answers 400 for a malformed category", async () => {
    const res = await api.post("/api/v1/product/product-filters").send({ checked: ["bad"] });

    expect(res.status).toBe(400);
  });
});

describe("DELETE /delete-product/:pid", () => {
  it("deletes a product for an admin", async () => {
    const product = await createProduct();

    const res = await asAdmin(api.delete(`/api/v1/product/delete-product/${product._id}`));

    expect(res.status).toBe(200);
    expect(await products.findById(product._id)).toBeNull();
  });

  it("leaves the product in place for a regular user", async () => {
    const product = await createProduct();

    await api.delete(`/api/v1/product/delete-product/${product._id}`).set("x-user-role", "0");

    expect(await products.findById(product._id)).not.toBeNull();
  });

  it("answers 400 for a malformed id and 500 on a storage failure", async () => {
    const malformed = await asAdmin(api.delete("/api/v1/product/delete-product/bad"));
    failing(products, "delete");
    const broken = await asAdmin(api.delete(`/api/v1/product/delete-product/${generateId()}`));

    expect(malformed.status).toBe(400);
    expect(broken.status).toBe(500);
  });
});

describe("internal routes", () => {
  it("returns products by ids", async () => {
    const product = await createProduct();

    const res = await api
      .post("/internal/products/by-ids")
      .send({ ids: [product._id, generateId()] });

    expect(res.status).toBe(200);
    expect(res.body.products.map((p) => p._id)).toEqual([product._id]);
  });

  it.each([[undefined], ["x"], [["bad"]]])("answers 400 for ids %j", async (ids) => {
    const res = await api.post("/internal/products/by-ids").send({ ids });

    expect(res.status).toBe(400);
  });

  it("answers 500 when by-ids storage fails", async () => {
    failing(products, "findByIds");

    const res = await api.post("/internal/products/by-ids").send({ ids: [] });

    expect(res.status).toBe(500);
  });

  it("reserves stock", async () => {
    const product = await createProduct({ quantity: 3 });

    const res = await api
      .post("/internal/stock/reserve")
      .send({ items: [{ productId: product._id, quantity: 2 }] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect((await products.findById(product._id)).quantity).toBe(1);
  });

  it("answers 409 with the product when stock runs out", async () => {
    const product = await createProduct({ quantity: 1 });

    const res = await api
      .post("/internal/stock/reserve")
      .send({ items: [{ productId: product._id, quantity: 2 }] });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ success: false, productId: product._id });
  });

  it("answers 404 for an unknown product", async () => {
    const id = generateId();

    const res = await api
      .post("/internal/stock/reserve")
      .send({ items: [{ productId: id, quantity: 1 }] });

    expect(res.status).toBe(404);
    expect(res.body.productId).toBe(id);
  });

  it("answers 400 for a bad payload", async () => {
    const res = await api.post("/internal/stock/reserve").send({ items: [] });

    expect(res.status).toBe(400);
  });

  it("releases stock", async () => {
    const product = await createProduct({ quantity: 1 });

    const res = await api
      .post("/internal/stock/release")
      .send({ items: [{ productId: product._id, quantity: 2 }] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, missing: [] });
    expect((await products.findById(product._id)).quantity).toBe(3);
  });

  it("answers 400 for a bad release payload", async () => {
    const res = await api.post("/internal/stock/release").send({});

    expect(res.status).toBe(400);
  });

  it("answers 500 when a mongoose-style cast is not the cause", async () => {
    failing(products, "increaseQuantity");

    const res = await api
      .post("/internal/stock/release")
      .send({ items: [{ productId: generateId(), quantity: 1 }] });

    expect(res.status).toBe(500);
  });
});
