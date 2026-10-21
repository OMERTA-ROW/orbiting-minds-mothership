export const SITE_URL = "https://evoomni.tech";

type SeoOptions = { indexable?: boolean; path?: string; image?: string; imageAlt?: string };

export function seo(title: string, description: string, options: SeoOptions = {}) {
  const full = `${title} · EVOLUTION Mothership`;
  const url = options.path ? `${SITE_URL}${options.path}` : undefined;
  const image = options.image ? `${SITE_URL}${options.image}` : undefined;
  return {
    meta: [
      { title: full },
      { name: "description", content: description },
      { property: "og:title", content: full },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "EVOLUTION Mothership" },
      ...(url ? [{ property: "og:url", content: url }] : []),
      ...(image
        ? [
            { property: "og:image", content: image },
            { property: "og:image:width", content: "1200" },
            { property: "og:image:height", content: "630" },
            ...(options.imageAlt ? [{ property: "og:image:alt", content: options.imageAlt }] : []),
            { name: "twitter:image", content: image },
          ]
        : []),
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: full },
      { name: "twitter:description", content: description },
      { name: "robots", content: options.indexable === true ? "index, follow" : "noindex" },
    ],
    links: url ? [{ rel: "canonical", href: url }] : [],
  };
}
