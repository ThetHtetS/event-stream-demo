const express = require("express");
const dashboardRouter = require("./routes/dashboard");
const { startKafkaConsumer, getKafkaStatus } = require("./utils/kafka");

require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3004;

app.use(express.json());

app.use((req, res, next) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  next();
});

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: process.env.SERVICE_NAME || "analytics-service",
    kafka: getKafkaStatus(),
    timestamp: new Date().toISOString()
  });
});

app.use("/dashboard", dashboardRouter);

app.listen(PORT, async () => {
  console.log(`[Analytics Service] HTTP server listening on port ${PORT}`);
  await startKafkaConsumer();
});
