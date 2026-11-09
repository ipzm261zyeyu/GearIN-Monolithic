import { InMemoryCategoryRepository } from "./memory/InMemoryCategoryRepository.js";
import { InMemoryPhotoStorage } from "./memory/InMemoryPhotoStorage.js";
import { InMemoryProductRepository } from "./memory/InMemoryProductRepository.js";
import { StorageFactory } from "./StorageFactory.js";

export class InMemoryStorageFactory extends StorageFactory {
  #state = {
    products: new Map(),
    categories: new Map(),
    photos: new Map(),
  };

  createProductRepository() {
    return new InMemoryProductRepository(this.#state);
  }

  createCategoryRepository() {
    return new InMemoryCategoryRepository(this.#state);
  }

  createPhotoStorage() {
    return new InMemoryPhotoStorage(this.#state);
  }
}
