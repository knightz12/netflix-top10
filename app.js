const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.text({ type: "text/plain", limit: "5mb" }));
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

app.use("/", require("./routes/main"));
app.use("/catalog", require("./routes/catalog"));
app.use("/api", require("./routes/api"));

module.exports = app;