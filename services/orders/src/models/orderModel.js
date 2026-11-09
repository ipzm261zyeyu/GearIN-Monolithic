import mongoose from "mongoose";
import { ORDER_STATUSES } from "../domain/OrderBuilder.js";

const itemSchema = new mongoose.Schema(
  {
    productId: { type: String, required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    buyer: { type: String },
    items: { type: [itemSchema], required: true },
    amount: { type: Number, required: true },
    transactionId: { type: String },
    payment: {},
    status: {
      type: String,
      default: ORDER_STATUSES[0],
      enum: ORDER_STATUSES,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Order", orderSchema);
