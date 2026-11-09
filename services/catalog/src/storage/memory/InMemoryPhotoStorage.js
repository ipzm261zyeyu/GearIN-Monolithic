import { ValidationError } from "../../errors.js";
import { isValidId } from "../../helpers/id.js";

export class InMemoryPhotoStorage {
  #photos;

  #products;

  constructor({ photos, products }) {
    this.#photos = photos;
    this.#products = products;
  }

  async save(productId, photo) {
    if (this.#products.has(String(productId))) {
      this.#photos.set(String(productId), photo);
    }
  }

  async get(productId) {
    if (!isValidId(String(productId))) {
      throw new ValidationError(`Invalid id: ${productId}`);
    }
    return this.#photos.get(String(productId)) ?? null;
  }
}
