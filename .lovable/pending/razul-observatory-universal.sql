-- RAZUL universal observatory expansion: topic taxonomy, entities, evidence
-- classification, and a broader real public-source registry.

alter table public.razul_findings
  add column topic text not null default 'general',
  add column entities text[] not null default '{}',
  add column evidence_class text not null default 'established',
  add column evidence_strength integer not null default 50,
  add column revision integer not null default 1;

alter table public.razul_job_state
  alter column coverage set default '{ai-model,vulnerability,development,research,space,astronomy,earth-science,climate,biology,physics,papers,government-data,news}';

update public.razul_job_state
set coverage = '{ai-model,vulnerability,development,research,space,astronomy,earth-science,climate,biology,physics,papers,government-data,news}',
    updated_at = now()
where id = 1;

-- Additional real public feeds across the expanded coverage. All are official
-- or reputable public RSS/Atom feeds; attribution retained, one bounded fetch
-- per source per run, sources rotate so the full registry is covered over time.
insert into public.razul_sources (id, name, url, kind, category, terms_note) values
  ('nasa-breaking', 'NASA Breaking News', 'https://www.nasa.gov/rss/dyn/breaking_news.rss', 'rss', 'space', 'US government public feed; attribution retained.'),
  ('esa-space-science', 'ESA Space Science', 'https://www.esa.int/rssfeed/Our_Activities/Space_Science', 'rss', 'astronomy', 'ESA public RSS feed; standard feed terms.'),
  ('phys-space', 'Phys.org Space', 'https://phys.org/rss-feed/space-news/', 'rss', 'astronomy', 'Public science news feed; headlines and summaries only.'),
  ('phys-earth', 'Phys.org Earth', 'https://phys.org/rss-feed/earth-news/', 'rss', 'earth-science', 'Public science news feed; headlines and summaries only.'),
  ('phys-biology', 'Phys.org Biology', 'https://phys.org/rss-feed/biology-news/', 'rss', 'biology', 'Public science news feed; headlines and summaries only.'),
  ('arxiv-astro-ph', 'arXiv astro-ph', 'https://arxiv.org/rss/astro-ph', 'rss', 'papers', 'arXiv public RSS; preprints flagged preliminary, attribution retained.'),
  ('arxiv-physics', 'arXiv physics', 'https://arxiv.org/rss/physics', 'rss', 'physics', 'arXiv public RSS; preprints flagged preliminary, attribution retained.'),
  ('usgs-significant-quakes', 'USGS Significant Earthquakes', 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_month.atom', 'atom', 'government-data', 'US government public data feed; attribution retained.'),
  ('bbc-science-environment', 'BBC Science & Environment', 'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml', 'rss', 'news', 'Public news feed; headlines and summaries only, copyright respected.')
on conflict (id) do nothing;
