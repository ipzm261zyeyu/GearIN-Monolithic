import braintree from "braintree";
import { PaymentProvider } from "./PaymentProvider.js";

export class BraintreeProvider extends PaymentProvider {
  #gateway;

  constructor({ merchantId, publicKey, privateKey }, sdk = braintree) {
    super();
    this.#gateway = new sdk.BraintreeGateway({
      environment: sdk.Environment.Sandbox,
      merchantId,
      publicKey,
      privateKey,
    });
  }

  getClientToken() {
    return new Promise((resolve, reject) => {
      this.#gateway.clientToken.generate({}, (error, response) =>
        error ? reject(error) : resolve(response)
      );
    });
  }

  charge({ amount, nonce }) {
    return new Promise((resolve, reject) => {
      this.#gateway.transaction.sale(
        {
          amount: amount.toFixed(2),
          paymentMethodNonce: nonce,
          options: { submitForSettlement: true },
        },
        (error, result) =>
          error
            ? reject(error)
            : resolve({
                success: result.success,
                transactionId: result.transaction?.id ?? null,
                message: result.message ?? null,
                details: result,
              })
      );
    });
  }
}
