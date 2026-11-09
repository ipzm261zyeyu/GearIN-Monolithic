import slugify from "slugify";
import { generateId } from "../helpers/id.js";

const COPIED_FIELDS = ["name", "description", "price", "category", "quantity", "shipping"];

const withoutUndefined = (values) =>
  Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined)
  );

const idOf = (value) => String(value?._id ?? value);

export class Product {
  #fields;

  constructor(fields) {
    this.#fields = { ...fields };
  }

  static fromRecord(record) {
    const source = record.toObject?.() ?? record;
    const fields = {};
    COPIED_FIELDS.forEach((name) => {
      fields[name] = source[name];
    });
    return new Product({
      ...fields,
      _id: idOf(source._id),
      slug: source.slug,
      category: idOf(source.category),
    });
  }

  clone(overrides = {}) {
    const { _id: ignoredId, photo: ignoredPhoto, ...allowed } = withoutUndefined(overrides);
    const merged = { ...this.#fields, ...allowed };
    const id = generateId();
    return new Product({
      ...merged,
      _id: id,
      slug: allowed.slug ?? `${slugify(merged.name)}-${id.slice(-6)}`,
    });
  }

  toRecord() {
    return { ...this.#fields };
  }
}
