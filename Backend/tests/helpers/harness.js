import { expect, jest } from "@jest/globals";
import bcrypt from "bcrypt";
import express from "express";
import JWT from "jsonwebtoken";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";

export const JWT_SECRET = "characterization-secret";
export const NO_RESPONSE_MS = 250;
export const PASSWORD = "secret123";

export const gateway = {
  clientToken: { generate: jest.fn() },
  transaction: { sale: jest.fn() },
};
export const BraintreeGateway = jest.fn(() => gateway);

export const tokenFor = (user) =>
  JWT.sign({ _id: user._id }, JWT_SECRET, { expiresIn: "7d" });

export const failing = (model, method) =>
  jest.spyOn(model, method).mockImplementation(() => {
    throw new Error("db down");
  });

export const expectNoResponse = async (pending) => {
  const error = await pending
    .timeout({ response: NO_RESPONSE_MS })
    .then(
      () => null,
      (e) => e
    );
  expect(error).toMatchObject({ code: "ECONNABORTED" });
};

export const waitFor = async (probe) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const value = await probe();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Condition was not met in time");
};

export const mountController = (controller) => {
  const app = express();
  app.use(express.json());
  let finish;
  const settled = new Promise((resolve) => {
    finish = resolve;
  });
  app.post("/", (req, res) => {
    controller(req, res).then(() => finish(null), finish);
  });
  return { api: request(app), settled };
};

export const startApp = async () => {
  Object.assign(process.env, {
    JWT_SECRET,
    BRAINTREE_MERCHANT_ID: "merchant-id",
    BRAINTREE_PUBLIC_KEY: "public-key",
    BRAINTREE_PRIVATE_KEY: "private-key",
  });

  jest.unstable_mockModule("braintree", () => ({
    default: { BraintreeGateway, Environment: { Sandbox: "sandbox" } },
  }));
  jest.unstable_mockModule("morgan", () => ({
    default: () => (req, res, next) => next(),
  }));

  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri("gearin-test"));

  const { default: app } = await import("../../app.js");
  const { default: userModel } = await import("../../models/userModel.js");
  const { default: categoryModel } = await import(
    "../../models/categoryModel.js"
  );
  const { default: productModel } = await import(
    "../../models/productModel.js"
  );
  const { default: orderModel } = await import("../../models/orderModel.js");

  const server = app.listen(0);
  let sequence = 0;

  const createUser = async (overrides = {}) => {
    sequence += 1;
    return userModel.create({
      name: `User ${sequence}`,
      email: `user${sequence}@gearin.test`,
      password: await bcrypt.hash(PASSWORD, 4),
      phone: "0501234567",
      address: "Kyiv",
      answer: "blue",
      ...overrides,
    });
  };

  const createAdmin = (overrides = {}) => createUser({ role: 1, ...overrides });

  const createCategory = (overrides = {}) => {
    sequence += 1;
    return categoryModel.create({
      name: `Category ${sequence}`,
      slug: `category-${sequence}`,
      ...overrides,
    });
  };

  const createProduct = (category, overrides = {}) => {
    sequence += 1;
    return productModel.create({
      name: `Product ${sequence}`,
      slug: `product-${sequence}`,
      description: `Description ${sequence}`,
      price: 100,
      quantity: 5,
      category: category._id,
      shipping: true,
      createdAt: new Date(Date.UTC(2024, 0, 1, 0, sequence)),
      ...overrides,
    });
  };

  const reset = async () => {
    jest.restoreAllMocks();
    gateway.clientToken.generate.mockReset();
    gateway.transaction.sale.mockReset();
    await Promise.all(
      Object.values(mongoose.connection.collections).map((collection) =>
        collection.deleteMany({})
      )
    );
  };

  const stop = async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
    await mongo.stop();
  };

  return {
    api: request(server),
    userModel,
    categoryModel,
    productModel,
    orderModel,
    createUser,
    createAdmin,
    createCategory,
    createProduct,
    reset,
    stop,
  };
};
