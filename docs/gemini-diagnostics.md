# Gemini timeout diagnosis

The installed official `@google/genai` version is **3.2.0**, used through its
CommonJS entry point and `models.generateContent`. Its installed source/types and
the official references agree on:

- [`httpOptions.retryOptions.attempts: 1`](https://googleapis.github.io/js-genai/release_docs/interfaces/types.HttpRetryOptions.html): one initial attempt, no retries.
- [`httpOptions.timeout`](https://googleapis.github.io/js-genai/release_docs/interfaces/types.HttpOptions.html): milliseconds per request attempt.
- [`abortSignal`](https://googleapis.github.io/js-genai/release_docs/interfaces/types.GenerateContentConfig.html): cancellation of the client HTTP request.

The client explicitly uses the Gemini Developer API at
`https://generativelanguage.googleapis.com`, API version `v1beta`.

## Live observations

All generation probes used the same local credential, official SDK, tools-disabled
generation configuration, and one attempt. Text probes omitted the PDF and course
system instructions. No credential values, request headers, document contents, or
raw provider errors were printed.

| Probe | Model | Result |
| --- | --- | --- |
| A: text only, 30-second bound | `gemini-3.8-flash` | Upstream HTTP 504 after about 28.7 seconds, before application cancellation |
| Bounded text-only comparison, 60 seconds | `gemini-3.8-flash` | Upstream HTTP 504 / `DEADLINE_EXCEEDED` after about 58.7 seconds |
| A: same text, original 30-second bound | `gemini-3.5-flash-lite` | HTTP 200, expected `OK`, about 2.1 seconds |
| B: generated valid one-page PDF | `gemini-3.5-flash-lite` | HTTP 200, known diagnostic code verified, about 2.1 seconds |
| C: existing formation PDF and wind-turbine question | `gemini-3.5-flash-lite` | HTTP 200, nonempty real answer, about 10.5 seconds; PDF read took 3 ms |
| Final HTTP endpoint with the exact Postman question | `gemini-3.5-flash-lite` | HTTP 200, real answer verified, about 9.46 seconds |

PDF probes were skipped for the failing model. They ran only after the alternate
model's text probe succeeded. DNS resolution, verified TLS, public API discovery,
and authenticated configured-model metadata lookup also succeeded. These checks
showed working connectivity and metadata access in the execution environment;
model metadata access alone does not prove generation quota or capacity.

The confirmed failure was an upstream generation deadline on the configured
`gemini-3.8-flash` path, independent of the PDF. The provider's underlying reason
for those generation deadlines remains unknown. No quota/authentication error was
returned, and these observations do not prove a permanent global model failure.

The operational fix sets `GEMINI_MODEL=gemini-3.5-flash-lite`, a
[Google-documented PDF-capable model](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite)
that passed text, tiny-PDF, and actual course-PDF checks. The local model setting,
application default, and `.env.example` agree. Other local environment values were
preserved. The default deadline stays **30000 ms**; the longer comparison did not
justify increasing it. Record snapshots and PDF content hashes were unchanged.

## Repeat the probes locally

From the project directory in Windows PowerShell:

```powershell
npm.cmd run diagnose:gemini -- --formation-id 6af1dcf4505ff5936917780e
```

This uses quiet application dotenv loading and the same model, client options,
generation options, and configured deadline as chat. It runs at most three
generation requests, with no retries:

1. A: text only, `Réponds uniquement : OK`, without course instructions.
2. B: only after A succeeds, an in-memory valid PDF with known content.
3. C: only after B succeeds, read the formation's existing PDF and ask the
   wind-turbine question.

The script never creates or replaces attachments or database records. It compares
the selected record and PDF content before and after C. It prints statuses,
timings, known sanitized error codes, and answer-verification booleans. It does
not print answers or document contents. A failure skips dependent probes and
returns a nonzero exit code. When A fails, it additionally checks DNS, verified
TLS, public discovery, and model metadata, each with a short bound. Proxy/custom
CA configuration is reported only as presence flags.

Connectivity results describe the machine running the command. An execution
sandbox restriction is not evidence that another computer cannot reach Gemini.

## Trace a Postman request

Stop the currently running development server, then run:

```powershell
$env:CHAT_DIAGNOSTICS="true"
npm.cmd run dev
```

Every chat trace has a generated request ID and monotonic elapsed times. Events
cover PDF reading, SDK request start, network request start, HTTP response receipt,
SDK response/error, and cancellation. Errors contain only allowlisted types,
HTTP/RPC statuses, and recognized transport codes. Cancellation sources distinguish
`deadline`, `client_disconnect`, and an explicit `external_abort`. An upstream
504 records `cancellationSource: none` unless a local signal also aborted.

Normal completion of the incoming request body does not cancel generation. The
controller listens for an aborted request or an unfinished response connection
closing; it removes those listeners when the handler completes. The provider
clears its timer and removes abort listeners after completion.

The test suite checks upstream-vs-local deadlines, normal completion, genuine
client disconnects, pre-cancelled requests, and the real installed SDK against a
local mock server. That server verifies one attempt on 429 and actual connection
cancellation when the configured deadline expires. These are mocked-provider
tests and do not contact Google.
