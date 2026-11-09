import { MongoCategoryRepository } from "./mongo/MongoCategoryRepository.js";
import { MongoPhotoStorage } from "./mongo/MongoPhotoStorage.js";
import { MongoProductRepository } from "./mongo/MongoProductRepository.js";
import { StorageFactory } from "./StorageFactory.js";

export class MongoStorageFactory extends StorageFactory {
  createProductRepository() {
    return new MongoProductRepository();
  }

  createCategoryRepository() {
    return new MongoCategoryRepository();
  }

  createPhotoStorage() {
    return new MongoPhotoStorage();
  }
}
