# ReVampLEX interactive release

Approved design source: e9c93a7deedef2ca19719285d6cb90bb740d2c58.
Production base: 5bb103fd2ac97a845cdb7414715dc05c7fc92a45.

## Changes

A new branded homepage and inspiration feed, consistent navigation, map/list browsing, clearer project posting, organized Project Rooms, all 16 existing calculators, editable quantities and saved estimate drafts, and improved takeoff and AI request handling. Existing billing and deployment integrations are retained. Project images are optimized.

This release contains production source. The isolated review data, review build, and Sites hosting manifest are excluded.

## Validation

`npm run verify` checks all 14 HTML pages and local assets, parses classic scripts, and runs 14 calculator/AI handling checks plus 11 notification authorization and error-handling checks. Notification requests are mocked; no real emails are sent during tests.

Browser end-to-end testing, live AI calls, and authenticated cross-account database workflows remain unverified. There is no available supported internal browser-preview workflow in this environment.

## Database dependency

Apply `supabase/migrations/20261020013000_community.sql` to the database used by the existing site, project `dezvwoedboikshqttdqu`. The migration adds optional sharing fields and comments/reactions with row-level security. Existing projects remain unshared by default, and existing jobs policies remain in place. Verify consent visibility and own-user insert/delete behavior before production release.

Read-only checks confirmed the live jobs table exists, but `share_activity`, `community_reactions`, and `community_comments` are missing. The initially connected Supabase account exposes only the inactive project `euejzhwtewygotgkylal`; it cannot administer the live site database. Do not switch the app to that inactive database.

After the Supabase/Vercel reconnection on 2026-10-20, the live database request still returned a permission error and the accessible project list still contained only the inactive project above. No migration has been applied.

## GitHub connection

The ReVampLEX account has installed the ChatGPT Codex Connector with access to `revamplex/revamplex-landing`. Repository authorization was verified on 2026-10-20. Upload this source to the release branch for a Vercel preview; production remains gated on the database migration and live integration checks above.

## Notification configuration

Project notifications now pass through `/api/project-notification`. The endpoint verifies the user's session with Supabase Auth, checks membership and job ownership under the user's existing row-level permissions, and resolves the other participant's saved email on the server. Client-supplied recipients, identities, and destination links are ignored. Failed submissions are shown as errors instead of successful invitations.

Set `ZAPIER_NOTIFICATION_WEBHOOK` as an encrypted Vercel environment variable for the existing Preview and Production environments before deploying. Never place this value in browser files or public environment variables. The previously published browser webhook remains in repository history; rotate it in Zapier and configure the replacement before production release. The endpoint preserves existing form field names, including `recipient_email`, `contractor_email`, `invite_type`, and `project_room_url`. Confirm the Zap email action uses `recipient_email` so contractor-to-homeowner notifications reach the correct partner.

Validate authorized two-party invitations and notifications against the live project schema before merging. Missing partner contact data returns a clear error. No live notification or email has been sent as part of release preparation.

## Vercel connection

The connected account can list team `revamplexs-projects` (`team_sqSrTeRhaY9OAbEfFEmSsaqY`), but that team's accessible project list is empty. Requests for `revamplex-landing` and the last known production deployment return HTTP 404. Access to the existing project must be resolved before deployment; no replacement project has been created and no production deployment has been changed.

## Release and rollback

Use the existing Vercel project `revamplexs-projects/revamplex-landing`. Confirm the preview build and existing runtime environment before merging. Do not deploy review sample data or create a replacement database.

After database verification and successful preview checks, merge this branch into `main` to use the existing GitHub/Vercel deployment. Confirm revamplex.com serves the approved homepage and the production deployment is ready.

If a release regression appears, restore the last working Vercel deployment or revert the release commit. The database addition is backward compatible; keep user-created community data rather than dropping its tables during a frontend rollback.
