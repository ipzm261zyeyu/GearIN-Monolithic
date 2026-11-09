import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "@jest/globals";
import mongoose from "mongoose";
import {
  expectNoResponse,
  failing,
  itDirect,
  itGateway,
  startApp,
  tokenFor,
} from "./helpers/harness.js";

let ctx;
let category;
let token;

const PHOTO = { data: Buffer.from("stored-image"), contentType: "image/png" };
const OVERSIZED = Buffer.alloc(1000001, 1);

const fields = () => ({
  name: "Gaming Mouse",
  description: "Fast mouse",
  price: "49",
  category: String(category._id),
  quantity: "7",
  shipping: "true",
});

const without = (field) => {
  const payload = fields();
  delete payload[field];
  return payload;
};

const missingFields = [
  ["name", "Name is Required"],
  ["description", "Description is Required"],
  ["price", "Price is Required"],
  ["category", "Category is Required"],
  ["quantity", "Quantity is Required"],
];

beforeAll(async () => {
  ctx = await startApp();
});

beforeEach(async () => {
  category = await ctx.createCategory();
  token = tokenFor(await ctx.createAdmin());
});

afterEach(() => ctx.reset());
afterAll(() => ctx.stop());

describe("POST /api/v1/product/create-product", () => {
  const create = (payload) =>
    ctx.api
      .post("/api/v1/product/create-product")
      .set("Authorization", token)
      .field(payload);

  it("creates a product with its photo and a case-preserving slug", async () => {
    const res = await create(fields()).attach("photo", Buffer.from("image"), {
      filename: "mouse.png",
      contentType: "image/png",
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      success: true,
      message: "Product Created Successfully",
      products: { name: "Gaming Mouse", slug: "Gaming-Mouse", price: 49, quantity: 7 },
    });
    const stored = await ctx.productModel.findById(res.body.products._id);
    expect(stored.photo.contentType).toBe("image/png");
    expect(stored.photo.data.toString()).toBe("image");
  });

  it("creates a product without a photo", async () => {
    const res = await create(fields());

    expect(res.status).toBe(201);
    const stored = await ctx.productModel.findById(res.body.products._id);
    expect(stored.photo.data).toBeUndefined();
  });

  // KNOWN-DEFECT-7
  itDirect.each(missingFields)("answers 500 when %s is missing", async (field, error) => {
    const res = await create(without(field));

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error });
  });

  // KNOWN-DEFECT-7 виправлено в services/catalog: помилка клієнта тепер 400, а не 500
  itGateway.each(missingFields)("answers 400 when %s is missing", async (field, error) => {
    const res = await create(without(field));

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error });
  });

  // KNOWN-DEFECT-7
  itDirect("answers 500 for a photo over the size limit", async () => {
    const res = await create(fields()).attach("photo", OVERSIZED, {
      filename: "big.png",
      contentType: "image/png",
    });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: "photo is required and should be less then 1mb",
    });
  });

  // KNOWN-DEFECT-7 виправлено в services/catalog: завелике фото — помилка клієнта, тому 400
  itGateway("answers 400 for a photo over the size limit", async () => {
    const res = await create(fields()).attach("photo", OVERSIZED, {
      filename: "big.png",
      contentType: "image/png",
    });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "photo is required and should be less then 1mb",
    });
  });

  // KNOWN-DEFECT-7
  itDirect("answers 500 for a non numeric price", async () => {
    const res = await create({ ...fields(), price: "free" });

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      success: false,
      message: "Error in Crearing Product",
    });
  });

  // KNOWN-DEFECT-7 виправлено в services/catalog: некоректна ціна — помилка клієнта, тому 400
  itGateway("answers 400 for a non numeric price", async () => {
    const res = await create({ ...fields(), price: "free" });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      success: false,
      message: "Error in Crearing Product",
    });
  });
});

describe("PUT /api/v1/product/update-product/:pid", () => {
  const update = (pid, payload) =>
    ctx.api
      .put(`/api/v1/product/update-product/${pid}`)
      .set("Authorization", token)
      .field(payload);

  it("updates fields, regenerates the slug and keeps the photo", async () => {
    const product = await ctx.createProduct(category, { photo: PHOTO });

    const res = await update(product._id, fields());

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      success: true,
      message: "Product Updated Successfully",
      products: { name: "Gaming Mouse", slug: "Gaming-Mouse", price: 49 },
    });
    const stored = await ctx.productModel.findById(product._id);
    expect(stored.photo.data.toString()).toBe("stored-image");
  });

  it("replaces the photo when a new one is sent", async () => {
    const product = await ctx.createProduct(category, { photo: PHOTO });

    const res = await update(product._id, fields()).attach(
      "photo",
      Buffer.from("fresh-image"),
      { filename: "new.jpg", contentType: "image/jpeg" }
    );

    expect(res.status).toBe(201);
    const stored = await ctx.productModel.findById(product._id);
    expect(stored.photo.data.toString()).toBe("fresh-image");
    expect(stored.photo.contentType).toBe("image/jpeg");
  });

  // KNOWN-DEFECT-7
  itDirect.each(missingFields)("answers 500 when %s is missing", async (field, error) => {
    const product = await ctx.createProduct(category);

    const res = await update(product._id, without(field));

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error });
  });

  // KNOWN-DEFECT-7 виправлено в services/catalog: помилка клієнта тепер 400, а не 500
  itGateway.each(missingFields)("answers 400 when %s is missing", async (field, error) => {
    const product = await ctx.createProduct(category);

    const res = await update(product._id, without(field));

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error });
  });

  // KNOWN-DEFECT-7
  itDirect("answers 500 for a photo over the size limit", async () => {
    const product = await ctx.createProduct(category);

    const res = await update(product._id, fields()).attach("photo", OVERSIZED, {
      filename: "big.png",
      contentType: "image/png",
    });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: "Photo is required and should be less then 1mb",
    });
  });

  // KNOWN-DEFECT-7 виправлено в services/catalog: завелике фото — помилка клієнта, тому 400
  itGateway("answers 400 for a photo over the size limit", async () => {
    const product = await ctx.createProduct(category);

    const res = await update(product._id, fields()).attach("photo", OVERSIZED, {
      filename: "big.png",
      contentType: "image/png",
    });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "Photo is required and should be less then 1mb",
    });
  });

  itDirect("answers 500 for an unknown product", async () => {
    const res = await update(new mongoose.Types.ObjectId(), fields());

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      success: false,
      message: "Error in Update product",
    });
  });

  // KNOWN-DEFECT-7 виправлено в services/catalog: неіснуючий товар тепер 404, а не 500
  itGateway("answers 404 for an unknown product", async () => {
    const res = await update(new mongoose.Types.ObjectId(), fields());

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      success: false,
      message: "Error in Update product",
    });
  });
});

describe("GET /api/v1/product/get-product", () => {
  it("returns at most 12 newest products without photos and with populated category", async () => {
    const created = [];
    for (let i = 0; i < 13; i += 1) {
      created.push(await ctx.createProduct(category, { photo: PHOTO }));
    }

    const res = await ctx.api.get("/api/v1/product/get-product");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.counTotal).toBe(12);
    expect(res.body.message).toBe("ALlProducts ");
    expect(res.body.products[0]._id).toBe(String(created[12]._id));
    expect(res.body.products[11]._id).toBe(String(created[1]._id));
    expect(res.body.products[0].photo).toBeUndefined();
    expect(res.body.products[0].category.slug).toBe(category.slug);
  });

  it("answers 500 with the error text when the database fails", async () => {
    failing(ctx.productModel, "find");

    const res = await ctx.api.get("/api/v1/product/get-product");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      success: false,
      message: "Error in Getting Products",
      error: "db down",
    });
  });
});

describe("GET /api/v1/product/get-product/:slug", () => {
  it("returns the product with its category and without the photo", async () => {
    const product = await ctx.createProduct(category, { photo: PHOTO });

    const res = await ctx.api.get(`/api/v1/product/get-product/${product.slug}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Single Product Fetched");
    expect(res.body.product._id).toBe(String(product._id));
    expect(res.body.product.photo).toBeUndefined();
    expect(res.body.product.category.slug).toBe(category.slug);
  });

  it("answers 200 with a null product for an unknown slug", async () => {
    const res = await ctx.api.get("/api/v1/product/get-product/missing");

    expect(res.status).toBe(200);
    expect(res.body.product).toBeNull();
  });

  it("answers 500 when the database fails", async () => {
    failing(ctx.productModel, "findOne");

    const res = await ctx.api.get("/api/v1/product/get-product/any");

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      success: false,
      message: "Error While Getitng Single Product",
    });
  });
});

describe("GET /api/v1/product/product-photo/:pid", () => {
  it("returns the stored bytes with their content type", async () => {
    const product = await ctx.createProduct(category, { photo: PHOTO });

    const res = await ctx.api
      .get(`/api/v1/product/product-photo/${product._id}`)
      .buffer(true)
      .parse((response, done) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => done(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("image/png");
    expect(res.body.toString()).toBe("stored-image");
  });

  itDirect("never responds for a product without a photo", async () => {
    const product = await ctx.createProduct(category);

    await expectNoResponse(
      ctx.api.get(`/api/v1/product/product-photo/${product._id}`)
    );
  });

  // KNOWN-DEFECT-7 виправлено в services/catalog: фото немає — відповідь 404 замість зависання
  itGateway("answers 404 for a product without a photo", async () => {
    const product = await ctx.createProduct(category);

    const res = await ctx.api.get(`/api/v1/product/product-photo/${product._id}`);

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      success: false,
      message: "Error While Getting Photo",
    });
  });

  itDirect("answers 500 for an unknown product", async () => {
    const res = await ctx.api.get(
      `/api/v1/product/product-photo/${new mongoose.Types.ObjectId()}`
    );

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      success: false,
      message: "Error While Getting Photo",
    });
  });

  // KNOWN-DEFECT-7 виправлено в services/catalog: неіснуючий товар тепер 404, а не 500
  itGateway("answers 404 for an unknown product", async () => {
    const res = await ctx.api.get(
      `/api/v1/product/product-photo/${new mongoose.Types.ObjectId()}`
    );

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      success: false,
      message: "Error While Getting Photo",
    });
  });
});

describe("DELETE /api/v1/product/delete-product/:pid", () => {
  // KNOWN-DEFECT-1
  itDirect("deletes a product without any token", async () => {
    const product = await ctx.createProduct(category);

    const res = await ctx.api.delete(
      `/api/v1/product/delete-product/${product._id}`
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: "Product Deleted Successfully",
    });
    expect(await ctx.productModel.findById(product._id)).toBeNull();
  });

  // KNOWN-DEFECT-1 виправлено: шлюз вимагає токен адміністратора, без нього товар лишається
  itGateway("answers 401 without a token and keeps the product", async () => {
    const product = await ctx.createProduct(category);

    const res = await ctx.api.delete(
      `/api/v1/product/delete-product/${product._id}`
    );

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, message: "Invalid or missing token" });
    expect(await ctx.productModel.findById(product._id)).not.toBeNull();
  });

  // KNOWN-DEFECT-1
  itDirect("deletes a product for a caller who is not an admin", async () => {
    const product = await ctx.createProduct(category);
    const user = await ctx.createUser();

    const res = await ctx.api
      .delete(`/api/v1/product/delete-product/${product._id}`)
      .set("Authorization", tokenFor(user));

    expect(res.status).toBe(200);
    expect(await ctx.productModel.findById(product._id)).toBeNull();
  });

  // KNOWN-DEFECT-1 виправлено: звичайному користувачу видалення заборонено
  itGateway("answers 401 for a caller who is not an admin and keeps the product", async () => {
    const product = await ctx.createProduct(category);
    const user = await ctx.createUser();

    const res = await ctx.api
      .delete(`/api/v1/product/delete-product/${product._id}`)
      .set("Authorization", tokenFor(user));

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, message: "Unauthorized Access" });
    expect(await ctx.productModel.findById(product._id)).not.toBeNull();
  });

  // KNOWN-DEFECT-1 виправлено: адміністратор, як і раніше, може видалити товар
  itGateway("deletes a product for an admin", async () => {
    const product = await ctx.createProduct(category);

    const res = await ctx.api
      .delete(`/api/v1/product/delete-product/${product._id}`)
      .set("Authorization", token);

    expect(res.status).toBe(200);
    expect(await ctx.productModel.findById(product._id)).toBeNull();
  });

  it("answers 500 when the database fails", async () => {
    failing(ctx.productModel, "findByIdAndDelete");

    const res = await ctx.api
      .delete(`/api/v1/product/delete-product/${new mongoose.Types.ObjectId()}`)
      .set("Authorization", token);

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      success: false,
      message: "Error While Deleting Product",
    });
  });
});

describe("POST /api/v1/product/product-filters", () => {
  it("returns everything, photos included, for empty filters", async () => {
    await ctx.createProduct(category, { photo: PHOTO });

    const res = await ctx.api
      .post("/api/v1/product/product-filters")
      .send({ checked: [], radio: [] });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.products).toHaveLength(1);
    expect(res.body.products[0].photo.contentType).toBe("image/png");
  });

  it("filters by category and by inclusive price range", async () => {
    const other = await ctx.createCategory();
    const cheap = await ctx.createProduct(category, { price: 10 });
    const edge = await ctx.createProduct(category, { price: 50 });
    await ctx.createProduct(category, { price: 51 });
    await ctx.createProduct(other, { price: 20 });

    const res = await ctx.api
      .post("/api/v1/product/product-filters")
      .send({ checked: [String(category._id)], radio: [0, 50] });

    expect(res.status).toBe(200);
    expect(res.body.products.map((p) => p._id).sort()).toEqual(
      [String(cheap._id), String(edge._id)].sort()
    );
  });

  // KNOWN-DEFECT-7
  itDirect("fails with 400 for a request without filters", async () => {
    const res = await ctx.api.post("/api/v1/product/product-filters").send({});

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      success: false,
      message: "Error while filtering products",
    });
  });

  // KNOWN-DEFECT-7 виправлено в services/catalog: порожній запит більше не падає, ProductQueryBuilder пропускає відсутні фільтри
  itGateway("returns everything for a request without filters", async () => {
    await ctx.createProduct(category);

    const res = await ctx.api.post("/api/v1/product/product-filters").send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.products).toHaveLength(1);
  });
});

describe("POST /api/v1/product/clone/:pid", () => {
  // Новий маршрут services/catalog: лише для адміністратора, копія без фото
  itGateway("creates a copy with a new id and slug and without the photo", async () => {
    const product = await ctx.createProduct(category, { photo: PHOTO });

    const res = await ctx.api
      .post(`/api/v1/product/clone/${product._id}`)
      .set("Authorization", token)
      .send({ price: 1 });

    expect(res.status).toBe(201);
    expect(res.body.products._id).not.toBe(String(product._id));
    expect(res.body.products.slug).not.toBe(product.slug);
    expect(res.body.products.price).toBe(1);
    const copy = await ctx.productModel.findById(res.body.products._id);
    expect(copy.photo.data).toBeUndefined();
  });

  // Новий маршрут services/catalog: звичайному користувачу клонування заборонено
  itGateway("answers 401 for a caller who is not an admin", async () => {
    const product = await ctx.createProduct(category);
    const user = await ctx.createUser();

    const res = await ctx.api
      .post(`/api/v1/product/clone/${product._id}`)
      .set("Authorization", tokenFor(user))
      .send({});

    expect(res.status).toBe(401);
    expect(await ctx.productModel.countDocuments()).toBe(1);
  });
});

describe("GET /api/v1/product/product-count", () => {
  it("returns the number of products", async () => {
    await ctx.createProduct(category);
    await ctx.createProduct(category);

    const res = await ctx.api.get("/api/v1/product/product-count");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, total: 2 });
  });

  it("answers 400 when the database fails", async () => {
    failing(ctx.productModel, "find");

    const res = await ctx.api.get("/api/v1/product/product-count");

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      success: false,
      message: "Error in product count",
    });
  });
});

describe("GET /api/v1/product/product-list/:page", () => {
  it("pages by six, newest first, without photos", async () => {
    const created = [];
    for (let i = 0; i < 8; i += 1) {
      created.push(await ctx.createProduct(category, { photo: PHOTO }));
    }

    const first = await ctx.api.get("/api/v1/product/product-list/1");
    const second = await ctx.api.get("/api/v1/product/product-list/2");

    expect(first.status).toBe(200);
    expect(first.body.products).toHaveLength(6);
    expect(first.body.products[0]._id).toBe(String(created[7]._id));
    expect(first.body.products[0].photo).toBeUndefined();
    expect(second.body.products.map((p) => p._id)).toEqual([
      String(created[1]._id),
      String(created[0]._id),
    ]);
  });

  it("serves the first page for a non numeric page", async () => {
    const created = [];
    for (let i = 0; i < 7; i += 1) {
      created.push(await ctx.createProduct(category));
    }

    const res = await ctx.api.get("/api/v1/product/product-list/abc");

    expect(res.status).toBe(200);
    expect(res.body.products).toHaveLength(6);
    expect(res.body.products[0]._id).toBe(String(created[6]._id));
  });

  it("answers 400 when the database fails", async () => {
    failing(ctx.productModel, "find");

    const res = await ctx.api.get("/api/v1/product/product-list/1");

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      success: false,
      message: "Error occured in loading page",
    });
  });
});

describe("GET /api/v1/product/search/:keyword", () => {
  it("matches name or description case-insensitively and returns a bare array", async () => {
    const byName = await ctx.createProduct(category, {
      name: "Wireless Mouse",
      photo: PHOTO,
    });
    const byDescription = await ctx.createProduct(category, {
      description: "A silent WIRELESS keyboard",
    });
    await ctx.createProduct(category, { name: "Cable", description: "Plain" });

    const res = await ctx.api.get("/api/v1/product/search/wireless");

    expect(res.status).toBe(200);
    expect(res.body.map((p) => p._id).sort()).toEqual(
      [String(byName._id), String(byDescription._id)].sort()
    );
    expect(res.body[0].photo).toBeUndefined();
  });

  it("answers 400 for an invalid regular expression", async () => {
    const res = await ctx.api.get("/api/v1/product/search/%28");

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      success: false,
      message: "Error in search product api",
    });
  });
});

describe("GET /api/v1/product/related-product/:pid/:cid", () => {
  it("returns up to three other products of the category", async () => {
    const other = await ctx.createCategory();
    const target = await ctx.createProduct(category, { photo: PHOTO });
    for (let i = 0; i < 4; i += 1) {
      await ctx.createProduct(category, { photo: PHOTO });
    }
    await ctx.createProduct(other);

    const res = await ctx.api.get(
      `/api/v1/product/related-product/${target._id}/${category._id}`
    );

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.products).toHaveLength(3);
    expect(res.body.products.map((p) => p._id)).not.toContain(String(target._id));
    expect(res.body.products[0].category.slug).toBe(category.slug);
    expect(res.body.products[0].photo).toBeUndefined();
  });

  it("answers 400 for malformed ids", async () => {
    const res = await ctx.api.get(
      "/api/v1/product/related-product/not-an-id/not-an-id"
    );

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      success: false,
      message: "Error While Getting Related Product",
    });
  });
});

describe("GET /api/v1/product/product-category/:slug", () => {
  it("returns the category and its products", async () => {
    const other = await ctx.createCategory();
    const product = await ctx.createProduct(category);
    await ctx.createProduct(other);

    const res = await ctx.api.get(
      `/api/v1/product/product-category/${category.slug}`
    );

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.category.slug).toBe(category.slug);
    expect(res.body.products.map((p) => p._id)).toEqual([String(product._id)]);
    expect(res.body.products[0].category.slug).toBe(category.slug);
  });

  it("answers 200 with a null category and no products for an unknown slug", async () => {
    await ctx.createProduct(category);

    const res = await ctx.api.get("/api/v1/product/product-category/missing");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, category: null, products: [] });
  });

  it("answers 400 when the database fails", async () => {
    failing(ctx.categoryModel, "findOne");

    const res = await ctx.api.get("/api/v1/product/product-category/any");

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      success: false,
      message: "Error while getting products",
    });
  });
});
