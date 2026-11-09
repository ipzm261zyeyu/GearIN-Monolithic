export class ValidationError extends Error {
  name = "ValidationError";

  status = 400;
}

export class NotFoundError extends Error {
  name = "NotFoundError";

  status = 404;

  constructor(message, productId) {
    super(message);
    this.productId = productId;
  }
}

export class InsufficientStockError extends Error {
  name = "InsufficientStockError";

  status = 409;

  constructor(message, productId) {
    super(message);
    this.productId = productId;
  }
}

export const isClientError = (error) =>
  error.name === "ValidationError" || error.name === "CastError";
