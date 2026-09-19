-- Keep the shared workspace access policies; permit the new site facilities and audit documents.
alter table public.trial_workspaces drop constraint trial_document_keys;
alter table public.trial_workspaces add constraint trial_document_keys check (documents - array[
  'titan-assets-v2','titan-bulk-tanks-v1','titan-workshop-stock-v1',
  'titan-service-trucks-v1','titan-oil-templates-v1','titan-fuel-schedule-v3',
  'titan-service-entries-v1','titan-fuel-submissions-v2',
  'titan-stock-adjustment-register-v1','titan-system-alert-settings-v1',
  'titan-branding-settings-v1','titan-daily-fuel-sheet-export-history-v1',
  'titan-site-facilities-v1','titan-site-stock-audit-v1'
]::text[] = '{}'::jsonb);
