export const toOrderItems = (cart) => {
  const quantities = new Map();
  cart.forEach(({ _id }) => {
    quantities.set(_id, (quantities.get(_id) ?? 0) + 1);
  });
  return [...quantities].map(([productId, quantity]) => ({ productId, quantity }));
};
