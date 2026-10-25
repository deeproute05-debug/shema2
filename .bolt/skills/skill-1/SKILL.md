---
name: skill-1
description: "Product PWA for designing a company's org structure with AI strategy."
---

# PROJECT RULES: OrgBuilder (read before EVERY task)

## Product

PWA for designing a company's org structure with AI strategy. ONE company per app. Users: owner, editor, viewer. Used by compounds in Egypt among others. Target: phone (touch) and desktop.

## Scope (do NOT go beyond)

IN: company/department/employee forms; schema views: org chart, matrix (solid line = functional manager, dashed = project manager), list; free-form mode + templates; editable, draggable diagram (mouse + touch, pinch-zoom); detail panel on card click with photo upload; real-time collaboration; AI strategy by BUTTON ONLY; export; PWA install; 3 languages.
OUT: multiple companies, non-profit view, public sign-up, any feature not asked. If a task seems to need something OUT, stop and ask.

## Stack

React 18, TypeScript (strict), Vite, Tailwind, Zustand, @xyflow/react, dagre, Supabase (Auth, Postgres+RLS, Realtime, Storage, Edge Functions), react-i18next, zod.

## Architecture (protect the core)

- core/: auth, roles, company, departments, employees, module registry, event bus. Change core ONLY when the task says so.
- modules/&lt;name&gt;/: own folder + manifest {id, version, deps, provides}. Modules never import each other; they talk via registry/events.
- Each module wrapped in an error boundary: a crashed module must not crash the app.
- Disabling a module hides it, data stays. Deleting module data = separate action with confirmation.
- DB migrations only ADD (new tables/columns). Never drop or rename without explicit approval.
- Modules: schema views, cards+photo, collaboration, ai-providers, ai-strategy, export, i18n.

## Access and security

- Public sign-up OFF. Only the owner invites by email (server-side, Edge Function with service role; never expose service key to client).
- Roles stored server-side; enforce with RLS on EVERY table. UI hiding is not security.
- AI keys: each user adds own key; store encrypted on server (e.g. Supabase Vault); never return it to the client after saving; AI calls only via Edge Function using the CALLER's key.
- Photos: private Storage bucket, access by role, client-side resize before upload.
- No secrets in client code, repo, or logs.

## AI

- Provider interface: one adapter per provider; user switches provider in settings. Do NOT hardcode claims about free tiers/limits; read provider docs or ask.
- Strategy recalculation ONLY on button click. Show badge "structure changed" if data changed since last run.
- Send structure JSON, request strict JSON output, validate with zod, handle errors/timeouts/rate limits, show clear messages. Output language = user's language.
- Keep strategy versions; allow restore.

## Collaboration

Supabase Realtime for live changes and presence. Last write wins on same field + notify user. Respect roles.

## i18n / RTL

- Languages: ar (Egyptian Arabic), ru, en. No hardcoded UI strings; all in translation files.
- ar: dir="rtl" for UI, use logical CSS (ms/me/ps/pe, start/end). Numbers/dates via Intl with locale "ar-EG-u-nu-arab" (Arabic-Indic digits).
- The diagram canvas ALWAYS dir="ltr" and is NEVER mirrored. Text inside nodes follows its own script direction.
- Arabic font with full glyph support. Test exports (PNG/PDF) with Arabic text.
- Arabic dialect strings: mark as "needs native review".

## UX

Touch targets &gt;= 44px. Drag/pan/pinch must work on touch. Autosave with debounce. Undo/redo. Loading, empty, and error states everywhere. Dark theme.

## Work protocol

1. Before coding: state a short plan (files to touch, risks). Keep tasks small; one concern per step.
2. If requirement is missing or ambiguous: ask ONE question. Never invent requirements, data, APIs, or library features.
3. No fake data, no stubs presented as done, no silent try/catch swallowing. Real errors must surface.
4. Run the build/type-check after changes. Fix errors before finishing.
5. Do not refactor or rename unrelated code. Do not add dependencies without saying why.
6. If a library API is uncertain, check its docs/types instead of guessing.

## Honesty rules

- Report only what is true. State what you verified and what you did NOT verify or could not run.
- Mark every claim: verified / assumption / unknown. Never say "works" without evidence.
- If something cannot be done as asked, say so and propose real alternatives with trade-offs.
- Do not flatter; point out risks in the requested approach.

## Final report format (after each task)

Done: ... | Files changed: ... | Not verified: ... | Risks/next steps: ...

Standing rule