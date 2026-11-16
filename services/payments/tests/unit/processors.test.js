import { describe, expect, it, jest } from "@jest/globals";
import { createPaymentProcessor } from "../../src/app.js";
import { BraintreePaymentProcessor } from "../../src/processors/BraintreePaymentProcessor.js";
import { FakePaymentProcessor } from "../../src/processors/FakePaymentProcessor.js";
import { PaymentProcessor } from "../../src/processors/PaymentProcessor.js";
import { BraintreeProvider } from "../../src/providers/BraintreeProvider.js";
import { FAKE_CLIENT_TOKEN, FakeProvider } from "../../src/providers/FakeProvider.js";

const CREDENTIALS = { merchantId: "m", publicKey: "pub", privateKey: "priv" };

class StubPaymentProcessor extends PaymentProcessor {
  constructor(provider) {
    super();
    this.createProvider = jest.fn(() => provider);
  }
}

describe("PaymentProcessor", () => {
  it("throws when createProvider is not overridden", () => {
    expect(() => new PaymentProcessor().createProvider()).toThrow(
      "createProvider is not implemented"
    );
  });

  it.each([
    ["processPayment", () => new PaymentProcessor().processPayment(40, "abc")],
    ["getClientToken", () => new PaymentProcessor().getClientToken()],
  ])("%s fails without a concrete creator", async (_name, call) => {
    await expect(call()).rejects.toThrow("createProvider is not implemented");
  });

  it("processPayment charges the created provider", async () => {
    const provider = { charge: jest.fn().mockResolvedValue({ success: true }) };

    await expect(new StubPaymentProcessor(provider).processPayment(40, "abc")).resolves.toEqual({
      success: true,
    });
    expect(provider.charge).toHaveBeenCalledWith({ amount: 40, nonce: "abc" });
  });

  it("getClientToken asks the created provider", async () => {
    const provider = { getClientToken: jest.fn().mockResolvedValue({ clientToken: "t" }) };

    await expect(new StubPaymentProcessor(provider).getClientToken()).resolves.toEqual({
      clientToken: "t",
    });
  });

  it("creates the provider once and reuses it", async () => {
    const provider = {
      charge: jest.fn().mockResolvedValue({ success: true }),
      getClientToken: jest.fn().mockResolvedValue({}),
    };
    const processor = new StubPaymentProcessor(provider);

    await processor.getClientToken();
    await processor.processPayment(1, "n");
    await processor.processPayment(2, "n");

    expect(processor.createProvider).toHaveBeenCalledTimes(1);
  });
});

describe("concrete creators", () => {
  it("BraintreePaymentProcessor creates a BraintreeProvider", () => {
    const processor = new BraintreePaymentProcessor(CREDENTIALS);

    expect(processor).toBeInstanceOf(PaymentProcessor);
    expect(processor.createProvider()).toBeInstanceOf(BraintreeProvider);
  });

  it("FakePaymentProcessor creates a FakeProvider", () => {
    const processor = new FakePaymentProcessor();

    expect(processor).toBeInstanceOf(PaymentProcessor);
    expect(processor.createProvider()).toBeInstanceOf(FakeProvider);
  });

  it("FakePaymentProcessor serves the fake client token", async () => {
    await expect(new FakePaymentProcessor().getClientToken()).resolves.toEqual({
      success: true,
      clientToken: FAKE_CLIENT_TOKEN,
    });
  });
});

describe("createPaymentProcessor", () => {
  it("returns FakePaymentProcessor for fake", () => {
    expect(createPaymentProcessor({ paymentProvider: "fake", braintree: null })).toBeInstanceOf(
      FakePaymentProcessor
    );
  });

  it("returns BraintreePaymentProcessor for braintree", () => {
    expect(
      createPaymentProcessor({ paymentProvider: "braintree", braintree: CREDENTIALS })
    ).toBeInstanceOf(BraintreePaymentProcessor);
  });

  it("creates a new processor on every call", () => {
    const config = { paymentProvider: "fake", braintree: null };

    expect(createPaymentProcessor(config)).not.toBe(createPaymentProcessor(config));
  });

  it.each(["paypal", "constructor", "__proto__", undefined])(
    "rejects provider %s",
    (paymentProvider) => {
      expect(() => createPaymentProcessor({ paymentProvider })).toThrow(
        "Unknown payment provider"
      );
    }
  );
});
