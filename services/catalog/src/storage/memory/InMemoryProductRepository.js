import { ValidationError } from "../../errors.js";
import { generateId, isValidId } from "../../helpers/id.js";

const REQUIRED_FIELDS = ["name", "slug", "description", "price", "category", "quantity"];
const NUMERIC_FIELDS = ["price", "quantity"];

const assertId = (id) => {
  if (!isValidId(String(id))) {
    throw new ValidationError(`Invalid id: ${id}`);
  }
};

const cast = (fields) => {
  const result = { ...fields };
  NUMERIC_FIELDS.filter((name) => result[name] !== undefined).forEach((name) => {
    result[name] = Number(result[name]);
    if (!Number.isFinite(result[name])) {
      throw new ValidationError(`${name} must be a number`);
    }
  });
  if (result.category !== undefined) {
    assertId(result.category);
    result.category = String(result.category);
  }
  if (typeof result.shipping === "string") {
    result.shipping = result.shipping === "true" || result.shipping === "1";
  }
  return result;
};

export class InMemoryProductRepository {
  #products;

  #categories;

  #photos;

  constructor({ products, categories, photos }) {
    this.#products = products;
    this.#categories = categories;
    this.#photos = photos;
  }

  #view(product, { includePhoto, populateCategory } = {}) {
    const view = { ...product };
    if (includePhoto && this.#photos.has(product._id)) {
      view.photo = this.#photos.get(product._id);
    }
    if (populateCategory) {
      const category = this.#categories.get(product.category);
      view.category = category ? { ...category } : null;
    }
    return view;
  }

  async create(fields) {
    const missing = REQUIRED_FIELDS.find(
      (name) => fields[name] === undefined || fields[name] === ""
    );
    if (missing) {
      throw new ValidationError(`${missing} is required`);
    }
    const now = new Date();
    const product = {
      _id: generateId(),
      createdAt: now,
      updatedAt: now,
      __v: 0,
      ...cast(fields),
    };
    this.#products.set(String(product._id), product);
    return this.#view(product);
  }

  async findById(id, view) {
    assertId(id);
    const product = this.#products.get(String(id));
    return product ? this.#view(product, view) : null;
  }

  async findBySlug(slug, view) {
    const product = [...this.#products.values()].find((item) => item.slug === slug);
    return product ? this.#view(product, view) : null;
  }

  async findByIds(ids) {
    ids.forEach(assertId);
    return ids
      .filter((id) => this.#products.has(String(id)))
      .map((id) => this.#view(this.#products.get(String(id))));
  }

  async search(query) {
    query.categories.forEach(assertId);
    if (query.excludeId !== undefined) assertId(query.excludeId);
    const keyword =
      query.keyword === undefined ? null : new RegExp(query.keyword, "i");

    const matches = [...this.#products.values()].filter(
      (product) =>
        (query.categories.length === 0 || query.categories.includes(product.category)) &&
        (query.minPrice === undefined || product.price >= query.minPrice) &&
        (query.maxPrice === undefined || product.price <= query.maxPrice) &&
        (!keyword || keyword.test(product.name) || keyword.test(product.description)) &&
        product._id !== query.excludeId
    );
    if (query.newestFirst) {
      matches.sort((a, b) => b.createdAt - a.createdAt);
    }
    const end = query.limit ? query.skip + query.limit : undefined;
    return matches.slice(query.skip, end).map((product) => this.#view(product, query));
  }

  async count() {
    return this.#products.size;
  }

  async update(id, fields) {
    assertId(id);
    const current = this.#products.get(String(id));
    if (!current) return null;
    const updated = { ...current, ...cast(fields), updatedAt: new Date() };
    this.#products.set(current._id, updated);
    return this.#view(updated);
  }

  async delete(id) {
    assertId(id);
    const current = this.#products.get(String(id));
    this.#products.delete(String(id));
    this.#photos.delete(String(id));
    return current ? this.#view(current) : null;
  }

  async decreaseQuantity(id, quantity) {
    assertId(id);
    const product = this.#products.get(String(id));
    if (!product || product.quantity < quantity) return false;
    product.quantity -= quantity;
    return true;
  }

  async increaseQuantity(id, quantity) {
    assertId(id);
    const product = this.#products.get(String(id));
    if (!product) return false;
    product.quantity += quantity;
    return true;
  }
}
