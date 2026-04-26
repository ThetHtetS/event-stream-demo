const { EventEmitter } = require("events");

const eventBus = new EventEmitter();

function registerOrderCreatedHandler(handler) {
  eventBus.on("order.created", handler);
}

async function emitOrderCreated(order) {
  const payload = {
    order,
    emittedAt: new Date().toISOString()
  };

  const listeners = eventBus.listeners("order.created");

  await Promise.all(listeners.map((listener) => listener(payload)));
}

module.exports = {
  registerOrderCreatedHandler,
  emitOrderCreated
};
