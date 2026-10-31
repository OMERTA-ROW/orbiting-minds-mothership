insert into public.razul_sources (id, name, url, kind, category, terms_note) values
  ('nasa-iotd', 'NASA Image of the Day', 'https://www.nasa.gov/rss/dyn/lg_image_of_the_day.rss', 'rss', 'space', 'US government public feed; attribution retained.')
on conflict (id) do nothing;