import { describe, expect, it } from "@jest/globals";
import { Product } from "../../src/domain/Product.js";
import { isValidId } from "../../src/helpers/id.js";

const CATEGORY = "64b000000000000000000001";

const record = {
  _id: "64b000000000000000000002",
  name: "Gaming Mouse",
  slug: "Gaming-Mouse",
  description: "Fast",
  price: 49,
  category: CATEGORY,
  quantity: 7,
  shipping: true,
  photo: { data: Buffer.from("x"), contentType: "image/png" },
};

const original = () => Product.fromRecord(record);

describe("Product.clone", () => {
  it("creates a copy with the same business fields", () => {
    const copy = original().clone().toRecord();

    expect(copy).toMatchObject({
      name: "Gaming Mouse",
      description: "Fast",
      price: 49,
      category: CATEGORY,
      quantity: 7,
      shipping: true,
    });
  });

  it("assigns a new valid id", () => {
    const copy = original().clone().toRecord();

    expect(copy._id).not.toBe(record._id);
    expect(isValidId(copy._id)).toBe(true);
  });

  it("assigns a new slug based on the name", () => {
    const copy = original().clone().toRecord();

    expect(copy.slug).not.toBe(record.slug);
    expect(copy.slug.startsWith("Gaming-Mouse-")).toBe(true);
  });

  it("gives different slugs to clones of one product", () => {
    const source = original();

    expect(source.clone().toRecord().slug).not.toBe(source.clone().toRecord().slug);
  });

  it("does not copy the photo", () => {
    expect(original().clone().toRecord().photo).toBeUndefined();
  });

  it("applies overrides", () => {
    const copy = original().clone({ price: 10, quantity: 1 }).toRecord();

    expect(copy).toMatchObject({ price: 10, quantity: 1, name: "Gaming Mouse" });
  });

  it("builds the slug from an overridden name", () => {
    const copy = original().clone({ name: "Office Mouse" }).toRecord();

    expect(copy.slug.startsWith("Office-Mouse-")).toBe(true);
  });

  it("honours an explicit slug", () => {
    expect(original().clone({ slug: "custom" }).toRecord().slug).toBe("custom");
  });

  it("cannot be given an id or a photo through overrides", () => {
    const copy = original()
      .clone({ _id: record._id, photo: record.photo })
      .toRecord();

    expect(copy._id).not.toBe(record._id);
    expect(copy.photo).toBeUndefined();
  });

  it("ignores undefined overrides", () => {
    expect(original().clone({ price: undefined }).toRecord().price).toBe(49);
  });

  it("leaves the original untouched", () => {
    const source = original();
    const before = source.toRecord();

    source.clone({ price: 1, name: "Other" });

    expect(source.toRecord()).toEqual(before);
  });

  it("can be cloned again", () => {
    const second = original().clone().clone({ price: 2 }).toRecord();

    expect(second.price).toBe(2);
    expect(second.name).toBe("Gaming Mouse");
  });
});

describe("Product.fromRecord", () => {
  it("reads a mongoose-like document", () => {
    const document = { toObject: () => ({ ...record, _id: { toString: () => record._id } }) };

    expect(Product.fromRecord(document).toRecord()._id).toBe(record._id);
  });

  it("reads a populated category", () => {
    const populated = { ...record, category: { _id: CATEGORY, name: "Mice" } };

    expect(Product.fromRecord(populated).toRecord().category).toBe(CATEGORY);
  });

  it("does not expose the photo", () => {
    expect(Product.fromRecord(record).toRecord().photo).toBeUndefined();
  });
});
