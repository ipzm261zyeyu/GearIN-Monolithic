import { orderTotal } from "./domain/money.js";

const UNAVAILABLE_PRODUCT = "Unavailable product";

const toItems = async (products, productIds) => {
  const quantities = new Map();
  productIds.forEach((id) => {
    quantities.set(String(id), (quantities.get(String(id)) ?? 0) + 1);
  });
  const found = await products
    .find({ _id: { $in: productIds } }, { projection: { name: 1, price: 1 } })
    .toArray();
  const byId = new Map(found.map((product) => [String(product._id), product]));
  return [...quantities].map(([productId, quantity]) => ({
    productId,
    name: byId.get(productId)?.name ?? UNAVAILABLE_PRODUCT,
    price: byId.get(productId)?.price ?? 0,
    quantity,
  }));
};

const toAmount = (order, items) => {
  const paid = Number(order.payment?.transaction?.amount);
  return Number.isFinite(paid) ? paid : orderTotal(items);
};

const toNewOrder = async (order, products) => {
  const { products: productIds = [], buyer, ...rest } = order;
  const items = await toItems(products, productIds);
  return {
    ...rest,
    buyer: buyer ? String(buyer) : null,
    items,
    amount: toAmount(order, items),
    transactionId: order.payment?.transaction?.id ?? null,
  };
};

export const migrateOrders = async (sourceDb, targetDb) => {
  if (sourceDb.databaseName === targetDb.databaseName) {
    throw new Error("Source and target databases must be different");
  }

  const products = sourceDb.collection("products");
  const target = targetDb.collection("orders");
  const stats = { copied: 0, skipped: 0 };

  for await (const order of sourceDb.collection("orders").find()) {
    const existing = await target.findOne({ _id: order._id }, { projection: { _id: 1 } });
    if (existing) {
      stats.skipped += 1;
      continue;
    }
    await target.insertOne(await toNewOrder(order, products));
    stats.copied += 1;
  }

  return stats;
};
