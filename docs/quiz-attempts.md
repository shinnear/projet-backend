# Saving quiz results for certificates

`POST /api/quizzes/:id/submit` can now save each valid submission in the new
MongoDB `quizattempts` collection. Both passing and failing attempts are saved.
Saved passing attempts also support [certificate PDF downloads](quiz-certificates.md).
No User model, authentication, JWTs, or admin interface is added.

## Exact local configuration

Keep your existing `.env`. Add or update only these three settings:

```dotenv
NODE_ENV=development
CERTIFICATE_DEMO_MODE=true
CERTIFICATE_PASSING_PERCENTAGE=80
```

Keep your existing `MONGO_URI`, `PORT`, Gemini settings, and other settings.
For the default local database, `MONGO_URI` is
`mongodb://127.0.0.1:27017/training_module_backend`. Start MongoDB, then run:

```powershell
npm.cmd run dev
```

Restart the backend after changing `.env`; the existing script still uses
`node --watch src/server.js`. The examples below assume `PORT=3000`.

| Setting | Default | Validation |
| --- | --- | --- |
| `CERTIFICATE_DEMO_MODE` | `false` | Exactly `true` or `false`; `true` requires `NODE_ENV=development` |
| `CERTIFICATE_PASSING_PERCENTAGE` | `80` | Decimal number from `0` through `100`, inclusive |

Blank values, padded values, non-numbers, infinities, and percentages outside
the range are rejected. Fractional thresholds such as `80.5` are supported.
Configuration is checked when a valid quiz submission reaches the persistence
step. Invalid enabled configuration returns **503** and saves nothing; it does
not fall back to grading success. Other endpoints remain available.

With `CERTIFICATE_DEMO_MODE=false`, or with that variable absent, the endpoint
keeps its original grading-only behavior and response. It does not resolve a
demo learner, read the formation for a snapshot, or save an attempt. The unused
passing-percentage setting is ignored in this mode. `.env.example` leaves demo
mode disabled so saving is an explicit opt-in.

## Exact Postman walkthrough

These requests use **Body > raw > JSON** and `Content-Type: application/json`.
No Authorization header is needed for this demo.

You can use an existing quiz: call `GET /api/quizzes/:id`, use its question IDs,
and submit exactly one answer per question. Alternatively, the following setup
creates a separate one-question demo quiz without modifying existing records.

1. Send **GET** `http://localhost:3000/api/trainings?limit=1`.
   Choose an existing formation and set a Postman environment variable
   `formationId` to its `_id`. A formation PDF is not required.
2. Send **POST** `http://localhost:3000/api/quizzes` with:

   ```json
   {
     "title": "Quiz de démonstration pour les certificats",
     "formation": "{{formationId}}",
     "questions": [
       {
         "question": "Quelle action permet de recycler ?",
         "options": {
           "A": "Trier les déchets recyclables",
           "B": "Tout jeter ensemble",
           "C": "Brûler les emballages",
           "D": "Abandonner les déchets"
         },
         "correctAnswer": "A"
       }
     ]
   }
   ```

3. Expect **201**. In this request's **Scripts > Post-response** tab, add this
   script before sending, or manually copy the two returned IDs into your
   Postman environment:

   ```javascript
   const quiz = pm.response.json().data;
   pm.environment.set("quizId", quiz._id);
   pm.environment.set("questionId", quiz.questions[0]._id);
   ```

4. Send **POST** `http://localhost:3000/api/quizzes/{{quizId}}/submit` with:

   ```json
   {
     "answers": [
       { "questionId": "{{questionId}}", "answer": "A" }
     ]
   }
   ```

   Expect **200**, `score: 1`, `totalQuestions: 1`, `percentage: 100`,
   `passingPercentage: 80`, `passed: true`, and a new `attemptId`.

5. Send the same submission with `"answer": "B"`. Expect **200** with a
   different `attemptId`, `score: 0`, `percentage: 0`, and `passed: false`.
   Both records are saved.
6. Send `{"answers": []}`. Expect **400** and no saved attempt.
7. Set `CERTIFICATE_DEMO_MODE=false`, restart, and repeat a valid submission.
   Expect the original response fields only and no additional attempt.

The successful demo response has this shape (IDs below are illustrative):

```json
{
  "success": true,
  "message": "Quiz graded successfully",
  "data": {
    "quizId": "507f1f77bcf86cd799439011",
    "score": 1,
    "totalQuestions": 1,
    "percentage": 100,
    "attemptId": "507f1f77bcf86cd799439014",
    "passingPercentage": 80,
    "passed": true
  }
}
```

Submit answers only. Learner identity, titles, scores, thresholds, pass/fail,
and timestamps are chosen by the server. Extra body fields cannot override them.
Correct answers remain excluded from quiz API responses.

## Stored attempts and failures

Each `QuizAttempt` contains `quizId`, `formationId`, `quizTitle`,
`formationTitle`, `learnerIdentifier`, `learnerDisplayName`, `score`,
`totalQuestions`, `percentage`, `passingPercentage`, `passed`, and `submittedAt`.
Titles and the threshold are snapshots taken for that submission; later edits
do not change previous attempts. `submittedAt` is a server-generated date
stored in UTC. Repeated submissions each create a new attempt.

The small resolver in `src/modules/quizzes/learner.js` supplies the fixed
server-side identity `demo-learner` / `Apprenant de démonstration` only with
validated demo configuration. It is the replacement point for future real
authentication. There is no learner identity fallback when demo mode is off.

Passing compares `score / totalQuestions >= passingPercentage / 100` before
rounding. The displayed/stored `percentage` keeps the existing two-decimal
rounding. For example, 2/3 displays `66.67` but fails a `66.67` threshold.

Existing answer validation and grading remain in place. Malformed answers,
missing/duplicate/unknown question IDs, and the wrong number of answers return
**400** without saving. Unknown quizzes return **404**. In enabled demo mode, a
missing referenced formation also returns **404**, since its title snapshot
cannot be obtained.

A failed attempt insert returns **503** with
`{"success":false,"message":"Unable to save quiz attempt. Please try again."}`.
There is no success result or `attemptId` until the save completes. Database
details are not returned. If a database write commits but its acknowledgement
is lost, the request still returns an error; a retry can create another attempt.
There is no deduplication in this first step.

No migration or changes to existing quiz/formation documents are required.
There is no new attempt-listing API. To inspect saved records, select the
database from your `MONGO_URI` in MongoDB Compass and open `quizattempts`.
Filter by `{ "learnerIdentifier": "demo-learner" }` or the returned attempt ID.

## Tests

```powershell
npm.cmd test
```

If the sandbox blocks Node's test subprocesses with `spawn EPERM`, use:

```powershell
npm.cmd test -- --test-isolation=none
```

`test/quizzes-submit.test.js` exercises real Express requests, Mongoose query
casting, schema validation, and document creation with mocked collection I/O.
It covers passing/failing/zero scores, exact and rounded thresholds, snapshots,
untrusted body fields, invalid submissions, save failures, waiting for the save,
configuration validation, the development-only restriction, and grading with
demo mode disabled. Tests never connect to MongoDB or modify your `.env`.
