const CONSTRUCTION_KEY = Symbol("Config");

const readPort = (value) => {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be an integer between 1 and 65535, got "${value}"`);
  }
  return port;
};

const readRequired = (name, value) => {
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
};

export class Config {
  static #instance = null;

  constructor(key, env) {
    if (key !== CONSTRUCTION_KEY) {
      throw new Error("Use Config.getInstance()");
    }
    this.port = readPort(env.PORT);
    this.mongoUrl = readRequired("MONGO_URL", env.MONGO_URL);
    this.mongoDbName = readRequired("MONGO_DB_NAME", env.MONGO_DB_NAME);
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
