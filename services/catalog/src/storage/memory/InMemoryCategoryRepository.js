import { ValidationError } from "../../errors.js";
import { generateId, isValidId } from "../../helpers/id.js";

const assertId = (id) => {
  if (!isValidId(String(id))) {
    throw new ValidationError(`Invalid id: ${id}`);
  }
};

export class InMemoryCategoryRepository {
  #categories;

  constructor({ categories }) {
    this.#categories = categories;
  }

  #normalize(fields) {
    return fields.slug === undefined
      ? fields
      : { ...fields, slug: fields.slug.toLowerCase() };
  }

  async create(fields) {
    const category = { _id: generateId(), __v: 0, ...this.#normalize(fields) };
    this.#categories.set(category._id, category);
    return { ...category };
  }

  async list() {
    return [...this.#categories.values()].map((category) => ({ ...category }));
  }

  async findByName(name) {
    return this.#find((category) => category.name === name);
  }

  async findBySlug(slug) {
    return this.#find((category) => category.slug === slug);
  }

  #find(predicate) {
    const found = [...this.#categories.values()].find(predicate);
    return found ? { ...found } : null;
  }

  async update(id, fields) {
    assertId(id);
    const current = this.#categories.get(String(id));
    if (!current) return null;
    const updated = { ...current, ...this.#normalize(fields) };
    this.#categories.set(current._id, updated);
    return { ...updated };
  }

  async delete(id) {
    assertId(id);
    const current = this.#categories.get(String(id));
    this.#categories.delete(String(id));
    return current ? { ...current } : null;
  }
}
