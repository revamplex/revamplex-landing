# ReVampLEX interactive release

Approved design source: e9c93a7deedef2ca19719285d6cb90bb740d2c58.
Production base: 5bb103fd2ac97a845cdb7414715dc05c7fc92a45.

## Changes

A new branded homepage and inspiration feed, consistent navigation, map/list browsing, clearer project posting, organized Project Rooms, all 16 existing calculators, editable quantities and saved estimate drafts, and improved takeoff and AI request handling. Existing billing and deployment integrations are retained. Project images are optimized.

This release contains production source. The isolated review data, review build, and Sites hosting manifest are excluded.

## Validation

`npm run verify` checks all 14 HTML pages and local assets, parses classic scripts, and runs 16 calculator/AI/account-link checks plus 13 notification authorization and error-handling checks. Notification requests are mocked; no real emails are sent during tests.

Browser end-to-end testing and live AI/notification calls remain unverified. The community database permissions have been tested with simulated authenticated and anonymous database roles in a rolled-back transaction. There is no available supported internal browser-preview workflow in this environment.

## Database dependency

Applied `supabase/migrations/20261020033931_community.sql` to the existing live database, project `dezvwoedboikshqttdqu`, on 2026-10-20 UTC. The migration adds optional sharing fields and comments/reactions with row-level security, explicit grants, foreign keys, and indexes. Existing projects remain unshared by default. The local migration filename matches Supabase's recorded migration version.

Supabase access is now correctly authorized for `revamplex's Org` (`ztwoimwdtdfjxtkcwfxu`). The similarly named organization `revamplex` contains a different inactive project and is not used by the site.

Inspection found a pre-existing permissive jobs UPDATE policy. A security-invoker trigger now protects job ownership, sharing consent, and the fields displayed on shared stories independently of that policy, while retaining existing signature/completion updates. Community queries request only shared projects and the fields needed by the feed.

`tests/community-permissions.sql` passed on the live database using a rolled-back transaction: owner opt-in, author ownership, private-project visibility, anonymous write rejection, protected sharing choices and story content, own-row deletion, and withdrawal of consent. No test accounts were created or emails sent, and zero fixture rows remained. All 11 existing jobs remain unshared; both new community tables are empty.

Applied `supabase/migrations/20261020034735_project_identity.sql` to the same project. Client-created jobs must belong to the signed-in user; new rooms must match the job owner and valid participant accounts; room participant IDs cannot be replaced from the client. Existing rooms are retained. `tests/project-identity.sql` passed in a rolled-back transaction, including valid homeowner/contractor room creation and rejected identity substitutions. Contractor listing UUIDs now resolve through their `profile_id` before opening a room.

The security advisor introduced no new findings. Existing notices remain for an unused review table, trigger-function execution grants, and password protection. See [RLS policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [function execution grants](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), and [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## GitHub connection

The ReVampLEX account has installed the ChatGPT Codex Connector with access to `revamplex/revamplex-landing`. The release is saved in [PR #5](https://github.com/revamplex/revamplex-landing/pull/5). Vercel successfully built the initial preview at https://revamplex-landing-git-codex-interact-3e5ad8-revamplexs-projects.vercel.app. The preview requires Vercel sign-in; build success is not a substitute for authenticated workflow verification.

## Notification configuration

Project notifications now pass through `/api/project-notification`. The endpoint verifies the user's session with Supabase Auth and checks membership and job ownership under the user's existing row-level permissions. It then resolves the other participant's confirmed account email through the server-only Auth admin API. Editable public contact fields are never used as destinations. Client-supplied recipients, identities, and destination links are ignored. Failed submissions are shown as errors instead of successful invitations.

Set `ZAPIER_NOTIFICATION_WEBHOOK` as an encrypted Vercel environment variable for the existing Preview and Production environments before deploying. Never place this value in browser files or public environment variables. The previously published browser webhook remains in repository history; rotate it in Zapier and configure the replacement before production release. The endpoint preserves existing form field names, including `recipient_email`, `contractor_email`, `invite_type`, and `project_room_url`. Confirm the Zap email action uses `recipient_email` so contractor-to-homeowner notifications reach the correct partner.

Verify that the existing server-only `SUPABASE_SERVICE_ROLE_KEY` used by Stripe integration is configured for the same live Supabase project in the required Vercel environments. Notifications reuse it only for the specific recipient lookup after caller authorization; all project-data reads still use the caller's JWT and RLS. Never expose or prefix this key for client use. Missing configuration or an unverified partner account returns a clear failure.

Validate authorized two-party invitations and notifications against the live project schema before merging. Missing partner contact data returns a clear error. No live notification or email has been sent as part of release preparation.

Live room identity and consent guards have passed database permission tests. Auth admin lookup and webhook delivery have passed mocked tests; live delivery and Vercel environment configuration remain unverified.

## Vercel connection

The connected account can list team `revamplexs-projects` (`team_sqSrTeRhaY9OAbEfFEmSsaqY`), but that team's accessible project list is empty. The existing project ID, confirmed by Vercel's GitHub preview comment, is `prj_cWW4JlBqUX1pHiwmMkTMdOScVDbH`. Requests by both project name and ID return HTTP 404. GitHub integration can create previews, but connector access must be extended to this project before runtime configuration and authenticated preview verification. No replacement project has been created and no production deployment has been changed.

## Release and rollback

Use the existing Vercel project `revamplexs-projects/revamplex-landing`. Confirm the preview build and existing runtime environment before merging. Do not deploy review sample data or create a replacement database.

After database verification and successful preview checks, merge this branch into `main` to use the existing GitHub/Vercel deployment. Confirm revamplex.com serves the approved homepage and the production deployment is ready.

If a release regression appears, restore the last working Vercel deployment or revert the release commit. The database addition is backward compatible; keep user-created community data rather than dropping its tables during a frontend rollback.
