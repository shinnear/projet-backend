const { performance } = require("node:perf_hooks");
const { randomUUID } = require("node:crypto");

const CLIENT_DISCONNECT = Symbol("chat client disconnected");
const EVENTS = new Set([
  "pdf_read_start", "pdf_read_complete", "pdf_read_error", "gemini_request_start",
  "gemini_fetch_start", "gemini_http_response", "gemini_transport_error",
  "gemini_response", "gemini_error", "cancellation", "chat_complete",
]);
const ERROR_TYPES = new Set(["Error", "TypeError", "ApiError", "AbortError", "TimeoutError", "AggregateError"]);
const TRANSPORT_CODES = new Set([
  "ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ECONNRESET", "EHOSTUNREACH", "ENETUNREACH",
  "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_SOCKET",
  "CERT_HAS_EXPIRED", "DEPTH_ZERO_SELF_SIGNED_CERT", "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "ERR_TLS_CERT_ALTNAME_INVALID",
]);
const RPC_STATUSES = new Set([
  "DEADLINE_EXCEEDED", "UNAVAILABLE", "PERMISSION_DENIED", "UNAUTHENTICATED",
  "RESOURCE_EXHAUSTED", "INVALID_ARGUMENT", "NOT_FOUND", "INTERNAL", "CANCELLED",
]);
const SOURCES = new Set(["deadline", "client_disconnect", "external_abort", "none"]);

function safeErrorDetails(error) {
  const codes = new Set();
  function collect(item, depth = 0) {
    if (!item || depth > 4) return;
    if (TRANSPORT_CODES.has(item.code)) codes.add(item.code);
    collect(item.cause, depth + 1);
    if (Array.isArray(item.errors)) item.errors.slice(0, 8).forEach((nested) => collect(nested, depth + 1));
  }
  collect(error);
  let rpcStatus;
  // ApiError encodes the API error JSON in its message. Extract only known codes.
  if (typeof error?.message === "string" && error.message.length <= 65536) {
    try {
      const value = JSON.parse(error.message)?.error?.status;
      if (RPC_STATUSES.has(value)) rpcStatus = value;
    } catch {}
  }
  const status = Number(error?.status ?? error?.statusCode ?? error?.response?.status);
  return {
    errorType: ERROR_TYPES.has(error?.name) ? error.name : "OtherError",
    status: Number.isInteger(status) && status >= 100 && status <= 599 ? status : null,
    transportCodes: [...codes],
    ...(rpcStatus ? { rpcStatus } : {}),
  };
}

function createDiagnostics({ enabled = process.env.CHAT_DIAGNOSTICS === "true", probe } = {}) {
  const started = performance.now();
  const requestId = randomUUID();
  return {
    enabled,
    emit(event, details = {}) {
      if (!enabled || !EVENTS.has(event)) return;
      // A fixed schema prevents accidental logging of arbitrary SDK/request data.
      const record = { component: "formation-chat", requestId, event, elapsedMs: Math.round(performance.now() - started) };
      if (["A", "B", "C"].includes(probe)) record.probe = probe;
      for (const field of ["durationMs", "bytes", "timeoutMs", "attempts"]) {
        if (Number.isSafeInteger(details[field]) && details[field] >= 0) record[field] = details[field];
      }
      if (typeof details.model === "string" && /^gemini-[a-zA-Z0-9._-]{1,100}$/.test(details.model)) record.model = details.model;
      if (Number.isInteger(details.status) && details.status >= 100 && details.status <= 599) record.status = details.status;
      if (ERROR_TYPES.has(details.errorType) || details.errorType === "OtherError") record.errorType = details.errorType;
      if (RPC_STATUSES.has(details.rpcStatus)) record.rpcStatus = details.rpcStatus;
      if (SOURCES.has(details.cancellationSource)) record.cancellationSource = details.cancellationSource;
      if (Array.isArray(details.transportCodes)) record.transportCodes = details.transportCodes.filter((code) => TRANSPORT_CODES.has(code));
      console.info(JSON.stringify(record));
    },
  };
}

module.exports = { createDiagnostics, safeErrorDetails, CLIENT_DISCONNECT };
