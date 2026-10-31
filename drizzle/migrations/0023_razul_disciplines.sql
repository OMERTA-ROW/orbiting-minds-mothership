-- RAZUL all-discipline expansion: broader coverage, per-agent scoped feeds,
-- and a feedback loop. Belief/interpretive traditions (astrology, religion)
-- are taxonomy categories with a distinct 'belief' evidence class; no feed is
-- seeded for them until a reputable permitted source is registered.

alter table public.razul_job_state
  alter column coverage set default '{ai-model,vulnerability,development,research,space,astronomy,earth-science,climate,biology,physics,papers,government-data,news,linguistics,archaeology,architecture,religion,astrology,culture,geography,engineering,emerging-tech}';

update public.razul_job_state
set coverage = '{ai-model,vulnerability,development,research,space,astronomy,earth-science,climate,biology,physics,papers,government-data,news,linguistics,archaeology,architecture,religion,astrology,culture,geography,engineering,emerging-tech}',
    updated_at = now()
where id = 1;

-- Additional real public feeds for the new disciplines.
insert into public.razul_sources (id, name, url, kind, category, terms_note) values
  ('language-log', 'Language Log', 'https://languagelog.ldc.upenn.edu/nll/?feed=rss2', 'rss', 'linguistics', 'University of Pennsylvania linguistics blog feed; attribution retained.'),
  ('phys-archaeology', 'Phys.org Archaeology', 'https://phys.org/rss-feed/archaeology-news/', 'rss', 'archaeology', 'Public science news feed; headlines and summaries only.'),
  ('phys-technology', 'Phys.org Technology', 'https://phys.org/rss-feed/technology-news/', 'rss', 'emerging-tech', 'Public science news feed; headlines and summaries only.'),
  ('bbc-entertainment-arts', 'BBC Entertainment & Arts', 'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml', 'rss', 'culture', 'Public news feed; headlines and summaries only, copyright respected.'),
  ('bbc-world', 'BBC World', 'https://feeds.bbci.co.uk/news/world/rss.xml', 'rss', 'geography', 'Public news feed; headlines and summaries only, copyright respected.')
on conflict (id) do nothing;

-- Per-agent scoped feed configuration: which categories each agent follows,
-- the minimum relevance for its alerts, and whether alerts are enabled.
create table public.razul_agent_feeds (
  agent text primary key,
  categories text[] not null default '{}',
  min_relevance integer not null default 40,
  alerts_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.razul_agent_feeds (agent, categories, min_relevance) values
  ('jackboy', '{vulnerability,development,ai-model,emerging-tech,engineering,government-data}', 40),
  ('jax', '{vulnerability,development,ai-model,emerging-tech}', 50),
  ('omni', '{ai-model,vulnerability,development,research,space,earth-science,climate,government-data,emerging-tech,engineering}', 40),
  ('sabrina', '{ai-model,research,space,astronomy,biology,physics,papers,news,culture,linguistics,archaeology,architecture,religion,astrology,geography}', 40),
  ('guardian', '{vulnerability,government-data}', 30)
on conflict (agent) do nothing;

-- Feedback loop: agents (via approved signed-in readers) mark findings useful
-- or not; feedback is append-only and attributed.
create table public.razul_agent_feedback (
  id uuid primary key default gen_random_uuid(),
  finding_id uuid not null references public.razul_findings(id) on delete cascade,
  agent text not null,
  verdict text not null check (verdict in ('useful', 'not-useful')),
  note text not null default '',
  created_by uuid not null,
  created_at timestamptz not null default now()
);

grant select on public.razul_agent_feeds to authenticated;
grant select, insert on public.razul_agent_feedback to authenticated;
grant all on public.razul_agent_feeds to service_role;
grant all on public.razul_agent_feedback to service_role;

alter table public.razul_agent_feeds enable row level security;
alter table public.razul_agent_feedback enable row level security;

create policy "Approved readers view agent feeds"
  on public.razul_agent_feeds for select to authenticated
  using (public.is_knowledge_reader());
create policy "Approved readers view feedback"
  on public.razul_agent_feedback for select to authenticated
  using (public.is_knowledge_reader());
create policy "Approved readers submit feedback"
  on public.razul_agent_feedback for insert to authenticated
  with check (public.is_knowledge_reader() and created_by = auth.uid());