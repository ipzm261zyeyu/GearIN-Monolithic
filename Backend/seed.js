import dotenv from "dotenv";
import mongoose from "mongoose";
import slugify from "slugify";
import userModel from "./models/userModel.js";
import categoryModel from "./models/categoryModel.js";
import productModel from "./models/productModel.js";
import { hashPassword } from "./helpers/authHelper.js";

dotenv.config();

const categories = ["Keyboards", "Mice", "Headphones"];

const products = [
  { name: "Mechanical Keyboard K1", category: "Keyboards", price: 79, quantity: 20 },
  { name: "Compact Keyboard K2", category: "Keyboards", price: 59, quantity: 15 },
  { name: "Wireless Mouse M1", category: "Mice", price: 29, quantity: 40 },
  { name: "Gaming Mouse M2", category: "Mice", price: 49, quantity: 25 },
  { name: "Studio Headphones H1", category: "Headphones", price: 99, quantity: 10 },
  { name: "Wireless Headphones H2", category: "Headphones", price: 129, quantity: 12 },
];

const run = async () => {
  await mongoose.connect(process.env.MONGO_URL);

  await Promise.all([
    userModel.deleteMany({ email: "admin@gearin.test" }),
    categoryModel.deleteMany({}),
    productModel.deleteMany({}),
  ]);

  await userModel.create({
    name: "Admin",
    email: "admin@gearin.test",
    password: await hashPassword("admin123"),
    phone: "0000000000",
    address: "Test street 1",
    answer: "test",
    role: 1,
  });

  const created = {};
  for (const name of categories) {
    const c = await categoryModel.create({ name, slug: slugify(name) });
    created[name] = c._id;
  }

  for (const p of products) {
    await productModel.create({
      name: p.name,
      slug: slugify(p.name),
      description: `${p.name} — demo product`,
      price: p.price,
      quantity: p.quantity,
      category: created[p.category],
      shipping: true,
    });
  }

  console.log("Seed done");
  await mongoose.disconnect();
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});