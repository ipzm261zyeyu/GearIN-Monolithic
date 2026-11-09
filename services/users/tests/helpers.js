import { MongoMemoryServer } from "mongodb-memory-server";

export const JWT_SECRET = "users-test-secret";

export const startMongo = async (dbName = "gearin_users") => {
  const mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    PORT: "4001",
    MONGO_URL: mongo.getUri(),
    MONGO_DB_NAME: dbName,
    JWT_SECRET,
  });
  return mongo;
};
