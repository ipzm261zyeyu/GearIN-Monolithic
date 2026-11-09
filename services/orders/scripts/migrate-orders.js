import dotenv from "dotenv";
import mongoose from "mongoose";
import { Config } from "../src/config.js";
import { migrateOrders } from "../src/migrateOrders.js";

dotenv.config({ quiet: true });

const { mongoUrl, mongoDbName } = Config.getInstance();
const client = new mongoose.mongo.MongoClient(mongoUrl);

try {
  await client.connect();
  const source = client.db();
  const target = client.db(mongoDbName);
  const stats = await migrateOrders(source, target);
  console.log(
    JSON.stringify({ source: source.databaseName, target: mongoDbName, ...stats })
  );
} finally {
  await client.close();
}
