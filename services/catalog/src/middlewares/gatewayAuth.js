const ADMIN_ROLE = "1";

export const requireAdmin = (req, res, next) => {
  if (req.headers["x-user-role"] !== ADMIN_ROLE) {
    return res.status(401).send({
      success: false,
      message: "Unauthorized Access",
    });
  }
  next();
};
