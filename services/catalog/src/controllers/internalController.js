import { ValidationError, isClientError } from "../errors.js";
import { isValidId } from "../helpers/id.js";

const respondWithError = (res, error) => {
  console.error(error);
  const status = error.status ?? (isClientError(error) ? 400 : 500);
  res.status(status).send({
    success: false,
    message: error.message,
    ...(error.productId && { productId: error.productId }),
  });
};

export const createInternalHandlers = ({ products, stock }) => ({
  productsByIds: async (req, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || !ids.every(isValidId)) {
        throw new ValidationError("ids must be an array of product ids");
      }
      res.status(200).send({
        success: true,
        products: await products.findByIds(ids),
      });
    } catch (error) {
      respondWithError(res, error);
    }
  },

  reserve: async (req, res) => {
    try {
      await stock.reserve(req.body.items);
      res.status(200).send({ success: true });
    } catch (error) {
      respondWithError(res, error);
    }
  },

  release: async (req, res) => {
    try {
      const { missing } = await stock.release(req.body.items);
      res.status(200).send({ success: true, missing });
    } catch (error) {
      respondWithError(res, error);
    }
  },
});
