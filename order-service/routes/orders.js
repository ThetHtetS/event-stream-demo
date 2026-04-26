const express = require("express");
const { emitOrderCreated } = require("../utils/orderEvents");

const router = express.Router();
const orders = [];

function validateOrderPayload(body) {
  const { customerName, product, quantity, price } = body;

  if (!customerName || typeof customerName !== "string" || !customerName.trim()) {
    return "customerName is required and must be a non-empty string";
  }

  if (!product || typeof product !== "string" || !product.trim()) {
    return "product is required and must be a non-empty string";
  }

  if (!Number.isInteger(quantity) || quantity <= 0) {
    return "quantity must be a positive integer";
  }

  if (typeof price !== "number" || Number.isNaN(price) || price <= 0) {
    return "price must be a positive number";
  }

  return null;
}

function createOrderId() {
  return `ord_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

router.get("/", (req, res) => {
  res.status(200).json({
    count: orders.length,
    orders
  });
});

router.post("/", async (req, res, next) => {
  try {
    const validationError = validateOrderPayload(req.body);

    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const order = {
      orderId: createOrderId(),
      customerName: req.body.customerName.trim(),
      product: req.body.product.trim(),
      quantity: req.body.quantity,
      price: req.body.price,
      total: Number((req.body.quantity * req.body.price).toFixed(2)),
      createdAt: new Date().toISOString()
    };

    orders.push(order);

    // The API stores the order first, then hands the event to the local emitter.
    // Downstream delivery happens through BullMQ, RabbitMQ, and Kafka.
    await emitOrderCreated(order);

    res.status(201).json({
      message: "Order created successfully",
      order,
      eventAccepted: true
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
