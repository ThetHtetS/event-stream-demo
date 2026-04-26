const express = require("express");
const ordersRouter = require("./routes/orders");
const { startRabbitMQ, getRabbitMQStatus } = require("./utils/rabbitmq");
const {
  startOrderEventWorker,
  getOrderQueueStatus,
  enqueueOrderCreatedEvent
} = require("./utils/orderQueue");
const { registerOrderCreatedHandler } = require("./utils/orderEvents");

require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3001;

registerOrderCreatedHandler(async ({ order }) => {
  await enqueueOrderCreatedEvent(order);
});

app.use(express.json());

app.use((req, res, next) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  next();
});

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: process.env.SERVICE_NAME || "order-service",
    rabbitmq: getRabbitMQStatus(),
    bullmq: getOrderQueueStatus(),
    timestamp: new Date().toISOString()
  });
});

app.use("/orders", ordersRouter);

app.use((err, req, res, next) => {
  console.error("[Order Service] Unhandled application error:", err);

  res.status(err.statusCode || 500).json({
    message: err.message || "Internal server error"
  });
});

app.listen(PORT, async () => {
  console.log(`[Order Service] HTTP server listening on port ${PORT}`);
  await startRabbitMQ();
  await startOrderEventWorker();
});
