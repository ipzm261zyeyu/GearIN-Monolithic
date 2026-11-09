import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { Config } from "../src/config.js";

const savedEnv = { ...process.env };
const KEYS = ["BRAINTREE_MERCHANT_ID", "BRAINTREE_PUBLIC_KEY", "BRAINTREE_PRIVATE_KEY"];

beforeEach(() => {
  KEYS.forEach((name) => delete process.env[name]);
  process.env.PORT = "4003";
  process.env.PAYMENT_PROVIDER = "fake";
  Config.reset();
});

afterEach(() => {
  process.env = { ...savedEnv };
  Config.reset();
});

const useBraintree = () => {
  process.env.PAYMENT_PROVIDER = "braintree";
  KEYS.forEach((name) => {
    process.env[name] = name.toLowerCase();
  });
};

describe("Config", () => {
  it("needs no Braintree keys for the fake provider", () => {
    expect(Config.getInstance()).toMatchObject({
      port: 4003,
      paymentProvider: "fake",
      braintree: null,
    });
  });

  it("reads the Braintree keys for the braintree provider", () => {
    useBraintree();

    expect(Config.getInstance().braintree).toEqual({
      merchantId: "braintree_merchant_id",
      publicKey: "braintree_public_key",
      privateKey: "braintree_private_key",
    });
  });

  it.each(KEYS)("requires %s for the braintree provider", (name) => {
    useBraintree();
    delete process.env[name];

    expect(() => Config.getInstance()).toThrow(`${name} is required`);
  });

  it("returns one instance and reads env once", () => {
    const first = Config.getInstance();
    process.env.PAYMENT_PROVIDER = "braintree";

    expect(Config.getInstance()).toBe(first);
    expect(first.paymentProvider).toBe("fake");
  });

  it("is immutable", () => {
    useBraintree();
    const config = Config.getInstance();

    expect(() => {
      config.paymentProvider = "fake";
    }).toThrow(TypeError);
    expect(() => {
      config.braintree.merchantId = "x";
    }).toThrow(TypeError);
  });

  it("cannot be constructed directly", () => {
    expect(() => new Config()).toThrow("Use Config.getInstance()");
  });

  it("allows reset only in tests", () => {
    process.env.NODE_ENV = "production";

    expect(() => Config.reset()).toThrow("only in tests");
    process.env.NODE_ENV = "test";
  });

  it.each([[undefined], ["paypal"], ["constructor"], [""]])("rejects PAYMENT_PROVIDER %s", (value) => {
    if (value === undefined) delete process.env.PAYMENT_PROVIDER;
    else process.env.PAYMENT_PROVIDER = value;

    expect(() => Config.getInstance()).toThrow("PAYMENT_PROVIDER must be one of");
  });

  it.each(["0", "abc", "70000"])("rejects PORT %s", (value) => {
    process.env.PORT = value;

    expect(() => Config.getInstance()).toThrow("PORT must be");
  });
});
