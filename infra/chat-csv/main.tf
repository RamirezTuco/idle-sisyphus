locals {
  required_apis = toset([
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "secretmanager.googleapis.com",
    "firestore.googleapis.com",
    "firebaserules.googleapis.com",
    "identitytoolkit.googleapis.com",
    "generativelanguage.googleapis.com",
    "aiplatform.googleapis.com",
  ])
  image_base = "${var.region}-docker.pkg.dev/${var.project_id}/chat-csv/app"
}

resource "google_project_service" "app" {
  for_each           = local.required_apis
  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

resource "google_service_account" "runtime" {
  project      = var.project_id
  account_id   = "chat-csv-runtime"
  display_name = "Chat CSV runtime"
}

resource "google_service_account" "deploy" {
  project      = var.project_id
  account_id   = "chat-csv-deploy"
  display_name = "Chat CSV image deployment (GitHub OIDC)"
}

resource "google_artifact_registry_repository" "app" {
  project       = var.project_id
  location      = var.region
  repository_id = "chat-csv"
  format        = "DOCKER"
  description   = "Independent Chat CSV standalone container images"
  depends_on    = [google_project_service.app]
}

resource "google_secret_manager_secret" "gemini" {
  project   = var.project_id
  secret_id = "chat-csv-gemini-api-key"
  replication {
    auto {}
  }
  depends_on = [google_project_service.app]
  lifecycle {
    prevent_destroy = true
  }
}

resource "google_firebase_web_app" "app" {
  provider     = google-beta
  project      = var.project_id
  display_name = "Chat CSV"
  lifecycle {
    prevent_destroy = true
  }
}

data "google_firebase_web_app_config" "app" {
  provider   = google-beta
  project    = var.project_id
  web_app_id = google_firebase_web_app.app.app_id
}

resource "google_firestore_database" "app" {
  project                     = var.project_id
  name                        = "chat-csv"
  location_id                 = var.region
  type                        = "FIRESTORE_NATIVE"
  app_engine_integration_mode = "DISABLED"
  delete_protection_state     = "DELETE_PROTECTION_ENABLED"
  deletion_policy             = "ABANDON"
  depends_on                  = [google_project_service.app]
  lifecycle {
    prevent_destroy = true
  }
}

resource "google_firestore_field" "expiration" {
  for_each   = toset(["dailyUsage", "users", "requests"])
  project    = var.project_id
  database   = google_firestore_database.app.name
  collection = each.value
  field      = "expiresAt"
  ttl_config {}
}

resource "google_firebaserules_ruleset" "app" {
  project = var.project_id
  source {
    files {
      name    = "firestore.rules"
      content = file("${path.module}/../../apps/chat-csv/firestore.rules")
    }
  }
  depends_on = [google_project_service.app, google_firestore_database.app]
  lifecycle {
    create_before_destroy = true
  }
}

resource "google_firebaserules_release" "app" {
  project      = var.project_id
  name         = "cloud.firestore/${google_firestore_database.app.name}"
  ruleset_name = "projects/${var.project_id}/rulesets/${google_firebaserules_ruleset.app.name}"
}
