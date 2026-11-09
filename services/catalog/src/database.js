import mongoose from "mongoose";
import { Config } from "./config.js";

const CONSTRUCTION_KEY = Symbol("Database");

export class Database {
  static #instance = null;

  #connecting = null;

  constructor(key) {
    if (key !== CONSTRUCTION_KEY) {
      throw new Error("Use Database.getInstance()");
    }
  }

  static getInstance() {
    if (!Database.#instance) {
      Database.#instance = new Database(CONSTRUCTION_KEY);
    }
    return Database.#instance;
  }

  connect() {
    if (!this.#connecting) {
      const { mongoUrl, mongoDbName } = Config.getInstance();
      this.#connecting = mongoose
        .connect(mongoUrl, { dbName: mongoDbName })
        .catch((error) => {
          this.#connecting = null;
          throw error;
        });
    }
    return this.#connecting;
  }

  async disconnect() {
    this.#connecting = null;
    await mongoose.disconnect();
  }
}
