import { afterAll, afterEach, beforeAll, describe, expect, it } from "@jest/globals";
import { expectNoResponse, startApp, tokenFor } from "./helpers/harness.js";

let ctx;

const ID = "64b000000000000000000000";

const adminRoutes = [
  ["get", "/api/v1/auth/test"],
  ["get", "/api/v1/auth/admin-auth"],
  ["get", "/api/v1/auth/all-orders"],
  ["put", `/api/v1/auth/order-status/${ID}`],
  ["post", "/api/v1/category/create-category"],
  ["put", `/api/v1/category/update-category/${ID}`],
  ["delete", `/api/v1/category/delete-category/${ID}`],
  ["post", "/api/v1/product/create-product"],
  ["put", `/api/v1/product/update-product/${ID}`],
];

const signedInRoutes = [
  ["get", "/api/v1/auth/user-auth"],
  ["put", "/api/v1/auth/profile"],
  ["get", "/api/v1/auth/orders"],
  ["post", "/api/v1/product/braintree/payment"],
];

const protectedRoutes = [...adminRoutes, ...signedInRoutes];

beforeAll(async () => {
  ctx = await startApp();
});

afterEach(() => ctx.reset());
afterAll(() => ctx.stop());

describe("requireSignIn", () => {
  // KNOWN-DEFECT-3
  it.each(protectedRoutes)("%s %s never responds without a token", async (method, url) => {
    await expectNoResponse(ctx.api[method](url));
  });

  // KNOWN-DEFECT-3
  it.each(protectedRoutes)("%s %s never responds to a malformed token", async (method, url) => {
    await expectNoResponse(ctx.api[method](url).set("Authorization", "garbage"));
  });
});

describe("isAdmin", () => {
  it.each(adminRoutes)("%s %s answers 401 for a regular user", async (method, url) => {
    const user = await ctx.createUser();

    const res = await ctx.api[method](url).set("Authorization", tokenFor(user));

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      success: false,
      message: "Unauthorized Access",
    });
  });

  it.each(adminRoutes)("%s %s answers 401 when the token owner is gone", async (method, url) => {
    const user = await ctx.createAdmin();
    await ctx.userModel.findByIdAndDelete(user._id);

    const res = await ctx.api[method](url).set("Authorization", tokenFor(user));

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({
      success: false,
      message: "Error in admin middleware",
    });
  });
});
