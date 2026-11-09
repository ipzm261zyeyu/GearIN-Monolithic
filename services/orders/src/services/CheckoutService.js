import { orderTotal } from "../domain/money.js";
import { OrderBuilder } from "../domain/OrderBuilder.js";
import { CheckoutError } from "../errors.js";

const OBJECT_ID = /^[a-f\d]{24}$/i;

const toLines = (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    throw new CheckoutError(400, "items must be a non-empty array");
  }
  const totals = new Map();
  items.forEach(({ productId, quantity } = {}) => {
    if (typeof productId !== "string" || !OBJECT_ID.test(productId)) {
      throw new CheckoutError(400, `Invalid product id: ${productId}`);
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new CheckoutError(400, `Invalid quantity for product ${productId}`);
    }
    totals.set(productId, (totals.get(productId) ?? 0) + quantity);
  });
  return [...totals].map(([productId, quantity]) => ({ productId, quantity }));
};

export class CheckoutService {
  #catalog;

  #payments;

  #orders;

  constructor({ catalog, payments, orders }) {
    this.#catalog = catalog;
    this.#payments = payments;
    this.#orders = orders;
  }

  async checkout({ buyerId, items, nonce }) {
    const lines = toLines(items);
    if (typeof nonce !== "string" || nonce.length === 0) {
      throw new CheckoutError(400, "nonce is required");
    }

    const snapshot = await this.#snapshot(lines);
    await this.#catalog.reserve(lines);

    const builder = new OrderBuilder().forBuyer(buyerId);
    snapshot.forEach((item) => builder.addItem(item));

    let charge;
    try {
      const amount = orderTotal(snapshot);
      if (amount <= 0) {
        throw new CheckoutError(400, "Order total must be positive");
      }
      builder.withAmount(amount).validate();
      charge = await this.#payments.charge({ amount, nonce });
      if (!charge.success) {
        throw new CheckoutError(402, charge.message ?? "Payment declined");
      }
    } catch (error) {
      await this.#releaseQuietly(lines);
      throw error;
    }

    return this.#save(builder, charge);
  }

  async #snapshot(lines) {
    const products = await this.#catalog.productsByIds(
      lines.map((line) => line.productId)
    );
    const byId = new Map(products.map((product) => [String(product._id), product]));
    return lines.map(({ productId, quantity }) => {
      const product = byId.get(productId);
      if (!product) {
        throw new CheckoutError(404, "Product not found", { productId });
      }
      return { productId, name: product.name, price: product.price, quantity };
    });
  }

  async #releaseQuietly(lines) {
    try {
      await this.#catalog.release(lines);
    } catch (error) {
      console.error("Could not release reserved stock", lines, error);
    }
  }

  async #save(builder, charge) {
    try {
      const order = builder.withTransactionId(charge.transactionId).build();
      return await this.#orders.create({
        ...order,
        payment: { success: true, details: charge.details },
      });
    } catch (error) {
      console.error("Order not saved after payment", charge.transactionId, error);
      throw new CheckoutError(500, "Payment was taken but the order could not be saved", {
        transactionId: charge.transactionId,
      });
    }
  }
}
