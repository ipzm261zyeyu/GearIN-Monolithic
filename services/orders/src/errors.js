export class CheckoutError extends Error {
  name = "CheckoutError";

  constructor(status, message, details = {}) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export class UpstreamError extends CheckoutError {
  name = "UpstreamError";

  constructor(service) {
    super(502, `${service} service is unavailable`);
  }
}

export class OrderValidationError extends Error {
  name = "OrderValidationError";

  status = 400;
}
