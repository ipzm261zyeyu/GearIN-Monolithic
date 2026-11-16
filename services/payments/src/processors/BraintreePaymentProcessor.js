import { BraintreeProvider } from "../providers/BraintreeProvider.js";
import { PaymentProcessor } from "./PaymentProcessor.js";

export class BraintreePaymentProcessor extends PaymentProcessor {
  #credentials;

  constructor(credentials) {
    super();
    this.#credentials = credentials;
  }

  createProvider() {
    return new BraintreeProvider(this.#credentials);
  }
}
