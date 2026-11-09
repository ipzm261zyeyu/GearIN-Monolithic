import userModel from "../models/userModel.js";

export const requireUser = (req, res, next) => {
  const id = req.headers["x-user-id"];
  if (!id) {
    return res.status(401).send({
      success: false,
      message: "Unauthorized Access",
    });
  }
  req.user = { _id: id };
  next();
};

export const requireAdmin = async (req, res, next) => {
  try {
    const user = await userModel.findById(req.user._id);
    if (user.role !== 1) {
      return res.status(401).send({
        success: false,
        message: "Unauthorized Access",
      });
    }
    next();
  } catch (error) {
    console.error(error);
    res.status(401).send({
      success: false,
      error,
      message: "Error in admin middleware",
    });
  }
};
