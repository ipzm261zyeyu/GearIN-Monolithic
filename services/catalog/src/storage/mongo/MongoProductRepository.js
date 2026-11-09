import "../../models/categoryModel.js";
import productModel from "../../models/productModel.js";

const toFilter = (query) => {
  const filter = {};
  if (query.categories.length > 0) {
    filter.category = { $in: query.categories };
  }
  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    filter.price = {
      ...(query.minPrice !== undefined && { $gte: query.minPrice }),
      ...(query.maxPrice !== undefined && { $lte: query.maxPrice }),
    };
  }
  if (query.keyword !== undefined) {
    filter.$or = [
      { name: { $regex: query.keyword, $options: "i" } },
      { description: { $regex: query.keyword, $options: "i" } },
    ];
  }
  if (query.excludeId !== undefined) {
    filter._id = { $ne: query.excludeId };
  }
  return filter;
};

const applyView = (request, { includePhoto, populateCategory } = {}) => {
  const selected = includePhoto ? request : request.select("-photo");
  return populateCategory ? selected.populate("category") : selected;
};

export class MongoProductRepository {
  create(fields) {
    return productModel.create(fields);
  }

  findById(id, view) {
    return applyView(productModel.findById(id), view);
  }

  findBySlug(slug, view) {
    return applyView(productModel.findOne({ slug }), view);
  }

  findByIds(ids) {
    return applyView(productModel.find({ _id: { $in: ids } }));
  }

  search(query) {
    let request = applyView(productModel.find(toFilter(query)), query);
    if (query.newestFirst) request = request.sort({ createdAt: -1 });
    if (query.skip) request = request.skip(query.skip);
    if (query.limit) request = request.limit(query.limit);
    return request;
  }

  count() {
    return productModel.find({}).estimatedDocumentCount();
  }

  update(id, fields) {
    return productModel
      .findByIdAndUpdate(id, fields, { new: true })
      .select("-photo");
  }

  delete(id) {
    return productModel.findByIdAndDelete(id).select("-photo");
  }

  async decreaseQuantity(id, quantity) {
    const { modifiedCount } = await productModel.updateOne(
      { _id: id, quantity: { $gte: quantity } },
      { $inc: { quantity: -quantity } }
    );
    return modifiedCount === 1;
  }

  async increaseQuantity(id, quantity) {
    const { modifiedCount } = await productModel.updateOne(
      { _id: id },
      { $inc: { quantity } }
    );
    return modifiedCount === 1;
  }
}
