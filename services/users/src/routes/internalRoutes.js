import express from "express";
import userModel from "../models/userModel.js";

const OBJECT_ID = /^[a-f\d]{24}$/i;

const router = express.Router();

router.post("/users/by-ids", async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string" && OBJECT_ID.test(id))) {
    return res.status(400).send({
      success: false,
      message: "ids must be an array of user ids",
    });
  }
  try {
    res.status(200).send({
      success: true,
      users: await userModel.find({ _id: { $in: ids } }).select("name"),
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({
      success: false,
      message: "Error While Getting Users",
    });
  }
});

export default router;
