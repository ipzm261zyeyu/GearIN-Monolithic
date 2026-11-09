import { describe, expect, it } from "@jest/globals";
import { ProductQueryBuilder } from "../../src/domain/ProductQueryBuilder.js";

const build = (configure) => configure(new ProductQueryBuilder()).build();

describe("ProductQueryBuilder", () => {
  it("builds an open query by default", () => {
    expect(new ProductQueryBuilder().build()).toEqual({
      categories: [],
      minPrice: undefined,
      maxPrice: undefined,
      keyword: undefined,
      excludeId: undefined,
      skip: 0,
      limit: undefined,
      newestFirst: false,
      includePhoto: false,
      populateCategory: false,
    });
  });

  it("is fluent", () => {
    const builder = new ProductQueryBuilder();

    expect(builder.inCategories(["a"]).priceBetween(1, 2).matchingKeyword("x")).toBe(builder);
  });

  it("returns a frozen query that later calls cannot change", () => {
    const builder = new ProductQueryBuilder().inCategories(["a"]);
    const query = builder.build();

    builder.inCategories(["b"]);

    expect(Object.isFrozen(query)).toBe(true);
    expect(query.categories).toEqual(["a"]);
  });

  describe("categories", () => {
    it("accepts a list", () => {
      expect(build((b) => b.inCategories(["a", "b"])).categories).toEqual(["a", "b"]);
    });

    it("accepts a single value", () => {
      expect(build((b) => b.inCategories("a")).categories).toEqual(["a"]);
    });

    it.each([[undefined], [null], [""], [[]]])("ignores %j", (value) => {
      expect(build((b) => b.inCategories(value)).categories).toEqual([]);
    });
  });

  describe("price range", () => {
    it("keeps both bounds", () => {
      expect(build((b) => b.priceBetween(10, 50))).toMatchObject({ minPrice: 10, maxPrice: 50 });
    });

    it("keeps a lower bound of zero", () => {
      expect(build((b) => b.priceBetween(0, 50)).minPrice).toBe(0);
    });

    it("accepts numeric strings", () => {
      expect(build((b) => b.priceBetween("10", "50"))).toMatchObject({ minPrice: 10, maxPrice: 50 });
    });

    it("allows one open bound", () => {
      expect(build((b) => b.priceBetween(undefined, 50))).toMatchObject({
        minPrice: undefined,
        maxPrice: 50,
      });
    });

    it.each([[undefined], [null], [""], ["abc"], [NaN]])("treats %j as missing", (value) => {
      expect(build((b) => b.priceBetween(value, value))).toMatchObject({
        minPrice: undefined,
        maxPrice: undefined,
      });
    });
  });

  describe("keyword", () => {
    it("keeps the keyword", () => {
      expect(build((b) => b.matchingKeyword("mouse")).keyword).toBe("mouse");
    });

    it.each([[undefined], [null], [""], [42]])("ignores %j", (value) => {
      expect(build((b) => b.matchingKeyword(value)).keyword).toBeUndefined();
    });
  });

  describe("page", () => {
    it("starts at the beginning for the first page", () => {
      expect(build((b) => b.page(1))).toMatchObject({ skip: 0, limit: 6 });
    });

    it("skips earlier pages", () => {
      expect(build((b) => b.page(3))).toMatchObject({ skip: 12, limit: 6 });
    });

    it("accepts a numeric string and a custom size", () => {
      expect(build((b) => b.page("2", 10))).toMatchObject({ skip: 10, limit: 10 });
    });

    it.each([[undefined], [null], ["abc"], [0], [-2], [1.5]])("falls back to page one for %j", (value) => {
      expect(build((b) => b.page(value))).toMatchObject({ skip: 0, limit: 6 });
    });
  });

  it("collects the remaining options", () => {
    const query = build((b) =>
      b.limit(3).excluding("id").newestFirst().withPhoto().withCategory()
    );

    expect(query).toMatchObject({
      limit: 3,
      excludeId: "id",
      newestFirst: true,
      includePhoto: true,
      populateCategory: true,
    });
  });

  it("ignores a missing excluded id", () => {
    expect(build((b) => b.excluding("")).excludeId).toBeUndefined();
  });
});
