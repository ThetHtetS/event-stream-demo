# Message Broker Demo with Node.js, Express, Redis, RabbitMQ, and Kafka

## Folder Structure

```text
project-root/
├── docker-compose.yml
├── README.md
├── order-service/
│   ├── .env.example
│   ├── .dockerignore
│   ├── Dockerfile
│   ├── package.json
│   ├── server.js
│   ├── routes/
│   │   └── orders.js
│   └── utils/
│       ├── orderEvents.js
│       ├── orderQueue.js
│       └── rabbitmq.js
└── notification-service/
    ├── .env.example
    ├── .dockerignore
    ├── Dockerfile
    ├── package.json
    ├── server.js
    ├── routes/
    │   └── notifications.js
    └── utils/
        └── rabbitmq.js
├── stream-bridge-service/
│   ├── .env.example
│   ├── Dockerfile
│   ├── package.json
│   ├── server.js
│   └── utils/
│       └── rabbitmqToKafka.js
└── analytics-service/
    ├── .env.example
    ├── Dockerfile
    ├── package.json
    ├── server.js
    ├── routes/
    │   └── dashboard.js
    └── utils/
        └── kafka.js
```

## What This Demo Shows

This project demonstrates a simple but realistic event-driven microservices architecture using:

- Node.js
- Express.js
- Redis with BullMQ
- RabbitMQ
- Kafka
- Docker Compose

Two services communicate asynchronously:

- `order-service` accepts HTTP requests and creates orders
- `notification-service` listens for RabbitMQ events and processes notifications
- `stream-bridge-service` forwards RabbitMQ events to Kafka
- `analytics-service` consumes Kafka events and serves a live dashboard

The important idea is that the Order Service does not call downstream services directly. It emits an in-process event, buffers it in BullMQ on Redis, publishes to RabbitMQ for service fan-out, then bridges to Kafka for streaming analytics and a real-time dashboard.

## Architecture Overview

Flow:

1. A client sends `POST /orders` to the Order Service.
2. The Order Service validates the request and stores the order in memory.
3. The Order Service emits `order.created` through a local `EventEmitter`.
4. BullMQ stores the event in Redis and retries delivery if RabbitMQ is unavailable.
5. A BullMQ worker publishes the `order.created` event to RabbitMQ.
6. RabbitMQ routes the event to the notification queue and the analytics bridge queue.
7. The Notification Service consumes the event asynchronously.
8. The Stream Bridge Service forwards the event to Kafka.
9. The Analytics Service consumes Kafka messages, aggregates orders by day, and pushes live updates to the dashboard.

## Streaming Pipeline

```text
EventEmitter -> BullMQ/Redis -> RabbitMQ -> Kafka -> Analytics Dashboard
```

Why this shape works well:

- `EventEmitter` keeps the HTTP layer simple and local.
- `BullMQ` adds buffering, retries, and backpressure handling.
- `RabbitMQ` fans out events to operational consumers.
- `Kafka` gives the analytics side an append-only event stream.
- `analytics-service` materializes a dashboard-friendly read model in real time.

## How RabbitMQ Fits Between the 2 Services

RabbitMQ acts as the broker between the services.

- The Order Service is the producer/publisher.
- The Notification Service is the consumer/subscriber.
- Events are published to a durable topic exchange.
- A durable queue is bound with the routing key `order.created`.
- Messages are sent as persistent JSON messages.
- The consumer acknowledges messages only after successful processing.

This means the services are loosely coupled. The Order Service does not need to know whether the Notification Service is currently busy or temporarily down.

## Event Payload Shape

The published message contains correlation and trace-friendly metadata:

```json
{
  "eventId": "evt_123456789",
  "eventType": "order.created",
  "timestamp": "2026-04-06T10:00:00.000Z",
  "source": "order-service",
  "data": {
    "orderId": "ord_123456789",
    "customerName": "John",
    "product": "Laptop",
    "quantity": 1,
    "price": 1200,
    "total": 1200,
    "createdAt": "2026-04-06T10:00:00.000Z"
  }
}
```

## Run with Docker Compose

### 1. Start everything

From the project root:

```bash
docker compose up --build
```

This starts:

- Redis on `6379`
- RabbitMQ on `5672`
- RabbitMQ Management UI on `15672`
- Kafka on `9092`
- Order Service on `3001`
- Notification Service on `3002`
- Stream Bridge Service on `3003`
- Analytics Service on `3004`

### 2. Open RabbitMQ Management UI

URL:

```text
http://localhost:15672
```

Default login:

- username: `guest`
- password: `guest`

### 3. Create an order

```bash
curl -X POST http://localhost:3001/orders \
  -H "Content-Type: application/json" \
  -d '{
    "customerName": "John",
    "product": "Laptop",
    "quantity": 1,
    "price": 1200
  }'
```

### 4. View stored orders

```bash
curl http://localhost:3001/orders
```

### 5. View processed notifications

```bash
curl http://localhost:3002/notifications
```

### 6. View dashboard stats

```bash
curl http://localhost:3004/dashboard
curl http://localhost:3004/dashboard/orders-by-day
```

### 7. Open the live dashboard

```text
http://localhost:3004/dashboard/live
```

## Run Services Manually

### 1. Start RabbitMQ only

```bash
docker compose up rabbitmq
```

### 2. Install dependencies

In one terminal:

```bash
cd order-service
npm install
```

In another terminal:

```bash
cd notification-service
npm install
```

### 3. Start the services

Order Service:

```bash
cd order-service
npm start
```

Notification Service:

```bash
cd notification-service
npm start
```

### 4. Use the APIs

Health checks:

```bash
curl http://localhost:3001/health
curl http://localhost:3002/health
```

Create an order:

```bash
curl -X POST http://localhost:3001/orders \
  -H "Content-Type: application/json" \
  -d '{
    "customerName": "Alice",
    "product": "Phone",
    "quantity": 2,
    "price": 500
  }'
```

Check notifications:

```bash
curl http://localhost:3002/notifications
```

## Expected Output Flow

When you create an order, you should see logs similar to:

```text
[Order Service] Connected to RabbitMQ
[Notification Service] Connected to RabbitMQ
[Order Service] Published order.created event for order ord_...
[Notification Service] Received order.created event for order ord_...
[Notification Service] Notification processed for customer John
```

Typical API behavior:

- `POST /orders` returns immediately after order creation
- Notification processing happens asynchronously in the background
- Analytics aggregation updates in the background from Kafka
- `GET /notifications` shows the consumed events after they are processed
- `GET /dashboard/orders-by-day` shows the real-time day-by-day order counts

## Endpoints

### Order Service

- `GET /health`
- `GET /orders`
- `POST /orders`

### Notification Service

- `GET /health`
- `GET /notifications`

### Stream Bridge Service

- `GET /health`

### Analytics Service

- `GET /health`
- `GET /dashboard`
- `GET /dashboard/orders-by-day`
- `GET /dashboard/stream`
- `GET /dashboard/live`

## Example Successful Order Response

```json
{
  "message": "Order created successfully",
  "order": {
    "orderId": "ord_1712345678901",
    "customerName": "John",
    "product": "Laptop",
    "quantity": 1,
    "price": 1200,
    "total": 1200,
    "createdAt": "2026-04-06T10:00:00.000Z"
  },
  "eventPublished": true
}
```

If RabbitMQ is temporarily unavailable, the API still stays up and returns:

```json
{
  "message": "Order created successfully",
  "order": {
    "orderId": "ord_1712345678901",
    "customerName": "John",
    "product": "Laptop",
    "quantity": 1,
    "price": 1200,
    "total": 1200,
    "createdAt": "2026-04-06T10:00:00.000Z"
  },
  "eventPublished": false
}
```

That behavior keeps the demo resilient and prevents the HTTP service from crashing when the broker is temporarily unavailable.

## Troubleshooting Tips

- If `POST /orders` returns `eventPublished: false`, RabbitMQ may still be starting. Wait a few seconds and try again.
- If Docker Compose fails on port binding, make sure ports `3001`, `3002`, `5672`, and `15672` are free.
- If services restart before RabbitMQ is ready, the built-in reconnect loop will retry automatically.
- If `GET /notifications` is empty, create a new order and watch the logs in both services.
- If you are running manually, make sure `RABBITMQ_URL` points to `amqp://guest:guest@localhost:5672`.

## Why This Is Production-Style Enough for a Demo

This project keeps the code beginner-friendly, while still including patterns commonly used in real services:

- exchange-based publishing
- durable queue
- persistent messages
- explicit message acknowledgement
- reconnect loop for RabbitMQ
- environment-based configuration
- health endpoints
- structured event payload
- clean service separation

## Notes

- Orders and notifications are stored in memory only, so restarting a service clears its local data.
- RabbitMQ persists the queue and messages, but in this demo the consumer's in-memory read model is not persisted to a database.
