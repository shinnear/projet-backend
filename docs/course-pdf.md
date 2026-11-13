# Formation course PDFs

Start the backend in Windows PowerShell with `npm.cmd run dev`. The default base
URL is `http://localhost:3000`. Use an existing formation's `_id` from
`GET /api/trainings`.

## Upload or replace in Postman

1. Create a **POST** request to
   `http://localhost:3000/api/trainings/<formation-id>/pdf`.
2. Select **Body → form-data**.
3. Add exactly one row: key **file**, change its type from **Text** to **File**,
   and select the PDF. Do not add text fields or additional files.
4. The file part must have content type **application/pdf**. Postman normally
   detects it from the extension; set the row's content type if needed.
5. Remove any manually entered request-level `Content-Type` header. Postman must
   generate `multipart/form-data` with its boundary.
6. Send. The first attachment returns **201**; replacing it returns **200**.

Successful responses follow the existing `{ success, message, data }` convention.
`data` is the formation, with public PDF metadata:

```json
{
  "coursePdf": {
    "originalName": "course.pdf",
    "mimeType": "application/pdf",
    "size": 12345,
    "uploadedAt": "2026-11-11T12:00:00.000Z",
    "downloadUrl": "/api/trainings/<formation-id>/pdf"
  }
}
```

The same safe metadata is included in formation list/detail/update responses.
The internal storage key and filesystem directory are not exposed. Ordinary
formation POST/PUT requests cannot set `coursePdf`.

## Download in Postman

1. Create a **GET** request to
   `http://localhost:3000/api/trainings/<formation-id>/pdf` (no body).
2. Choose **Send and Download**, or send and select **Save Response → Save to a
   file**, depending on your Postman version.
3. Expect **200**, `Content-Type: application/pdf`, and
   `Content-Disposition: attachment` with the original filename.

## Validation and storage

- Maximum size: **10 × 1024 × 1024 bytes** (10 MB).
- The filename must end in `.pdf` (case insensitive), the file part must use
  `application/pdf`, and its first five bytes must be `%PDF-`.
- Missing/wrong/multiple files, unexpected fields, malformed multipart bodies,
  or malformed formation IDs return **400**.
- Oversized files return **413**.
- Unknown formations, missing attachments, or missing physical files return
  **404**.
- Errors use `{ "success": false, "message": "..." }`, with the existing
  validation error details when Mongoose rejects metadata.

Files use server-generated UUID filenames under `uploads/formations`, which has
no public static route and is ignored by Git. A formation is checked before
Multer accepts its upload. Multer buffers at most one size-limited file; disk
storage starts only after signature validation.

Replacement writes the new file before atomically updating MongoDB. The update
returns the previous metadata, so each request removes only the attachment it
actually replaced. Deletion likewise removes the attachment returned by the
atomic document deletion. Missing files are harmless during cleanup. An already
opened download can finish while an attachment is replaced or deleted.

New files are removed after definite validation/database failures. If MongoDB
loses an update acknowledgement, the service checks the current reference before
cleanup. If that check is unavailable, it keeps the candidate and logs the issue
for recovery rather than risking removal of a committed attachment. Filesystem
cleanup failures are also logged; a completed database operation remains successful.

## Tests

```powershell
npm.cmd test
```

For a sandbox that blocks Node's test subprocesses:

```powershell
npm.cmd test -- --test-isolation=none
```

The tests use uniquely created temporary directories and in-memory database I/O
fixtures while exercising real Express, Multer, Mongoose validation, and file
operations. They never connect to MongoDB or touch real uploads.
