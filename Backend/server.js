import dotenv from "dotenv";
import connectDB from "./config/db.js";
import app from "./app.js";

// ENV Configuration
dotenv.config();

// Database Configuration
connectDB();

// Port
const PORT = process.env.PORT || 4000;

// Server Listen
app.listen(PORT, () => {
  console.log(
    `Server Running on ${process.env.DEV_MODE} mode on port ${PORT}`
  );
});
