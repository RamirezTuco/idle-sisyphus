import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function isDeploymentEligible({ enabled, event, ref, branch = "main" }) {
  return enabled === "true"
    && ["push", "workflow_dispatch"].includes(event)
    && ref === `refs/heads/${branch}`;
}

export function isCurrentCommit(commit, latestCommit) {
  if (![commit, latestCommit].every((sha) => typeof sha === "string" && /^[a-f0-9]{40}$/.test(sha))) {
    throw new Error("Current and latest commit IDs must be full Git commit hashes.");
  }
  return commit === latestCommit;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.env.GITHUB_OUTPUT) {
    throw new Error("GITHUB_OUTPUT is required when running the deployment policy.");
  }
  const mode = process.argv[2];
  if (mode === "eligible") {
    const eligible = isDeploymentEligible({
      enabled: process.env.DEPLOY_ENABLED,
      event: process.env.GITHUB_EVENT_NAME,
      ref: process.env.GITHUB_REF,
      branch: process.env.DEPLOY_BRANCH || "main"
    });
    appendFileSync(process.env.GITHUB_OUTPUT, `eligible=${eligible}\n`);
    console.log(eligible ? "Deployment enabled for this branch and event." : "Deployment disabled for this branch or event.");
  } else if (mode === "current") {
    const current = isCurrentCommit(process.env.GITHUB_SHA, process.env.LATEST_SHA);
    appendFileSync(process.env.GITHUB_OUTPUT, `current=${current}\n`);
    console.log(current ? "Deploying the current branch commit." : "::notice::Skipping superseded commit; the newer branch commit has its own deployment run.");
  } else {
    throw new Error("Expected deployment policy mode: eligible or current.");
  }
}
