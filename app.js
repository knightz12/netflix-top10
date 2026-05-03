const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/", require("./routes/main"));
app.use("/catalog", require("./routes/catalog"));
app.use("/api", require("./routes/api"));

module.exports = app;
