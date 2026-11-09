import productModel from "../../models/productModel.js";

export class MongoPhotoStorage {
  async save(productId, photo) {
    await productModel.updateOne({ _id: productId }, { $set: { photo } });
  }

  async get(productId) {
    const product = await productModel.findById(productId).select("photo");
    return product?.photo?.data
      ? { data: product.photo.data, contentType: product.photo.contentType }
      : null;
  }
}
