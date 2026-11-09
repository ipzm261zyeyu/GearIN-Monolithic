import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { Config } from "../src/config.js";

const savedEnv = { ...process.env };

beforeEach(() => {
  process.env.PORT = "8080";
  process.env.MONOLITH_URL = "http://backend:4000";
  process.env.USERS_URL = "http://users:4001";
  process.env.CATALOG_URL = "http://catalog:4002";
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
    expect(config.monolithUrl).toBe("http://backend:4000");
    expect(config.usersUrl).toBe("http://users:4001");
    expect(config.jwtSecret).toBe("secret");
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
    process.env.MONOLITH_URL = "http://other:4000";

    const second = Config.getInstance();

    expect(second).toBe(first);
    expect(second.monolithUrl).toBe("http://backend:4000");
  });

  it("rereads env after reset", () => {
    Config.getInstance();
    process.env.MONOLITH_URL = "http://other:4000";
    Config.reset();

    expect(Config.getInstance().monolithUrl).toBe("http://other:4000");
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

  it("requires MONOLITH_URL", () => {
    delete process.env.MONOLITH_URL;

    expect(() => Config.getInstance()).toThrow("MONOLITH_URL is required");
  });

  it.each([
    ["not a url", "must be a valid URL"],
    ["ftp://backend:4000", "must use http or https"],
  ])("rejects MONOLITH_URL %s", (value, message) => {
    process.env.MONOLITH_URL = value;

    expect(() => Config.getInstance()).toThrow(message);
  });
});
