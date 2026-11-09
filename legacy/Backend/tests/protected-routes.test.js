import { afterAll, afterEach, beforeAll, describe, expect, it } from "@jest/globals";
import {
  VIA_GATEWAY,
  expectNoResponse,
  itDirect,
  itGateway,
  startApp,
  tokenFor,
} from "./helpers/harness.js";

let ctx;

const ID = "64b000000000000000000000";

const monolithAdminRoutes = [
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

// Маршрут /auth/test існував лише в моноліті, тому через шлюз його більше немає
const adminRoutes = VIA_GATEWAY
  ? monolithAdminRoutes.filter(([, url]) => url !== "/api/v1/auth/test")
  : monolithAdminRoutes;

const trustsGatewayRole = ([, url]) =>
  /\/api\/v1\/(category|product)\/|\/all-orders|\/order-status\//.test(url);
const catalogAdminRoutes = adminRoutes.filter(trustsGatewayRole);
const nonCatalogAdminRoutes = adminRoutes.filter((route) => !trustsGatewayRole(route));

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
  itDirect.each(protectedRoutes)("%s %s never responds without a token", async (method, url) => {
    await expectNoResponse(ctx.api[method](url));
  });

  // KNOWN-DEFECT-3
  itDirect.each(protectedRoutes)("%s %s never responds to a malformed token", async (method, url) => {
    await expectNoResponse(ctx.api[method](url).set("Authorization", "garbage"));
  });

  // KNOWN-DEFECT-3 виправлено на шлюзі: запит без токена отримує 401 і не доходить до сервісів
  itGateway.each(protectedRoutes)("%s %s answers 401 without a token", async (method, url) => {
    const res = await ctx.api[method](url);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, message: "Invalid or missing token" });
  });

  // KNOWN-DEFECT-3 виправлено на шлюзі: невалідний токен отримує 401 і не доходить до сервісів
  itGateway.each(protectedRoutes)("%s %s answers 401 to a malformed token", async (method, url) => {
    const res = await ctx.api[method](url).set("Authorization", "garbage");

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, message: "Invalid or missing token" });
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

  const answersAdminCheck = async (method, url) => {
    const user = await ctx.createAdmin();
    await ctx.userModel.findByIdAndDelete(user._id);

    const res = await ctx.api[method](url).set("Authorization", tokenFor(user));

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({
      success: false,
      message: "Error in admin middleware",
    });
  };

  it.each(nonCatalogAdminRoutes)("%s %s answers 401 when the token owner is gone", answersAdminCheck);

  itDirect.each(catalogAdminRoutes)("%s %s answers 401 when the token owner is gone", answersAdminCheck);

  // Каталог і замовлення довіряють ролі із заголовків шлюзу й не бачать бази користувачів, тому токен видаленого адміністратора діє до завершення строку
  itGateway.each(catalogAdminRoutes)("%s %s still trusts the role until the token expires", async (method, url) => {
    const user = await ctx.createAdmin();
    await ctx.userModel.findByIdAndDelete(user._id);

    const res = await ctx.api[method](url).set("Authorization", tokenFor(user));

    expect(res.body?.message).not.toBe("Error in admin middleware");
    expect(res.body?.message).not.toBe("Unauthorized Access");
    expect(res.body?.message).not.toBe("Invalid or missing token");
  });
});
