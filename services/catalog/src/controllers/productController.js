import fs from "fs";
import slugify from "slugify";
import { Product } from "../domain/Product.js";
import { ProductQueryBuilder } from "../domain/ProductQueryBuilder.js";
import { isClientError } from "../errors.js";

const MAX_PHOTO_BYTES = 1000000;
const EDITABLE_FIELDS = ["name", "description", "price", "category", "quantity", "shipping"];
const REQUIRED_FIELDS = [
  ["name", "Name is Required"],
  ["description", "Description is Required"],
  ["price", "Price is Required"],
  ["category", "Category is Required"],
  ["quantity", "Quantity is Required"],
];

const statusOf = (error) => (isClientError(error) ? 400 : 500);

const pickEditable = (source) =>
  Object.fromEntries(
    EDITABLE_FIELDS.filter((name) => source[name] !== undefined).map((name) => [
      name,
      source[name],
    ])
  );

const validationError = (fields, photo, oversizedMessage) => {
  const missing = REQUIRED_FIELDS.find(([name]) => !fields[name]);
  if (missing) return missing[1];
  return photo && photo.size > MAX_PHOTO_BYTES ? oversizedMessage : null;
};

const readUpload = (photo) => ({
  data: fs.readFileSync(photo.path),
  contentType: photo.type,
});

const WITH_PHOTO = { includePhoto: true };
const WITH_CATEGORY = { populateCategory: true };

export const createProductHandlers = ({ products, categories, photos }) => ({
  create: async (req, res) => {
    try {
      const { photo } = req.files;
      const error = validationError(
        req.fields,
        photo,
        "photo is required and should be less then 1mb"
      );
      if (error) {
        return res.status(400).send({ error });
      }
      const created = await products.create({
        ...pickEditable(req.fields),
        slug: slugify(req.fields.name),
      });
      if (photo) {
        await photos.save(created._id, readUpload(photo));
      }
      res.status(201).send({
        success: true,
        message: "Product Created Successfully",
        products: await products.findById(created._id, WITH_PHOTO),
      });
    } catch (error) {
      console.error(error);
      res.status(statusOf(error)).send({
        success: false,
        error,
        message: "Error in Crearing Product",
      });
    }
  },

  update: async (req, res) => {
    try {
      const { photo } = req.files;
      const error = validationError(
        req.fields,
        photo,
        "Photo is required and should be less then 1mb"
      );
      if (error) {
        return res.status(400).send({ error });
      }
      const updated = await products.update(req.params.pid, {
        ...pickEditable(req.fields),
        slug: slugify(req.fields.name),
      });
      if (!updated) {
        return res.status(404).send({
          success: false,
          message: "Error in Update product",
        });
      }
      if (photo) {
        await photos.save(updated._id, readUpload(photo));
      }
      res.status(201).send({
        success: true,
        message: "Product Updated Successfully",
        products: await products.findById(updated._id, WITH_PHOTO),
      });
    } catch (error) {
      console.error(error);
      res.status(statusOf(error)).send({
        success: false,
        error,
        message: "Error in Update product",
      });
    }
  },

  clone: async (req, res) => {
    try {
      const source = await products.findById(req.params.pid);
      if (!source) {
        return res.status(404).send({
          success: false,
          message: "Product Not Found",
        });
      }
      const copy = Product.fromRecord(source).clone(pickEditable(req.body));
      res.status(201).send({
        success: true,
        message: "Product Cloned Successfully",
        products: await products.create(copy.toRecord()),
      });
    } catch (error) {
      console.error(error);
      res.status(statusOf(error)).send({
        success: false,
        error,
        message: "Error While Cloning Product",
      });
    }
  },

  list: async (req, res) => {
    try {
      const query = new ProductQueryBuilder()
        .withCategory()
        .limit(12)
        .newestFirst()
        .build();
      const found = await products.search(query);
      res.status(200).send({
        success: true,
        counTotal: found.length,
        message: "ALlProducts ",
        products: found,
      });
    } catch (error) {
      console.error(error);
      res.status(500).send({
        success: false,
        message: "Error in Getting Products",
        error: error.message,
      });
    }
  },

  single: async (req, res) => {
    try {
      const product = await products.findBySlug(req.params.slug, WITH_CATEGORY);
      res.status(200).send({
        success: true,
        message: "Single Product Fetched",
        product,
      });
    } catch (error) {
      console.error(error);
      res.status(500).send({
        success: false,
        message: "Error While Getitng Single Product",
        error,
      });
    }
  },

  photo: async (req, res) => {
    try {
      const photo = await photos.get(req.params.pid);
      if (!photo) {
        return res.status(404).send({
          success: false,
          message: "Error While Getting Photo",
        });
      }
      res.set("Content-type", photo.contentType);
      res.status(200).send(photo.data);
    } catch (error) {
      console.error(error);
      res.status(statusOf(error)).send({
        success: false,
        message: "Error While Getting Photo",
        error,
      });
    }
  },

  remove: async (req, res) => {
    try {
      await products.delete(req.params.pid);
      res.status(200).send({
        success: true,
        message: "Product Deleted Successfully",
      });
    } catch (error) {
      console.error(error);
      res.status(statusOf(error)).send({
        success: false,
        message: "Error While Deleting Product",
        error,
      });
    }
  },

  filters: async (req, res) => {
    try {
      const { checked, radio } = req.body;
      const query = new ProductQueryBuilder()
        .inCategories(checked)
        .priceBetween(radio?.[0], radio?.[1])
        .withPhoto()
        .build();
      res.status(200).send({
        success: true,
        products: await products.search(query),
      });
    } catch (error) {
      console.error(error);
      res.status(400).send({
        success: false,
        message: "Error while filtering products",
        error,
      });
    }
  },

  count: async (req, res) => {
    try {
      res.status(200).send({
        success: true,
        total: await products.count(),
      });
    } catch (error) {
      console.error(error);
      res.status(400).send({
        message: "Error in product count",
        error,
        success: false,
      });
    }
  },

  page: async (req, res) => {
    try {
      const query = new ProductQueryBuilder()
        .page(req.params.page)
        .newestFirst()
        .build();
      res.status(200).send({
        success: true,
        products: await products.search(query),
      });
    } catch (error) {
      console.error(error);
      res.status(400).send({
        success: false,
        message: "Error occured in loading page",
        error,
      });
    }
  },

  search: async (req, res) => {
    try {
      const query = new ProductQueryBuilder()
        .matchingKeyword(req.params.keyword)
        .build();
      res.json(await products.search(query));
    } catch (error) {
      console.error(error);
      res.status(400).send({
        success: false,
        message: "Error in search product api",
        error,
      });
    }
  },

  related: async (req, res) => {
    try {
      const { pid, cid } = req.params;
      const query = new ProductQueryBuilder()
        .inCategories(cid)
        .excluding(pid)
        .limit(3)
        .withCategory()
        .build();
      res.status(200).send({
        success: true,
        products: await products.search(query),
      });
    } catch (error) {
      console.error(error);
      res.status(400).send({
        success: false,
        message: "Error While Getting Related Product",
        error,
      });
    }
  },

  byCategory: async (req, res) => {
    try {
      const category = await categories.findBySlug(req.params.slug);
      const found = category
        ? await products.search(
            new ProductQueryBuilder()
              .inCategories(String(category._id))
              .withPhoto()
              .withCategory()
              .build()
          )
        : [];
      res.status(200).send({
        success: true,
        category,
        products: found,
      });
    } catch (error) {
      console.error(error);
      res.status(400).send({
        success: false,
        error,
        message: "Error while getting products",
      });
    }
  },
});
