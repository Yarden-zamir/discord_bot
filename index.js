let payload;
try {
  payload = require("./payload.json");
} catch (e) {}

if (payload) {
  console.log("Payload file found, running payload processor");
  const payloadProcessor = require("./payloadProcessor.js");
  payloadProcessor.process(payload);
} else {
  console.log("No payload file found, running bot server only");
  const server = require("./botServer.js");
  server.start();
}
