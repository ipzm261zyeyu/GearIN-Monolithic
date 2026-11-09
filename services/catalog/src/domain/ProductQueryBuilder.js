const DEFAULT_PAGE_SIZE = 6;

const toNumber = (value) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
};

export class ProductQueryBuilder {
  #query = {
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
  };

  inCategories(categories) {
    this.#query.categories = [categories].flat().filter(Boolean);
    return this;
  }

  priceBetween(min, max) {
    this.#query.minPrice = toNumber(min);
    this.#query.maxPrice = toNumber(max);
    return this;
  }

  matchingKeyword(keyword) {
    this.#query.keyword =
      typeof keyword === "string" && keyword ? keyword : undefined;
    return this;
  }

  page(page, size = DEFAULT_PAGE_SIZE) {
    const number = toNumber(page);
    const current = Number.isInteger(number) && number > 0 ? number : 1;
    this.#query.skip = (current - 1) * size;
    this.#query.limit = size;
    return this;
  }

  limit(limit) {
    this.#query.limit = limit;
    return this;
  }

  excluding(id) {
    this.#query.excludeId = id || undefined;
    return this;
  }

  newestFirst() {
    this.#query.newestFirst = true;
    return this;
  }

  withPhoto() {
    this.#query.includePhoto = true;
    return this;
  }

  withCategory() {
    this.#query.populateCategory = true;
    return this;
  }

  build() {
    return Object.freeze({
      ...this.#query,
      categories: [...this.#query.categories],
    });
  }
}
