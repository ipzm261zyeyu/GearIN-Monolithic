import { describe, expect, it } from "@jest/globals";
import { InMemoryCategoryRepository } from "../../src/storage/memory/InMemoryCategoryRepository.js";
import { InMemoryPhotoStorage } from "../../src/storage/memory/InMemoryPhotoStorage.js";
import { InMemoryProductRepository } from "../../src/storage/memory/InMemoryProductRepository.js";
import { InMemoryStorageFactory } from "../../src/storage/InMemoryStorageFactory.js";
import { MongoCategoryRepository } from "../../src/storage/mongo/MongoCategoryRepository.js";
import { MongoPhotoStorage } from "../../src/storage/mongo/MongoPhotoStorage.js";
import { MongoProductRepository } from "../../src/storage/mongo/MongoProductRepository.js";
import { MongoStorageFactory } from "../../src/storage/MongoStorageFactory.js";
import { StorageFactory } from "../../src/storage/StorageFactory.js";

describe("StorageFactory", () => {
  it.each(["createProductRepository", "createCategoryRepository", "createPhotoStorage"])(
    "%s must be implemented by a concrete factory",
    (method) => {
      expect(() => new StorageFactory()[method]()).toThrow("not implemented");
    }
  );

  it.each([
    ["MongoStorageFactory", MongoStorageFactory],
    ["InMemoryStorageFactory", InMemoryStorageFactory],
  ])("%s is a StorageFactory", (_name, Factory) => {
    expect(new Factory()).toBeInstanceOf(StorageFactory);
  });

  it("MongoStorageFactory creates only Mongo storages", () => {
    const factory = new MongoStorageFactory();

    expect(factory.createProductRepository()).toBeInstanceOf(MongoProductRepository);
    expect(factory.createCategoryRepository()).toBeInstanceOf(MongoCategoryRepository);
    expect(factory.createPhotoStorage()).toBeInstanceOf(MongoPhotoStorage);
  });

  it("InMemoryStorageFactory creates only in-memory storages", () => {
    const factory = new InMemoryStorageFactory();

    expect(factory.createProductRepository()).toBeInstanceOf(InMemoryProductRepository);
    expect(factory.createCategoryRepository()).toBeInstanceOf(InMemoryCategoryRepository);
    expect(factory.createPhotoStorage()).toBeInstanceOf(InMemoryPhotoStorage);
  });

  it("gives the storages of one in-memory factory shared data", async () => {
    const factory = new InMemoryStorageFactory();
    const category = await factory
      .createCategoryRepository()
      .create({ name: "Mice", slug: "mice" });
    const product = await factory.createProductRepository().create({
      name: "Mouse",
      slug: "mouse",
      description: "Fast",
      price: 10,
      category: category._id,
      quantity: 1,
    });
    await factory
      .createPhotoStorage()
      .save(product._id, { data: Buffer.from("x"), contentType: "image/png" });

    const found = await factory
      .createProductRepository()
      .findById(product._id, { includePhoto: true, populateCategory: true });

    expect(found.category.slug).toBe("mice");
    expect(found.photo.contentType).toBe("image/png");
  });

  it("keeps different in-memory factories apart", async () => {
    await new InMemoryStorageFactory()
      .createCategoryRepository()
      .create({ name: "Mice", slug: "mice" });

    await expect(new InMemoryStorageFactory().createCategoryRepository().list()).resolves.toEqual([]);
  });
});
