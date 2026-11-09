const CONSTRUCTION_KEY = Symbol("Config");

const readPort = (value) => {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be an integer between 1 and 65535, got "${value}"`);
  }
  return port;
};

const readHttpUrl = (name, value) => {
  if (!value) {
    throw new Error(`${name} is required`);
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL, got "${value}"`);
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(`${name} must use http or https, got "${value}"`);
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
    this.monolithUrl = readHttpUrl("MONOLITH_URL", env.MONOLITH_URL);
    this.usersUrl = readHttpUrl("USERS_URL", env.USERS_URL);
    this.catalogUrl = readHttpUrl("CATALOG_URL", env.CATALOG_URL);
    if (!env.JWT_SECRET) {
      throw new Error("JWT_SECRET is required");
    }
    this.jwtSecret = env.JWT_SECRET;
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
