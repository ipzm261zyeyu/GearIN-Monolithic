import { InsufficientStockError, NotFoundError, ValidationError } from "../errors.js";
import { isValidId } from "../helpers/id.js";

const toTotals = (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    throw new ValidationError("items must be a non-empty array");
  }
  const totals = new Map();
  items.forEach(({ productId, quantity } = {}) => {
    if (!isValidId(productId)) {
      throw new ValidationError(`Invalid product id: ${productId}`);
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new ValidationError(`Invalid quantity for product ${productId}`);
    }
    totals.set(productId, (totals.get(productId) ?? 0) + quantity);
  });
  return [...totals];
};

export class StockService {
  #products;

  constructor(products) {
    this.#products = products;
  }

  async reserve(items) {
    const reserved = [];
    try {
      for (const [productId, quantity] of toTotals(items)) {
        const decreased = await this.#products.decreaseQuantity(productId, quantity);
        if (!decreased) {
          throw await this.#reservationError(productId);
        }
        reserved.push([productId, quantity]);
      }
    } catch (error) {
      await Promise.allSettled(
        reserved.map(([productId, quantity]) =>
          this.#products.increaseQuantity(productId, quantity)
        )
      );
      throw error;
    }
  }

  async #reservationError(productId) {
    const product = await this.#products.findById(productId);
    return product
      ? new InsufficientStockError("Not enough stock", productId)
      : new NotFoundError("Product not found", productId);
  }

  async release(items) {
    const missing = [];
    for (const [productId, quantity] of toTotals(items)) {
      const increased = await this.#products.increaseQuantity(productId, quantity);
      if (!increased) missing.push(productId);
    }
    return { missing };
  }
}
