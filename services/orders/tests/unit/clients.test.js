import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { createClients } from "../../src/clients/index.js";
import { CheckoutError, UpstreamError } from "../../src/errors.js";

const { catalog, payments, users } = createClients({
  catalogUrl: "http://catalog",
  paymentsUrl: "http://payments",
  usersUrl: "http://users",
});

const answer = (status, body) =>
  jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValue({ status, json: async () => body });

const unreachable = () =>
  jest.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));

afterEach(() => jest.restoreAllMocks());

const sentTo = (fetchMock) => {
  const [url, options] = fetchMock.mock.calls[0];
  return { url, method: options.method, body: JSON.parse(options.body) };
};

describe("CatalogClient", () => {
  it("asks for products by ids", async () => {
    const fetchMock = answer(200, { products: [{ _id: "a" }] });

    await expect(catalog.productsByIds(["a"])).resolves.toEqual([{ _id: "a" }]);
    expect(sentTo(fetchMock)).toEqual({
      url: "http://catalog/internal/products/by-ids",
      method: "POST",
      body: { ids: ["a"] },
    });
  });

  it("fails as unavailable on a bad answer", async () => {
    answer(500, {});

    await expect(catalog.productsByIds(["a"])).rejects.toBeInstanceOf(UpstreamError);
  });

  it("reserves items", async () => {
    const fetchMock = answer(200, { success: true });
    const items = [{ productId: "a", quantity: 1 }];

    await catalog.reserve(items);

    expect(sentTo(fetchMock)).toMatchObject({
      url: "http://catalog/internal/stock/reserve",
      body: { items },
    });
  });

  it.each([400, 404, 409])("passes on a %i from the reservation", async (status) => {
    answer(status, { message: "Nope", productId: "a" });

    const error = await catalog.reserve([]).catch((e) => e);

    expect(error).toBeInstanceOf(CheckoutError);
    expect(error).toMatchObject({ status, message: "Nope", details: { productId: "a" } });
  });

  it("fails as unavailable when the reservation breaks", async () => {
    answer(500, {});

    await expect(catalog.reserve([])).rejects.toMatchObject({ status: 502 });
  });

  it("releases items", async () => {
    const fetchMock = answer(200, { success: true, missing: [] });

    await catalog.release([]);

    expect(sentTo(fetchMock).url).toBe("http://catalog/internal/stock/release");
  });

  it("fails as unavailable when the release breaks", async () => {
    answer(500, {});

    await expect(catalog.release([])).rejects.toBeInstanceOf(UpstreamError);
  });

  it("fails as unavailable when the network is down", async () => {
    unreachable();

    await expect(catalog.productsByIds([])).rejects.toMatchObject({
      status: 502,
      message: "catalog service is unavailable",
    });
  });
});

describe("PaymentsClient", () => {
  it("returns a successful charge", async () => {
    const fetchMock = answer(200, { success: true, transactionId: "t" });

    await expect(payments.charge({ amount: 5, nonce: "n" })).resolves.toEqual({
      success: true,
      transactionId: "t",
    });
    expect(sentTo(fetchMock)).toMatchObject({
      url: "http://payments/internal/charge",
      body: { amount: 5, nonce: "n" },
    });
  });

  it("returns a declined charge instead of failing", async () => {
    answer(402, { success: false, message: "Declined" });

    await expect(payments.charge({ amount: 5, nonce: "n" })).resolves.toMatchObject({
      success: false,
    });
  });

  it.each([400, 502])("fails as unavailable on a %i", async (status) => {
    answer(status, { success: false });

    await expect(payments.charge({ amount: 5, nonce: "n" })).rejects.toBeInstanceOf(UpstreamError);
  });
});

describe("UsersClient", () => {
  it("maps ids to names", async () => {
    const fetchMock = answer(200, { users: [{ _id: "a", name: "Olena" }] });

    await expect(users.namesByIds(["a"])).resolves.toEqual(new Map([["a", "Olena"]]));
    expect(sentTo(fetchMock).url).toBe("http://users/internal/users/by-ids");
  });

  it("does not call the service for no ids", async () => {
    const fetchMock = answer(200, { users: [] });

    await users.namesByIds([]);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns no names on a bad answer", async () => {
    answer(500, {});

    await expect(users.namesByIds(["a"])).resolves.toEqual(new Map());
  });

  it("returns no names when the network is down", async () => {
    unreachable();

    await expect(users.namesByIds(["a"])).resolves.toEqual(new Map());
  });
});
