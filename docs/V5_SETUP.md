# Little Scholars V5.0 — Multi-user school pilot

**Status:** draft implementation / review branch, not production. The existing 20-day V4.2 curriculum remains in `index.html`. The home page and live Netlify site are unchanged until this PR is merged.

## Architecture

- **Netlify** serves the existing static app and a new `portal.html` login and organization portal.
- **Supabase Auth** handles adult email/password login, confirmation, password reset, and sessions.
- **Supabase Postgres + Row Level Security** holds organizations, staff roles, classrooms, learner profiles, guardian links and a per-learner curriculum snapshot.
- **Adults only** have credentials. Children choose a learner dashboard after adult login. No student emails, birthdays, addresses, or photos are collected in this MVP.
- **Schools and co-ops:** owner/admin sees all school learners, assigned teachers see their classrooms only, linked guardians see their children only. Staff invitations use 7-day, single-use tokens and verified recipient email addresses. Invitees do not receive elevated owner/admin privileges. Invites can be copied securely; sending email automatically is not implemented.
- **Families:** an account owner may create a family organization and children. Parents can keep using the original app without Supabase as a local-only demo.

## Set up an isolated staging environment first

1. Create a **new Supabase staging project** using https://supabase.com/dashboard. Never paste secret/service-role keys into repository files or ChatGPT.
2. In its SQL editor apply `supabase/migrations/202611230001_v5_multi_tenant.sql`. **This SQL has not been executed or integration-tested in a real Supabase project.** Review and test the policies before admitting students.
3. In Supabase Auth enable adult email/password, **email confirmations**, and configure the allowed redirect URLs for the **Netlify deploy preview** (including `/portal.html`).
4. In `v5-config.js`, set the project URL and **publishable/anon key only**. Both are public client identifiers, **not secrets**. Never use a Supabase service-role/secret key in frontend code.
5. Deploy this **feature branch as a preview**, not the main/production branch. Open `/portal.html` on the preview URL.
6. Create one family, then one school, a classroom and test learner. Create a teacher invite for a specific classroom and a guardian invite for a specific learner.
7. Sign in as invited confirmed adults in other browsers; verify no one can see another organization's data even when changing client-side URLs. Test access **after deleting membership rows** in a staging environment.
8. Test daily lessons, Phonics Lab, Math Lab, original stories, Reading Academy, and save/reload. Test cross-device concurrency: two sessions saving the same learner should cause the stale session to reject the save and prompt the user to reload.

## Compatibility and migration

The legacy app uses browser localStorage key `little_scholars_w1_4_v3`. This key remains untouched.
- `index.html` without `?learner=<uuid>` retains the **original local demo behavior**.
- Opening a selected learner from the portal redirects to `index.html?learner=<uuid>`, authenticates the adult, checks row access, and loads only that learner's cloud progress.
- If a learner has no cloud progress yet, a **manual, confirmed import** can migrate the old device's progress; no automatic cross-child transfer occurs.
- Imported fields: current week/day, answers, completion, observations, lab progress, storybook progress, reader progress, reading rate, worldview, etc. Parent-recorded microphone audio (if later added) is not included.
- Cloud data is saved on a debounce after each action. The server compares `updated_at` to prevent stale-device overwrites; cloud conflicts stop saving rather than silently overwriting. Save/refresh persistence still requires real-world QA.
- Existing local demo remains separate and remains exportable.

## Test coverage status

- JavaScript **syntax checks pass** for original inline JS, `portal.js` and `cloud-bridge.js` using a V8 parser.
- Static inspection verifies the original curriculum and saved-progress keys were preserved.
- **Not completed:** end-to-end Supabase tests, SQL migration execution, browser interaction testing against configured staging, teacher/guardian RLS security penetration tests, mobile Safari QA, child-privacy legal review.
- Do **not** merge or admit real learner records until these are completed.

## Before production

- Confirm COPPA/FERPA applicability with qualified counsel; publish privacy notice, retention/deletion policies, admin access and incident response. Add guardian consent and account/data deletion workflows.
- Commission a database RLS review, rate limits, audit/event logs, error monitoring, backup and restore plan.
- Build invitations administration (revoke/resend), multi-guardian support, roster import and teacher assignments.
- Add accessible child profile switching, saved-progress indicators and sync conflict recovery UI.
- Test real iPad/Safari and offline/reconnect behavior before production.

## How to preview

`portal.html` is the new account entry point. `index.html` remains the original learning app and also supports cloud learner mode when opened from the portal. Netlify publish directory remains `.`; no build step is required.

**No data is migrated automatically. No production deployment is requested or performed by this PR.**
