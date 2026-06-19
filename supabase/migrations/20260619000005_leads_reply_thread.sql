alter table leads
  add column if not exists graph_message_id text,
  add column if not exists graph_conversation_id text,
  add column if not exists klant_reacties jsonb default '[]'::jsonb;
