import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "@jest/globals";
import {
  PASSWORD,
  describeGateway,
  gateway,
  startApp,
} from "./helpers/harness.js";

let ctx;
let adminToken;
let customer;

const login = async (email, password) => {
  const res = await ctx.api.post("/api/v1/auth/login").send({ email, password });
  expect(res.status).toBe(200);
  expect(res.body.success).toBe(true);
  return res.body.token;
};

const registerCustomer = async (email) => {
  const res = await ctx.api.post("/api/v1/auth/register").send({
    name: "Olena Customer",
    email,
    password: "customer123",
    phone: "0501234567",
    address: "Lviv",
    answer: "blue",
  });
  expect(res.status).toBe(201);
  return {
    _id: res.body.user._id,
    token: await login(email, "customer123"),
  };
};

const createCategory = async () => {
  const res = await ctx.api
    .post("/api/v1/category/create-category")
    .set("Authorization", adminToken)
    .send({ name: "Mice" });
  expect(res.status).toBe(201);
  return res.body.category;
};

const createProduct = async (category, { name, price, quantity }) => {
  const res = await ctx.api
    .post("/api/v1/product/create-product")
    .set("Authorization", adminToken)
    .field({
      name,
      description: `${name} description`,
      price: String(price),
      category: category._id,
      quantity: String(quantity),
      shipping: "true",
    });
  expect(res.status).toBe(201);
  return res.body.products;
};

const stockOf = async (product) => {
  const res = await ctx.api.get(`/api/v1/product/get-product/${product.slug}`);
  return res.body.product.quantity;
};

const checkout = (token, body) =>
  ctx.api
    .post("/api/v1/product/braintree/payment")
    .set("Authorization", token)
    .send(body);

const ordersOf = async (token) => {
  const res = await ctx.api.get("/api/v1/auth/orders").set("Authorization", token);
  expect(res.status).toBe(200);
  return res.body;
};

const approveSales = () =>
  gateway.transaction.sale.mockImplementation((_args, callback) =>
    callback(null, { success: true, transaction: { id: "tx-scenario" } })
  );

beforeAll(async () => {
  ctx = await startApp();
});

beforeEach(async () => {
  const admin = await ctx.createAdmin();
  adminToken = await login(admin.email, PASSWORD);
  customer = await registerCustomer("customer@gearin.test");
});

afterEach(() => ctx.reset());
afterAll(() => ctx.stop());

describeGateway("full checkout through the gateway", () => {
  it("takes a customer from registration to a delivered order", async () => {
    const category = await createCategory();
    const mouse = await createProduct(category, { name: "Gaming Mouse", price: 19.99, quantity: 5 });
    const keyboard = await createProduct(category, { name: "Keyboard", price: 50, quantity: 2 });

    const catalog = await ctx.api.get("/api/v1/product/get-product");
    expect(catalog.body.products.map((p) => p._id).sort()).toEqual([mouse._id, keyboard._id].sort());

    gateway.clientToken.generate.mockImplementation((_options, callback) =>
      callback(null, { success: true, clientToken: "drop-in-token" })
    );
    const clientToken = await ctx.api.get("/api/v1/product/braintree/token");
    expect(clientToken.body.clientToken).toBe("drop-in-token");

    approveSales();
    const placed = await checkout(customer.token, {
      nonce: "card-nonce",
      items: [
        { productId: mouse._id, quantity: 3 },
        { productId: keyboard._id, quantity: 1 },
      ],
    });

    expect(placed.status).toBe(200);
    expect(placed.body.ok).toBe(true);
    expect(gateway.transaction.sale.mock.calls[0][0]).toMatchObject({
      amount: "109.97",
      paymentMethodNonce: "card-nonce",
    });
    expect(await stockOf(mouse)).toBe(2);
    expect(await stockOf(keyboard)).toBe(1);

    const [order, ...others] = await ordersOf(customer.token);
    expect(others).toEqual([]);
    expect(order).toMatchObject({
      _id: placed.body.orderId,
      status: "Not Processed",
      amount: 109.97,
      transactionId: "tx-scenario",
      payment: { success: true },
      buyer: { _id: customer._id, name: "Olena Customer" },
    });
    expect(order.products).toEqual(
      expect.arrayContaining([
        { _id: mouse._id, name: "Gaming Mouse", price: 19.99, quantity: 3 },
        { _id: keyboard._id, name: "Keyboard", price: 50, quantity: 1 },
      ])
    );

    const updatedPrice = await ctx.api
      .put(`/api/v1/product/update-product/${mouse._id}`)
      .set("Authorization", adminToken)
      .field({
        name: "Renamed Mouse",
        description: "New description",
        price: "500",
        category: category._id,
        quantity: "2",
      });
    expect(updatedPrice.status).toBe(201);
    const [unchanged] = await ordersOf(customer.token);
    expect(unchanged.amount).toBe(109.97);
    expect(unchanged.products.find((p) => p._id === mouse._id)).toMatchObject({
      name: "Gaming Mouse",
      price: 19.99,
    });

    const all = await ctx.api.get("/api/v1/auth/all-orders").set("Authorization", adminToken);
    expect(all.body.map((o) => o._id)).toEqual([placed.body.orderId]);
    expect(all.body[0].buyer.name).toBe("Olena Customer");

    const shipped = await ctx.api
      .put(`/api/v1/auth/order-status/${placed.body.orderId}`)
      .set("Authorization", adminToken)
      .send({ status: "Delivered" });
    expect(shipped.status).toBe(200);
    expect((await ordersOf(customer.token))[0].status).toBe("Delivered");
  });

  it("returns the stock and creates no order when the card is declined", async () => {
    const category = await createCategory();
    const mouse = await createProduct(category, { name: "Mouse", price: 10, quantity: 3 });
    gateway.transaction.sale.mockImplementation((_args, callback) =>
      callback(null, { success: false, message: "Do Not Honor" })
    );

    const res = await checkout(customer.token, {
      nonce: "bad-card",
      items: [{ productId: mouse._id, quantity: 2 }],
    });

    expect(res.status).toBe(402);
    expect(res.body.message).toBe("Do Not Honor");
    expect(await stockOf(mouse)).toBe(3);
    expect(await ordersOf(customer.token)).toEqual([]);
  });

  it("sells the last items once and refuses the next customer without charging", async () => {
    const category = await createCategory();
    const mouse = await createProduct(category, { name: "Mouse", price: 10, quantity: 1 });
    const second = await registerCustomer("second@gearin.test");
    approveSales();

    const first = await checkout(customer.token, {
      nonce: "n1",
      items: [{ productId: mouse._id, quantity: 1 }],
    });
    const late = await checkout(second.token, {
      nonce: "n2",
      items: [{ productId: mouse._id, quantity: 1 }],
    });

    expect(first.status).toBe(200);
    expect(late.status).toBe(409);
    expect(late.body.productId).toBe(mouse._id);
    expect(gateway.transaction.sale).toHaveBeenCalledTimes(1);
    expect(await stockOf(mouse)).toBe(0);
    expect(await ordersOf(second.token)).toEqual([]);
  });

  it("charges server prices and books the order to the token owner", async () => {
    const category = await createCategory();
    const mouse = await createProduct(category, { name: "Mouse", price: 100, quantity: 2 });
    const victim = await registerCustomer("victim@gearin.test");
    approveSales();

    const res = await ctx.api
      .post("/api/v1/product/braintree/payment")
      .set("Authorization", customer.token)
      .set("x-user-id", victim._id)
      .send({
        nonce: "n",
        buyer: victim._id,
        amount: 0.01,
        items: [{ productId: mouse._id, quantity: 1, price: 0.01 }],
      });

    expect(res.status).toBe(200);
    expect(gateway.transaction.sale.mock.calls[0][0].amount).toBe("100.00");
    expect(await ordersOf(victim.token)).toEqual([]);
    expect(await ordersOf(customer.token)).toHaveLength(1);
  });

  it("does not let an anonymous visitor check out", async () => {
    const category = await createCategory();
    const mouse = await createProduct(category, { name: "Mouse", price: 10, quantity: 1 });

    const res = await ctx.api
      .post("/api/v1/product/braintree/payment")
      .send({ nonce: "n", items: [{ productId: mouse._id, quantity: 1 }] });

    expect(res.status).toBe(401);
    expect(await stockOf(mouse)).toBe(1);
  });
});
