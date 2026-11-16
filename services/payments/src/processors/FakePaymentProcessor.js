import { FakeProvider } from "../providers/FakeProvider.js";
import { PaymentProcessor } from "./PaymentProcessor.js";

export class FakePaymentProcessor extends PaymentProcessor {
  createProvider() {
    return new FakeProvider();
  }
}
