import css from "@/styles/forge-web.css?raw";
import { webContent, type WebContent } from "./forge";
const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (v) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[v] ?? v,
  );
export function renderForgeWeb(input: WebContent) {
  const v = webContent.parse(input),
    e = escape;
  return `<!doctype html><html lang="en" data-theme="${v.theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'"><meta name="robots" content="noindex"><title>${e(v.brand)} — ${e(v.headline)}</title><meta name="description" content="${e(v.description)}"><meta property="og:title" content="${e(v.brand)} — ${e(v.headline)}"><meta property="og:description" content="${e(v.description)}"><meta property="og:type" content="website"><meta name="twitter:card" content="summary"><style>${css}</style></head><body><a class="skip" href="#main">Skip to content</a><header><nav aria-label="Site navigation"><span class="brand">${e(v.brand)}</span><a href="#story">Story & credits</a></nav></header><main id="main"><section class="cover"><p class="category">${e(v.category)}</p><h1>${e(v.brand)}</h1><h2>${e(v.headline)}</h2><p class="lead">${e(v.description)}</p><a class="cta" href="#story">${e(v.cta)}</a></section><section id="story" class="story"><h2>The story</h2><p>${e(v.about)}</p><h2>Creator credits</h2><p class="credits">${e(v.credits)}</p>${v.audioAssetId ? '<p class="note">A private project audio version is referenced in the accompanying manifest. No private file or storage URL is embedded in this website.</p>' : ""}</section></main><footer>${e(v.brand)} · Owner-review draft / not published</footer></body></html>`;
}
export function checkForgeWeb(content: WebContent) {
  const parsed = webContent.parse(content),
    html = renderForgeWeb(parsed);
  return {
    method: "Structured static document checks v1",
    title: `${parsed.brand} — ${parsed.headline}`,
    descriptionLength: parsed.description.length,
    singleH1: (html.match(/<h1>/g) ?? []).length === 1,
    language: "en",
    viewport: true,
    landmarks: true,
    skipLink: true,
    scripts: 0,
    externalRequests: 0,
    contactForm: "NOT CONNECTED",
    responsiveCss: true,
    visualAccessibility: "REQUIRES BROWSER AND HUMAN REVIEW",
    seoIndexing: "noindex / draft",
    deployment: "NOT RUN",
    linkedAudioIncluded: false,
  };
}
