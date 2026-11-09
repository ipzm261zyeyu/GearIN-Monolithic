import { UpstreamError } from "../errors.js";
import { postJson } from "./http.js";

const SERVICE = "payments";
const ANSWERED = [200, 402];

export class PaymentsClient {
  #baseUrl;

  constructor(baseUrl) {
    this.#baseUrl = baseUrl;
  }

  async charge({ amount, nonce }) {
    const { status, body } = await postJson(
      SERVICE,
      `${this.#baseUrl}/internal/charge`,
      { amount, nonce }
    );
    if (!ANSWERED.includes(status)) {
      throw new UpstreamError(SERVICE);
    }
    return body;
  }
}
