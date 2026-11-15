# Sisyphus

A static home for independent tools, with independently deployable application
implementations under `apps/`.

Chat CSV is [live](https://chat-csv-bxaf227woa-uc.a.run.app) as a restricted
Google-sign-in development preview. Browser Task Runner (BTR) and Agentic
Learning remain **coming soon** and have not been integrated yet.
The independently deployed landing page has no
backend, accounts, uploads, AI usage, or workers. BTR does not require a worker.

## Run locally

Use Node.js 24 (`nvm use` if you use nvm).

```sh
npm ci
npm test
npm run dev
```

Open <http://127.0.0.1:4173>. No build step or cloud credentials are needed.
`PORT=4174 npm run dev` selects another port. The local server binds only
to loopback and is for development, not production.

## Deploy

Hosting serves only `public/`; source, Terraform state, and credentials are
never part of the site. Firebase supplies HTTPS and the initial
`https://idle-sisyphus.web.app` address for this project, so a custom domain
is not required.

1. Use the existing GCP project `idle-sisyphus` (number `597305374429`) and
   GitHub repository `RamirezTuco/idle-sisyphus`, deployment branch `main`.
2. Follow [infrastructure setup](infra/README.md) to enable Firebase
   Hosting and create the restricted GitHub deployment identity.
3. Configure the repository variables described there, leaving deployment
   disabled until infrastructure is ready. Set `DEPLOY_ENABLED` to exactly
   `true` to enable deployment on every main push, including documentation
   changes, or a manual workflow run on main. Setting the variable does not
   itself trigger a deployment.

For a manual deployment after infrastructure setup:

```sh
npx firebase login
npm run deploy -- --project idle-sisyphus
```

Always supply the project explicitly. Terraform manages Hosting and deployment
identity in the existing development project; it does not create a production
project or application backends. Configure the repository variables described
in the infrastructure guide before using deployment through GitHub Actions.
The `DEPLOY_ENABLED` switch applies to GitHub Actions, not the manual command.

The first release is a disposable public preview. Before integrating apps
that retain external-user data, use the production separation and launch
gates in [the requirements](sisyphus-platform-requirements.md).

## Applications

### Chat CSV

The [Chat CSV application](apps/chat-csv/README.md) reuses the supplied app's
upload, Gemini analysis, result, and export workflow, with Google sign-in,
server-side usage limits, isolated execution, and CSV/XLSX parsing.

```sh
npm ci --prefix apps/chat-csv
npm run dev:chat-csv
```

Configure its own ignored `.env.local` as documented before making local AI
requests. The default local address is <http://127.0.0.1:3000>. The deployed
app uses Vertex AI, a named Firestore database, and verified Google identity,
with five queries per user and globally per UTC day. Only the approved operator
account is allowlisted. Source credentials and existing app data are not migrated.
The independent deployment flag defaults disabled for new setups; the configured
development service is enabled after its first successful live query.

### Directory links

Deploy each supplied app independently, then edit its entry in
`public/apps.json`:

```json
{
  "id": "chat-csv",
  "name": "Chat CSV",
  "category": "Understand your data",
  "description": "Explore spreadsheets through conversation.",
  "status": "live",
  "url": "https://YOUR_ACTUAL_APP_HOST"
}
```

Use a real absolute HTTPS URL with no embedded credentials. Leave an app
as `"status": "coming-soon"` and `"url": null` until it is deployed.
Run `npm test` and deploy the directory after changing it. The browser also
validates the catalog and displays an explicit error if loading fails.
Card content is rendered as text, not injected HTML.

Subdomains can be connected once a domain is chosen. Do not place the
apps' source or secrets in `public/`. App-specific API, session, and CORS
requirements belong to each integration, not this landing page.

## Layout

| Path | Purpose |
|---|---|
| `public/` | Static page, styles, app catalog, and real 404 page |
| `apps/chat-csv/` | Independent Next.js Chat CSV implementation and container |
| `scripts/serve.js` | Dependency-free local preview server |
| `scripts/deployment-policy.js` | Shared, tested GitHub deployment eligibility and stale-commit checks |
| `tests/` | Node's built-in tests for catalog, preview, and deployment behaviour |
| `firebase.json` | Hosting public directory and response headers |
| `infra/` | Portal Terraform state; separate Chat CSV deployment preparation |
| `.github/workflows/` | Validation and identity-federated hosting deployment |

## Operations

The portal infrastructure provisions only static hosting. Hosting traffic has quotas and
may incur costs depending on the project's billing plan; review those
limits and configure appropriate billing alerts before promoting the
site. The live portal intentionally has no paid AI or worker execution. The
Chat CSV has its own approved runtime/database setup. Project-wide billing
emails are configured at INR 1,428.45/month (approximately USD 15 at setup),
at 50%, 80%, and 100%. This is an alert budget, not a daily or hard spending cap.
Do not add analytics, cookies, or data collection without documenting the
resulting privacy and operational requirements.

Use Firebase Hosting release history to roll back a release, as described
in the infrastructure guide. Back up Terraform state securely and do not
commit state, local variable files, login tokens, or service-account keys.
