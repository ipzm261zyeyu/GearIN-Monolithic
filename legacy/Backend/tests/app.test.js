import { afterAll, afterEach, beforeAll, describe, expect, it, jest } from "@jest/globals";
import fs from "fs";
import mongoose from "mongoose";
import path from "path";
import { describeDirect, describeGateway, startApp } from "./helpers/harness.js";

let ctx;
let connectDB;

beforeAll(async () => {
  ctx = await startApp();
  ({ default: connectDB } = await import("../config/db.js"));
});

afterEach(() => ctx.reset());
afterAll(() => ctx.stop());

describeDirect("GET /", () => {
  it("reports the service status", async () => {
    const res = await ctx.api.get("/");

    expect(res.status).toBe(200);
    expect(res.text).toBe("<h1>GearIN Backend Status: UP</h1>");
  });
});

describeGateway("GET / through the gateway", () => {
  // Сторінка статусу належала моноліту, тому після його відключення шлюз її не обслуговує
  it("no longer exists", async () => {
    const res = await ctx.api.get("/");

    expect(res.status).toBe(404);
  });
});

describeDirect("connectDB", () => {
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
  it("takes the server address from REACT_APP_API_URL in a single module", () => {
    const root = path.resolve(process.cwd(), "../../Frontend/src");
    const sources = fs
      .readdirSync(root, { recursive: true })
      .filter((file) => file.endsWith(".js"))
      .map((file) => ({
        file: file.split(path.sep).join("/"),
        text: fs.readFileSync(path.join(root, file), "utf8"),
      }));

    expect(sources.filter(({ text }) => text.includes("localhost:4000"))).toEqual([]);
    expect(
      sources
        .filter(({ text }) => text.includes("REACT_APP_API_URL"))
        .map(({ file }) => file)
    ).toEqual(["api.js"]);
    expect(
      sources.filter(({ text }) => text.includes('from "axios"')).map(({ file }) => file)
    ).toEqual(["api.js"]);
  });
});
