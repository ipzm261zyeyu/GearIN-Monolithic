const unauthorized = (res) =>
  res.status(401).send({
    success: false,
    message: "Unauthorized Access",
  });

export const requireUser = (req, res, next) => {
  const id = req.headers["x-user-id"];
  if (!id) {
    return unauthorized(res);
  }
  req.user = { _id: id };
  next();
};

export const requireAdmin = (req, res, next) => {
  if (req.headers["x-user-role"] !== "1") {
    return unauthorized(res);
  }
  next();
};
