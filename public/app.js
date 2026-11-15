import { validateApps } from "./catalog.js";

const directory = document.querySelector("#app-directory");
const status = document.querySelector("#directory-status");
const template = document.querySelector("#app-card");

async function loadDirectory() {
  const response = await fetch("./apps.json", { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`Application directory request failed: HTTP ${response.status}`);
  }
  const apps = validateApps(await response.json());
  const cards = apps.map((app, index) => {
    const card = template.content.cloneNode(true);
    card.querySelector(".card-number").textContent = String(index + 1).padStart(2, "0");
    card.querySelector(".card-category").textContent = app.category;
    const heading = card.querySelector("h3");
    heading.textContent = app.name;
    heading.id = `app-${app.id}`;
    card.querySelector("article").setAttribute("aria-labelledby", heading.id);
    card.querySelector(".card-description").textContent = app.description;
    const footer = card.querySelector(".card-footer");
    if (app.status === "live") {
      const link = document.createElement("a");
      link.href = app.url;
      link.className = "app-link";
      link.textContent = "Open app";
      link.setAttribute("aria-label", `Open ${app.name}`);
      footer.append(link);
    } else {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = "Coming soon";
      footer.append(badge);
    }
    return card;
  });
  directory.replaceChildren(...cards);
  directory.removeAttribute("aria-busy");
  status.textContent = `${apps.length} tools. ${apps.filter((app) => app.status === "live").length} available now.`;
}

loadDirectory().catch((error) => {
  console.error("Could not load the application directory.", error);
  directory.removeAttribute("aria-busy");
  status.textContent = "The tool directory could not be loaded. Please refresh to try again.";
  status.setAttribute("role", "alert");
});
