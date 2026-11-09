import { CheckoutError, UpstreamError } from "../errors.js";
import { postJson } from "./http.js";

const SERVICE = "catalog";
const CLIENT_ERRORS = [400, 404, 409];

export class CatalogClient {
  #baseUrl;

  constructor(baseUrl) {
    this.#baseUrl = baseUrl;
  }

  async productsByIds(ids) {
    const { status, body } = await postJson(
      SERVICE,
      `${this.#baseUrl}/internal/products/by-ids`,
      { ids }
    );
    if (status !== 200) {
      throw new UpstreamError(SERVICE);
    }
    return body.products;
  }

  async reserve(items) {
    const { status, body } = await postJson(
      SERVICE,
      `${this.#baseUrl}/internal/stock/reserve`,
      { items }
    );
    if (CLIENT_ERRORS.includes(status)) {
      throw new CheckoutError(status, body.message, { productId: body.productId });
    }
    if (status !== 200) {
      throw new UpstreamError(SERVICE);
    }
  }

  async release(items) {
    const { status } = await postJson(
      SERVICE,
      `${this.#baseUrl}/internal/stock/release`,
      { items }
    );
    if (status !== 200) {
      throw new UpstreamError(SERVICE);
    }
  }
}
