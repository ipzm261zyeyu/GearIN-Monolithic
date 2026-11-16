export class PaymentProcessor {
  #provider = null;

  createProvider() {
    throw new Error("createProvider is not implemented");
  }

  #getProvider() {
    this.#provider ??= this.createProvider();
    return this.#provider;
  }

  async processPayment(amount, nonce) {
    return this.#getProvider().charge({ amount, nonce });
  }

  async getClientToken() {
    return this.#getProvider().getClientToken();
  }
}
