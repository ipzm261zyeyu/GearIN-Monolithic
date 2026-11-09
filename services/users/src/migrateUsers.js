import { hashSecret, isHashed } from "./helpers/hash.js";

const withProtectedAnswer = async (user) =>
  typeof user.answer === "string" && user.answer && !isHashed(user.answer)
    ? { ...user, answer: await hashSecret(user.answer) }
    : user;

export const migrateUsers = async (sourceDb, targetDb) => {
  if (sourceDb.databaseName === targetDb.databaseName) {
    throw new Error("Source and target databases must be different");
  }

  const target = targetDb.collection("users");
  const stats = { copied: 0, skipped: 0, conflicts: 0 };

  for await (const user of sourceDb.collection("users").find()) {
    const existing = await target.findOne(
      { $or: [{ _id: user._id }, { email: user.email }] },
      { projection: { _id: 1 } }
    );
    if (existing) {
      if (existing._id.equals(user._id)) stats.skipped += 1;
      else stats.conflicts += 1;
      continue;
    }
    await target.insertOne(await withProtectedAnswer(user));
    stats.copied += 1;
  }

  return stats;
};
