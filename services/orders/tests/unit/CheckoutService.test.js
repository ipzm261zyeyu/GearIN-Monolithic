import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { CheckoutError, UpstreamError } from "../../src/errors.js";
import { CheckoutService } from "../../src/services/CheckoutService.js";

const A = "64b000000000000000000001";
const B = "64b000000000000000000002";

let steps;
let catalog;
let payments;
let orders;
let service;

const record = (name, implementation = async () => undefined) =>
  jest.fn(async (...args) => {
    steps.push(name);
    return implementation(...args);
  });

const request = (items = [{ productId: A, quantity: 2 }]) => ({
  buyerId: "buyer-1",
  items,
  nonce: "nonce",
});

beforeEach(() => {
  steps = [];
  catalog = {
    productsByIds: record("products", async () => [
      { _id: A, name: "Mouse", price: 10.5 },
      { _id: B, name: "Keyboard", price: 20 },
    ]),
    reserve: record("reserve"),
    release: record("release"),
  };
  payments = {
    charge: record("charge", async () => ({
      success: true,
      transactionId: "tx-1",
      details: { raw: true },
    })),
  };
  orders = { create: record("save", async (order) => ({ _id: "order-1", ...order })) };
  service = new CheckoutService({ catalog, payments, orders });
});

describe("a successful checkout", () => {
  it("follows the agreed order of steps", async () => {
    await service.checkout(request());

    expect(steps).toEqual(["products", "reserve", "charge", "save"]);
  });

  it("saves a snapshot built from catalog prices", async () => {
    await service.checkout(request());

    expect(orders.create).toHaveBeenCalledWith({
      buyer: "buyer-1",
      items: [{ productId: A, name: "Mouse", price: 10.5, quantity: 2 }],
      amount: 21,
      transactionId: "tx-1",
      status: "Not Processed",
      payment: { success: true, details: { raw: true } },
    });
  });

  it("charges the sum calculated on the server", async () => {
    await service.checkout(
      request([
        { productId: A, quantity: 2 },
        { productId: B, quantity: 1 },
      ])
    );

    expect(payments.charge).toHaveBeenCalledWith({ amount: 41, nonce: "nonce" });
  });

  it("ignores prices sent by the client", async () => {
    await service.checkout(request([{ productId: A, quantity: 1, price: 0.01, name: "Free" }]));

    expect(payments.charge).toHaveBeenCalledWith({ amount: 10.5, nonce: "nonce" });
    expect(orders.create.mock.calls[0][0].items[0]).toMatchObject({ name: "Mouse", price: 10.5 });
  });

  it("merges repeated products into one line", async () => {
    await service.checkout(
      request([
        { productId: A, quantity: 1 },
        { productId: A, quantity: 2 },
      ])
    );

    expect(catalog.reserve).toHaveBeenCalledWith([{ productId: A, quantity: 3 }]);
  });

  it("does not release the stock", async () => {
    await service.checkout(request());

    expect(catalog.release).not.toHaveBeenCalled();
  });

  it("returns the saved order", async () => {
    await expect(service.checkout(request())).resolves.toMatchObject({ _id: "order-1" });
  });
});

describe("rejected input", () => {
  it.each([
    ["undefined", undefined],
    ["an empty list", []],
    ["a non-array", "x"],
    ["a malformed id", [{ productId: "x", quantity: 1 }]],
    ["a numeric id", [{ productId: 5, quantity: 1 }]],
    ["a zero quantity", [{ productId: A, quantity: 0 }]],
    ["a negative quantity", [{ productId: A, quantity: -1 }]],
    ["a fractional quantity", [{ productId: A, quantity: 1.5 }]],
    ["a string quantity", [{ productId: A, quantity: "1" }]],
    ["a missing item", [undefined]],
  ])("answers 400 for items that are %s", async (_case, items) => {
    await expect(service.checkout({ ...request(), items })).rejects.toMatchObject({ status: 400 });
    expect(steps).toEqual([]);
  });

  it.each([[undefined], [""], [7]])("answers 400 for nonce %j", async (nonce) => {
    await expect(service.checkout({ ...request(), nonce })).rejects.toMatchObject({ status: 400 });
    expect(steps).toEqual([]);
  });
});

describe("before the reservation", () => {
  it("answers 404 for an unknown product and reserves nothing", async () => {
    const unknown = "64b0000000000000000000ff";

    await expect(
      service.checkout(request([{ productId: unknown, quantity: 1 }]))
    ).rejects.toMatchObject({ status: 404, details: { productId: unknown } });
    expect(catalog.reserve).not.toHaveBeenCalled();
  });

  it("does not charge when the reservation fails and has nothing to release", async () => {
    catalog.reserve = record("reserve", async () => {
      throw new CheckoutError(409, "Not enough stock", { productId: A });
    });

    await expect(service.checkout(request())).rejects.toMatchObject({ status: 409 });
    expect(payments.charge).not.toHaveBeenCalled();
    expect(catalog.release).not.toHaveBeenCalled();
  });
});

describe("after the reservation", () => {
  it("releases the stock once when the payment is declined", async () => {
    payments.charge = record("charge", async () => ({ success: false, message: "Do Not Honor" }));

    await expect(service.checkout(request())).rejects.toMatchObject({
      status: 402,
      message: "Do Not Honor",
    });
    expect(steps).toEqual(["products", "reserve", "charge", "release"]);
    expect(catalog.release).toHaveBeenCalledWith([{ productId: A, quantity: 2 }]);
    expect(orders.create).not.toHaveBeenCalled();
  });

  it("uses a default message for a declined payment without one", async () => {
    payments.charge = record("charge", async () => ({ success: false }));

    await expect(service.checkout(request())).rejects.toThrow("Payment declined");
  });

  it("releases the stock when the payment service fails", async () => {
    payments.charge = record("charge", async () => {
      throw new UpstreamError("payments");
    });

    await expect(service.checkout(request())).rejects.toMatchObject({ status: 502 });
    expect(catalog.release).toHaveBeenCalledTimes(1);
    expect(orders.create).not.toHaveBeenCalled();
  });

  it("releases the stock and does not charge for a zero total", async () => {
    catalog.productsByIds = record("products", async () => [{ _id: A, name: "Free", price: 0 }]);

    await expect(service.checkout(request())).rejects.toMatchObject({ status: 400 });
    expect(payments.charge).not.toHaveBeenCalled();
    expect(catalog.release).toHaveBeenCalledTimes(1);
  });

  it("keeps the original error when the release also fails", async () => {
    payments.charge = record("charge", async () => ({ success: false, message: "Declined" }));
    catalog.release = record("release", async () => {
      throw new UpstreamError("catalog");
    });

    await expect(service.checkout(request())).rejects.toMatchObject({ status: 402 });
  });
});

describe("after the payment", () => {
  it("keeps the reservation and reports the transaction when saving fails", async () => {
    orders.create = record("save", async () => {
      throw new Error("db down");
    });

    await expect(service.checkout(request())).rejects.toMatchObject({
      status: 500,
      details: { transactionId: "tx-1" },
    });
    expect(catalog.release).not.toHaveBeenCalled();
  });
});
