# Certificate PDF downloads

`GET /api/quizzes/attempts/:attemptId/certificate` downloads a French GreenJob
certificate from an existing saved `QuizAttempt`. It reads the attempt only;
it does not change records, create certificate documents, or store PDF files.
Formation course PDFs and Gemini chat are independent of this endpoint.

## Local configuration

Keep your current `.env` and other settings. Certificate downloads require:

```dotenv
NODE_ENV=development
CERTIFICATE_DEMO_MODE=true
```

For saving new demo attempts, keep `CERTIFICATE_PASSING_PERCENTAGE=80` (or your
chosen valid threshold). Downloads use the threshold saved on the attempt;
today's percentage setting is not read or validated by this endpoint. Changing
it affects future submissions only.

Install dependencies with `npm.cmd ci` after obtaining these changes, then run:

```powershell
npm.cmd run dev
```

The project remains CommonJS and the development script still uses
`node --watch src/server.js`. Restart after changing `.env`. The examples assume
the existing `PORT=3000` and a reachable MongoDB at your existing `MONGO_URI`.

## Exact Postman instructions

1. Obtain the `attemptId` returned by an earlier successful
   `POST /api/quizzes/:id/submit`, or copy an existing attempt's `_id` from
   MongoDB Compass (`quizattempts`). Choose a record with
   `learnerIdentifier: "demo-learner"` and `passed: true`. This is an **attempt
   ID**, not the quiz ID or formation ID. The
   [submission walkthrough](quiz-attempts.md#exact-postman-walkthrough) describes
   how to save both passing and failing demo attempts if needed.
2. Set the Postman environment variable `attemptId` to the full 24-character
   hexadecimal ID.
3. Create a **GET** request with this exact URL:

   ```text
   http://localhost:3000/api/quizzes/attempts/{{attemptId}}/certificate
   ```

4. Select **Body > none** and **Authorization > No Auth**. Optionally add
   `Accept: application/pdf`. No `Content-Type` header is needed for a bodyless
   GET. Do not supply learner identity, scores, titles, or pass/fail values.
5. Select **Send and Download**, or send and choose **Save Response > Save to a
   file**. Save as a `.pdf` if Postman asks for a name.
6. Expect **200** and these headers:

   ```http
   Content-Type: application/pdf
   Content-Disposition: attachment; filename="certificat-GJ-<full-attempt-id>.pdf"
   Cache-Control: private, no-store
   ```

7. Open the file. Check GreenJob, the learner's saved display name, formation
   and quiz title snapshots, score/total, percentage, achievement date,
   `GJ-<full-attempt-id>`, and the discreet `Mode démonstration` footer.
8. Download the same attempt again. The certificate number and achievement date
   stay the same. Changing current quiz/formation titles or today's threshold
   does not change the saved certificate details.
9. Replace `attemptId` with an existing **failing** demo attempt's ID. Use
   ordinary **Send** to inspect the **403** JSON response:

   ```json
   {
     "success": false,
     "message": "Certificate unavailable: this attempt does not meet the saved passing requirements"
   }
   ```

Malformed IDs such as `invalid` return **400**. A valid but absent ID, such as
`000000000000000000000000`, returns **404** if no such record exists. Attempts
owned by another learner return the same **404**. Disabling demo mode and
restarting causes valid certificate requests to return **503**; it does not
change the existing grading-only submit behavior.

## Eligibility and identity

The endpoint uses the existing server-side demo learner resolver. It requires
explicit demo mode in development; unset/disabled demo mode, invalid demo
settings, or unavailable identity resolution return **503**. A malformed ID is
rejected before resolving identity or reading MongoDB.

The database lookup is scoped to the attempt ID and the resolved learner's
identifier. Unknown and unowned attempts both return `Quiz attempt not found`
with **404**, without generating a PDF.

An owned attempt must have `passed === true` and valid saved numeric values:
an integer score from zero through `totalQuestions`, a positive integer
`totalQuestions`, and a finite `passingPercentage` between zero and 100. It
must satisfy:

```javascript
score / totalQuestions >= passingPercentage / 100
```

The saved rounded display percentage is not used to decide eligibility.
Thus, 2/3 still fails a saved threshold of 66.67 even if the display percentage
is 66.67. Failed or inconsistent eligibility data returns **403**. Request
parameters, headers, and bodies cannot override the server's learner, saved
snapshots, or eligibility.

## PDF rendering and errors

Generation uses pinned [PDFKit 0.20.2](https://github.com/foliojs/pdfkit/releases/tag/v0.20.2),
with its CommonJS Node entry point. The white, green-accented certificate uses
one A4 landscape page. PDFKit's standard Helvetica fonts support French
accents, apostrophes, and French ligatures without a machine-specific font
installation. Text is normalized to NFC and whitespace is collapsed for layout.
Names and titles wrap and shrink within separate measured boxes, down to a
readable 10-point minimum. Exceptionally large snapshots that cannot fit return
an error instead of truncating text, overlapping fields, or creating extra pages.

All identity and title text comes from the saved attempt, including
`learnerDisplayName`; the resolver is used for ownership only. The result shows
the saved score, question count, and display percentage. `Date de réussite` is
formatted in French from the saved `submittedAt`, explicitly in `Europe/Paris`
so the server's local timezone cannot change it. For example,
`2026-02-27T23:45:00Z` displays as `28 février 2026`.

The certificate number is `GJ-` plus the entire canonical lowercase attempt ID.
It and the date are not based on download time. PDF creation/modification
metadata also uses `submittedAt`. The safe filename contains only the fixed
prefix and that ID, never a client-supplied title or learner name.

PDF bytes are collected in memory. Download headers are sent only after the PDF
stream finishes successfully. Database read failures, incomplete/unrenderable
snapshot details, and PDFKit generation errors return **503** in the existing
JSON error format. Generation failures return:

```json
{
  "success": false,
  "message": "Unable to generate certificate PDF. Please try again."
}
```

No partial PDF or attachment headers are sent on these errors. There are no
certificate database records, permanent PDF files, new authentication models,
or admin endpoints.

## Verification

```powershell
npm.cmd test
```

For a sandbox that blocks Node's test subprocesses:

```powershell
npm.cmd test -- --test-isolation=none
```

`test/quiz-certificates.test.js` exercises real Express, Mongoose query casting,
and PDFKit with mocked database I/O. It checks content and page dimensions,
French accents and long text, download headers, stable details, saved threshold
eligibility, ownership, malformed/missing IDs, disabled/restricted demo mode,
read failures, synchronous/stream rendering errors, and waiting for generation.
The regression suite also covers attempt saving, grading validation, formation
CRUD/filtering/pagination behavior, course PDFs, and Gemini chat.

During implementation, existing passing and failing attempts in local MongoDB
were checked through this endpoint (200/403). Repeated successful downloads
were identical; the selected records and collection count were unchanged.
Generated normal and long-text sample PDFs were rendered and visually inspected
as single landscape A4 pages; text-block checks found no overlaps. Preview
artifacts were created only in the OS temporary directory, outside the app's
PDF upload storage. Automated tests never connect to real MongoDB.
