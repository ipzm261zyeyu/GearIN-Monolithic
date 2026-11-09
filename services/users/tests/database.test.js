import { afterAll, afterEach, beforeAll, describe, expect, it, jest } from "@jest/globals";
import mongoose from "mongoose";
import { Config } from "../src/config.js";
import { Database } from "../src/database.js";
import { startMongo } from "./helpers.js";

let mongo;

beforeAll(async () => {
  mongo = await startMongo();
  Config.reset();
});

afterEach(async () => {
  jest.restoreAllMocks();
  await Database.getInstance().disconnect();
});

afterAll(() => mongo.stop());

describe("Database", () => {
  it("returns the same instance", () => {
    expect(Database.getInstance()).toBe(Database.getInstance());
  });

  it("cannot be constructed directly", () => {
    expect(() => new Database()).toThrow("Use Database.getInstance()");
  });

  it("connects to the database named in the config", async () => {
    await Database.getInstance().connect();

    expect(mongoose.connection.name).toBe("gearin_users");
  });

  it("opens only one connection", async () => {
    const connect = jest.spyOn(mongoose, "connect");

    await Promise.all([
      Database.getInstance().connect(),
      Database.getInstance().connect(),
    ]);

    expect(connect).toHaveBeenCalledTimes(1);
  });

  it("can retry after a failed connection", async () => {
    const connect = jest
      .spyOn(mongoose, "connect")
      .mockRejectedValueOnce(new Error("refused"));

    await expect(Database.getInstance().connect()).rejects.toThrow("refused");
    await Database.getInstance().connect();

    expect(connect).toHaveBeenCalledTimes(2);
  });
});
