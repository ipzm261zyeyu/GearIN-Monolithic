import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { Config } from "../src/config.js";

const savedEnv = { ...process.env };

beforeEach(() => {
  process.env.PORT = "8080";
  process.env.USERS_URL = "http://users:4001";
  process.env.CATALOG_URL = "http://catalog:4002";
  process.env.PAYMENTS_URL = "http://payments:4003";
  process.env.ORDERS_URL = "http://orders:4004";
  process.env.JWT_SECRET = "secret";
  Config.reset();
});

afterEach(() => {
  process.env = { ...savedEnv };
  Config.reset();
});

describe("Config", () => {
  it("reads the settings from env", () => {
    const config = Config.getInstance();

    expect(config.port).toBe(8080);
    expect(config.usersUrl).toBe("http://users:4001");
    expect(config.monolithUrl).toBeUndefined();
    expect(config.jwtSecret).toBe("secret");
  });

  it("requires ORDERS_URL", () => {
    delete process.env.ORDERS_URL;

    expect(() => Config.getInstance()).toThrow("ORDERS_URL is required");
  });

  it("requires PAYMENTS_URL", () => {
    delete process.env.PAYMENTS_URL;

    expect(() => Config.getInstance()).toThrow("PAYMENTS_URL is required");
  });

  it("requires CATALOG_URL", () => {
    delete process.env.CATALOG_URL;

    expect(() => Config.getInstance()).toThrow("CATALOG_URL is required");
  });

  it("requires USERS_URL", () => {
    delete process.env.USERS_URL;

    expect(() => Config.getInstance()).toThrow("USERS_URL is required");
  });

  it("requires JWT_SECRET", () => {
    delete process.env.JWT_SECRET;

    expect(() => Config.getInstance()).toThrow("JWT_SECRET is required");
  });

  it("returns the same instance and reads env only once", () => {
    const first = Config.getInstance();
    process.env.USERS_URL = "http://other:4001";

    const second = Config.getInstance();

    expect(second).toBe(first);
    expect(second.usersUrl).toBe("http://users:4001");
  });

  it("rereads env after reset", () => {
    Config.getInstance();
    process.env.USERS_URL = "http://other:4001";
    Config.reset();

    expect(Config.getInstance().usersUrl).toBe("http://other:4001");
  });

  it("is immutable", () => {
    const config = Config.getInstance();

    expect(() => {
      config.port = 1;
    }).toThrow(TypeError);
  });

  it("cannot be constructed directly", () => {
    expect(() => new Config()).toThrow("Use Config.getInstance()");
  });

  it("allows reset only in tests", () => {
    process.env.NODE_ENV = "production";

    expect(() => Config.reset()).toThrow("only in tests");
    process.env.NODE_ENV = "test";
  });

  it.each([
    [undefined],
    ["abc"],
    ["0"],
    ["70000"],
    ["80.5"],
  ])("rejects PORT %s", (value) => {
    if (value === undefined) delete process.env.PORT;
    else process.env.PORT = value;

    expect(() => Config.getInstance()).toThrow("PORT must be");
  });

  it("does not need MONOLITH_URL", () => {
    delete process.env.MONOLITH_URL;

    expect(() => Config.getInstance()).not.toThrow();
  });

  it.each([
    ["not a url", "must be a valid URL"],
    ["ftp://users:4001", "must use http or https"],
  ])("rejects USERS_URL %s", (value, message) => {
    process.env.USERS_URL = value;

    expect(() => Config.getInstance()).toThrow(message);
  });
});
