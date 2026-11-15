# Static Hosting infrastructure

Terraform bootstraps Firebase Hosting and keyless GitHub deployment into an
**existing Google Cloud project**. It creates no project, billing account, backend,
worker, database, or runtime service. BTR has no runtime worker. Future apps are
not provisioned. No cloud provisioning or deployment has been performed here.

## Prerequisites and state

- Terraform 1.6+ (CI uses 1.9.8), Google Cloud CLI, Node 24, and this repository's
  locked npm dependencies (`npm ci` at repository root).
- An existing project, permission to enable its APIs/add Firebase, manage project
  IAM and service accounts, and administer Workload Identity Federation.
  Bootstrap commonly needs Service Usage Admin, Firebase Admin, Project IAM
  Admin, Service Account Admin, and Workload Identity Pool Admin, plus permission
  to read the project and consume API quota. Organization policy may require an
  administrator. Do not grant bootstrap privileges to the CI deployment account.
- API availability, quotas, organization policies, and any billing requirements
  remain the operator's responsibility. Static Hosting can use Firebase's Spark
  tier within its limits; this configuration does not link or enable billing.

State starts local in `infra/terraform.tfstate`. State, backups, `.terraform/`,
real `*.tfvars`, saved plans, and generated credentials must be gitignored.
Never commit credentials or state. Store state/backups securely with restricted
access and encryption; use a different local directory/state and tfvars per
environment (a project has just one default site). Before collaboration, configure
a separately bootstrapped, access-controlled remote backend with locking and
versioning, then run `terraform init -migrate-state`. Backend creation is out of
scope. Commit `.terraform.lock.hcl`; it locks both stable and beta providers.

## One-time manual bootstrap

Run from the repository root with your own authorized account:

```sh
export PROJECT_ID="your-existing-project-id"
gcloud auth login
gcloud auth application-default login
# These APIs must already be available for quota/project bootstrap.
gcloud services enable serviceusage.googleapis.com cloudresourcemanager.googleapis.com \
  --project="$PROJECT_ID"
gcloud auth application-default set-quota-project "$PROJECT_ID"
cd infra
cp terraform.tfvars.example development.tfvars
# Edit development.tfvars: project_id, exact GitHub owner/repo, github_branch.
terraform init
terraform plan -var-file=development.tfvars
terraform apply -var-file=development.tfvars
```

Review the plan before applying. If Firebase was already added to the project,
**import it before plan/apply**, after `terraform init`:

```sh
terraform import -var-file=development.tfvars google_firebase_project.this \
  "projects/$PROJECT_ID"
```

The site ID deliberately equals the project ID, so Firebase CLI's default site
selection and `--project` agree without `.firebaserc` or deploy targets. Adding
Firebase can automatically create this default site. Provider 6.50.0 checks for
an existing site and adopts it rather than blindly creating another. For an
already-existing site, explicitly importing before apply is also supported:

```sh
terraform import -var-file=development.tfvars google_firebase_hosting_site.this \
  "projects/$PROJECT_ID/sites/$PROJECT_ID"
```

Only import a site that already exists, belongs to this project, and is not
managed by another Terraform state. A legacy project's default site might have
a different ID: stop and resolve that mismatch before using this foundation.
If an older provider or API race reports `ALREADY_EXISTS`, import the existing
site and re-plan; do not delete the default site to retry. Firebase enablement
and the site have `prevent_destroy`; APIs have `disable_on_destroy = false`.
Protection is not a substitute for state backups and does not protect resources
removed from configuration or deleted outside Terraform.

Firebase project/site resources use `google-beta`, as required by the
[6.50.0 resource docs](https://registry.terraform.io/providers/hashicorp/google-beta/6.50.0/docs/resources/firebase_hosting_site);
general project/IAM resources use the matching stable `google` provider.

## Connect GitHub Actions

After a successful apply:

```sh
terraform output
terraform output -raw GCP_PROJECT_ID
terraform output -raw WIF_PROVIDER
terraform output -raw DEPLOY_SERVICE_ACCOUNT
terraform output -raw SITE_URL
```

In GitHub **Settings > Secrets and variables > Actions > Variables**, set
`GCP_PROJECT_ID`, `WIF_PROVIDER`, and `DEPLOY_SERVICE_ACCOUNT` to those exact
outputs. `SITE_URL` is informational; optionally save it as a repository variable.
For a branch other than `main`, also set `DEPLOY_BRANCH` to `github_branch`.
No service-account key or Firebase token secret is needed.

Protect the deployment branch with required **Site checks** and **Terraform
checks** and trusted reviews, including workflow/IAM changes. WIF accepts only
the configured repository, branch, exact `.github/workflows/ci.yml` workflow,
and push/manual events. Renaming that workflow or repository requires a manual
Terraform update. Repository names can be reused: remove/update trust before
releasing or transferring the configured GitHub namespace.

Every PR/push checks the site (`npm ci`, `npm test`) and Terraform (`fmt`,
credential-free `init -backend=false`, `validate`). PRs never authenticate to
Google. Deployment waits for both checks and checks out the same commit, with
OIDC permission only in the deploy job. Pushes deploy only relevant site,
dependency, script, Firebase-config, or workflow changes; docs-only and
Terraform-only changes still run checks but do not publish. **Run workflow**
on the trusted branch redeploys manually. Deployment jobs are serialized.

The deploy account has only Hosting Admin (includes Firebase project lookup)
and Service Usage Consumer (quota consumption), with Workload Identity User
granted to the restricted pool principal. It cannot apply Terraform or change
IAM/APIs. Hosting Admin is the product-scoped predefined role; no Editor,
Owner, Cloud Functions, Cloud Run, or Service Account Token Creator is granted.

## Operate

The Firebase CLI publishes `public/` only, with no SPA rewrite: unknown paths
serve `public/404.html` with a genuine 404. CSP permits only same-origin modules,
styles, images, fonts, and fetches (including `apps.json`); no inline scripts,
external CDN assets, framing, or form submission. All content revalidates with
`Cache-Control: no-cache`. Update CSP deliberately if future apps need more.

Optional local preview from the repository root (no cloud authentication):

```sh
npm exec -- firebase emulators:start --only hosting --project demo-sisyphus
```

Open `http://127.0.0.1:5000`. After deployment, smoke-test the output URL,
`/apps.json`, security headers, and an unknown path's 404. To roll back, use
**Firebase Console > Hosting > Release history > previous release > Roll back**.
Alternatively revert the site commit and let trusted-branch CI redeploy it.
CI never runs Terraform apply; infrastructure changes are reviewed and applied
manually using the same protected state.
