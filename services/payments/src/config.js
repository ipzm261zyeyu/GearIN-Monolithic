const CONSTRUCTION_KEY = Symbol("Config");
const PROVIDERS = ["braintree", "fake"];

const readPort = (value) => {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be an integer between 1 and 65535, got "${value}"`);
  }
  return port;
};

const readProvider = (value) => {
  if (!PROVIDERS.includes(value)) {
    throw new Error(
      `PAYMENT_PROVIDER must be one of ${PROVIDERS.join(", ")}, got "${value}"`
    );
  }
  return value;
};

const readRequired = (name, value) => {
  if (!value) {
    throw new Error(`${name} is required when PAYMENT_PROVIDER is braintree`);
  }
  return value;
};

const readBraintree = (env) =>
  Object.freeze({
    merchantId: readRequired("BRAINTREE_MERCHANT_ID", env.BRAINTREE_MERCHANT_ID),
    publicKey: readRequired("BRAINTREE_PUBLIC_KEY", env.BRAINTREE_PUBLIC_KEY),
    privateKey: readRequired("BRAINTREE_PRIVATE_KEY", env.BRAINTREE_PRIVATE_KEY),
  });

export class Config {
  static #instance = null;

  constructor(key, env) {
    if (key !== CONSTRUCTION_KEY) {
      throw new Error("Use Config.getInstance()");
    }
    this.port = readPort(env.PORT);
    this.paymentProvider = readProvider(env.PAYMENT_PROVIDER);
    this.braintree = this.paymentProvider === "braintree" ? readBraintree(env) : null;
    Object.freeze(this);
  }

  static getInstance() {
    if (!Config.#instance) {
      Config.#instance = new Config(CONSTRUCTION_KEY, process.env);
    }
    return Config.#instance;
  }

  static reset() {
    if (process.env.NODE_ENV !== "test") {
      throw new Error("Config.reset() is available only in tests");
    }
    Config.#instance = null;
  }
}
