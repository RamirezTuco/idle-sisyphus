# Personal Tools Platform --- Hosting & Infrastructure Requirements

**Status:** Revised requirements and architecture direction; launch limits pending\
**Platform name (working):** Sisyphus\
**GCP project display name:** Sisyphus\
**Development GCP project ID:** `sisyphus-platform-dev`\
**Future production GCP project ID:** `sisyphus-platform-prod`
(proposed)

## 1. Objective

Create a single umbrella platform for multiple independent web
applications and experiments, including both AI-powered and conventional
software utilities.

The platform should:

-   Provide one central landing page that introduces and links to all
    applications.
-   Allow each application to have its own identity and URL while
    sharing common platform capabilities where appropriate.
-   Make it straightforward to add new applications without redesigning
    the hosting architecture.
-   Demonstrate production-grade application and agent engineering.
-   Serve as a practical way to learn Google Cloud Platform (GCP).
-   Support migration of the existing applications from Vercel to GCP.
    The preference discussed was to evaluate moving both frontend and
    backend, rather than defaulting to a hybrid deployment.

## 2. Applications in scope

The platform is expected to host multiple independently deployable
applications. The initial and planned examples discussed include:

  -----------------------------------------------------------------------
  Application                         Description / notes
  ----------------------------------- -----------------------------------
  Chat with CSV / XLSX                Ask questions about tabular data.
                                      Existing application, currently
                                      deployed on Vercel.

  Browser Task Runner                 Browser automation / task execution
                                      application. Existing application,
                                      currently deployed on Vercel. Simple
                                      integration; no runtime worker.

  Chat with PDF                       Conversational interaction with PDF
                                      documents.

  PDF to HTML                         PDF conversion utility.

  Agentic Learning                    Learning application with adaptive
                                      question selection and learner
                                      state.

  Other utilities and experiments     New AI and non-AI tools can be
                                      added over time.
  -----------------------------------------------------------------------

The architecture must not assume that every application uses AI or the
same backend technology.

## 3. Domain and application URL structure

Use one primary domain for the umbrella platform, with a central
homepage and separate subdomains for individual applications.

Illustrative structure (final domain name is not yet fixed):

``` text
<primary-domain>                 # Platform homepage / application directory
chat-csv.<primary-domain>        # Chat with CSV / XLSX
chat-pdf.<primary-domain>        # Chat with PDF
pdf-to-html.<primary-domain>    # PDF to HTML
browser.<primary-domain>        # Browser Task Runner
learn.<primary-domain>          # Agentic Learning
```

Requirements:

-   The root domain should act as the central landing page.
-   Each application should have a stable, human-readable URL.
-   Applications should be independently deployable.
-   Adding an application should primarily require adding a new app
    deployment and DNS/routing entry.
-   Prefer subdomains for application separation rather than putting
    every application under a path on the root domain.
-   Provide consistent navigation and, where useful, shared
    authentication across applications.
-   Keep the domain choice independent of the GCP project ID. The final
    domain has not yet been selected.

## 4. GCP project organisation

A GCP project is the cloud resource and billing/IAM boundary; an
application is a separately deployable product or service within the
platform. Multiple applications should initially share one GCP project
rather than creating a separate GCP project for every application.

### Initial setup

Create one GCP project for development, experimentation, and disposable
public demos:

-   **Display name:** `Sisyphus`
-   **Project ID:** `sisyphus-platform-dev`

This project can contain the resources for multiple applications, with
clear naming and access boundaries.

### Future production separation

Create a separate production project before accepting persistent data
from external users or promising service availability:

-   **Proposed project ID:** `sisyphus-platform-prod`

The intended direction is:

-   Development/experimentation resources live in the development
    project.
-   Stable production deployments live in the production project.
-   Development demos must use synthetic or disposable data, clearly
    identify their experimental status, and make no availability promise.
-   Production must have separate identities, secrets, databases, storage,
    and deployment approvals; do not copy development credentials.
-   Avoid creating one GCP project per application unless a future
    security, billing, compliance, or operational requirement justifies
    it.

### Isolation within a shared GCP project

Even when applications share a GCP project:

-   Deploy each app/backend as its own service where practical.
-   Use separate service accounts and least-privilege IAM permissions
    for application workloads.
-   Keep application-specific configuration and secrets separate.
-   Use clear resource naming conventions, labels, and environment
    configuration.
-   Avoid sharing databases, buckets, queues, or credentials across apps
    unless there is a deliberate platform-level reason.
-   Separate Firestore collections are logical organisation, not a
    backend IAM isolation boundary. Server client libraries bypass
    Firebase Security Rules.
-   Where apps require IAM-enforced data isolation, use separate
    databases with database-scoped IAM grants and no inherited broader
    grants, or separate projects if the required boundary demands it.
-   If apps deliberately share a database, document the trust boundary
    and enforce app/user ownership in every backend data-access path.
    Apply Firebase Security Rules separately to direct client access.

### Region and data-location policy

Before creating persistent resources, record the primary region and
compatible Firestore and Cloud Storage locations. Keep Cloud Run services,
jobs, and Cloud Tasks queues co-located where supported. Account for
service availability, user latency, data residency, and cross-region
transfer costs. Treat database location changes as a migration, not a
routine configuration update.

## 5. Hosting and runtime architecture

The preferred direction discussed was an all-Google hosting
architecture.

  -----------------------------------------------------------------------
  Concern                 Preferred GCP service / Intended use
                          approach                
  ----------------------- ----------------------- -----------------------
  Web frontend            Firebase Hosting for    Choose per app; use App
                          static sites; App       Hosting for supported
                          Hosting or Cloud Run    SSR frameworks or Cloud
                          for server rendering    Run for containerised SSR.

  Backend APIs            Cloud Run               Host Python/FastAPI and
                                                  other containerised
                                                  backend services.

  Agent workflows         Cloud Run               Run LangGraph and other
                                                  agent/backend
                                                  workloads.

  Background workers      Cloud Run services or   Services handle bounded
                          Cloud Run Jobs          HTTP tasks; Jobs execute
                                                  longer finite workloads.

  Authentication          Firebase Authentication Shared authentication
                                                  where applications need
                                                  user accounts.

  Application state       Firestore where         Suitable for task state;
                          appropriate             evaluate relational needs
                                                  and agent checkpoints
                                                  separately per app.

  File storage            Cloud Storage           Store uploaded
                                                  documents, generated
                                                  files, and browser-task
                                                  artifacts.

  Async task dispatch     Cloud Tasks             Queue and dispatch work
                                                  that should execute
                                                  asynchronously.

  Event messaging         Pub/Sub, deferred       Add only for a concrete
                                                  event fan-out or
                                                  messaging requirement.

  Secrets                 Secret Manager          Separate secrets and
                                                  access by app/environment.

  Container images        Artifact Registry       Store versioned deployment
                                                  images for APIs and jobs.

  Logs and monitoring     Cloud Logging and Cloud Centralised operational
                          Monitoring              visibility.

  AI model access         Existing LiteLLM        Keep model-provider
                          abstraction; Gemini may flexibility rather than
                          be used where           coupling every app to
                          appropriate             one provider.
  -----------------------------------------------------------------------

The exact frontend hosting choice should be based on each application's
framework and deployment needs. Static frontends should default to
Firebase Hosting; server-rendered frontends should evaluate Firebase App
Hosting support versus a Cloud Run container.

### Initial implementation scope

Phase 0 is a deployable static Sisyphus landing page on Firebase Hosting,
with unavailable directory entries for Chat CSV, Browser Task Runner, and
Agentic Learning. Implementations of those applications will be supplied
later. Do not expose placeholder entries as working applications.

The foundation includes Terraform for an existing GCP project and
GitHub Actions deployment using short-lived credentials. It does not
provision a backend, authentication, user database, runtime worker, task
queue, model access, or file uploads. Browser Task Runner specifically
requires no runtime worker; its final integration follows the supplied
simple implementation.

Next, integrate one existing application end-to-end. Use only the
services required by that application: frontend
hosting, a Cloud Run API if needed, secrets, image storage, and basic
observability. Add authentication, persistence, file storage, and task
dispatch when that application's requirements need them.

Do not introduce Pub/Sub, a dedicated LiteLLM proxy deployment, or a
general-purpose workflow platform solely for anticipated future use.
Preserve the existing LiteLLM abstraction without requiring an extra
network service.

## 6. Backend and agent execution requirements

-   Support Python/FastAPI services and agent frameworks such as
    LangGraph.
-   Support container-based deployment so applications are not tied to
    one framework or language.
-   Keep model-provider access behind LiteLLM where practical,
    preserving provider independence.
-   Separate synchronous API requests from work that may take a long
    time.
-   Design long-running tasks to survive request timeouts and client
    disconnects.
-   Persist task status and relevant state so users can check progress
    and retrieve results.
-   Select persistence per workload. Firestore is a candidate for task
    metadata, not a mandatory database for all applications. Evaluate
    relational storage for workloads needing relational queries,
    constraints, or reporting.
-   For resumable LangGraph workflows, select a supported durable
    checkpoint store and define thread ownership, checkpoint retention,
    and restart behaviour. Task status alone is not an agent checkpoint.

### Execution and acknowledgement boundaries

-   Cloud Tasks HTTP dispatch has a maximum deadline of 30 minutes.
    Use a Cloud Run service handler only when the complete task fits
    within the configured dispatch and service timeouts, with headroom.
-   For such handlers, acknowledge success only after durable completion.
    Do not acknowledge and then depend on an in-process background thread
    or coroutine continuing after the response.
-   For longer finite browser or agent runs, use Cloud Run Jobs with an
    explicit execution timeout and retry policy. A short authenticated
    dispatcher may start the job and acknowledge only after the execution
    reference is durably recorded; that acknowledgement means launched,
    not completed.
-   A launched job's completion and failure must be tracked separately
    from the dispatch task. Cloud Tasks acknowledgement is not proof of
    job success.
-   Do not assume either services or Jobs run indefinitely. Choose
    workload-specific deadlines within platform limits; checkpoint and
    split work that cannot fit.

### Optional future asynchronous workload example

This pattern applies only to a future app with a demonstrated need for
long-running server-side work. It is not required for Browser Task Runner
or the static foundation. The proposed execution pattern is:

1.  The frontend submits a task with an idempotency key to a Cloud Run
    API. The API validates identity, ownership, input limits, and quota.
2.  The API atomically records the task, quota reservation, and pending
    dispatch intent in the selected database, using Firestore if suitable.
    Repeated submissions with the same key and payload return the same
    task; conflicting reuse of the key is rejected.
3.  The API attempts dispatch through Cloud Tasks. A scheduled
    reconciler retries pending dispatch intents, so a failed enqueue
    cannot silently strand an accepted task. Use deterministic task names
    to reduce duplicate enqueueing, without assuming exactly-once delivery.
4.  A private, authenticated handler claims an execution lease and either
    executes bounded work directly or launches a Cloud Run Job. For Jobs,
    record the execution reference and reconcile uncertain launch outcomes
    before relaunching; duplicate launches must still be safe.
5.  The worker records progress and checkpoints where supported, renews
    its lease, and writes artifacts to app/user-scoped Cloud Storage.
6.  Completion or failure is persisted durably. A reconciler detects
    expired leases, missing terminal updates, and failed job executions.
    Terminal updates and quota settlement must be idempotent.
7.  The frontend polls with backoff or subscribes to authorised status
    updates and retrieves only results belonging to that user.

This is an example pattern for long-running workloads; other
applications can use simpler request/response APIs when appropriate.

### Task lifecycle and recovery

-   Define `queued`, `running`, `succeeded`, `failed`, and `cancelled`
    states, with dispatch status, attempt count, execution reference,
    timestamps, lease owner/expiry, and a safe user-visible error.
-   Transitions must be conditional and atomic. Only the current
    execution lease holder may commit results; stale attempts must not
    overwrite terminal state or publish authoritative artifacts.
-   Expect retries and duplicate delivery. Protect side effects with
    idempotency keys or downstream deduplication where supported; document
    non-repeatable browser actions and do not blindly retry them when
    their outcome is unknown.
-   Bound dispatch and execution retries with backoff and an overall
    deadline. Coordinate Cloud Tasks, Jobs, and application retry policies
    to avoid multiplicative retries and duplicate model spend.
-   Record exhausted work as failed with an actionable diagnostic and an
    explicit, authorised retry path; never leave it permanently running.
-   Deploy reconciliation as an authenticated scheduled operation, for
    example through Cloud Scheduler, when asynchronous work is enabled.
    Define its interval and stale-task thresholds, and alert on missed
    runs or growing task backlog.
-   Cancellation is best-effort: stop new steps, request execution
    termination, release resources, and record the outcome. It cannot
    undo external actions already performed.

## 7. Shared platform capabilities

The platform should support shared capabilities without forcing every
application to use them.

-   **Common landing page:** list and describe all available
    applications.
-   **Consistent navigation:** make it easy to move between
    applications.
-   **Authentication:** allow shared Firebase Authentication where user
    identity is needed. Default to one identity directory per environment,
    not a tenant per app. Shared accounts do not imply shared sessions:
    Firebase web persistence is scoped to a single host origin.
-   **Cross-subdomain sign-in:** separate app sign-ins are acceptable
    initially. If seamless SSO is required, design an explicit central
    sign-in/session exchange with redirect validation, CSRF protection,
    logout/revocation behaviour, and narrowly scoped session handling.
    Do not assume broad parent-domain cookies are a safe default.
-   **Application isolation:** each app owns its own backend services,
    configuration, and data boundaries.
-   **Observability:** centralised logs and monitoring, with enough
    labels/context to identify the application and environment.
-   **Reusable deployment conventions:** common CI/CD patterns and
    infrastructure conventions.
-   **Independent evolution:** an application should be replaceable or
    deployable without requiring a release of every other application.

## 8. Source control and deployment

-   Use GitHub as the source-control and CI/CD starting point.
-   Deploy applications independently.
-   A change to one application should not require rebuilding or
    redeploying unrelated applications.
-   Keep deployment configuration and environment-specific settings
    outside application source where appropriate.
-   Use separate configuration for development and production.
-   Ensure secrets are not committed to source control.
-   Establish a repeatable build-and-deploy workflow for frontend
    services, APIs, and workers.
-   Manage foundational infrastructure as code from the first deployment,
    using Terraform by default. Keep infrastructure changes reviewable and
    separate environment state with appropriate access controls.
-   Use GitHub Actions with Workload Identity Federation and
    least-privilege deployment identities rather than long-lived service
    account keys. Restrict trusted repositories, branches, and environments.
-   Store container images in Artifact Registry and deploy immutable
    image digests. Record the deployed frontend version, API revision,
    and worker/job image for each release.
-   Define rollback for both frontend releases and Cloud Run revisions.
    Use backward-compatible schema/task payload changes so in-flight work
    and previous revisions remain compatible during deployment or rollback.

## 9. Security, operations, and cost controls

-   Apply least-privilege IAM and use separate service accounts for
    different workloads.
-   Keep credentials and API keys in an appropriate secrets-management
    mechanism: Secret Manager by default, with separate access per app
    and environment.
-   Configure budgets and billing alerts early, especially while
    experimenting with GCP.
-   Monitor service errors, latency, resource usage, and background-task
    failures.
-   Set appropriate limits and timeouts for APIs and workers.
-   Define retention and cleanup policies for uploaded files and
    generated artifacts before accepting user data, including database
    records, agent checkpoints, and backups.
-   Avoid granting one application's service account broad access to
    another application's data.
-   Budgets configured for alerts only do not cap spending. Set an
    initial monthly spending target and enforce application-level limits
    independently of billing notifications.
-   Require per-user request/task quotas, upload limits, model input/output
    token limits, agent tool-step limits, and overall execution deadlines.
    Bound worker instances/concurrency and queue dispatch rates together;
    instance limits alone are not a spending cap.
-   Reserve usage before starting expensive work and settle it
    idempotently. Reject or pause work when limits are exhausted, including
    requests that would exceed the remaining reservation.
-   Provide an operator kill switch that blocks new expensive work,
    pauses dispatch, and can request cancellation of active executions.
    Document that in-flight provider charges may still occur.
-   Keep task workers private with authenticated service-to-service
    invocation. Define authentication or explicit restricted access for
    costly public-facing operations; anonymous access must still have
    enforceable abuse and usage limits.
-   Treat browser automation, uploaded files, and generated HTML as
    untrusted workloads. Restrict browser destinations and network access,
    isolate per-task browser profiles, and keep workload credentials out
    of page-accessible contexts. Serve untrusted rendered content from an
    isolated origin with an appropriate sandbox, not the authenticated
    application origin.
-   Redact secrets and user content from logs. Correlate requests, tasks,
    attempts, and job executions with identifiers and app/environment
    labels.

## 10. Migration considerations

The existing Chat with CSV and Browser Task Runner applications are
currently deployed on Vercel.

The migration should evaluate moving both frontend and backend
components to GCP. The target architecture should not assume that the
frontend remains on Vercel or that only the backend moves.

A sensible migration sequence is:

1.  Select resource locations, then establish the GCP project, billing,
    IAM, infrastructure as code, and basic monitoring. A GCP organisation
    is not a prerequisite for a personal project.
2.  Deploy a small application end-to-end to validate the hosting and
    deployment pattern.
3.  Migrate the existing applications in manageable steps.
4.  Validate authentication, file handling, background execution,
    logging, and cost.
5.  Use the proven pattern for new applications.

Before moving an existing application's traffic, inventory its runtime,
environment variables, secrets, identity configuration, persistent data,
and active tasks. Define data transfer and validation, DNS cutover, and
rollback without losing writes or orphaning work. Keep the existing
deployment available until the new deployment meets its acceptance
criteria.

## 11. Decisions captured so far

  -----------------------------------------------------------------------
  Topic                               Direction
  ----------------------------------- -----------------------------------
  Overall structure                   One umbrella platform hosting
                                      multiple applications.

  Domain                              One primary domain, root homepage,
                                      individual app subdomains.

  GCP project count initially         One shared
                                      development/experimentation
                                      project.

  Production                          Separate project before persistent
                                      external-user data or availability
                                      commitments.

  Per-app GCP projects                Not the initial approach; use
                                      separate services and IAM
                                      boundaries within the shared
                                      project.

  Hosting                             Prefer an all-Google architecture;
                                      evaluate frontend and backend
                                      migration together.

  Frontend                            Firebase Hosting for static sites;
                                      App Hosting or Cloud Run for SSR.

  Backend and workers                 Cloud Run services for APIs/bounded
                                      tasks; Jobs for longer finite work.

  Long-running work                   Durable dispatch, idempotent workers,
                                      leases, bounded retries, and recovery;
                                      track job completion separately.

  Auth and data                       Firebase Authentication, Firestore,
                                      and Cloud Storage where suitable;
                                      SSO and data boundaries explicit.

  Model access                        Retain LiteLLM for provider
                                      independence.

  CI/CD                               GitHub Actions with federation,
                                      infrastructure as code, immutable
                                      images, and independent rollback.

  Cost controls                       Budgets plus enforced usage limits,
                                      bounded execution, and a kill switch.
  -----------------------------------------------------------------------

## 12. Open decisions

These items were not finalised and should be decided during
implementation:

1.  **Final domain name and registrar:** choose the brand/domain and
    verify registration and renewal pricing.
2.  **DNS and routing implementation:** decide how subdomains will be
    mapped to Firebase Hosting/App Hosting and Cloud Run services.
3.  **Frontend hosting per app:** confirm static versus server-rendered
    requirements and choose Firebase Hosting, App Hosting, or Cloud Run.
4.  **Shared authentication:** decide which applications actually need
    accounts. Confirm whether shared accounts with separate sign-ins are
    sufficient or seamless cross-subdomain SSO is needed.
5.  **Data boundaries:** decide whether each app gets its own Firestore
    database and Cloud Storage bucket or deliberately shares resources.
    Record IAM boundaries and application-level ownership enforcement;
    do not equate collection naming with backend isolation.
6.  **Regions and residency:** select compatible resource locations before
    provisioning persistent resources.
7.  **Persistence per app:** choose the task/application database and any
    durable agent checkpoint store, including relational needs.
8.  **Execution sizing, if needed:** measure server-side task duration and resource use,
    then choose bounded service handlers or Jobs and their coordinated
    retry, concurrency, and checkpoint policies.
9.  **Operational values:** agree the numerical limits and targets below
    before opening an application to its intended users.
10. **Production readiness:** define backup/restore procedures, access
    controls, release approvals, and monitoring required before the
    production separation trigger is reached.

## 13. Acceptance criteria and launch gates

Record explicit values per application and environment; unspecified
values are unresolved requirements, not unlimited defaults. These are
launch gates for the relevant feature, not reasons to provision every
optional service immediately.

| Requirement | Value or evidence required before launch |
|---|---|
| Audience and load | Personal/demo/public audience, expected concurrent users, and peak request/task rate. |
| Latency | API and frontend latency targets, including cold-start expectations and task-start delay. |
| Input limits | Maximum upload size, file/page/row limits, accepted formats, and validation rules. |
| Execution limits | Maximum task duration, token/tool-step budgets, attempt limits, worker concurrency, and queue rate. |
| Spending | Monthly target, per-user usage allowances, reservation policy, alert thresholds, and kill-switch procedure. |
| Retention and deletion | Retention for uploads, artifacts, metadata, checkpoints, and backups; user deletion process and completion target. |
| Recovery | Acceptable data loss and recovery time, backup coverage, restore procedure, and a demonstrated restore for persistent user data. |
| Identity and isolation | Access policy, ownership checks, chosen cross-app sign-in behaviour, and denied cross-user/app access cases. |
| Async reliability | Demonstrated duplicate delivery, enqueue failure, worker crash, lease expiry, retry exhaustion, and cancellation handling. |
| Delivery and migration | Reproducible deployment, rollback procedure, compatible in-flight work, and migration/cutover evidence where applicable. |

For applications without uploads, accounts, or background work, mark the
corresponding criteria not applicable with a reason. Do not invent limits
without workload measurements and an agreed spending target.

------------------------------------------------------------------------

**Guiding principle:** one domain and one initial GCP development
project can host many independently deployable experiments. Start with
the smallest useful service set, make execution and ownership boundaries
explicit, and enforce cost and recovery limits. Separate production
before accepting persistent external-user data or availability
commitments.
