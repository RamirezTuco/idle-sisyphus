export function validateApps(apps) {
  if (!Array.isArray(apps) || apps.length === 0) {
    throw new Error("The application directory must contain at least one app.");
  }

  const ids = new Set();
  for (const app of apps) {
    if (!app || typeof app !== "object" || Array.isArray(app)) {
      throw new Error("Each application must be an object.");
    }
    if (typeof app.id !== "string" || !/^[a-z][a-z0-9-]*$/.test(app.id) || ids.has(app.id)) {
      throw new Error("Application IDs must be unique lowercase slugs.");
    }
    ids.add(app.id);
    for (const field of ["name", "category", "description"]) {
      if (typeof app[field] !== "string" || !app[field].trim()) {
        throw new Error(`Application ${app.id} requires ${field}.`);
      }
    }
    if (!["live", "coming-soon"].includes(app.status)) {
      throw new Error(`Application ${app.id} has an invalid status.`);
    }
    if (app.status === "coming-soon") {
      if (app.url !== null) {
        throw new Error(`Unavailable application ${app.id} must have a null URL.`);
      }
    } else {
      if (typeof app.url !== "string" || !URL.canParse(app.url)) {
        throw new Error(`Live application ${app.id} requires an absolute HTTPS URL.`);
      }
      const url = new URL(app.url);
      if (url.protocol !== "https:" || url.username || url.password) {
        throw new Error(`Application ${app.id} must use HTTPS without embedded credentials.`);
      }
    }
  }
  return apps;
}
