import { afterAll, afterEach, beforeAll, describe, expect, it, jest } from "@jest/globals";
import bcrypt from "bcrypt";
import JWT from "jsonwebtoken";
import request from "supertest";
import { createApp } from "../src/app.js";
import { Config } from "../src/config.js";
import { Database } from "../src/database.js";
import userModel from "../src/models/userModel.js";
import { JWT_SECRET, startMongo } from "./helpers.js";

let mongo;
let api;
let sequence = 0;

const registration = {
  name: "Olena",
  email: "olena@gearin.test",
  password: "secret123",
  phone: "050",
  address: "Lviv",
  answer: "blue",
};

const createUser = async (overrides = {}) => {
  sequence += 1;
  return userModel.create({
    name: `User ${sequence}`,
    email: `user${sequence}@gearin.test`,
    password: await bcrypt.hash("secret123", 4),
    phone: "050",
    address: "Kyiv",
    answer: await bcrypt.hash("blue", 4),
    ...overrides,
  });
};

const failing = (method) =>
  jest.spyOn(userModel, method).mockImplementation(() => {
    throw new Error("db down");
  });

beforeAll(async () => {
  mongo = await startMongo();
  Config.reset();
  await Database.getInstance().connect();
  api = request(createApp());
});

afterEach(async () => {
  jest.restoreAllMocks();
  await userModel.deleteMany({});
});

afterAll(async () => {
  await Database.getInstance().disconnect();
  await mongo.stop();
});

describe("POST /register", () => {
  it.each([
    ["name", { error: "Name is Required" }],
    ["email", { message: "Email is Required" }],
    ["password", { message: "Password is Required" }],
    ["phone", { message: "Phone no is Required" }],
    ["address", { message: "Address is Required" }],
    ["answer", { message: "Answer is Required" }],
  ])("reports a missing %s", async (field, body) => {
    const payload = { ...registration };
    delete payload[field];

    const res = await api.post("/api/v1/auth/register").send(payload);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(body);
  });

  it("hashes the password and the secret answer", async () => {
    const res = await api.post("/api/v1/auth/register").send(registration);

    expect(res.status).toBe(201);
    const stored = await userModel.findById(res.body.user._id);
    expect(stored.answer).not.toBe("blue");
    expect(await bcrypt.compare("blue", stored.answer)).toBe(true);
    expect(await bcrypt.compare("secret123", stored.password)).toBe(true);
  });

  it("refuses a registered email", async () => {
    await createUser({ email: registration.email });

    const res = await api.post("/api/v1/auth/register").send(registration);

    expect(res.body).toEqual({ success: false, message: "Already register please login" });
  });

  it("answers 500 when the database fails", async () => {
    failing("findOne");

    const res = await api.post("/api/v1/auth/register").send(registration);

    expect(res.status).toBe(500);
    expect(res.body.message).toBe("Error in Registration");
  });
});

describe("POST /login", () => {
  it("issues a seven day token with the id and the role", async () => {
    const user = await createUser({ role: 1 });

    const res = await api
      .post("/api/v1/auth/login")
      .send({ email: user.email, password: "secret123" });

    expect(res.status).toBe(200);
    const payload = JWT.verify(res.body.token, JWT_SECRET);
    expect(payload._id).toBe(String(user._id));
    expect(payload.role).toBe(1);
    expect(payload.exp - payload.iat).toBe(7 * 24 * 60 * 60);
  });

  it("issues role 0 to a regular user", async () => {
    const user = await createUser();

    const res = await api
      .post("/api/v1/auth/login")
      .send({ email: user.email, password: "secret123" });

    expect(JWT.verify(res.body.token, JWT_SECRET).role).toBe(0);
  });

  it("answers 404 without credentials", async () => {
    const res = await api.post("/api/v1/auth/login").send({});

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Invalid email or password");
  });

  it("answers 404 for an unknown email", async () => {
    const res = await api
      .post("/api/v1/auth/login")
      .send({ email: "no@gearin.test", password: "x" });

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Email is not registerd");
  });

  it("answers 200 with success false for a wrong password", async () => {
    const user = await createUser();

    const res = await api
      .post("/api/v1/auth/login")
      .send({ email: user.email, password: "wrong" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: false, message: "Invalid Password" });
  });

  it("answers 500 when the database fails", async () => {
    failing("findOne");

    const res = await api
      .post("/api/v1/auth/login")
      .send({ email: "a@gearin.test", password: "x" });

    expect(res.status).toBe(500);
  });
});

describe("POST /forgot-password", () => {
  it("replaces the password for the right answer", async () => {
    const user = await createUser();

    const res = await api
      .post("/api/v1/auth/forgot-password")
      .send({ email: user.email, answer: "blue", newPassword: "changed123" });

    expect(res.status).toBe(200);
    const stored = await userModel.findById(user._id);
    expect(await bcrypt.compare("changed123", stored.password)).toBe(true);
  });

  it("does not accept the stored hash as the answer", async () => {
    const user = await createUser();

    const res = await api
      .post("/api/v1/auth/forgot-password")
      .send({ email: user.email, answer: user.answer, newPassword: "changed123" });

    expect(res.status).toBe(404);
  });

  it.each([
    ["a wrong answer", (user) => ({ email: user.email, answer: "red" })],
    ["an unknown email", () => ({ email: "no@gearin.test", answer: "blue" })],
  ])("answers 404 for %s", async (_case, build) => {
    const user = await createUser();

    const res = await api
      .post("/api/v1/auth/forgot-password")
      .send({ ...build(user), newPassword: "changed123" });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, message: "Wrong Email Provided" });
  });

  it("answers 404 for a user who has no stored answer", async () => {
    const user = await createUser();
    await userModel.collection.updateOne({ _id: user._id }, { $unset: { answer: "" } });

    const res = await api
      .post("/api/v1/auth/forgot-password")
      .send({ email: user.email, answer: "blue", newPassword: "changed123" });

    expect(res.status).toBe(404);
  });

  it.each([
    ["email", { answer: "blue", newPassword: "changed123" }, "Email is required"],
    ["answer", { email: "a@gearin.test", newPassword: "changed123" }, "Answer is required"],
    ["newPassword", { email: "a@gearin.test", answer: "blue" }, "New Password is required"],
  ])("stops after answering 400 for a missing %s", async (_field, payload, message) => {
    const findOne = jest.spyOn(userModel, "findOne");

    const res = await api.post("/api/v1/auth/forgot-password").send(payload);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message });
    expect(findOne).not.toHaveBeenCalled();
  });

  it("answers 500 when the database fails", async () => {
    failing("findOne");

    const res = await api
      .post("/api/v1/auth/forgot-password")
      .send({ email: "a@gearin.test", answer: "blue", newPassword: "changed123" });

    expect(res.status).toBe(500);
    expect(res.body.message).toBe("Something Went Wrong");
  });
});

describe("POST /internal/users/by-ids", () => {
  it("returns only ids and names", async () => {
    const user = await createUser({ name: "Olena" });

    const res = await api.post("/internal/users/by-ids").send({ ids: [String(user._id)] });

    expect(res.status).toBe(200);
    expect(res.body.users).toEqual([{ _id: String(user._id), name: "Olena" }]);
  });

  it("leaves out unknown users", async () => {
    const res = await api
      .post("/internal/users/by-ids")
      .send({ ids: ["64b000000000000000000001"] });

    expect(res.body.users).toEqual([]);
  });

  it.each([[undefined], ["x"], [["bad"]], [[5]]])("answers 400 for ids %j", async (ids) => {
    const res = await api.post("/internal/users/by-ids").send({ ids });

    expect(res.status).toBe(400);
  });

  it("answers 500 when the database fails", async () => {
    failing("find");

    const res = await api.post("/internal/users/by-ids").send({ ids: [] });

    expect(res.status).toBe(500);
  });
});

describe("routes behind the gateway", () => {
  it.each([
    ["get", "/api/v1/auth/user-auth"],
    ["get", "/api/v1/auth/admin-auth"],
    ["put", "/api/v1/auth/profile"],
  ])("%s %s answers 401 without x-user-id", async (method, url) => {
    const res = await api[method](url);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, message: "Unauthorized Access" });
  });

  it("GET /user-auth answers ok with x-user-id", async () => {
    const res = await api.get("/api/v1/auth/user-auth").set("x-user-id", "abc");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("GET /admin-auth answers ok for an admin", async () => {
    const admin = await createUser({ role: 1 });

    const res = await api.get("/api/v1/auth/admin-auth").set("x-user-id", String(admin._id));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("GET /admin-auth answers 401 for a regular user", async () => {
    const user = await createUser();

    const res = await api.get("/api/v1/auth/admin-auth").set("x-user-id", String(user._id));

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Unauthorized Access");
  });

  it("GET /admin-auth answers 401 for a removed user", async () => {
    const user = await createUser({ role: 1 });
    await userModel.findByIdAndDelete(user._id);

    const res = await api.get("/api/v1/auth/admin-auth").set("x-user-id", String(user._id));

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Error in admin middleware");
  });

  it("PUT /profile updates the user from x-user-id and ignores email", async () => {
    const user = await createUser();

    const res = await api
      .put("/api/v1/auth/profile")
      .set("x-user-id", String(user._id))
      .send({ name: "Renamed", email: "new@gearin.test", password: "changed123" });

    expect(res.status).toBe(200);
    expect(res.body.updatedUser).toMatchObject({ name: "Renamed", email: user.email });
    expect(await bcrypt.compare("changed123", res.body.updatedUser.password)).toBe(true);
  });

  it("PUT /profile keeps stored values for omitted fields", async () => {
    const user = await createUser();

    const res = await api
      .put("/api/v1/auth/profile")
      .set("x-user-id", String(user._id))
      .send({});

    expect(res.body.updatedUser.password).toBe(user.password);
    expect(res.body.updatedUser.phone).toBe(user.phone);
  });

  it("PUT /profile rejects a short password", async () => {
    const user = await createUser();

    const res = await api
      .put("/api/v1/auth/profile")
      .set("x-user-id", String(user._id))
      .send({ password: "12345" });

    expect(res.body).toEqual({ error: "Passsword is Required and 6 Character Long" });
  });

  it("PUT /profile answers 400 for a removed user", async () => {
    const user = await createUser();
    await userModel.findByIdAndDelete(user._id);

    const res = await api
      .put("/api/v1/auth/profile")
      .set("x-user-id", String(user._id))
      .send({ name: "Ghost" });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Error While Updating Profile");
  });

  it("answers preflight requests for the browser", async () => {
    const res = await api
      .options("/api/v1/auth/login")
      .set("Origin", "http://localhost:3000")
      .set("Access-Control-Request-Method", "POST");

    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
  });
});
