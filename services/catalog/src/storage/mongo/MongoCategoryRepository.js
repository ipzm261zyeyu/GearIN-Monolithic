import categoryModel from "../../models/categoryModel.js";

export class MongoCategoryRepository {
  create(fields) {
    return categoryModel.create(fields);
  }

  list() {
    return categoryModel.find({});
  }

  findByName(name) {
    return categoryModel.findOne({ name });
  }

  findBySlug(slug) {
    return categoryModel.findOne({ slug });
  }

  update(id, fields) {
    return categoryModel.findByIdAndUpdate(id, fields, { new: true });
  }

  delete(id) {
    return categoryModel.findByIdAndDelete(id);
  }
}
