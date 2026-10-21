export function seo(title: string, description: string, options: { indexable?: boolean } = {}) {
  const full = `${title} · EVOLUTION Mothership`;
  return {
    meta: [
      { title: full },
      { name: "description", content: description },
      { property: "og:title", content: full },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: options.indexable === true ? "index, follow" : "noindex" },
    ],
  };
}
