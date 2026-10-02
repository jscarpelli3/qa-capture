-- Invitations created before email delivery was enabled were incorrectly
-- labeled "sent" even though their links were meant to be copied manually.
update public.invitations
set status = 'draft'
where status = 'sent';
