const express = require("express");

const router = express.Router();
const processedNotifications = [];

router.get("/", (req, res) => {
  res.status(200).json({
    count: processedNotifications.length,
    notifications: processedNotifications
  });
});

function saveProcessedNotification(notificationRecord) {
  processedNotifications.push(notificationRecord);
}

module.exports = router;
module.exports.processedNotifications = processedNotifications;
module.exports.saveProcessedNotification = saveProcessedNotification;
