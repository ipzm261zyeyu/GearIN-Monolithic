const COLLECTIONS = ["categories", "products"];

const copyCollection = async (source, target) => {
  const stats = { copied: 0, skipped: 0 };
  for await (const document of source.find()) {
    const existing = await target.findOne(
      { _id: document._id },
      { projection: { _id: 1 } }
    );
    if (existing) {
      stats.skipped += 1;
      continue;
    }
    await target.insertOne(document);
    stats.copied += 1;
  }
  return stats;
};

export const migrateCatalog = async (sourceDb, targetDb) => {
  if (sourceDb.databaseName === targetDb.databaseName) {
    throw new Error("Source and target databases must be different");
  }

  const report = {};
  for (const name of COLLECTIONS) {
    report[name] = await copyCollection(
      sourceDb.collection(name),
      targetDb.collection(name)
    );
  }
  return report;
};
