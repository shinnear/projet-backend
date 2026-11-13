function configurationError() {
  const error = new Error("Chat configuration is missing or invalid");
  error.statusCode = 503;
  return error;
}

function integerSetting(name, fallback, minimum, maximum) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  if (!/^\d+$/.test(raw)) throw configurationError();
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw configurationError();
  }
  return value;
}

function getConfig() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const model = (process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite").trim();
  if (!apiKey || /\s/.test(apiKey) || !/^gemini-[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(model)) {
    throw configurationError();
  }
  return {
    apiKey,
    model,
    maxOutputTokens: integerSetting("GEMINI_MAX_OUTPUT_TOKENS", 1024, 1, 2048),
    timeoutMs: integerSetting("GEMINI_TIMEOUT_MS", 30000, 1000, 120000),
  };
}

function getRateLimitConfig() {
  return {
    limit: integerSetting("CHAT_RATE_LIMIT_MAX", 10, 1, 1000),
    windowMs: integerSetting("CHAT_RATE_LIMIT_WINDOW_MS", 60000, 1000, 3600000),
  };
}

function createClient(config) {
  // Initialize only for chat, so an invalid key cannot prevent application startup.
  const { GoogleGenAI } = require("@google/genai");
  return new GoogleGenAI({
    apiKey: config.apiKey,
    vertexai: false,
    httpOptions: {
      baseUrl: "https://generativelanguage.googleapis.com",
      apiVersion: "v1beta",
      timeout: config.timeoutMs,
      retryOptions: { attempts: 1 },
    },
  });
}

function generationConfig(settings) {
  return {
    maxOutputTokens: settings.maxOutputTokens,
    responseModalities: ["TEXT"],
    tools: [],
    automaticFunctionCalling: { disable: true },
    automaticContinuation: false,
    httpOptions: { timeout: settings.timeoutMs, retryOptions: { attempts: 1 } },
    ...(settings.model.startsWith("gemini-3")
      ? { thinkingConfig: { thinkingLevel: "LOW", includeThoughts: false } }
      : {}),
  };
}

module.exports = { getConfig, getRateLimitConfig, createClient, generationConfig, configurationError };
