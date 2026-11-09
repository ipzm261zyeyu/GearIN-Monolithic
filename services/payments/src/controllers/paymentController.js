const isValidAmount = (amount) =>
  typeof amount === "number" && Number.isFinite(amount) && amount > 0;

const isValidNonce = (nonce) => typeof nonce === "string" && nonce.length > 0;

export const createPaymentHandlers = (provider) => ({
  clientToken: async (req, res) => {
    try {
      res.send(await provider.getClientToken());
    } catch (error) {
      console.error(error);
      res.status(500).send(error);
    }
  },

  charge: async (req, res) => {
    const { amount, nonce } = req.body;
    if (!isValidAmount(amount)) {
      return res.status(400).send({
        success: false,
        message: "amount must be a positive number",
      });
    }
    if (!isValidNonce(nonce)) {
      return res.status(400).send({
        success: false,
        message: "nonce is required",
      });
    }
    try {
      const result = await provider.charge({ amount, nonce });
      res.status(result.success ? 200 : 402).send(result);
    } catch (error) {
      console.error(error);
      res.status(502).send({
        success: false,
        message: "Payment provider error",
      });
    }
  },
});
