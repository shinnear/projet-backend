# Formation PDF chatbot

`POST /api/trainings/:id/chat` answers one independent question using only the
PDF currently attached to that formation. It reads the private file through the
existing storage helper and sends the actual bytes as inline base64 PDF input to
Google's official `@google/genai` SDK (`models.generateContent`). It does not send
the localhost download URL or create conversation records.

## Configuration

Use Node.js 24 and keep credentials only in the local `.env`. The application
loads dotenv quietly in `src/app.js`, before loading its routes. `.env` and other
local environment variants are excluded from Git; `.env.example` contains only
non-secret examples and an empty API key placeholder.

Set `GEMINI_API_KEY` locally and use:

```dotenv
GEMINI_MODEL=gemini-3.5-flash-lite
```

Google lists [Gemini 3.5 Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite)
as a supported, low-latency model accepting PDF input and producing text. The
[official JavaScript SDK reference](https://googleapis.github.io/js-genai/index.html)
documents `GoogleGenAI` and `models.generateContent`. The installed SDK supports
CommonJS through `require("@google/genai")`.

| Variable | Default | Allowed values |
| --- | --- | --- |
| `GEMINI_API_KEY` | None | Your server-side Gemini API credential |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` | A PDF-capable Gemini model identifier |
| `GEMINI_MAX_OUTPUT_TOKENS` | `1024` | Integer from 1 to 2048 |
| `GEMINI_TIMEOUT_MS` | `30000` | Integer from 1000 to 120000 |
| `CHAT_DIAGNOSTICS` | `false` | Set `true` to enable sanitized timing records |
| `CHAT_RATE_LIMIT_MAX` | `10` | Integer from 1 to 1000 |
| `CHAT_RATE_LIMIT_WINDOW_MS` | `60000` | Integer from 1000 to 3600000 |

Restart the development server after editing `.env`. Run it in PowerShell with
`npm.cmd run dev`; the existing `node --watch` script is preserved.

Configuration is validated only when chat is requested. Missing credentials,
invalid settings, or inaccessible models return a sanitized chat error while
health, CRUD, quiz scoring, filtering, and PDF endpoints remain available.

The rate limit applies per client IP to chat requests only, including rejected
requests. A rejected request returns 429 with `Retry-After`. The in-memory store
is scoped to one Node process and resets on restart. Multiple backend processes
would need a shared store for a combined limit. Express retains its existing
proxy configuration; forwarded addresses are not implicitly trusted.

## Postman

1. Create a **POST** request to
   `http://localhost:3000/api/trainings/6af1dcf4505ff5936917780e/chat`.
2. Select **Body → raw → JSON**. The header must be
   `Content-Type: application/json`.
3. Enter:

   ```json
   {
     "question": "Résume ce document en une phrase."
   }
   ```

4. Send. The formation must exist and have a PDF attached. Only `question` is
   accepted; do not add file uploads, paths, URLs, model settings, history, or
   query parameters. The question is trimmed and must contain 1–2000 Unicode
   characters afterward.

A successful response is:

```json
{
  "success": true,
  "data": {
    "formationId": "6af1dcf4505ff5936917780e",
    "answer": "The generated answer in the question's language.",
    "sourceFileName": "course.pdf"
  }
}
```

Both `formationId` and `sourceFileName` come from server-side records.

## Bounds, grounding, and errors

The system instruction restricts answers to the selected PDF, asks the model to
acknowledge missing information and cite identifiable PDF pages without inventing
references, and treats instructions embedded in the PDF as document content.
No external tools, search, code execution, or automatic tool calls are enabled.
Grounding and page references are model instructions, not independently verified
citations.

The existing **10 × 1024 × 1024 byte** attachment limit is enforced against both
the file size and the actual bytes read. The PDF signature is rechecked. Google's
[document limits](https://ai.google.dev/gemini-api/docs/document-processing#technical-details)
currently specify up to 50 MB or 1000 pages, with additional model context limits.
The application's 10 MB bound remains stricter; provider document/context
rejections are returned as sanitized 422 errors. No local text extraction or
PDF page parsing endpoint is added.

Generation defaults to a 30-second deadline, configurable through `GEMINI_TIMEOUT_MS`,
with an AbortSignal passed to the SDK and a matching HTTP timeout. Client disconnects
also abort the request. An upstream provider deadline, the application's deadline,
and client disconnect cancellation are distinguished in diagnostics. Automatic
retries and continuation are disabled. SDK
[cancellation](https://googleapis.github.io/js-genai/release_docs/interfaces/types.GenerateContentConfig.html#abortSignal)
stops the client request; Google may still finish processing a request already
received. Answers exclude thought parts and are capped at 8000 Unicode characters,
in addition to the configurable output token limit.

Errors follow `{ "success": false, "message": "..." }`:

| HTTP status | Meaning |
| --- | --- |
| 400 | Malformed ID, invalid body/question, non-JSON request, or unexpected input |
| 404 | Missing formation, PDF metadata, or private file |
| 413 | PDF exceeds the application/provider size limit |
| 422 | Invalid PDF signature, provider document limits, or blocked request/answer |
| 429 | Local chat rate limit or Gemini quota exceeded |
| 502 | Provider/network failure, empty answer, or unusable response |
| 503 | Missing/invalid configuration, inaccessible credentials/model, or provider unavailable |
| 504 | Provider request timed out or was cancelled |

Provider errors are mapped to fixed public messages. Raw provider messages,
request objects, credentials, headers, PDF content, and questions are not logged.

## Verification

Run `npm.cmd test`. If the execution sandbox blocks Node worker subprocesses,
use `npm.cmd test -- --test-isolation=none`.

`test/trainings-chat.test.js` mocks provider calls and database I/O, while using
real HTTP requests, Mongoose query casting, and temporary private PDF storage.
It verifies validation, selection of the correct PDF, response shape, independent
questions, missing files, byte limits, configuration failures, provider failures,
blocked responses, output bounds, rate limiting, timeout cancellation, and
disconnect cancellation. It never calls Gemini or changes real records/uploads.

A live Gemini request is separate from these mocked tests and must be explicitly
run with the local credential and an existing attached PDF.

See [Gemini diagnostics](gemini-diagnostics.md) for the measured timeout diagnosis,
the sequential A/B/C probe command, and safe timing details.
