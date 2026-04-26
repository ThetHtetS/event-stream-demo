const { Kafka } = require("kafkajs");
const { recordOrderCreatedEvent } = require("../routes/dashboard");

require("dotenv").config();

const brokers = (process.env.KAFKA_BROKERS || "127.0.0.1:9092")
  .split(",")
  .map((broker) => broker.trim())
  .filter(Boolean);
const topic = process.env.KAFKA_TOPIC || "orders.events";
const clientId = process.env.KAFKA_CLIENT_ID || "analytics-service";
const groupId = process.env.KAFKA_GROUP_ID || "analytics-dashboard-group";

const kafka = new Kafka({
  clientId,
  brokers
});
const consumer = kafka.consumer({ groupId });

let isStarted = false;
let connected = false;
let processedEvents = 0;

async function startKafkaConsumer() {
  if (isStarted) {
    return;
  }

  await consumer.connect();
  connected = true;

  await consumer.subscribe({ topic, fromBeginning: true });

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) {
        return;
      }

      const event = JSON.parse(message.value.toString());

      if (event.eventType === "order.created") {
        recordOrderCreatedEvent(event);
        processedEvents += 1;
      }
    }
  });

  isStarted = true;
  console.log(`[Analytics Service] Kafka consumer subscribed to ${topic}`);
}

function getKafkaStatus() {
  return {
    connected,
    topic,
    groupId,
    processedEvents
  };
}

module.exports = {
  startKafkaConsumer,
  getKafkaStatus
};
