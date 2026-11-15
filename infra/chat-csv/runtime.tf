resource "google_cloud_run_v2_service" "app" {
  count               = var.enable_runtime ? 1 : 0
  project             = var.project_id
  name                = "chat-csv"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = true

  scaling {
    min_instance_count = 0
  }

  template {
    service_account                  = google_service_account.runtime.email
    timeout                          = "90s"
    max_instance_request_concurrency = 1
    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }
    containers {
      image = var.seed_image
      ports {
        container_port = 8080
      }
      resources {
        limits = {
          cpu    = "1"
          memory = "1Gi"
        }
        cpu_idle = true
      }
      dynamic "env" {
        for_each = {
          GOOGLE_CLOUD_PROJECT          = var.project_id
          FIRESTORE_DATABASE_ID         = google_firestore_database.app.name
          GEMINI_MODEL                  = "gemini-3.5-flash-lite"
          GEMINI_PROVIDER               = var.model_provider
          GEMINI_REGION                 = "us"
          CHAT_CSV_DAILY_LIMIT          = tostring(var.daily_limit)
          CHAT_CSV_GLOBAL_DAILY_LIMIT   = tostring(var.global_daily_limit)
          CHAT_CSV_ACCESS_MODE          = var.access_mode
          CHAT_CSV_ALLOWED_UIDS         = join(",", var.allowed_uids)
          CHAT_CSV_USAGE_RETENTION_DAYS = "7"
        }
        content {
          name  = env.key
          value = env.value
        }
      }
      dynamic "env" {
        for_each = var.model_provider == "developer" ? [true] : []
        content {
          name = "GEMINI_API_KEY"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.gemini.secret_id
              version = "latest"
            }
          }
        }
      }
      startup_probe {
        http_get {
          path = "/api/health"
          port = 8080
        }
        period_seconds    = 10
        timeout_seconds   = 5
        failure_threshold = 9
      }
    }
  }

  depends_on = [
    google_project_service.app,
    google_project_iam_member.runtime_database,
    google_project_iam_member.runtime_auth,
    google_project_iam_member.runtime_vertex,
    google_project_iam_member.runtime_usage,
    google_secret_manager_secret_iam_member.runtime_gemini,
    google_firebaserules_release.app,
    google_firestore_field.expiration,
  ]
  lifecycle {
    ignore_changes = [template[0].containers[0].image, client, client_version]
  }
}

resource "google_cloud_run_v2_service_iam_member" "deploy" {
  count    = var.enable_runtime ? 1 : 0
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.app[0].name
  role     = "roles/run.developer"
  member   = "serviceAccount:${google_service_account.deploy.email}"
}

resource "google_cloud_run_v2_service_iam_member" "ui_invoker" {
  count    = var.enable_runtime ? 1 : 0
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.app[0].name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
