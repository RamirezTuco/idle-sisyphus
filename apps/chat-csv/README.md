# Sisyphus / Chat CSV

An independent Next.js application adapted from the supplied Chat CSV project.
The Sisyphus landing page stays static and deploys separately.

Development URL: <https://chat-csv-bxaf227woa-uc.a.run.app>. Google sign-in is
required, and access is restricted to the approved operator's account.

## What was reused

| Source behavior | Implementation here |
|---|---|
| Upload a file, ask a question, analyze all rows | Same workflow and Gemini-generated `processData(data)` response contract |
| PapaParse CSV parsing | Reused with header, structure, row, cell, and size validation |
| Markdown, table, list, JSON, and scalar results | Component-based rendering, bounded previews, and expandable cells |
| Download/copy results | Adapted real source export logic, preserving zero/false and protecting spreadsheet string cells |
| Google identity and free daily allowance | Firebase Google sign-in; verified ID tokens and server-side quotas |

The source's environment file, credentials, accounts, Firestore data, payment
placeholders, marketing/legal claims, and build artifacts were not copied.
There is no implemented payment integration to migrate. XLSX support is new.

Generated JavaScript runs in a fresh QuickJS WebAssembly interpreter with CPU,
memory, and output limits and no host APIs. It is never evaluated in Node or
the browser. Uploaded rows stay in request memory; sample rows and the question
are sent to Gemini. Only usage/request metadata and token counts are persisted.
Do not upload sensitive data to this preview.

## Local setup

Use Node.js 24. From the repository root:

```sh
npm ci --prefix apps/chat-csv
cp apps/chat-csv/.env.example apps/chat-csv/.env.local
```

Edit `.env.local` yourself; never commit it or paste credentials into chat.

1. Obtain a Firebase web application's public configuration for the chosen
   environment. Set the four `NEXT_PUBLIC_FIREBASE_*` values. These identify the
   client app; they are not the Gemini secret.
2. Enable Firebase Authentication's Google provider and authorize `localhost`
   for local sign-in. The server only accepts verified Google-provider sessions.
3. Use a named Firestore database `chat-csv` and the supplied rules denying
   client access. All quota reads/writes go through authenticated server routes.
   Configure application-default credentials locally with authorized access to
   that database and Firebase Authentication. Do not create a service-account key.
4. Use `GEMINI_PROVIDER=vertex`, `GEMINI_REGION=us`, and ADC with Vertex AI
   access for direct Cloud Billing. No Gemini key is needed in this mode.
   Alternatively select `developer` and set server-only `GEMINI_API_KEY`; new
   Developer API accounts may require prepaid credits even with billing linked.
   Configure the allowed Firebase UIDs.
   Find a user's UID in Firebase Console > Authentication > Users. For an
   isolated local experiment, explicitly selecting
   `CHAT_CSV_ACCESS_MODE=authenticated` allows all verified Google users in the
   configured Firebase project; the default is a restricted allowlist.

Provisioning Firebase, databases, secrets, or billable runtime resources is
a separate approval step. Until configured, the UI displays a setup notice
and APIs fail explicitly rather than using mock answers or bypassing sign-in.

```sh
npm run dev:chat-csv
```

Open <http://127.0.0.1:3000>. The root portal preview remains on port 4173.
For local production serving, run `npm run build:chat-csv`, then
`npm --prefix apps/chat-csv start -- --hostname 127.0.0.1`.

## Limits and usage

| Boundary | Current setting |
|---|---|
| Upload | CSV or XLSX, at most 5 MiB |
| Dataset | At most 20,000 rows, 64 columns, 2,000 characters per cell |
| XLSX | First worksheet only; cached formula results, never formula execution |
| Workbook expansion | At most 32 MiB and 1,000 archive entries; encrypted archives rejected |
| Normalized data / model samples | At most 10 MiB / 24,000 characters |
| Question | At most 2,000 characters |
| Generated function / returned result | At most 65,536 characters / 1 MiB |
| Interpreter | 2 seconds, 128 MiB heap, no filesystem/network/imports/host functions |
| Gemini | 3.5 Flash-Lite, minimal thinking; 60-second timeout; 8,192 maximum output tokens |
| Usage | 5 accepted questions per user per UTC day by default |
| Global budget | Explicitly configured for production; example value 100/day is not an agreed launch budget |
| Metadata retention | 7-day expiration timestamps by default; Firestore TTL cleanup is asynchronous |

Headers must be non-empty and unique. CSV delimiter detection supports common
delimiters; blank rows are ignored. Results are computed against all accepted
rows, not only the model samples. AI-generated calculations can still be wrong:
review generated code and validate important answers.

Quotas are reserved atomically before a model call. Invalid inputs consume no
allowance; accepted attempts can consume allowance even if the provider fails
or the client disconnects. There is no silent localStorage fallback, browser
quota override, or automatic paid retry. Per-user and global counters share
a Firestore transaction; token settlement is idempotent.

Metadata lives in `dailyUsage/{UTC-date}`, its `users/{uid}` subcollection, and
`requests/{request-id}` in the named database. It includes counts, timestamps,
status, and verified UID, not file names, rows, questions, or results. All three
collection groups need TTL on `expiresAt`, as prepared in the infrastructure.

Firebase's peer dependencies are constrained to the app/compat versions shipped
with the pinned client SDK, and Firebase Admin's Realtime Database dependency
is constrained to a Node-compatible version. Unconstrained peers otherwise pull
packages requiring a newer Node 24 minor. This app does not use Realtime Database.

## API

| Endpoint | Behavior |
|---|---|
| `GET /api/health` | Runtime liveness only; not proof that credentials/database are configured |
| `GET /api/usage` | Bearer Firebase ID token; returns the signed-in user's daily usage |
| `POST /api/ask_csv` | Bearer token, multipart `file` and `question`; bounded analysis and result |

Errors use non-success HTTP status codes with `error`, `code`, and `requestId`.
Data/auth responses are not cached. Logs contain request IDs and failure codes,
not uploaded rows, questions, credentials, or generated results.

## Deployment preparation

[Independent Cloud Run setup](../../infra/chat-csv/README.md) describes the
separate state, app identity, named database, secret, image repository, and
disabled-by-default application workflow. No new cloud resources are provisioned
by adding these files.

Firebase public configuration is supplied at **build time**, so changing it
requires rebuilding the image. Vertex authenticates with the Cloud Run runtime
identity; it neither receives nor reads the stored Developer API key. In
Developer mode only, the key is supplied at **runtime** through Secret Manager.
The Docker build context excludes all `.env` files, tests,
local artifacts, and logs. The runtime uses a non-root user.

The default allowlist is appropriate for a personal development preview.
Before accepting persistent metadata from external users, satisfy the
production-project separation and launch gates in the platform requirements.
Choose a region and spending target before provisioning. Do not update the
portal entry to `live` until an approved deployment actually works.

The development deployment uses `us-central1` for compute/Firestore and the
`us` multi-region for Gemini processing. The original Gemini 2.5 Flash was
retired on Vertex on October 20, 2026; its recommended economical replacement
is [Gemini 3.5 Flash-Lite](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-5-flash-lite).
Both per-user and global query caps are initially five/day.

## Development checks

```sh
npm run test:chat-csv
npm run build:chat-csv
npm test
```

These use Node's built-in runner and Next.js's existing build command. Backend
tests use fake identities/provider responses, not real credentials or paid
model calls; an authenticated live smoke test remains a launch requirement.
