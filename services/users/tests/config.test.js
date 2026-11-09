import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { Config } from "../src/config.js";

const savedEnv = { ...process.env };

beforeEach(() => {
  Object.assign(process.env, {
    PORT: "4001",
    MONGO_URL: "mongodb://db:27017",
    MONGO_DB_NAME: "gearin_users",
    JWT_SECRET: "secret",
  });
  Config.reset();
});

afterEach(() => {
  process.env = { ...savedEnv };
  Config.reset();
});

describe("Config", () => {
  it("reads the settings from env", () => {
    expect(Config.getInstance()).toMatchObject({
      port: 4001,
      mongoUrl: "mongodb://db:27017",
      mongoDbName: "gearin_users",
      jwtSecret: "secret",
    });
  });

  it("returns the same instance and reads env only once", () => {
    const first = Config.getInstance();
    process.env.MONGO_DB_NAME = "other";

    expect(Config.getInstance()).toBe(first);
    expect(Config.getInstance().mongoDbName).toBe("gearin_users");
  });

  it("cannot be constructed directly", () => {
    expect(() => new Config()).toThrow("Use Config.getInstance()");
  });

  it("allows reset only in tests", () => {
    process.env.NODE_ENV = "production";

    expect(() => Config.reset()).toThrow("only in tests");
    process.env.NODE_ENV = "test";
  });

  it.each(["0", "abc", "70000"])("rejects PORT %s", (value) => {
    process.env.PORT = value;

    expect(() => Config.getInstance()).toThrow("PORT must be");
  });

  it.each(["MONGO_URL", "MONGO_DB_NAME", "JWT_SECRET"])("requires %s", (name) => {
    delete process.env[name];

    expect(() => Config.getInstance()).toThrow(`${name} is required`);
  });
});
