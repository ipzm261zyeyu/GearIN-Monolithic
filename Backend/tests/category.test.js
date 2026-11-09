import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "@jest/globals";
import mongoose from "mongoose";
import {
  expectNoResponse,
  failing,
  mountController,
  startApp,
  tokenFor,
} from "./helpers/harness.js";

let ctx;
let admin;
let token;
let createCategoryController;

beforeAll(async () => {
  ctx = await startApp();
  ({ createCategoryController } = await import(
    "../controllers/categoryController.js"
  ));
});

beforeEach(async () => {
  admin = await ctx.createAdmin();
  token = tokenFor(admin);
});

afterEach(() => ctx.reset());
afterAll(() => ctx.stop());

describe("POST /api/v1/category/create-category", () => {
  it("creates a category with a lowercase slug", async () => {
    const res = await ctx.api
      .post("/api/v1/category/create-category")
      .set("Authorization", token)
      .send({ name: "Gaming Mice" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      success: true,
      message: "New Category Created",
      category: { name: "Gaming Mice", slug: "gaming-mice" },
    });
  });

  it("answers 401 when the name is missing", async () => {
    const res = await ctx.api
      .post("/api/v1/category/create-category")
      .set("Authorization", token)
      .send({});

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: "Name is required" });
  });

  it("answers 200 with success false for a duplicate name", async () => {
    await ctx.createCategory({ name: "Mice" });

    const res = await ctx.api
      .post("/api/v1/category/create-category")
      .set("Authorization", token)
      .send({ name: "Mice" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: false,
      message: "Category Already Exists",
    });
  });

  it("never responds on a database failure because the catch block throws", async () => {
    failing(ctx.categoryModel, "findOne");
    const { api, settled } = mountController(createCategoryController);

    await expectNoResponse(api.post("/").send({ name: "Mice" }));

    await expect(settled).resolves.toBeInstanceOf(ReferenceError);
  });
});

describe("PUT /api/v1/category/update-category/:id", () => {
  it("renames the category and regenerates the slug", async () => {
    const category = await ctx.createCategory();

    const res = await ctx.api
      .put(`/api/v1/category/update-category/${category._id}`)
      .set("Authorization", token)
      .send({ name: "Studio Headphones" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      messsage: "Category Updated Successfully",
      category: { name: "Studio Headphones", slug: "studio-headphones" },
    });
  });

  it("answers 200 with a null category for an unknown id", async () => {
    const res = await ctx.api
      .put(`/api/v1/category/update-category/${new mongoose.Types.ObjectId()}`)
      .set("Authorization", token)
      .send({ name: "Nothing" });

    expect(res.status).toBe(200);
    expect(res.body.category).toBeNull();
  });

  it("answers 500 when the name is missing", async () => {
    const category = await ctx.createCategory();

    const res = await ctx.api
      .put(`/api/v1/category/update-category/${category._id}`)
      .set("Authorization", token)
      .send({});

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      success: false,
      message: "Error While Updating Category",
    });
  });
});

describe("GET /api/v1/category/get-category", () => {
  it("lists every category without a token", async () => {
    await ctx.createCategory({ name: "One", slug: "one" });
    await ctx.createCategory({ name: "Two", slug: "two" });

    const res = await ctx.api.get("/api/v1/category/get-category");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe("All Categories List");
    expect(res.body.category.map((c) => c.slug).sort()).toEqual(["one", "two"]);
  });

  it("answers 500 when the database fails", async () => {
    failing(ctx.categoryModel, "find");

    const res = await ctx.api.get("/api/v1/category/get-category");

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      success: false,
      message: "Error While Getting All Categories",
    });
  });
});

describe("GET /api/v1/category/single-category/:slug", () => {
  it("returns the category by slug", async () => {
    await ctx.createCategory({ name: "Mice", slug: "mice" });

    const res = await ctx.api.get("/api/v1/category/single-category/mice");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      message: "Get Single Category Successfully",
      category: { name: "Mice", slug: "mice" },
    });
  });

  it("answers 200 with a null category for an unknown slug", async () => {
    const res = await ctx.api.get("/api/v1/category/single-category/missing");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.category).toBeNull();
  });

  it("answers 500 when the database fails", async () => {
    failing(ctx.categoryModel, "findOne");

    const res = await ctx.api.get("/api/v1/category/single-category/mice");

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      success: false,
      message: "Error While Getting Single Category",
    });
  });
});

describe("DELETE /api/v1/category/delete-category/:id", () => {
  it("removes the category", async () => {
    const category = await ctx.createCategory();

    const res = await ctx.api
      .delete(`/api/v1/category/delete-category/${category._id}`)
      .set("Authorization", token);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: "Category Deleted Successfully",
    });
    expect(await ctx.categoryModel.findById(category._id)).toBeNull();
  });

  it("leaves products of the deleted category in place", async () => {
    const category = await ctx.createCategory();
    const product = await ctx.createProduct(category);

    await ctx.api
      .delete(`/api/v1/category/delete-category/${category._id}`)
      .set("Authorization", token);

    expect(await ctx.productModel.findById(product._id)).not.toBeNull();
  });

  it("answers 500 for a malformed id", async () => {
    const res = await ctx.api
      .delete("/api/v1/category/delete-category/not-an-id")
      .set("Authorization", token);

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      success: false,
      message: "Error While Deleting Category",
    });
  });
});
