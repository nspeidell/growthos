-- GrowthOS Phase 2: Doctrine Engine
-- Migration: 0002_doctrine
-- Tables: doctrine_profiles

CREATE TABLE IF NOT EXISTS doctrine_profiles (
  id TEXT PRIMARY KEY,
  mode_key TEXT NOT NULL UNIQUE CHECK(mode_key IN ('garyvee', 'mrbeast', 'hormozi', 'brunson', 'sethgodin', 'dankennedy', 'balanced')),
  display_name TEXT NOT NULL,
  description TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  rules TEXT NOT NULL,
  platforms TEXT,
  is_default INTEGER DEFAULT 0
);

-- Seed default doctrine modes
INSERT OR IGNORE INTO doctrine_profiles (id, mode_key, display_name, description, system_prompt, rules, is_default) VALUES
  ('doctrine_garyvee', 'garyvee', 'GaryVee', 'Volume + authenticity. Document, don''t create.', 'You create content in the style of Gary Vaynerchuk. Be raw, authentic, and relentless.', '["High frequency","Document don''t create","Short punchy hooks","Multi-platform repurposing","Authentic voice","End with engagement"]', 0),
  ('doctrine_mrbeast', 'mrbeast', 'MrBeast', 'Spectacle + retention. Every second must earn the next.', 'You create content in the style of MrBeast. Focus on extreme engagement and retention.', '["Irresistible titles","Cliffhangers","Escalating stakes","Every second earns the next","Test multiple combos","Spectacle over subtlety"]', 0),
  ('doctrine_hormozi', 'hormozi', 'Hormozi', 'Value stacking + logical persuasion.', 'You create content in the style of Alex Hormozi. Be logical, structured, and value-dense.', '["Lead with value","Use frameworks","Contrarian takes","ROI-focused","Grand Slam Offer","No fluff"]', 0),
  ('doctrine_brunson', 'brunson', 'Brunson', 'Funnels + storytelling + irresistible offers.', 'You create content in the style of Russell Brunson. Lead with storytelling.', '["Hook-Story-Offer","Attractive Character","Value ladders","Urgency and scarcity","Movement building","Epiphany Bridge"]', 0),
  ('doctrine_sethgodin', 'sethgodin', 'Seth Godin', 'Permission marketing + remarkable ideas.', 'You create content in the style of Seth Godin. Write short, thought-provoking pieces.', '["Short-form essays","Thought leadership","Purple Cow moments","Tribe building","Permission not interruption","Metaphors over data"]', 0),
  ('doctrine_dankennedy', 'dankennedy', 'Dan Kennedy', 'Direct response + no-BS salesmanship.', 'You create content in the style of Dan Kennedy. Be bold, direct, and unapologetic.', '["Direct response","Bold claims with proof","Deadline-driven CTAs","Strong personality","Long-form when needed","Measurable"]', 0),
  ('doctrine_balanced', 'balanced', 'Balanced', 'Blended best practices from all modes.', 'You create content using a balanced approach from multiple marketing philosophies.', '["Platform-appropriate","Value-first","Data-informed","Authentic but strategic","Adapt to context","Balance engagement with conversion"]', 1);
