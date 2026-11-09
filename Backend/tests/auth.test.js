import { afterAll, afterEach, beforeAll, describe, expect, it } from "@jest/globals";
import bcrypt from "bcrypt";
import JWT from "jsonwebtoken";
import {
  JWT_SECRET,
  PASSWORD,
  expectNoResponse,
  failing,
  mountController,
  startApp,
  tokenFor,
} from "./helpers/harness.js";

let ctx;
let forgotPasswordController;

const registration = {
  name: "Olena",
  email: "olena@gearin.test",
  password: "secret123",
  phone: "0501234567",
  address: "Lviv",
  answer: "blue",
};

beforeAll(async () => {
  ctx = await startApp();
  ({ forgotPasswordController } = await import(
    "../controllers/authController.js"
  ));
});

afterEach(() => ctx.reset());
afterAll(() => ctx.stop());

describe("POST /api/v1/auth/register", () => {
  it.each([
    ["name", { error: "Name is Required" }],
    ["email", { message: "Email is Required" }],
    ["password", { message: "Password is Required" }],
    ["phone", { message: "Phone no is Required" }],
    ["address", { message: "Address is Required" }],
    ["answer", { message: "Answer is Required" }],
  ])("answers 200 with a validation body when %s is missing", async (field, body) => {
    const payload = { ...registration };
    delete payload[field];

    const res = await ctx.api.post("/api/v1/auth/register").send(payload);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(body);
    expect(await ctx.userModel.countDocuments()).toBe(0);
  });

  it("creates a user and returns the whole document", async () => {
    const res = await ctx.api.post("/api/v1/auth/register").send(registration);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      success: true,
      message: "User Register Successfully",
      user: { name: "Olena", email: "olena@gearin.test", role: 0, answer: "blue" },
    });
    expect(await bcrypt.compare("secret123", res.body.user.password)).toBe(true);
  });

  // KNOWN-DEFECT-2
  it("stores the secret answer as plain text", async () => {
    await ctx.api.post("/api/v1/auth/register").send(registration);

    const stored = await ctx.userModel.findOne({ email: registration.email });

    expect(stored.answer).toBe("blue");
  });

  it("answers 200 with success false for a registered email", async () => {
    await ctx.createUser({ email: registration.email });

    const res = await ctx.api.post("/api/v1/auth/register").send(registration);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: false,
      message: "Already register please login",
    });
  });

  it("answers 500 when the database fails", async () => {
    failing(ctx.userModel, "findOne");

    const res = await ctx.api.post("/api/v1/auth/register").send(registration);

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      success: false,
      message: "Error in Registration",
    });
  });
});

describe("POST /api/v1/auth/login", () => {
  it.each([
    ["email", { password: PASSWORD }],
    ["password", { email: "someone@gearin.test" }],
  ])("answers 404 when %s is missing", async (_field, payload) => {
    const res = await ctx.api.post("/api/v1/auth/login").send(payload);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      success: false,
      message: "Invalid email or password",
    });
  });

  it("answers 404 for an unknown email", async () => {
    const res = await ctx.api
      .post("/api/v1/auth/login")
      .send({ email: "nobody@gearin.test", password: PASSWORD });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      success: false,
      message: "Email is not registerd",
    });
  });

  it("answers 200 with success false for a wrong password", async () => {
    const user = await ctx.createUser();

    const res = await ctx.api
      .post("/api/v1/auth/login")
      .send({ email: user.email, password: "wrong-password" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: false, message: "Invalid Password" });
  });

  it("returns the profile and a seven day token that carries only the id", async () => {
    const user = await ctx.createAdmin();

    const res = await ctx.api
      .post("/api/v1/auth/login")
      .send({ email: user.email, password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe("Login Successfully");
    expect(res.body.user).toEqual({
      _id: String(user._id),
      name: user.name,
      email: user.email,
      phone: user.phone,
      address: user.address,
      role: 1,
    });

    const payload = JWT.verify(res.body.token, JWT_SECRET);
    expect(Object.keys(payload).sort()).toEqual(["_id", "exp", "iat"]);
    expect(payload._id).toBe(String(user._id));
    expect(payload.exp - payload.iat).toBe(7 * 24 * 60 * 60);
  });

  it("answers 500 when the database fails", async () => {
    failing(ctx.userModel, "findOne");

    const res = await ctx.api
      .post("/api/v1/auth/login")
      .send({ email: "a@gearin.test", password: PASSWORD });

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      success: false,
      message: "Error Occured While Login",
    });
  });
});

describe("POST /api/v1/auth/forgot-password", () => {
  it("replaces the password when email and answer match", async () => {
    const user = await ctx.createUser();

    const res = await ctx.api
      .post("/api/v1/auth/forgot-password")
      .send({ email: user.email, answer: "blue", newPassword: "changed123" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: "Password Reset Successfully",
    });
    const stored = await ctx.userModel.findById(user._id);
    expect(await bcrypt.compare("changed123", stored.password)).toBe(true);
  });

  it("answers 404 when the answer does not match", async () => {
    const user = await ctx.createUser();

    const res = await ctx.api
      .post("/api/v1/auth/forgot-password")
      .send({ email: user.email, answer: "red", newPassword: "changed123" });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, message: "Wrong Email Provided" });
  });

  // KNOWN-DEFECT-2
  it("does not limit attempts to guess the secret answer", async () => {
    const user = await ctx.createUser();

    for (const answer of ["a", "b", "c", "d", "e", "f", "g", "h"]) {
      const res = await ctx.api
        .post("/api/v1/auth/forgot-password")
        .send({ email: user.email, answer, newPassword: "changed123" });
      expect(res.status).toBe(404);
    }

    const res = await ctx.api
      .post("/api/v1/auth/forgot-password")
      .send({ email: user.email, answer: "blue", newPassword: "changed123" });
    expect(res.status).toBe(200);
  });

  // KNOWN-DEFECT-4
  it.each([
    ["email", { answer: "blue", newPassword: "changed123" }, "Email is required"],
    ["answer", { email: "known", newPassword: "changed123" }, "Answer is required"],
    ["newPassword", { email: "known", answer: "blue" }, "New Password is required"],
  ])(
    "keeps running after answering 400 for a missing %s and fails on the second response",
    async (_field, payload, message) => {
      const user = await ctx.createUser();
      const body = {
        ...payload,
        ...(payload.email ? { email: user.email } : {}),
      };
      const { api, settled } = mountController(forgotPasswordController);

      const res = await api.post("/").send(body);

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ message });
      await expect(settled).resolves.toMatchObject({
        code: "ERR_HTTP_HEADERS_SENT",
      });
    }
  );

  it("answers 500 when the database fails", async () => {
    failing(ctx.userModel, "findOne");

    const res = await ctx.api
      .post("/api/v1/auth/forgot-password")
      .send({ email: "a@gearin.test", answer: "blue", newPassword: "changed123" });

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      success: false,
      message: "Something Went Wrong",
    });
  });
});

describe("protected checks", () => {
  it("GET /api/v1/auth/test answers for an admin", async () => {
    const admin = await ctx.createAdmin();

    const res = await ctx.api
      .get("/api/v1/auth/test")
      .set("Authorization", tokenFor(admin));

    expect(res.status).toBe(200);
    expect(res.text).toBe("Protected Routes");
  });

  it("GET /api/v1/auth/user-auth answers ok for a signed-in user", async () => {
    const user = await ctx.createUser();

    const res = await ctx.api
      .get("/api/v1/auth/user-auth")
      .set("Authorization", tokenFor(user));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("GET /api/v1/auth/admin-auth answers ok for an admin", async () => {
    const admin = await ctx.createAdmin();

    const res = await ctx.api
      .get("/api/v1/auth/admin-auth")
      .set("Authorization", tokenFor(admin));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("does not accept a token with the Bearer prefix", async () => {
    const user = await ctx.createUser();

    await expectNoResponse(
      ctx.api
        .get("/api/v1/auth/user-auth")
        .set("Authorization", `Bearer ${tokenFor(user)}`)
    );
  });
});

describe("PUT /api/v1/auth/profile", () => {
  it("updates the profile, hashes the password and ignores email", async () => {
    const user = await ctx.createUser();

    const res = await ctx.api
      .put("/api/v1/auth/profile")
      .set("Authorization", tokenFor(user))
      .send({
        name: "Renamed",
        email: "new@gearin.test",
        password: "changed123",
        phone: "0670000000",
        address: "Odesa",
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      message: "Profile Updated Successfully",
      updatedUser: {
        name: "Renamed",
        email: user.email,
        phone: "0670000000",
        address: "Odesa",
      },
    });
    expect(await bcrypt.compare("changed123", res.body.updatedUser.password)).toBe(true);
  });

  it("keeps the stored values for omitted fields", async () => {
    const user = await ctx.createUser();

    const res = await ctx.api
      .put("/api/v1/auth/profile")
      .set("Authorization", tokenFor(user))
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.updatedUser).toMatchObject({
      name: user.name,
      phone: user.phone,
      address: user.address,
      password: user.password,
    });
  });

  it("answers 200 with an error for a short password", async () => {
    const user = await ctx.createUser();

    const res = await ctx.api
      .put("/api/v1/auth/profile")
      .set("Authorization", tokenFor(user))
      .send({ password: "12345" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      error: "Passsword is Required and 6 Character Long",
    });
  });

  it("answers 400 when the token owner no longer exists", async () => {
    const user = await ctx.createUser();
    await ctx.userModel.findByIdAndDelete(user._id);

    const res = await ctx.api
      .put("/api/v1/auth/profile")
      .set("Authorization", tokenFor(user))
      .send({ name: "Ghost" });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      success: false,
      message: "Error While Updating Profile",
    });
  });
});
