import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { BraintreeProvider } from "../../src/providers/BraintreeProvider.js";
import {
  FAKE_CLIENT_TOKEN,
  FAKE_DECLINED_NONCE,
  FakeProvider,
} from "../../src/providers/FakeProvider.js";
import { PaymentProvider } from "../../src/providers/PaymentProvider.js";
import { ProviderFactory } from "../../src/providers/ProviderFactory.js";

const CREDENTIALS = { merchantId: "m", publicKey: "pub", privateKey: "priv" };

describe("PaymentProvider", () => {
  it.each(["getClientToken", "charge"])("%s must be implemented", async (method) => {
    await expect(new PaymentProvider()[method]()).rejects.toThrow("not implemented");
  });

  it.each([
    ["BraintreeProvider", BraintreeProvider],
    ["FakeProvider", FakeProvider],
  ])("%s implements the interface", (_name, Provider) => {
    expect(Provider.prototype).toBeInstanceOf(PaymentProvider);
    expect(Object.hasOwn(Provider.prototype, "getClientToken")).toBe(true);
    expect(Object.hasOwn(Provider.prototype, "charge")).toBe(true);
  });
});

describe("ProviderFactory", () => {
  it("returns FakeProvider for fake", () => {
    expect(ProviderFactory.create({ paymentProvider: "fake", braintree: null })).toBeInstanceOf(
      FakeProvider
    );
  });

  it("returns BraintreeProvider for braintree", () => {
    expect(
      ProviderFactory.create({ paymentProvider: "braintree", braintree: CREDENTIALS })
    ).toBeInstanceOf(BraintreeProvider);
  });

  it("creates a new provider on every call", () => {
    const config = { paymentProvider: "fake", braintree: null };

    expect(ProviderFactory.create(config)).not.toBe(ProviderFactory.create(config));
  });

  it.each(["paypal", "constructor", "__proto__", undefined])("rejects provider %s", (paymentProvider) => {
    expect(() => ProviderFactory.create({ paymentProvider })).toThrow("Unknown payment provider");
  });
});

describe("FakeProvider", () => {
  const provider = new FakeProvider();

  it("always returns the same client token", async () => {
    const first = await provider.getClientToken();

    expect(first).toEqual({ success: true, clientToken: FAKE_CLIENT_TOKEN });
    expect(await new FakeProvider().getClientToken()).toEqual(first);
  });

  it("returns the same result for the same charge", async () => {
    const first = await provider.charge({ amount: 40, nonce: "abc" });

    expect(first.success).toBe(true);
    expect(await provider.charge({ amount: 40, nonce: "abc" })).toEqual(first);
    expect(await new FakeProvider().charge({ amount: 40, nonce: "abc" })).toEqual(first);
  });

  it("has a stable transaction id across runs", async () => {
    const { transactionId } = await provider.charge({ amount: 40, nonce: "abc" });

    expect(transactionId).toBe("fake-9d52109be5e622a8");
  });

  it("treats equal amounts as equal", async () => {
    expect((await provider.charge({ amount: 10, nonce: "n" })).transactionId).toBe(
      (await provider.charge({ amount: 10.0, nonce: "n" })).transactionId
    );
  });

  it.each([
    [{ amount: 41, nonce: "abc" }],
    [{ amount: 40, nonce: "abd" }],
  ])("gives a different id for different input %j", async (input) => {
    const base = await provider.charge({ amount: 40, nonce: "abc" });

    expect((await provider.charge(input)).transactionId).not.toBe(base.transactionId);
  });

  it("declines the agreed nonce every time", async () => {
    const declined = { amount: 40, nonce: FAKE_DECLINED_NONCE };

    expect(await provider.charge(declined)).toEqual({
      success: false,
      transactionId: null,
      message: "Declined",
      details: { fake: true },
    });
    expect(await provider.charge(declined)).toEqual(await provider.charge(declined));
  });
});

describe("BraintreeProvider", () => {
  let sdk;
  let client;

  beforeEach(() => {
    client = {
      clientToken: { generate: jest.fn() },
      transaction: { sale: jest.fn() },
    };
    sdk = {
      BraintreeGateway: jest.fn(() => client),
      Environment: { Sandbox: "sandbox" },
    };
  });

  it("creates the client once, with the given keys", () => {
    new BraintreeProvider(CREDENTIALS, sdk);

    expect(sdk.BraintreeGateway).toHaveBeenCalledTimes(1);
    expect(sdk.BraintreeGateway).toHaveBeenCalledWith({
      environment: "sandbox",
      merchantId: "m",
      publicKey: "pub",
      privateKey: "priv",
    });
  });

  it("returns the generated token", async () => {
    client.clientToken.generate.mockImplementation((_options, callback) =>
      callback(null, { success: true, clientToken: "real" })
    );

    await expect(new BraintreeProvider(CREDENTIALS, sdk).getClientToken()).resolves.toEqual({
      success: true,
      clientToken: "real",
    });
  });

  it("rejects when the token cannot be generated", async () => {
    client.clientToken.generate.mockImplementation((_options, callback) =>
      callback({ type: "authenticationError" })
    );

    await expect(new BraintreeProvider(CREDENTIALS, sdk).getClientToken()).rejects.toEqual({
      type: "authenticationError",
    });
  });

  it("rejects when the client throws", async () => {
    client.clientToken.generate.mockImplementation(() => {
      throw new Error("gateway down");
    });

    await expect(new BraintreeProvider(CREDENTIALS, sdk).getClientToken()).rejects.toThrow(
      "gateway down"
    );
  });

  it("charges with two decimals and settles the sale", async () => {
    client.transaction.sale.mockImplementation((_args, callback) =>
      callback(null, { success: true, transaction: { id: "tx-1" } })
    );

    const result = await new BraintreeProvider(CREDENTIALS, sdk).charge({
      amount: 0.1 + 0.2,
      nonce: "nonce",
    });

    expect(client.transaction.sale.mock.calls[0][0]).toEqual({
      amount: "0.30",
      paymentMethodNonce: "nonce",
      options: { submitForSettlement: true },
    });
    expect(result).toEqual({
      success: true,
      transactionId: "tx-1",
      message: null,
      details: { success: true, transaction: { id: "tx-1" } },
    });
  });

  it("reports a declined sale without throwing", async () => {
    client.transaction.sale.mockImplementation((_args, callback) =>
      callback(null, { success: false, message: "Do Not Honor" })
    );

    await expect(
      new BraintreeProvider(CREDENTIALS, sdk).charge({ amount: 1, nonce: "n" })
    ).resolves.toMatchObject({ success: false, transactionId: null, message: "Do Not Honor" });
  });

  it("rejects when the sale fails", async () => {
    client.transaction.sale.mockImplementation((_args, callback) =>
      callback({ type: "unexpectedError" })
    );

    await expect(
      new BraintreeProvider(CREDENTIALS, sdk).charge({ amount: 1, nonce: "n" })
    ).rejects.toEqual({ type: "unexpectedError" });
  });
});
