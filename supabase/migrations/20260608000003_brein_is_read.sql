-- BREIN: gelezen-status uit Outlook (Graph isRead) bijhouden.
-- Wordt gevuld/bijgewerkt door de sync. false = ongelezen in Outlook.
alter table brein_messages
  add column if not exists is_read boolean not null default false;
