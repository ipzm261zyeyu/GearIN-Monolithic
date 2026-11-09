const CONSTRUCTION_KEY = Symbol("Logger");

export class Logger {
  static #instance = null;

  constructor(key) {
    if (key !== CONSTRUCTION_KEY) {
      throw new Error("Use Logger.getInstance()");
    }
  }

  static getInstance() {
    if (!Logger.#instance) {
      Logger.#instance = new Logger(CONSTRUCTION_KEY);
    }
    return Logger.#instance;
  }

  #write(level, message, details) {
    console[level](
      JSON.stringify({
        time: new Date().toISOString(),
        level,
        message,
        ...details,
      })
    );
  }

  info(message, details = {}) {
    this.#write("info", message, details);
  }

  warn(message, details = {}) {
    this.#write("warn", message, details);
  }

  error(message, details = {}) {
    this.#write("error", message, details);
  }
}
