import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../../../", import.meta.url);

test("Terraform runtime settings match the app's environment contract", async () => {
  const runtime = await readFile(new URL("infra/chat-csv/runtime.tf", root), "utf8");
  const settings = [
    ["GEMINI_MODEL", '"gemini-3.5-flash-lite"'],
    ["GEMINI_PROVIDER", "var.model_provider"],
    ["GEMINI_REGION", '"us"'],
    ["CHAT_CSV_DAILY_LIMIT", "tostring(var.daily_limit)"],
    ["CHAT_CSV_GLOBAL_DAILY_LIMIT", "tostring(var.global_daily_limit)"],
    ["CHAT_CSV_ACCESS_MODE", "var.access_mode"],
    ["CHAT_CSV_ALLOWED_UIDS", 'join(",", var.allowed_uids)'],
    ["CHAT_CSV_USAGE_RETENTION_DAYS", '"7"'],
  ];
  for (const [name, expression] of settings) {
    const line = runtime.split("\n").find((value) => value.trim().startsWith(`${name} `));
    assert.equal(line?.split("=").slice(1).join("=").trim(), expression, name);
  }
  assert.match(runtime, /max_instance_request_concurrency\s*=\s*1/);
  assert.match(runtime, /ignore_changes\s*=\s*\[template\[0\]\.containers\[0\]\.image, client, client_version\]/);
  assert.match(runtime, /scaling\s*\{\s*min_instance_count\s*=\s*0\s*\}/);
});

test("the app's shared-pool identity cannot match the portal identity binding", async () => {
  const iam = await readFile(new URL("infra/chat-csv/iam.tf", root), "utf8");
  assert.match(iam, /"attribute\.deployment"\s*=\s*"'chat-csv'"/);
  assert.match(iam, /attribute\.deployment\/chat-csv/);
  assert.doesNotMatch(iam, /"attribute\.repository"\s*=/);
  assert.match(iam, /chat-csv\.yml@refs\/heads\/main/);
});

test("app deployment is separately gated and excludes runtime secrets from builds", async () => {
  const workflow = await readFile(new URL(".github/workflows/chat-csv.yml", root), "utf8");
  const dockerfile = await readFile(new URL("apps/chat-csv/Dockerfile", root), "utf8");
  const ignore = await readFile(new URL("apps/chat-csv/.dockerignore", root), "utf8");
  assert.match(workflow, /vars\.CHAT_CSV_DEPLOY_ENABLED == 'true'/);
  assert.match(workflow, /node scripts\/deployment-policy\.js current/);
  assert.match(workflow, /docker build[\s\S]*apps\/chat-csv/);
  assert.match(workflow, /gcloud run services describe chat-csv/);
  assert.doesNotMatch(workflow, /--allow-unauthenticated|GEMINI_API_KEY/);
  assert.doesNotMatch(dockerfile, /GEMINI_API_KEY/);
  assert.match(ignore, /^\.env\.\*$/m);
  assert.match(dockerfile, /^USER node$/m);
});
