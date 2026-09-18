# Supabase trial project

Created on 18 September 2026 with the owner's approval of the quoted $0/month project cost.

- Project: Titan In Field Servicing Trial
- Reference: awcnotllkwctbczgprmn
- Organisation: TITAN SAFTEY SYSTEM
- Region: Sydney (`ap-southeast-2`)
- Dashboard: https://supabase.com/dashboard/project/awcnotllkwctbczgprmn
- Creation status: ACTIVE_HEALTHY

## Integration status

The app now signs in with Supabase Auth and loads a shared presentation workspace.
The same approved administrator account opens the employee and management portals.
Separate employee roles are deliberately not enabled in this presentation build.

## Operation

1. Sign in using the approved app email and password (not a prototype PIN).
2. Initialise once on the desktop: explicitly import its allowlisted operational
   records, or start with empty registers and bundled sample stock. Old browser
   records remain untouched. Back up each device separately before importing.
3. Open the employee portal on the phone and management on the desktop using the
   same account. A status bar identifies the shared trial connection.
4. An action groups the changed registers and stock into one database transaction.
   Wait for the saving overlay to close. Other active pages check for updates
   every two seconds; background pages refresh when focused.
5. If editing while another device saves, the older save is rejected. Download
   the unsaved action if needed, then discard and reload before re-entering it.
   An uncertain network result is retried with the original operation id.

## Implementation and checks

- Tables and functions: `supabase/trial-schema.sql`; applied remotely as
  `shared_administrator_trial` and `return_edit_conflicts_without_transaction_retries`.
- Membership and ownership policies restrict records to the approved account.
  No anonymous table access, public membership editing, service-role key, PIN,
  or browser authentication session is included in shared documents.
- The workspace is a revisioned JSON document for this small presentation trial,
  not a production multi-employee ledger. Each action has a durable commit receipt.
- Local pending actions are retained under an account-specific key for recovery.
  Storage quota failures stop the save. Authentication tokens are never exported.
- Six automated tests cover totals, safe backups, two clients, conflicting saves,
  lost responses, retry idempotency, and local-storage failure.
- Database transaction tests verified authorized access, revision increments,
  retry deduplication, rejection of stale edits, and denial for unrelated and
  anonymous accounts. Test transactions were rolled back.
- Browser verification: TRIAL-001 added in management appeared in the employee
  portal. Its 100 L fuel + 10 L engine-oil submission appeared in management;
  RD4830 diesel fell from 700 to 600 L and engine oil from 1,050 to 1,040 L.
  A stale extra 1 L save was rejected, leaving the total at 100 L.
- Supabase performance advisor: no findings. Security advisor: no database/RLS
  findings; leaked-password protection is disabled on this project. See
  https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

## Presentation limits

Use sample data. Employee-specific permissions, a complete stock movement audit
ledger, camera QR scanning, supervisor messaging, SSO, and self-service password
recovery are not delivered by this integration. The existing prototype has other
workflows that have not received a full production-readiness audit. Do not claim
that every feature is production-ready. Image data is included in the small trial
workspace; a dedicated Storage bucket and normalized operational tables are the
next scaling step.
