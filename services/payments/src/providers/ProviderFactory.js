import { Config } from "../config.js";
import { BraintreeProvider } from "./BraintreeProvider.js";
import { FakeProvider } from "./FakeProvider.js";

const CREATORS = new Map([
  ["braintree", (config) => new BraintreeProvider(config.braintree)],
  ["fake", () => new FakeProvider()],
]);

export class ProviderFactory {
  static create(config = Config.getInstance()) {
    const creator = CREATORS.get(config.paymentProvider);
    if (!creator) {
      throw new Error(`Unknown payment provider "${config.paymentProvider}"`);
    }
    return creator(config);
  }
}
