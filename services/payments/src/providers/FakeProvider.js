import crypto from "crypto";
import { PaymentProvider } from "./PaymentProvider.js";

export const FAKE_CLIENT_TOKEN = "fake-client-token";
export const FAKE_DECLINED_NONCE = "fake-declined-nonce";

export class FakeProvider extends PaymentProvider {
  async getClientToken() {
    return { success: true, clientToken: FAKE_CLIENT_TOKEN };
  }

  async charge({ amount, nonce }) {
    if (nonce === FAKE_DECLINED_NONCE) {
      return {
        success: false,
        transactionId: null,
        message: "Declined",
        details: { fake: true },
      };
    }
    const digest = crypto
      .createHash("sha256")
      .update(`${nonce}:${amount.toFixed(2)}`)
      .digest("hex");
    return {
      success: true,
      transactionId: `fake-${digest.slice(0, 16)}`,
      message: null,
      details: { fake: true },
    };
  }
}
