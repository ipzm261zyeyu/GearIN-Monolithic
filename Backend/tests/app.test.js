import { afterAll, afterEach, beforeAll, describe, expect, it, jest } from "@jest/globals";
import fs from "fs";
import mongoose from "mongoose";
import path from "path";
import { startApp } from "./helpers/harness.js";

let ctx;
let connectDB;

beforeAll(async () => {
  ctx = await startApp();
  ({ default: connectDB } = await import("../config/db.js"));
});

afterEach(() => ctx.reset());
afterAll(() => ctx.stop());

describe("GET /", () => {
  it("reports the service status", async () => {
    const res = await ctx.api.get("/");

    expect(res.status).toBe(200);
    expect(res.text).toBe("<h1>GearIN Backend Status: UP</h1>");
  });
});

describe("connectDB", () => {
  it("connects with MONGO_URL and logs the host", async () => {
    process.env.MONGO_URL = "mongodb://example/GearIN";
    const connect = jest
      .spyOn(mongoose, "connect")
      .mockResolvedValue({ connection: { host: "example" } });
    const log = jest.spyOn(console, "log").mockImplementation(() => {});

    await connectDB();

    expect(connect).toHaveBeenCalledWith("mongodb://example/GearIN");
    expect(log).toHaveBeenCalledWith('Connected To Mongodb "example"');
  });

  it("only logs a failed connection", async () => {
    jest.spyOn(mongoose, "connect").mockRejectedValue(new Error("refused"));
    const log = jest.spyOn(console, "log").mockImplementation(() => {});

    await expect(connectDB()).resolves.toBeUndefined();

    expect(log).toHaveBeenCalledWith(
      "Error Occured While Connecting MongoDB Error: refused"
    );
  });
});

describe("frontend client", () => {
  // KNOWN-DEFECT-9
  it("hard-codes the server address in 42 places across 19 files", () => {
    const root = path.resolve(process.cwd(), "../Frontend/src");
    const counts = fs
      .readdirSync(root, { recursive: true })
      .filter((file) => file.endsWith(".js"))
      .map(
        (file) =>
          fs
            .readFileSync(path.join(root, file), "utf8")
            .split("http://localhost:4000").length - 1
      )
      .filter((count) => count > 0);

    expect(counts).toHaveLength(19);
    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(42);
  });
});
