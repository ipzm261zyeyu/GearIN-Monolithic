import { describe, expect, it, jest } from "@jest/globals";
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

export const VIA_GATEWAY = Boolean(process.env.TEST_VIA_GATEWAY);
export const itDirect = VIA_GATEWAY ? it.skip : it;
export const itGateway = VIA_GATEWAY ? it : it.skip;
export const describeDirect = VIA_GATEWAY ? describe.skip : describe;
export const describeGateway = VIA_GATEWAY ? describe : describe.skip;

export const tokenFor = (user) =>
  JWT.sign({ _id: user._id, role: user.role }, JWT_SECRET, { expiresIn: "7d" });

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

const openServers = [];

const listen = (app) =>
  new Promise((resolve) => {
    const server = app.listen(0, () => {
      openServers.push(server);
      resolve(server);
    });
  });

const expose = async (app) => {
  const monolith = await listen(app);
  if (!VIA_GATEWAY) {
    return request(monolith);
  }
  process.env.PORT = "8080";
  process.env.MONOLITH_URL = `http://127.0.0.1:${monolith.address().port}`;
  const { Config } = await import("../../../services/gateway/src/config.js");
  const { createApp } = await import("../../../services/gateway/src/app.js");
  Config.reset();
  return request(await listen(createApp()));
};

const startUsersService = async (mongoUri, dbName) => {
  Object.assign(process.env, {
    PORT: "4001",
    MONGO_URL: mongoUri,
    MONGO_DB_NAME: dbName,
  });
  const { Database } = await import("../../../services/users/src/database.js");
  const { createApp } = await import("../../../services/users/src/app.js");
  const { default: userModel } = await import(
    "../../../services/users/src/models/userModel.js"
  );
  await Database.getInstance().connect();
  const server = await listen(createApp());
  process.env.USERS_URL = `http://127.0.0.1:${server.address().port}`;
  return { userModel, disconnect: () => Database.getInstance().disconnect() };
};

const startCatalogService = async (mongoUri, dbName) => {
  Object.assign(process.env, {
    PORT: "4002",
    MONGO_URL: mongoUri,
    MONGO_DB_NAME: dbName,
  });
  const { Database } = await import("../../../services/catalog/src/database.js");
  const { createApp } = await import("../../../services/catalog/src/app.js");
  const { MongoStorageFactory } = await import(
    "../../../services/catalog/src/storage/MongoStorageFactory.js"
  );
  const { default: productModel } = await import(
    "../../../services/catalog/src/models/productModel.js"
  );
  const { default: categoryModel } = await import(
    "../../../services/catalog/src/models/categoryModel.js"
  );
  await Database.getInstance().connect();
  const server = await listen(createApp(new MongoStorageFactory()));
  process.env.CATALOG_URL = `http://127.0.0.1:${server.address().port}`;
  return {
    productModel,
    categoryModel,
    disconnect: () => Database.getInstance().disconnect(),
  };
};

const startPaymentsService = async () => {
  const { createApp } = await import("../../../services/payments/src/app.js");
  const { BraintreeProvider } = await import(
    "../../../services/payments/src/providers/BraintreeProvider.js"
  );
  class SharedGatewayClient {
    constructor() {
      return gateway;
    }
  }
  const provider = new BraintreeProvider(
    { merchantId: "merchant-id", publicKey: "public-key", privateKey: "private-key" },
    { BraintreeGateway: SharedGatewayClient, Environment: { Sandbox: "sandbox" } }
  );
  const server = await listen(createApp(provider));
  process.env.PAYMENTS_URL = `http://127.0.0.1:${server.address().port}`;
};

const startOrdersService = async (mongoUri, dbName) => {
  Object.assign(process.env, {
    PORT: "4004",
    MONGO_URL: mongoUri,
    MONGO_DB_NAME: dbName,
  });
  const { Config } = await import("../../../services/orders/src/config.js");
  const { Database } = await import("../../../services/orders/src/database.js");
  const { createApp } = await import("../../../services/orders/src/app.js");
  const { createClients } = await import(
    "../../../services/orders/src/clients/index.js"
  );
  const { default: orderModel } = await import(
    "../../../services/orders/src/models/orderModel.js"
  );
  await Database.getInstance().connect();
  const server = await listen(createApp(createClients(Config.getInstance())));
  process.env.ORDERS_URL = `http://127.0.0.1:${server.address().port}`;
  return { orderModel, disconnect: () => Database.getInstance().disconnect() };
};

export const mountController = async (controller) => {
  const app = express();
  app.use(express.json());
  let finish;
  const settled = new Promise((resolve) => {
    finish = resolve;
  });
  app.post("/", (req, res) => {
    controller(req, res).then(() => finish(null), finish);
  });
  return { api: await expose(app), settled };
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

  const usersService = VIA_GATEWAY
    ? await startUsersService(mongo.getUri(), "gearin-test")
    : null;
  const catalogService = VIA_GATEWAY
    ? await startCatalogService(mongo.getUri(), "gearin-test")
    : null;
  if (VIA_GATEWAY) {
    await startPaymentsService();
  }
  const ordersService = VIA_GATEWAY
    ? await startOrdersService(mongo.getUri(), "gearin-test")
    : null;

  const { default: app } = await import("../../app.js");
  const { default: monolithUserModel } = await import("../../models/userModel.js");
  const userModel = usersService?.userModel ?? monolithUserModel;
  const { default: monolithCategoryModel } = await import(
    "../../models/categoryModel.js"
  );
  const { default: monolithProductModel } = await import(
    "../../models/productModel.js"
  );
  const categoryModel = catalogService?.categoryModel ?? monolithCategoryModel;
  const productModel = catalogService?.productModel ?? monolithProductModel;
  const { default: monolithOrderModel } = await import("../../models/orderModel.js");
  const orderModel = ordersService?.orderModel ?? monolithOrderModel;

  const api = await expose(app);
  let sequence = 0;

  const createUser = async (overrides = {}) => {
    sequence += 1;
    return userModel.create({
      name: `User ${sequence}`,
      email: `user${sequence}@gearin.test`,
      password: await bcrypt.hash(PASSWORD, 4),
      phone: "0501234567",
      address: "Kyiv",
      answer: VIA_GATEWAY ? await bcrypt.hash("blue", 4) : "blue",
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
    await Promise.all(
      openServers.splice(0).map((server) => {
        server.closeAllConnections();
        return new Promise((resolve) => server.close(resolve));
      })
    );
    await ordersService?.disconnect();
    await catalogService?.disconnect();
    await usersService?.disconnect();
    await mongoose.disconnect();
    await mongo.stop();
  };

  return {
    api,
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
