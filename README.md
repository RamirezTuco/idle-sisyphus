# Sisyphus

A static home for independent tools. This first version is a deployable
landing page, not the applications themselves.

Chat CSV, Browser Task Runner (BTR), and Agentic Learning appear as
**coming soon** until their implementations are provided. There is no
backend, database, authentication, AI usage, upload handling, or runtime
worker. BTR does not require a worker.

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
`https://<project-id>.web.app` address, so a custom domain is not required.

1. Create or choose a GCP project and a GitHub repository. The suggested
   project ID is `sisyphus-platform-dev`, subject to availability.
2. Follow [infrastructure setup](infra/README.md) to enable Firebase
   Hosting and create the restricted GitHub deployment identity.
3. Configure the repository variables described there. Push the code to
   the configured deployment branch to deploy through GitHub Actions.

For a manual deployment after infrastructure setup:

```sh
npx firebase login
npm run deploy -- --project YOUR_PROJECT_ID
```

Always supply the project explicitly. No production project or cloud
resources have been created by adding these files. Configure the repository
variables described in the infrastructure guide before using deployment
through GitHub Actions.

The first release is a disposable public preview. Before integrating apps
that retain external-user data, use the production separation and launch
gates in [the requirements](sisyphus-platform-requirements.md).

## Connect an application later

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
| `scripts/serve.js` | Dependency-free local preview server |
| `tests/` | Node's built-in tests for catalog and preview behaviour |
| `firebase.json` | Hosting public directory and response headers |
| `infra/` | Terraform bootstrap and deployment instructions |
| `.github/workflows/` | Validation and identity-federated hosting deployment |

## Operations

The infrastructure provisions only static hosting. Hosting traffic has quotas and
may incur costs depending on the project's billing plan; review those
limits and configure appropriate billing alerts before promoting the
site. This release intentionally has no paid AI or worker execution.
Do not add analytics, cookies, or data collection without documenting the
resulting privacy and operational requirements.

Use Firebase Hosting release history to roll back a release, as described
in the infrastructure guide. Back up Terraform state securely and do not
commit state, local variable files, login tokens, or service-account keys.
