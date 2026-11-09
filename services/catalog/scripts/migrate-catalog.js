import dotenv from "dotenv";
import mongoose from "mongoose";
import { Config } from "../src/config.js";
import { migrateCatalog } from "../src/migrateCatalog.js";

dotenv.config({ quiet: true });

const { mongoUrl, mongoDbName } = Config.getInstance();
const client = new mongoose.mongo.MongoClient(mongoUrl);

try {
  await client.connect();
  const source = client.db();
  const target = client.db(mongoDbName);
  const report = await migrateCatalog(source, target);
  console.log(
    JSON.stringify({ source: source.databaseName, target: mongoDbName, ...report })
  );
} finally {
  await client.close();
}
