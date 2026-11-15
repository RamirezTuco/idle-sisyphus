data "google_iam_workload_identity_pool" "github" {
  project                   = var.project_id
  workload_identity_pool_id = "sisyphus-github"
}

resource "google_iam_workload_identity_pool_provider" "app" {
  project                            = var.project_id
  workload_identity_pool_id          = data.google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "chat-csv"
  display_name                       = "Trusted Chat CSV workflow"
  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.ref"        = "assertion.ref"
    "attribute.deployment" = "'chat-csv'"
  }
  attribute_condition = join(" && ", [
    "assertion.repository == 'RamirezTuco/idle-sisyphus'",
    "assertion.ref == 'refs/heads/main'",
    "assertion.workflow_ref == 'RamirezTuco/idle-sisyphus/.github/workflows/chat-csv.yml@refs/heads/main'",
    "(assertion.event_name == 'push' || assertion.event_name == 'workflow_dispatch')",
  ])
  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account_iam_member" "github" {
  service_account_id = google_service_account.deploy.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${data.google_iam_workload_identity_pool.github.name}/attribute.deployment/chat-csv"
  depends_on         = [google_iam_workload_identity_pool_provider.app]
}

resource "google_artifact_registry_repository_iam_member" "deploy_writer" {
  project    = var.project_id
  location   = google_artifact_registry_repository.app.location
  repository = google_artifact_registry_repository.app.name
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.deploy.email}"
}

resource "google_service_account_iam_member" "deploy_runtime" {
  service_account_id = google_service_account.runtime.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.deploy.email}"
}

resource "google_project_iam_member" "deploy_usage" {
  project = var.project_id
  role    = "roles/serviceusage.serviceUsageConsumer"
  member  = "serviceAccount:${google_service_account.deploy.email}"
}

resource "google_project_iam_member" "runtime_database" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.runtime.email}"
  condition {
    title       = "chat-csv-database-only"
    description = "Server SDK transactions and documents in the named Chat CSV database only"
    expression  = "resource.name == 'projects/${var.project_id}/databases/${google_firestore_database.app.name}'"
  }
}

resource "google_project_iam_member" "runtime_auth" {
  project    = var.project_id
  role       = "roles/firebaseauth.viewer"
  member     = "serviceAccount:${google_service_account.runtime.email}"
  depends_on = [google_project_service.app]
}

resource "google_secret_manager_secret_iam_member" "runtime_gemini" {
  count     = var.model_provider == "developer" ? 1 : 0
  project   = var.project_id
  secret_id = google_secret_manager_secret.gemini.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_project_iam_member" "runtime_vertex" {
  count      = var.model_provider == "vertex" ? 1 : 0
  project    = var.project_id
  role       = "roles/aiplatform.user"
  member     = "serviceAccount:${google_service_account.runtime.email}"
  depends_on = [google_project_service.app]
}

resource "google_project_iam_member" "runtime_usage" {
  count   = var.model_provider == "vertex" ? 1 : 0
  project = var.project_id
  role    = "roles/serviceusage.serviceUsageConsumer"
  member  = "serviceAccount:${google_service_account.runtime.email}"
}
