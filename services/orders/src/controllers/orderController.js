const toView = (order, names) => ({
  _id: order._id,
  status: order.status,
  amount: order.amount,
  transactionId: order.transactionId,
  payment: order.payment,
  buyer: { _id: order.buyer, name: names.get(order.buyer) ?? null },
  products: order.items.map(({ productId, name, price, quantity }) => ({
    _id: productId,
    name,
    price,
    quantity,
  })),
  createdAt: order.createdAt,
  updatedAt: order.updatedAt,
});

export const createOrderHandlers = ({ orderModel, checkoutService, users }) => {
  const toViews = async (orders) => {
    const buyers = [...new Set(orders.map((order) => order.buyer).filter(Boolean))];
    const names = await users.namesByIds(buyers);
    return orders.map((order) => toView(order, names));
  };

  const respondWithOrders = async (res, findOrders) => {
    try {
      res.json(await toViews(await findOrders()));
    } catch (error) {
      console.error(error);
      res.status(500).send({
        success: false,
        message: "Error While Getting Orders",
        error,
      });
    }
  };

  return {
    mine: (req, res) =>
      respondWithOrders(res, () => orderModel.find({ buyer: req.user._id })),

    all: (req, res) =>
      respondWithOrders(res, () => orderModel.find({}).sort({ createdAt: -1 })),

    updateStatus: async (req, res) => {
      try {
        const order = await orderModel.findByIdAndUpdate(
          req.params.orderId,
          { status: req.body.status },
          { new: true }
        );
        res.json(order ? (await toViews([order]))[0] : null);
      } catch (error) {
        console.error(error);
        res.status(500).send({
          success: false,
          message: "Error While Updating Order",
          error,
        });
      }
    },

    checkout: async (req, res) => {
      try {
        const { items, nonce } = req.body;
        const order = await checkoutService.checkout({
          buyerId: req.user._id,
          items,
          nonce,
        });
        res.json({ ok: true, orderId: order._id });
      } catch (error) {
        console.error(error);
        res.status(error.status ?? 500).send({
          success: false,
          message: error.status ? error.message : "Error While Placing Order",
          ...error.details,
        });
      }
    },
  };
};
