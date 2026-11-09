import { describe, expect, it, jest } from "@jest/globals";
import request from "supertest";
import { createApp } from "../src/app.js";
import {
  FAKE_CLIENT_TOKEN,
  FAKE_DECLINED_NONCE,
  FakeProvider,
} from "../src/providers/FakeProvider.js";

const api = request(createApp(new FakeProvider()));

const failingApi = (error) =>
  request(
    createApp({
      getClientToken: jest.fn().mockRejectedValue(error),
      charge: jest.fn().mockRejectedValue(error),
    })
  );

describe("GET /api/v1/product/braintree/token", () => {
  it("returns the client token without authentication", async () => {
    const res = await api.get("/api/v1/product/braintree/token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, clientToken: FAKE_CLIENT_TOKEN });
  });

  it("answers 500 with the provider error", async () => {
    const res = await failingApi({ type: "authenticationError" }).get(
      "/api/v1/product/braintree/token"
    );

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ type: "authenticationError" });
  });

  it("answers preflight requests for the browser", async () => {
    const res = await api
      .options("/api/v1/product/braintree/token")
      .set("Origin", "http://localhost:3000")
      .set("Access-Control-Request-Method", "GET");

    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
  });
});

describe("POST /internal/charge", () => {
  it("answers 200 with the transaction", async () => {
    const res = await api.post("/internal/charge").send({ amount: 40, nonce: "abc" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, message: null });
    expect(res.body.transactionId).toMatch(/^fake-/);
  });

  it("answers 402 for a declined payment", async () => {
    const res = await api
      .post("/internal/charge")
      .send({ amount: 40, nonce: FAKE_DECLINED_NONCE });

    expect(res.status).toBe(402);
    expect(res.body).toMatchObject({ success: false, message: "Declined" });
  });

  it.each([
    ["a missing amount", { nonce: "abc" }],
    ["a zero amount", { amount: 0, nonce: "abc" }],
    ["a negative amount", { amount: -5, nonce: "abc" }],
    ["a string amount", { amount: "40", nonce: "abc" }],
  ])("answers 400 for %s", async (_case, body) => {
    const res = await api.post("/internal/charge").send(body);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      message: "amount must be a positive number",
    });
  });

  it.each([
    ["a missing nonce", { amount: 40 }],
    ["an empty nonce", { amount: 40, nonce: "" }],
    ["a non-string nonce", { amount: 40, nonce: 7 }],
  ])("answers 400 for %s", async (_case, body) => {
    const res = await api.post("/internal/charge").send(body);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, message: "nonce is required" });
  });

  it("does not charge an invalid request", async () => {
    const charge = jest.fn();

    await request(createApp({ charge })).post("/internal/charge").send({ amount: -1, nonce: "n" });

    expect(charge).not.toHaveBeenCalled();
  });

  it("answers 502 without leaking provider details", async () => {
    const res = await failingApi(new Error("secret detail"))
      .post("/internal/charge")
      .send({ amount: 40, nonce: "abc" });

    expect(res.status).toBe(502);
    expect(res.body).toEqual({ success: false, message: "Payment provider error" });
  });
});
