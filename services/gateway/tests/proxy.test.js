import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import JWT from "jsonwebtoken";
import request from "supertest";
import { createApp } from "../src/app.js";
import { Config } from "../src/config.js";

const SECRET = "proxy-test-secret";

const listen = (app) =>
  new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });

const close = (server) => {
  server.closeAllConnections();
  return new Promise((resolve) => server.close(resolve));
};

const useMonolith = (url) => {
  process.env.PORT = "8080";
  process.env.MONOLITH_URL = url;
  process.env.USERS_URL = url;
  process.env.CATALOG_URL = url;
  process.env.PAYMENTS_URL = url;
  process.env.JWT_SECRET = SECRET;
  Config.reset();
};

let upstream;
let gateway;
let received;

beforeAll(async () => {
  const app = express();
  app.use(express.raw({ type: () => true, limit: "5mb" }));
  app.get("/api/v1/hang", () => {});
  app.get("/api/v1/binary", (req, res) => {
    res.set("Content-Type", "image/png").send(Buffer.from([0, 255, 1, 254]));
  });
  app.get("/api/v1/headers", (req, res) => {
    res.set("X-Custom", "kept");
    res.set("Access-Control-Allow-Origin", "*");
    res.cookie("a", "1").cookie("b", "2");
    res.json({ ok: true });
  });
  app.use((req, res) => {
    received.push({
      method: req.method,
      url: req.originalUrl,
      headers: req.headers,
      body: req.body,
    });
    res.status(Number(req.get("x-want-status") || 200)).json({ served: req.originalUrl });
  });
  upstream = await listen(app);

  useMonolith(`http://127.0.0.1:${upstream.address().port}`);
  gateway = await listen(createApp());
});

beforeEach(() => {
  received = [];
});

afterAll(async () => {
  await close(gateway);
  await close(upstream);
});

describe("proxying to the monolith", () => {
  it.each(["get", "post", "put", "delete"])(
    "forwards %s with the full path and query string",
    async (method) => {
      const res = await request(gateway)[method]("/api/v1/product/search/mouse?a=1&b=2");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ served: "/api/v1/product/search/mouse?a=1&b=2" });
      expect(received[0].method).toBe(method.toUpperCase());
    }
  );

  it("keeps the upstream status code", async () => {
    const res = await request(gateway)
      .get("/api/v1/auth/login")
      .set("x-want-status", "418");

    expect(res.status).toBe(418);
  });

  it("forwards the Authorization header untouched", async () => {
    await request(gateway).get("/api/v1/product/get-product").set("Authorization", "raw-token");

    expect(received[0].headers.authorization).toBe("raw-token");
  });

  it("forwards a JSON body byte for byte", async () => {
    await request(gateway)
      .post("/api/v1/auth/login")
      .set("Content-Type", "application/json")
      .send('{ "email" : "a@b.c" }');

    expect(received[0].body.toString()).toBe('{ "email" : "a@b.c" }');
  });

  it("streams a multipart body without parsing it", async () => {
    const photo = Buffer.alloc(1024 * 1024, 7);

    await request(gateway)
      .post("/api/v1/product/create-product")
      .set("Authorization", JWT.sign({ _id: "admin", role: 1 }, SECRET))
      .field("name", "Mouse")
      .attach("photo", photo, { filename: "p.png", contentType: "image/png" });

    expect(received[0].headers["content-type"]).toContain("multipart/form-data");
    expect(received[0].body.includes(photo)).toBe(true);
  });

  it("returns binary responses unchanged", async () => {
    const res = await request(gateway)
      .get("/api/v1/binary")
      .buffer(true)
      .parse((response, done) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => done(null, Buffer.concat(chunks)));
      });

    expect(res.headers["content-type"]).toContain("image/png");
    expect([...res.body]).toEqual([0, 255, 1, 254]);
  });

  it("keeps upstream headers and adds none of its own", async () => {
    const res = await request(gateway).get("/api/v1/headers");

    expect(res.headers["x-custom"]).toBe("kept");
    expect(res.headers["access-control-allow-origin"]).toBe("*");
    expect(res.headers["set-cookie"]).toHaveLength(2);
    expect(res.headers["x-powered-by"]).toBe("Express");
  });

  it("does not answer on behalf of an upstream that never responds", async () => {
    const error = await request(gateway)
      .get("/api/v1/hang")
      .timeout({ response: 250 })
      .then(
        () => null,
        (e) => e
      );

    expect(error).toMatchObject({ code: "ECONNABORTED" });
  });

  it("forwards the status page at the root", async () => {
    const res = await request(gateway).get("/");

    expect(res.body).toEqual({ served: "/" });
  });
});

describe("requests outside /api/v1", () => {
  it.each(["/api/v2/auth/login", "/api/v1", "/api/v1evil/x", "/admin"])(
    "does not forward %s",
    async (url) => {
      const res = await request(gateway).get(url);

      expect(res.status).toBe(404);
      expect(received).toHaveLength(0);
    }
  );
});

describe("when the monolith is unavailable", () => {
  it("answers 502 in JSON and logs the failure", async () => {
    const dead = await listen(express());
    const { port } = dead.address();
    await close(dead);
    useMonolith(`http://127.0.0.1:${port}`);
    const isolated = await listen(createApp());
    const log = jest.spyOn(console, "error").mockImplementation(() => {});

    const res = await request(isolated).get("/api/v1/category/get-category");

    expect(res.status).toBe(502);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
    expect(res.body).toEqual({
      success: false,
      message: "Upstream service unavailable",
    });
    expect(JSON.parse(log.mock.calls[0][0])).toMatchObject({
      level: "error",
      message: "proxy failed",
      url: "/api/v1/category/get-category",
    });
    log.mockRestore();
    await close(isolated);
  });
});
