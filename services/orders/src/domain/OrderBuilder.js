import { OrderValidationError } from "../errors.js";
import { orderTotal, toCents } from "./money.js";

export const ORDER_STATUSES = ["Not Processed", "Processing", "Shipped", "Delivered", "Cancel"];

const isValidItem = ({ productId, name, price, quantity }) =>
  Boolean(productId) &&
  Boolean(name) &&
  Number.isFinite(price) &&
  price >= 0 &&
  Number.isInteger(quantity) &&
  quantity > 0;

export class OrderBuilder {
  #buyer;

  #items = [];

  #amount;

  #transactionId;

  #status = ORDER_STATUSES[0];

  forBuyer(buyer) {
    this.#buyer = buyer;
    return this;
  }

  addItem({ productId, name, price, quantity }) {
    this.#items.push({ productId, name, price, quantity });
    return this;
  }

  withAmount(amount) {
    this.#amount = amount;
    return this;
  }

  withTransactionId(transactionId) {
    this.#transactionId = transactionId;
    return this;
  }

  withStatus(status) {
    this.#status = status;
    return this;
  }

  validate() {
    if (!this.#buyer) {
      throw new OrderValidationError("Order needs a buyer");
    }
    if (this.#items.length === 0) {
      throw new OrderValidationError("Order needs at least one item");
    }
    if (!this.#items.every(isValidItem)) {
      throw new OrderValidationError("Order has an invalid item");
    }
    if (
      !Number.isFinite(this.#amount) ||
      toCents(this.#amount) !== toCents(orderTotal(this.#items))
    ) {
      throw new OrderValidationError("Order amount does not match its items");
    }
    if (!ORDER_STATUSES.includes(this.#status)) {
      throw new OrderValidationError(`Unknown order status: ${this.#status}`);
    }
    return this;
  }

  build() {
    this.validate();
    if (!this.#transactionId) {
      throw new OrderValidationError("Order needs a transaction id");
    }
    return Object.freeze({
      buyer: this.#buyer,
      items: Object.freeze(this.#items.map((item) => Object.freeze({ ...item }))),
      amount: this.#amount,
      transactionId: this.#transactionId,
      status: this.#status,
    });
  }
}
