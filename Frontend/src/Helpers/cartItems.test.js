import { toOrderItems } from "./cartItems";

describe("toOrderItems", () => {
  it("sends only the id and the quantity", () => {
    const cart = [{ _id: "a", name: "Mouse", price: 10, description: "Text" }];

    expect(toOrderItems(cart)).toEqual([{ productId: "a", quantity: 1 }]);
  });

  it("turns repeated products into a quantity", () => {
    const cart = [{ _id: "a" }, { _id: "b" }, { _id: "a" }];

    expect(toOrderItems(cart)).toEqual([
      { productId: "a", quantity: 2 },
      { productId: "b", quantity: 1 },
    ]);
  });

  it("returns nothing for an empty cart", () => {
    expect(toOrderItems([])).toEqual([]);
  });
});
