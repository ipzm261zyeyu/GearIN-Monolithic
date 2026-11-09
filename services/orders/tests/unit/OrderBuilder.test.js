import { describe, expect, it } from "@jest/globals";
import { orderTotal } from "../../src/domain/money.js";
import { ORDER_STATUSES, OrderBuilder } from "../../src/domain/OrderBuilder.js";
import { OrderValidationError } from "../../src/errors.js";

const ITEM = { productId: "p1", name: "Mouse", price: 10.5, quantity: 2 };

const complete = () =>
  new OrderBuilder().forBuyer("u1").addItem(ITEM).withAmount(21).withTransactionId("tx-1");

describe("orderTotal", () => {
  it("multiplies price by quantity", () => {
    expect(orderTotal([ITEM, { price: 1, quantity: 3 }])).toBe(24);
  });

  it("does not accumulate binary rounding errors", () => {
    expect(orderTotal([{ price: 0.1, quantity: 1 }, { price: 0.2, quantity: 1 }])).toBe(0.3);
    expect(orderTotal([{ price: 19.99, quantity: 3 }])).toBe(59.97);
  });

  it("is zero for no items", () => {
    expect(orderTotal([])).toBe(0);
  });
});

describe("OrderBuilder", () => {
  it("builds a complete order with the default status", () => {
    expect(complete().build()).toEqual({
      buyer: "u1",
      items: [ITEM],
      amount: 21,
      transactionId: "tx-1",
      status: "Not Processed",
    });
  });

  it("is fluent", () => {
    const builder = new OrderBuilder();

    expect(builder.forBuyer("u").addItem(ITEM).withAmount(1).withStatus("Shipped")).toBe(builder);
  });

  it("keeps only the snapshot fields of an item", () => {
    const order = complete();
    order.addItem({ ...ITEM, productId: "p2", quantity: 1, photo: "x", description: "y" });
    order.withAmount(31.5);

    expect(Object.keys(order.build().items[1]).sort()).toEqual([
      "name",
      "price",
      "productId",
      "quantity",
    ]);
  });

  it("returns an immutable order", () => {
    const order = complete().build();

    expect(Object.isFrozen(order)).toBe(true);
    expect(Object.isFrozen(order.items)).toBe(true);
    expect(Object.isFrozen(order.items[0])).toBe(true);
  });

  it("does not change an order already built", () => {
    const builder = complete();
    const first = builder.build();

    builder.addItem({ ...ITEM, productId: "p2" }).withAmount(42);

    expect(first.items).toHaveLength(1);
  });

  it("accepts every known status", () => {
    ORDER_STATUSES.forEach((status) => {
      expect(complete().withStatus(status).build().status).toBe(status);
    });
  });

  it("accepts amounts equal to the cent", () => {
    const order = new OrderBuilder()
      .forBuyer("u")
      .addItem({ productId: "a", name: "A", price: 0.1, quantity: 1 })
      .addItem({ productId: "b", name: "B", price: 0.2, quantity: 1 })
      .withAmount(0.1 + 0.2)
      .withTransactionId("t");

    expect(order.build().amount).toBeCloseTo(0.3);
  });

  it.each([
    ["no items", () => new OrderBuilder().forBuyer("u").withAmount(0).withTransactionId("t"), "at least one item"],
    ["no buyer", () => new OrderBuilder().addItem(ITEM).withAmount(21).withTransactionId("t"), "needs a buyer"],
    ["no amount", () => new OrderBuilder().forBuyer("u").addItem(ITEM).withTransactionId("t"), "does not match"],
    ["a different amount", () => complete().withAmount(20.99), "does not match"],
    ["an amount that is not a number", () => complete().withAmount("21"), "does not match"],
    ["no transaction id", () => complete().withTransactionId(undefined), "transaction id"],
    ["an unknown status", () => complete().withStatus("Lost"), "Unknown order status"],
  ])("rejects %s", (_case, create, message) => {
    expect(() => create().build()).toThrow(OrderValidationError);
    expect(() => create().build()).toThrow(message);
  });

  it.each([
    ["a missing product id", { productId: undefined }],
    ["a missing name", { name: "" }],
    ["a negative price", { price: -1 }],
    ["a price that is not a number", { price: "10" }],
    ["a zero quantity", { quantity: 0 }],
    ["a fractional quantity", { quantity: 1.5 }],
  ])("rejects an item with %s", (_case, change) => {
    const builder = new OrderBuilder()
      .forBuyer("u")
      .addItem({ ...ITEM, ...change })
      .withAmount(21)
      .withTransactionId("t");

    expect(() => builder.build()).toThrow("invalid item");
  });

  describe("validate", () => {
    it("passes before the transaction id is known", () => {
      const builder = new OrderBuilder().forBuyer("u").addItem(ITEM).withAmount(21);

      expect(builder.validate()).toBe(builder);
    });

    it("fails on a wrong amount before any payment", () => {
      const builder = new OrderBuilder().forBuyer("u").addItem(ITEM).withAmount(1);

      expect(() => builder.validate()).toThrow("does not match");
    });
  });
});
