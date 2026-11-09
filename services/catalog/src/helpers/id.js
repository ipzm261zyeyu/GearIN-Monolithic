import crypto from "crypto";

const OBJECT_ID = /^[a-f\d]{24}$/i;

export const generateId = () => crypto.randomBytes(12).toString("hex");

export const isValidId = (value) =>
  typeof value === "string" && OBJECT_ID.test(value);
