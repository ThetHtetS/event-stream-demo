const express = require("express");
const notificationsRouter = require("./routes/notifications");
const { startRabbitMQConsumer, getRabbitMQStatus } = require("./utils/rabbitmq");

require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3002;

app.use(express.json());

app.use((req, res, next) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  next();
});

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: process.env.SERVICE_NAME || "notification-service",
    rabbitmq: getRabbitMQStatus(),
    timestamp: new Date().toISOString()
  });
});

app.use("/notifications", notificationsRouter);

app.use((err, req, res, next) => {
  console.error("[Notification Service] Unhandled application error:", err);

  res.status(err.statusCode || 500).json({
    message: err.message || "Internal server error"
  });
});

app.listen(PORT, async () => {
  console.log(`[Notification Service] HTTP server listening on port ${PORT}`);
  await startRabbitMQConsumer();
});
