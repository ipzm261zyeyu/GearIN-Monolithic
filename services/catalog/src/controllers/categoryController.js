import slugify from "slugify";
import { isClientError } from "../errors.js";

const statusOf = (error) => (isClientError(error) ? 400 : 500);

export const createCategoryHandlers = (categories) => ({
  create: async (req, res) => {
    try {
      const { name } = req.body;
      if (!name) {
        return res.status(401).send({ message: "Name is required" });
      }
      const existing = await categories.findByName(name);
      if (existing) {
        return res.status(200).send({
          success: false,
          message: "Category Already Exists",
        });
      }
      const category = await categories.create({ name, slug: slugify(name) });
      res.status(201).send({
        success: true,
        message: "New Category Created",
        category,
      });
    } catch (error) {
      console.error(error);
      res.status(statusOf(error)).send({
        success: false,
        error,
        message: "Error In Category",
      });
    }
  },

  update: async (req, res) => {
    try {
      const { name } = req.body;
      if (!name) {
        return res.status(400).send({
          success: false,
          message: "Error While Updating Category",
        });
      }
      const category = await categories.update(req.params.id, {
        name,
        slug: slugify(name),
      });
      res.status(200).send({
        success: true,
        messsage: "Category Updated Successfully",
        category,
      });
    } catch (error) {
      console.error(error);
      res.status(statusOf(error)).send({
        success: false,
        error,
        message: "Error While Updating Category",
      });
    }
  },

  list: async (req, res) => {
    try {
      const category = await categories.list();
      res.status(200).send({
        success: true,
        message: "All Categories List",
        category,
      });
    } catch (error) {
      console.error(error);
      res.status(500).send({
        success: false,
        error,
        message: "Error While Getting All Categories",
      });
    }
  },

  single: async (req, res) => {
    try {
      const category = await categories.findBySlug(req.params.slug);
      res.status(200).send({
        success: true,
        message: "Get Single Category Successfully",
        category,
      });
    } catch (error) {
      console.error(error);
      res.status(500).send({
        success: false,
        error,
        message: "Error While Getting Single Category",
      });
    }
  },

  remove: async (req, res) => {
    try {
      await categories.delete(req.params.id);
      res.status(200).send({
        success: true,
        message: "Category Deleted Successfully",
      });
    } catch (error) {
      console.error(error);
      res.status(statusOf(error)).send({
        success: false,
        message: "Error While Deleting Category",
        error,
      });
    }
  },
});
