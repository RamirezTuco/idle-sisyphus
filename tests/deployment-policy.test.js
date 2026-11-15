import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeploymentEligible, isCurrentCommit } from "../scripts/deployment-policy.js";

const mainPush = { enabled: "true", event: "push", ref: "refs/heads/main" };
const current = "a".repeat(40);
const newer = "b".repeat(40);
const script = fileURLToPath(new URL("../scripts/deployment-policy.js", import.meta.url));

test("deployment requires explicit lowercase true enablement", () => {
  for (const enabled of [undefined, "", "false", "TRUE", "1", true]) {
    assert.equal(isDeploymentEligible({ ...mainPush, enabled }), false);
  }
  assert.equal(isDeploymentEligible(mainPush), true);
});

test("only main pushes and trusted manual runs are eligible by default", () => {
  assert.equal(isDeploymentEligible({ ...mainPush, event: "workflow_dispatch" }), true);
  for (const event of ["pull_request", "pull_request_target", "schedule", "workflow_run"]) {
    assert.equal(isDeploymentEligible({ ...mainPush, event }), false);
  }
  for (const ref of ["refs/heads/feature", "refs/pull/1/merge", "refs/tags/main"]) {
    assert.equal(isDeploymentEligible({ ...mainPush, ref }), false);
  }
  assert.equal(isDeploymentEligible({
    ...mainPush, branch: "release/site", ref: "refs/heads/release/site"
  }), true);
});

test("a docs-only main push can publish an earlier superseded site change", () => {
  assert.equal(isDeploymentEligible({ ...mainPush, changedPaths: ["public/index.html"] }), true);
  assert.equal(isCurrentCommit(current, newer), false);
  assert.equal(isDeploymentEligible({ ...mainPush, changedPaths: ["README.md"] }), true);
  assert.equal(isCurrentCommit(newer, newer), true);
});

test("invalid or absent commit references fail instead of silently skipping", () => {
  for (const value of [undefined, "", "null", "main", "abcdef0"]) {
    assert.throws(() => isCurrentCommit(value, current));
    assert.throws(() => isCurrentCommit(current, value));
  }
});

test("workflow helpers write actual GitHub step outputs", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "sisyphus-deployment-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const output = join(dir, "outputs");
  const env = {
    ...process.env,
    GITHUB_OUTPUT: output,
    DEPLOY_ENABLED: "true",
    DEPLOY_BRANCH: "main",
    GITHUB_EVENT_NAME: "push",
    GITHUB_REF: "refs/heads/main",
    GITHUB_SHA: current,
    LATEST_SHA: newer
  };
  execFileSync(process.execPath, [script, "eligible"], { env });
  execFileSync(process.execPath, [script, "current"], { env });
  execFileSync(process.execPath, [script, "eligible"], { env: { ...env, DEPLOY_ENABLED: "false" } });
  execFileSync(process.execPath, [script, "current"], { env: { ...env, GITHUB_SHA: newer } });
  assert.equal(await readFile(output, "utf8"), "eligible=true\ncurrent=false\neligible=false\ncurrent=true\n");
  const invalid = spawnSync(process.execPath, [script, "current"], {
    env: { ...env, LATEST_SHA: "" }, encoding: "utf8"
  });
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /must be full Git commit hashes/);
});

test("the workflow wires the shared policy and gates cloud operations", async () => {
  const workflow = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  assert.match(workflow, /deploy_eligible: \$\{\{ steps\.deployment\.outputs\.eligible \}\}/);
  assert.match(workflow, /DEPLOY_ENABLED: \$\{\{ vars\.DEPLOY_ENABLED \}\}/);
  assert.match(workflow, /run: node scripts\/deployment-policy\.js eligible/);
  assert.match(workflow, /needs\.site\.outputs\.deploy_eligible == 'true'/);
  assert.match(workflow, /github\.event_name == 'push' \|\| github\.event_name == 'workflow_dispatch'/);
  assert.match(workflow, /github\.ref == format\('refs\/heads\/\{0\}', vars\.DEPLOY_BRANCH \|\| 'main'\)/);
  assert.match(workflow, /LATEST_SHA="\$latest_sha" node scripts\/deployment-policy\.js current/);
  assert.match(workflow, /needs: \[site, terraform\]/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.equal((workflow.match(/if: steps\.current\.outputs\.current == 'true'/g) ?? []).length, 3);
  assert.doesNotMatch(workflow, /git diff|deploy_needed|BEFORE_SHA/);
});
