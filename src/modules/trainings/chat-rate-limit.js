const { rateLimit, MemoryStore } = require("express-rate-limit");
const gemini = require("../../config/gemini");

function createChatRateLimit() {
  let middleware;
  let settingsKey;
  let store;

  return function limitChat(req, res, next) {
    try {
      const settings = gemini.getRateLimitConfig();
      const key = `${settings.limit}:${settings.windowMs}`;
      if (key !== settingsKey) {
        store?.shutdown();
        store = new MemoryStore();
        middleware = rateLimit({
          ...settings,
          store,
          // Construction is intentionally lazy: invalid settings affect only chat.
          validate: { creationStack: false },
          standardHeaders: "draft-8",
          legacyHeaders: false,
          handler(request, response, forward) {
            const error = new Error("Too many chat requests. Try again later.");
            error.statusCode = 429;
            forward(error);
          },
        });
        settingsKey = key;
      }
      return middleware(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

module.exports = createChatRateLimit;
