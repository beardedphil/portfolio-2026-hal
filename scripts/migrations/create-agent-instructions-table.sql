-- Create agent_instructions table for storing instruction files
-- Similar structure to agent_artifacts but for instruction content

CREATE TABLE IF NOT EXISTS agent_instructions (
  instruction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_full_name TEXT NOT NULL,
  topic_id TEXT NOT NULL, -- e.g., "auditability-and-traceability"
  filename TEXT NOT NULL, -- e.g., "auditability-and-traceability.mdc"
  title TEXT, -- Human-readable title
  description TEXT, -- Description from frontmatter
  content_md TEXT NOT NULL, -- Full markdown content (including frontmatter)
  content_body TEXT, -- Content without frontmatter (for easier querying)
  always_apply BOOLEAN DEFAULT false,
  agent_types TEXT[] DEFAULT ARRAY[]::TEXT[], -- Array of agent types this applies to
  is_basic BOOLEAN DEFAULT false, -- Whether this is a basic instruction (always loaded)
  is_situational BOOLEAN DEFAULT false, -- Whether this is situational (on-demand)
  topic_metadata JSONB, -- Additional metadata (title, description, keywords, etc.)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(repo_full_name, topic_id)
);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_agent_instructions_repo ON agent_instructions(repo_full_name);
CREATE INDEX IF NOT EXISTS idx_agent_instructions_topic ON agent_instructions(topic_id);
CREATE INDEX IF NOT EXISTS idx_agent_instructions_basic ON agent_instructions(repo_full_name, is_basic) WHERE is_basic = true;
CREATE INDEX IF NOT EXISTS idx_agent_instructions_situational ON agent_instructions(repo_full_name, is_situational) WHERE is_situational = true;

-- Create instruction_index table for storing the index metadata
CREATE TABLE IF NOT EXISTS agent_instruction_index (
  index_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_full_name TEXT NOT NULL UNIQUE,
  index_data JSONB NOT NULL, -- The full .instructions-index.json structure
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_instruction_index_repo ON agent_instruction_index(repo_full_name);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers to auto-update updated_at
CREATE TRIGGER update_agent_instructions_updated_at
  BEFORE UPDATE ON agent_instructions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_agent_instruction_index_updated_at
  BEFORE UPDATE ON agent_instruction_index
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
