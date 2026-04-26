const express = require("express");
const {
  startStreamBridgeConsumer,
  getBridgeStatus
} = require("./utils/rabbitmqToKafka");

require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3003;

app.use(express.json());

app.use((req, res, next) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  next();
});

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: process.env.SERVICE_NAME || "stream-bridge-service",
    bridge: getBridgeStatus(),
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, async () => {
  console.log(`[Stream Bridge Service] HTTP server listening on port ${PORT}`);
  await startStreamBridgeConsumer();
});
