import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Config } from "../src/config.js";
import { Database } from "../src/database.js";

const savedEnv = { ...process.env };

const baseEnv = {
  PORT: "4004",
  MONGO_URL: "mongodb://db:27017",
  MONGO_DB_NAME: "gearin_orders",
  CATALOG_URL: "http://catalog:4002",
  PAYMENTS_URL: "http://payments:4003",
  USERS_URL: "http://users:4001",
};

describe("Config", () => {
  beforeEach(() => {
    Object.assign(process.env, baseEnv);
    Config.reset();
  });

  afterEach(() => {
    process.env = { ...savedEnv };
    Config.reset();
  });

  it("reads the settings from env", () => {
    expect(Config.getInstance()).toMatchObject({
      port: 4004,
      mongoDbName: "gearin_orders",
      catalogUrl: "http://catalog:4002",
      paymentsUrl: "http://payments:4003",
      usersUrl: "http://users:4001",
    });
  });

  it("returns one instance and reads env once", () => {
    const first = Config.getInstance();
    process.env.MONGO_DB_NAME = "other";

    expect(Config.getInstance()).toBe(first);
    expect(first.mongoDbName).toBe("gearin_orders");
  });

  it("cannot be constructed directly", () => {
    expect(() => new Config()).toThrow("Use Config.getInstance()");
  });

  it("allows reset only in tests", () => {
    process.env.NODE_ENV = "production";

    expect(() => Config.reset()).toThrow("only in tests");
    process.env.NODE_ENV = "test";
  });

  it.each(["0", "abc"])("rejects PORT %s", (value) => {
    process.env.PORT = value;

    expect(() => Config.getInstance()).toThrow("PORT must be");
  });

  it.each(["MONGO_URL", "MONGO_DB_NAME", "CATALOG_URL", "PAYMENTS_URL", "USERS_URL"])(
    "requires %s",
    (name) => {
      delete process.env[name];

      expect(() => Config.getInstance()).toThrow(`${name} is required`);
    }
  );

  it.each([
    ["not a url", "must be a valid URL"],
    ["ftp://catalog", "must use http or https"],
  ])("rejects CATALOG_URL %s", (value, message) => {
    process.env.CATALOG_URL = value;

    expect(() => Config.getInstance()).toThrow(message);
  });
});

describe("Database", () => {
  let mongo;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
  });

  beforeEach(() => {
    Object.assign(process.env, baseEnv, { MONGO_URL: mongo.getUri() });
    Config.reset();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await Database.getInstance().disconnect();
  });

  afterAll(() => mongo.stop());

  it("returns one instance and cannot be constructed directly", () => {
    expect(Database.getInstance()).toBe(Database.getInstance());
    expect(() => new Database()).toThrow("Use Database.getInstance()");
  });

  it("connects to the configured database once", async () => {
    const connect = jest.spyOn(mongoose, "connect");

    await Promise.all([Database.getInstance().connect(), Database.getInstance().connect()]);

    expect(connect).toHaveBeenCalledTimes(1);
    expect(mongoose.connection.name).toBe("gearin_orders");
  });

  it("can retry after a failure", async () => {
    const connect = jest
      .spyOn(mongoose, "connect")
      .mockRejectedValueOnce(new Error("refused"));

    await expect(Database.getInstance().connect()).rejects.toThrow("refused");
    await Database.getInstance().connect();

    expect(connect).toHaveBeenCalledTimes(2);
  });
});
