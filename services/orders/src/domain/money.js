export const toCents = (value) => Math.round(value * 100);

export const orderTotal = (items) =>
  items.reduce((sum, { price, quantity }) => sum + toCents(price) * quantity, 0) / 100;
