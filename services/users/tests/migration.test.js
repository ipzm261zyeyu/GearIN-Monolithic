import { afterAll, afterEach, beforeAll, describe, expect, it } from "@jest/globals";
import bcrypt from "bcrypt";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { migrateUsers } from "../src/migrateUsers.js";

const { ObjectId } = mongoose.Types;

let mongo;
let client;
let source;
let target;

const sourceUser = (overrides = {}) => ({
  _id: new ObjectId(),
  name: "Olena",
  email: `${new ObjectId()}@gearin.test`,
  password: "$2b$10$storedpasswordhash",
  phone: "050",
  address: "Lviv",
  answer: "blue",
  role: 1,
  createdAt: new Date("2024-01-01"),
  ...overrides,
});

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  client = new mongoose.mongo.MongoClient(mongo.getUri());
  await client.connect();
  source = client.db("gearin");
  target = client.db("gearin_users");
});

afterEach(async () => {
  await source.collection("users").deleteMany({});
  await target.collection("users").deleteMany({});
});

afterAll(async () => {
  await client.close();
  await mongo.stop();
});

describe("migrateUsers", () => {
  it("copies users with their ids and every other field", async () => {
    const user = sourceUser();
    await source.collection("users").insertOne(user);

    const stats = await migrateUsers(source, target);

    expect(stats).toEqual({ copied: 1, skipped: 0, conflicts: 0 });
    const { answer, ...rest } = await target.collection("users").findOne({ _id: user._id });
    const { answer: _plain, ...expected } = user;
    expect(rest).toEqual(expected);
    expect(answer).not.toBe("blue");
  });

  it("hashes plain secret answers so they keep working", async () => {
    const user = sourceUser();
    await source.collection("users").insertOne(user);

    await migrateUsers(source, target);

    const copied = await target.collection("users").findOne({ _id: user._id });
    expect(await bcrypt.compare("blue", copied.answer)).toBe(true);
  });

  it("does not hash an answer twice", async () => {
    const hash = await bcrypt.hash("blue", 4);
    const user = sourceUser({ answer: hash });
    await source.collection("users").insertOne(user);

    await migrateUsers(source, target);

    expect((await target.collection("users").findOne({ _id: user._id })).answer).toBe(hash);
  });

  it("copies a user without an answer as is", async () => {
    const { answer: _answer, ...user } = sourceUser();
    await source.collection("users").insertOne(user);

    const stats = await migrateUsers(source, target);

    expect(stats.copied).toBe(1);
    expect((await target.collection("users").findOne({ _id: user._id })).answer).toBeUndefined();
  });

  it("can be repeated without overwriting newer data", async () => {
    const user = sourceUser();
    await source.collection("users").insertOne(user);
    await migrateUsers(source, target);
    await target.collection("users").updateOne({ _id: user._id }, { $set: { name: "Changed" } });

    const stats = await migrateUsers(source, target);

    expect(stats).toEqual({ copied: 0, skipped: 1, conflicts: 0 });
    expect((await target.collection("users").findOne({ _id: user._id })).name).toBe("Changed");
  });

  it("reports an email already taken by another user", async () => {
    const user = sourceUser();
    await source.collection("users").insertOne(user);
    await target.collection("users").insertOne(sourceUser({ email: user.email }));

    const stats = await migrateUsers(source, target);

    expect(stats).toEqual({ copied: 0, skipped: 0, conflicts: 1 });
    expect(await target.collection("users").countDocuments()).toBe(1);
  });

  it("refuses to use one database as both source and target", async () => {
    await expect(migrateUsers(source, client.db("gearin"))).rejects.toThrow("must be different");
  });
});
