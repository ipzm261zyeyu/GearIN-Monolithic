import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { Logger } from "../src/logger.js";

afterEach(() => jest.restoreAllMocks());

describe("Logger", () => {
  it("returns the same instance", () => {
    expect(Logger.getInstance()).toBe(Logger.getInstance());
  });

  it("cannot be constructed directly", () => {
    expect(() => new Logger()).toThrow("Use Logger.getInstance()");
  });

  it.each(["info", "warn", "error"])("writes %s as one JSON line", (level) => {
    const write = jest.spyOn(console, level).mockImplementation(() => {});

    Logger.getInstance()[level]("something happened", { url: "/x" });

    expect(write).toHaveBeenCalledTimes(1);
    expect(JSON.parse(write.mock.calls[0][0])).toEqual({
      time: expect.any(String),
      level,
      message: "something happened",
      url: "/x",
    });
  });

  it("accepts a message without details", () => {
    const write = jest.spyOn(console, "info").mockImplementation(() => {});

    Logger.getInstance().info("started");

    expect(JSON.parse(write.mock.calls[0][0]).message).toBe("started");
  });
});
