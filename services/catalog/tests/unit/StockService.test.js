import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { InsufficientStockError, NotFoundError } from "../../src/errors.js";
import { StockService } from "../../src/services/StockService.js";
import { InMemoryStorageFactory } from "../../src/storage/InMemoryStorageFactory.js";

const CATEGORY = "64b000000000000000000001";
const UNKNOWN = "64b0000000000000000000ff";

let products;
let stock;

const createProduct = (quantity) =>
  products.create({
    name: "Mouse",
    slug: `mouse-${quantity}-${Math.random()}`,
    description: "Fast",
    price: 10,
    category: CATEGORY,
    quantity,
  });

const quantityOf = async (id) => (await products.findById(id)).quantity;

beforeEach(() => {
  products = new InMemoryStorageFactory().createProductRepository();
  stock = new StockService(products);
});

describe("StockService.reserve", () => {
  it("decreases the stock of every item", async () => {
    const a = await createProduct(5);
    const b = await createProduct(3);

    await stock.reserve([
      { productId: a._id, quantity: 2 },
      { productId: b._id, quantity: 3 },
    ]);

    expect(await quantityOf(a._id)).toBe(3);
    expect(await quantityOf(b._id)).toBe(0);
  });

  it("adds up repeated products before checking the stock", async () => {
    const a = await createProduct(3);

    await expect(
      stock.reserve([
        { productId: a._id, quantity: 2 },
        { productId: a._id, quantity: 2 },
      ])
    ).rejects.toBeInstanceOf(InsufficientStockError);
    expect(await quantityOf(a._id)).toBe(3);
  });

  it("restores earlier items when a later one is out of stock", async () => {
    const a = await createProduct(5);
    const b = await createProduct(1);

    await expect(
      stock.reserve([
        { productId: a._id, quantity: 2 },
        { productId: b._id, quantity: 2 },
      ])
    ).rejects.toMatchObject({ status: 409, productId: b._id });

    expect(await quantityOf(a._id)).toBe(5);
    expect(await quantityOf(b._id)).toBe(1);
  });

  it("restores earlier items when a later product does not exist", async () => {
    const a = await createProduct(5);

    await expect(
      stock.reserve([
        { productId: a._id, quantity: 2 },
        { productId: UNKNOWN, quantity: 1 },
      ])
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(await quantityOf(a._id)).toBe(5);
  });

  it("restores earlier items when storage fails", async () => {
    const a = await createProduct(5);
    const b = await createProduct(5);
    const original = products.decreaseQuantity.bind(products);
    jest.spyOn(products, "decreaseQuantity").mockImplementation((id, quantity) => {
      if (id === b._id) throw new Error("db down");
      return original(id, quantity);
    });

    await expect(
      stock.reserve([
        { productId: a._id, quantity: 2 },
        { productId: b._id, quantity: 1 },
      ])
    ).rejects.toThrow("db down");

    expect(await quantityOf(a._id)).toBe(5);
  });

  it.each([
    ["undefined", undefined],
    ["an empty list", []],
    ["a non-array", { productId: "x" }],
    ["a malformed id", [{ productId: "x", quantity: 1 }]],
    ["a missing item", [undefined]],
  ])("rejects %s", async (_case, items) => {
    await expect(stock.reserve(items)).rejects.toMatchObject({ status: 400 });
  });

  it.each([[0], [-1], [1.5], ["2"], [undefined]])("rejects quantity %j", async (quantity) => {
    const a = await createProduct(5);

    await expect(stock.reserve([{ productId: a._id, quantity }])).rejects.toMatchObject({
      status: 400,
    });
    expect(await quantityOf(a._id)).toBe(5);
  });
});

describe("StockService.release", () => {
  it("returns the stock", async () => {
    const a = await createProduct(1);

    await expect(stock.release([{ productId: a._id, quantity: 4 }])).resolves.toEqual({
      missing: [],
    });

    expect(await quantityOf(a._id)).toBe(5);
  });

  it("releases what exists and reports deleted products", async () => {
    const a = await createProduct(1);

    const result = await stock.release([
      { productId: UNKNOWN, quantity: 1 },
      { productId: a._id, quantity: 1 },
    ]);

    expect(result).toEqual({ missing: [UNKNOWN] });
    expect(await quantityOf(a._id)).toBe(2);
  });

  it("rejects a negative quantity", async () => {
    const a = await createProduct(1);

    await expect(stock.release([{ productId: a._id, quantity: -1 }])).rejects.toMatchObject({
      status: 400,
    });
  });
});
