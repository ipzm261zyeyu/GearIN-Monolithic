import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { EJSON } from "bson";
import { hashPassword } from "./helpers/authHelper.js";

const dir = path.resolve("../../Assets/MongoDB_Datadump");
const collections = ["categories", "products", "users", "orders"];

await mongoose.connect(process.env.MONGO_URL);
const client = mongoose.connection.getClient();
const old = mongoose.connection.db;

for (const dbName of ["gearin_users", "gearin_catalog", "gearin_orders"]) {
  await client.db(dbName).dropDatabase();
  console.log(`dropped ${dbName}`);
}

for (const name of collections) {
  const docs = EJSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), "utf8"));
  await old.collection(name).deleteMany({});
  await old.collection(name).insertMany(docs);
  console.log(`${name}: ${docs.length}`);
}

await old.collection("users").insertOne({
  name: "Admin",
  email: "admin@gearin.test",
  password: await hashPassword("admin123"),
  phone: "0000000000",
  address: "Test street 1",
  answer: "test",
  role: 1,
});
console.log("admin added");

await mongoose.disconnect();