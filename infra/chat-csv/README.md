# Chat CSV deployment preparation

Development service: <https://chat-csv-bxaf227woa-uc.a.run.app>. The approved
setup has been provisioned and its first authenticated analysis completed.
The runbook below remains approval-gated for any new environment or changes;
the project-specific state and tester identities are ignored local files.

**Preparation only. Nothing here authorizes cloud changes, billing changes, secret
creation, image publication, deployment, or public release.** Deployment is
disabled unless the repository variable `CHAT_CSV_DEPLOY_ENABLED` is exactly
`true`. Keep it unset/`false` until the foundation, app, secret, Firebase Auth,
and the relevant stage have been reviewed and separately approved.

## Isolation and ownership

- Run Terraform only from `infra/chat-csv` (or with `-chdir=infra/chat-csv`).
  This is an independent root module with its own local `terraform.tfstate`,
  not a child module of `infra`. Never point it at the portal state, import
  portal resources, run root `terraform apply`, or reuse root credentials.
  The existing root `.gitignore` ignores `.terraform`, state, plans, and
  `*.tfvars`; only the example and generated provider lock belong in Git.
  Securely back up this independent local state before any eventual apply.
  No remote backend or billing linkage is provisioned.
- Reuses the **already provisioned** Firebase project `idle-sisyphus`
  (project number `597305374429`) and WIF pool `sisyphus-github` as a data
  source, not as managed resources. Existing project-level Firebase, IAM,
  IAM Credentials, STS, Resource Manager, and Service Usage APIs remain owned
  by the root foundation. This module enables only app APIs, keeping them
  enabled on destroy.
- Separate `chat-csv-runtime` and `chat-csv-deploy` service accounts; separate
  regional Docker repository `chat-csv`, web-app registration, secret metadata,
  named Native Firestore database `chat-csv`, and Cloud Run service `chat-csv`.
  No Firebase Hosting site, worker, queue, storage bucket, or uploaded-file
  persistence is provisioned.
- The new WIF provider accepts **only** repository
  `RamirezTuco/idle-sisyphus`, branch `main`, workflow
  `.github/workflows/chat-csv.yml`, and push/manual events. Its exclusive
  `attribute.deployment=chat-csv` binding prevents a token accepted by the
  existing Hosting provider from impersonating this deploy account merely
  because the repository matches. It deliberately does not map
  `attribute.repository`, so its tokens cannot match the existing Hosting
  account's repository binding either. Do not broaden the existing provider.
- Deploy permissions are repository-scoped Artifact Registry Writer,
  Service Account User on only the runtime identity, project Service Usage
  Consumer, and Cloud Run Developer on only the service **after it exists**.
  CI cannot create the bootstrap service or change its IAM. No Run Admin,
  Editor, Owner, Gemini secret access, or Firestore access is granted to CI.
- Runtime has Datastore User conditionally restricted to the named database,
  Firebase Auth Viewer for `verifyIdToken(token, true)` revocation checks,
  and Vertex AI User plus Service Usage Consumer for the selected Vertex
  provider and its quota project. Developer mode instead
  grants Secret Accessor on only `chat-csv-gemini-api-key`; Vertex runtime has
  no access to that key.

## Required decisions and data boundary

`region` has **no default**. Choose a location supported by Cloud Run,
Artifact Registry, and Firestore before approving a plan. The database location
is immutable; changing this requires deliberate migration, not replacement.
The database has API delete protection and Terraform `prevent_destroy`.

`global_daily_limit` also has **no default**. It is an explicit global daily
AI-request cap; `100` in the example is strictly illustrative, not approved.
The per-user cap defaults to `5`. These server-enforced request limits are
not a monetary budget, quota guarantee, or billing hard stop. No billing
account or cloud budget is changed.

The approved development setup uses `us-central1`, five queries/user/day and
five globally/day, and `model_provider="vertex"`. Its project-wide email budget
is configured separately in Cloud Billing at INR 1,428.45/month (approximately
USD 15 at the setup-time Google conversion), with 50%, 80%, and 100% actual-spend
alerts to project owners and default billing recipients. The user's existing
account budget is preserved. This is not a daily alert or a hard spending cap;
reports/emails can be delayed.

Firebase-managed Google-provider provisioning initialized Identity
Platform-backed Authentication in this development project. Review its MAU
pricing and the production launch gates before admitting external users.

Runtime stays absent with `enable_runtime=false`. Enabling it requires a real
own-repository `app@sha256:...` image and nonempty `allowed_uids` in default
`allowlist` mode. Explicit `access_mode="authenticated"` admits all signed-in
users and requires production/public-release approval; it is not anonymous
access. The Cloud Run frontend is publicly invokable for the UI, while **every
AI API request must verify a Firebase Google ID token, check revocation and
access policy, and reserve server-authoritative Firestore usage**.

Firestore stores only server metadata and counters, never uploaded files,
questions, prompts, model outputs, or analysis results. Clients cannot read or
write Firestore. Terraform publishes `apps/chat-csv/firestore.rules` (deny all
client reads/writes) to release **`cloud.firestore/chat-csv`**, not the default
database. Server SDK access uses IAM and bypasses those rules. TTL is enabled
on timestamp `expiresAt` in collection groups `dailyUsage`, `users`, and
`requests`; the app must populate that field with seven-day expiry. TTL deletion
is asynchronous, not an exact seven-day erasure SLA.

Do not copy or reuse the source app's Gemini key, service-account credentials,
Firebase configuration, storage, database, or persisted content. The new web
registration shares project-level Firebase Auth; it does not create an isolated
user directory or a unique OAuth consent screen. Firebase public web config is
intended for the browser and differs from the server-only Gemini credential.

## Local, credential-free checks

Terraform 1.9.8 is used in CI; supported local versions are `>=1.9,<2`.
Providers are pinned to `google`/`google-beta` 6.50.0.

From the repository root:

```sh
terraform -chdir=infra/chat-csv fmt -check -recursive
terraform -chdir=infra/chat-csv init -backend=false -input=false -lockfile=readonly
terraform -chdir=infra/chat-csv validate -no-color
```

These checks do not need GCP credentials or a live plan. The independent
workflow runs them alongside `npm ci`, `npm test`, and `npm run build` in
`apps/chat-csv` using Node 24 on PRs, pushes, and manual runs. It leaves the
portal workflow untouched. All deploy jobs independently enforce the flag,
event, and branch even if a PR supplies a forged eligibility output. They
check the current branch commit before cloud authentication, use the checked
SHA, and serialize deployment in an app-specific concurrency group.

## Future operator runbook — only after separate approvals

The following are instructions for a later approved operation, **not commands
executed as part of preparation**. Do not share credentials in chat or code.
Use an independently authorized operator login/ADC; never copy credentials
from the source application or export a service-account JSON key.

### 1. Approve and apply foundation only

Select the immutable region and global request cap. Copy the example locally:

```sh
cp infra/chat-csv/terraform.tfvars.example infra/chat-csv/terraform.tfvars
```

Edit the ignored file: set `region`, `global_daily_limit`, and eventual allowed
UIDs; keep `enable_runtime=false`. Verify the app rules file exists. Review the
separate app-only plan, obtain cloud-operation approval, then apply **that
reviewed plan**:

```sh
terraform -chdir=infra/chat-csv init -input=false -lockfile=readonly
terraform -chdir=infra/chat-csv plan -input=false -out=foundation.tfplan
# Stop here for explicit review/approval before proceeding.
terraform -chdir=infra/chat-csv apply foundation.tfplan
terraform -chdir=infra/chat-csv output
```

The plan must not create/modify the root Firebase project, WIF pool/provider,
Hosting site, billing, or existing application resources. This stage creates
**no Cloud Run service, public invoker binding, or secret version**.

### 2. Configure the model provider and Firebase Auth

Default Vertex mode uses the runtime service account and direct Cloud Billing,
not a Gemini Developer API key or prepaid balance. Gemini 3.5 Flash-Lite uses
the supported `us` multi-region endpoint; compute and Firestore remain in
`us-central1`. Standard ADC is used without exporting a service-account key.

The app's separate Developer API key is retained in Secret Manager for optional
Developer mode, not injected into the Vertex container. Avoid printing API-key
creation responses: `gcloud services api-keys create` can print the operation's
key material even with `--format=none`. Use the Console or a non-logging API
flow, and rotate any key exposed in output.

Only when selecting Developer mode, after approval, create a **new app-appropriate** Gemini Developer API key
associated with the intended project through Google AI Studio/Google Cloud
Console. Check API/key restrictions and service availability; do not enable or
change billing without separate approval. In Secret Manager Console, select
`chat-csv-gemini-api-key` in `idle-sisyphus` and **Add new version** with this
new value. Terraform manages metadata only: no secret-version resource, secret
data source, value, Terraform variable, GitHub secret, Docker build argument,
or secret-reading command. Ensure the enabled version will resolve as
`latest` before enabling the runtime.

In Firebase Console, Authentication → Sign-in method, configure the **Google**
provider for the existing project with the appropriate support/contact and
consent settings. Review project-level OAuth consent configuration instead of
assuming one consent screen per web app. Authentication → Settings →
Authorized domains: keep/add the actual auth-domain hostname from this
app's config; after stage 4, add the exact Cloud Run/custom hostname you will
use. Domains are hostnames, not full URLs or paths. Do **not** enter
`*.web.app`; if a Hosting hostname is actually used, authorize its exact
hostname. Add localhost only for intended local development. Obtain Firebase
UIDs for the approved testers and enter them into `allowed_uids`.

### 3. Populate public repository variables and publish bootstrap

Repository: `RamirezTuco/idle-sisyphus`. Preserve the existing root
`GCP_PROJECT_ID=idle-sisyphus` and `DEPLOY_BRANCH=main` (or unset branch).
This provider deliberately refuses any non-main branch even if the shared
branch variable is changed.

Set app-specific variables from **this module's outputs**, not portal/source
config:

| Repository variable | Value |
| --- | --- |
| `CHAT_CSV_DEPLOY_ENABLED` | `false` until each approved publication/deploy |
| `CHAT_CSV_REGION` | output `region` |
| `CHAT_CSV_IMAGE_BASE` | output `image_base`: `REGION-docker.pkg.dev/idle-sisyphus/chat-csv/app` |
| `CHAT_CSV_WIF_PROVIDER` | output `wif_provider`, ending `/providers/chat-csv` |
| `CHAT_CSV_DEPLOY_SERVICE_ACCOUNT` | output `deploy_service_account` |
| `CHAT_CSV_NEXT_PUBLIC_FIREBASE_API_KEY` | `firebase_public_config.NEXT_PUBLIC_FIREBASE_API_KEY` |
| `CHAT_CSV_NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `firebase_public_config.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` |
| `CHAT_CSV_NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `firebase_public_config.NEXT_PUBLIC_FIREBASE_PROJECT_ID` |
| `CHAT_CSV_NEXT_PUBLIC_FIREBASE_APP_ID` | `firebase_public_config.NEXT_PUBLIC_FIREBASE_APP_ID` |
| `CHAT_CSV_NEXT_PUBLIC_PLATFORM_URL` | `https://idle-sisyphus.web.app` (existing platform URL) |

Example public-variable setup (requires approved repository changes):

```sh
gh variable set CHAT_CSV_DEPLOY_ENABLED --repo RamirezTuco/idle-sisyphus --body false
gh variable set CHAT_CSV_REGION --repo RamirezTuco/idle-sisyphus --body "$(terraform -chdir=infra/chat-csv output -raw region)"
gh variable set CHAT_CSV_IMAGE_BASE --repo RamirezTuco/idle-sisyphus --body "$(terraform -chdir=infra/chat-csv output -raw image_base)"
gh variable set CHAT_CSV_WIF_PROVIDER --repo RamirezTuco/idle-sisyphus --body "$(terraform -chdir=infra/chat-csv output -raw wif_provider)"
gh variable set CHAT_CSV_DEPLOY_SERVICE_ACCOUNT --repo RamirezTuco/idle-sisyphus --body "$(terraform -chdir=infra/chat-csv output -raw deploy_service_account)"
gh variable set CHAT_CSV_NEXT_PUBLIC_FIREBASE_API_KEY --repo RamirezTuco/idle-sisyphus --body "$(terraform -chdir=infra/chat-csv output -json firebase_public_config | jq -r .NEXT_PUBLIC_FIREBASE_API_KEY)"
gh variable set CHAT_CSV_NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN --repo RamirezTuco/idle-sisyphus --body "$(terraform -chdir=infra/chat-csv output -json firebase_public_config | jq -r .NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN)"
gh variable set CHAT_CSV_NEXT_PUBLIC_FIREBASE_PROJECT_ID --repo RamirezTuco/idle-sisyphus --body "$(terraform -chdir=infra/chat-csv output -json firebase_public_config | jq -r .NEXT_PUBLIC_FIREBASE_PROJECT_ID)"
gh variable set CHAT_CSV_NEXT_PUBLIC_FIREBASE_APP_ID --repo RamirezTuco/idle-sisyphus --body "$(terraform -chdir=infra/chat-csv output -json firebase_public_config | jq -r .NEXT_PUBLIC_FIREBASE_APP_ID)"
gh variable set CHAT_CSV_NEXT_PUBLIC_PLATFORM_URL --repo RamirezTuco/idle-sisyphus --body https://idle-sisyphus.web.app
```

After explicit bootstrap-image publication approval, temporarily enable only
this app's deployment flag, manually dispatch `publish_only=true` against
reviewed current `main`, wait for checks/publication to finish, then disable it:

```sh
gh variable set CHAT_CSV_DEPLOY_ENABLED --repo RamirezTuco/idle-sisyphus --body true
gh workflow run chat-csv.yml --repo RamirezTuco/idle-sisyphus --ref main -f publish_only=true
gh run list --repo RamirezTuco/idle-sisyphus --workflow chat-csv.yml --limit 5
gh run watch APPROVED_RUN_ID --repo RamirezTuco/idle-sisyphus --exit-status
gh variable set CHAT_CSV_DEPLOY_ENABLED --repo RamirezTuco/idle-sisyphus --body false
```

Avoid concurrent main pushes during this temporary window. A normal push/manual
run is never implicitly publish-only: it must update an **existing** service
or fail, not silently skip deployment. The bootstrap run prints the immutable
`IMAGE_BASE@sha256:...` in its summary. It performs **no** Run update. Docker
build occurs before cloud authentication; only public Firebase/platform values
are build arguments. Gemini is exclusively a runtime Secret Manager reference.

### 4. Separately approve runtime creation

Paste the **real summary digest** into local `seed_image`; set
`enable_runtime=true`, verify the approved global cap and allowlist, then
generate and review a new plan. Do not substitute a tag, dummy image, example
digest, or hello-world image.

```sh
terraform -chdir=infra/chat-csv plan -input=false -out=runtime.tfplan
# Stop here for separate runtime/public-UI approval.
terraform -chdir=infra/chat-csv apply runtime.tfplan
terraform -chdir=infra/chat-csv output -raw service_url
```

Terraform owns service configuration, runtime identity, IAM, secret reference,
and env: `GOOGLE_CLOUD_PROJECT`, `FIRESTORE_DATABASE_ID=chat-csv`,
`GEMINI_MODEL=gemini-3.5-flash-lite`, `GEMINI_PROVIDER`, `GEMINI_REGION=us`,
`CHAT_CSV_DAILY_LIMIT=5`,
`CHAT_CSV_GLOBAL_DAILY_LIMIT`, `CHAT_CSV_ACCESS_MODE`, `CHAT_CSV_ALLOWED_UIDS`,
`CHAT_CSV_USAGE_RETENTION_DAYS=7`.
It pins the initial image; only `template[0].containers[0].image` is ignored for
future CI image changes. Runtime is 0–2 instances, 1 CPU/1 GiB each, concurrency
1, timeout 90 seconds, HTTP startup probe `/api/health` on port 8080.
Cloud Run supplies `PORT`; the standalone Node 24 container must listen on all
interfaces. Runtime deployment is deletion-protected.

Finish the exact-hostname Firebase Auth setup, then, after approval, verify
health, Google sign-in, allowed-user requests, revoked-token denial, nonallowlist
denial, unauthenticated AI denial, global/per-user caps, metadata-only storage,
TTL fields, and denied browser Firestore access:

```sh
curl --fail "$(terraform -chdir=infra/chat-csv output -raw service_url)/api/health"
```

Enable `CHAT_CSV_DEPLOY_ENABLED=true` for future CI image updates only after
all verification and user approval. CI uses the registry-returned immutable
digest with `gcloud run deploy chat-csv --image ... --project ... --region ...
--quiet`; it never passes `--allow-unauthenticated`, alters env, or sets secrets.
Terraform remains the source of truth for those settings.

**No public app catalog/link update until a real approved live deployment has
been verified.** Broader authenticated access and public promotion need their
own production approval.

## Verified provider/API details

- [Provider 6.50.0 named Firestore release example](https://github.com/hashicorp/terraform-provider-google/blob/v6.50.0/website/docs/r/firebaserules_release.html.markdown#example-usage---firestore_release_additional)
  uses `cloud.firestore/DATABASE_ID` and a fully qualified ruleset name.
- [Firestore per-database IAM conditions](https://cloud.google.com/firestore/docs/manage-databases#configure_per-database_access_permissions)
  document `resource.name == "projects/PROJECT_ID/databases/DATABASE_ID"` for
  `roles/datastore.user`. No document-prefix guess or unconditioned database
  grant is used. Conditions protect server SDK/REST access, not Console views.
- [Provider 6.50.0 Firebase public config data source](https://github.com/hashicorp/terraform-provider-google-beta/blob/v6.50.0/website/docs/d/firebase_web_app_config.html.markdown)
  supports API key/auth domain; the web-app resource supplies its app ID.
- [Firestore IAM](https://cloud.google.com/firestore/docs/security/iam) and
  [rules](https://firebase.google.com/docs/firestore/security/get-started)
  explain that server libraries use IAM rather than client security rules.
