# Assets Needed From Jorge / Operations

These are the inputs from the platform operator (you) that need to land before
each feature can go live. Categorized by what's blocked without them.

## Critical for first real tenant

### Database
- [ ] Apply the four SQL migrations against Supabase (see `db/README.md`)
- [ ] Create a `platform_operators` row for yourself so you can sign into `/admin`
   ```sql
   -- Run in Supabase SQL Editor after migrations are applied.
   -- First: sign up via Supabase Auth Dashboard manually to create an auth.users row.
   -- Then:
   insert into platform_operators (id, email, full_name, operator_role)
   values ('<auth_user_id>', 'jorge@jwallerenterprise.com', 'Jorge Mendoza', 'super');
   ```

### Stripe (defer until you charge real money)
- [ ] Stripe account + secret key → `STRIPE_SECRET_KEY`
- [ ] Webhook endpoint configured at `https://[your-domain]/api/webhooks/stripe`,
      with signing secret → `STRIPE_WEBHOOK_SECRET`
- [ ] One Product + Price (monthly or annual) in Stripe → `STRIPE_PRICE_ID_STANDARD`

## Per-tenant onboarding inputs (Module 1)

Required from each new customer:
- Company name
- Logo (PNG/SVG, transparent background preferred)
- Primary brand color (HEX, with Pantone/RGB optional)
- Secondary brand color (HEX)
- One or more HQ addresses with service radius
- Trades they work in (multi-select)
- Annual revenue history (5–10 years)
- Optional: historical contracts and proposals to seed CRM

## Contract review (Module 8)

Required from you (platform operator):

### Contract review checklist
- [ ] Master list of items every construction contract should include
- [ ] Per item:
  - Title (e.g., "Pay-when-paid clause")
  - Plain-language explanation of why it matters
  - Category (payment_terms, indemnity, scope, schedule, etc.)
  - Default priority (critical / high / low)
  - Applicable trades (or "all")
- Suggested launch volume: 25–50 items

### Clause library
- [ ] Vetted contract language for each checklist item
- [ ] Per clause:
  - Title
  - Full clause text
  - Linked checklist item
  - Tags (payment, indemnity, etc.)
  - Applicable trades

These are the only sources of truth Pre-Con uses (along with anonymized
cross-tenant patterns mined over time). The system fills gaps with Claude
when no library entry matches, so partial coverage is fine at launch.

## Folder templates per trade (Module 6)

Currently seeded with **placeholders** (Accounting / Operations / HR). These
need to be replaced with real trade-specific structures:

- [ ] General Contracting folder template
- [ ] Plumbing folder template
- [ ] Mechanical / pipe trades folder template
- [ ] Fire protection folder template
- [ ] Concrete folder template
- [ ] Steel folder template
- [ ] Electrical folder template
- [ ] HVAC folder template
- [ ] Each other trade you intend to support

Format per template: a tree of folder/sub-folder names. Example for a GC:
```
Active Projects/
  ├── [Project Number] [Project Name]/
  │   ├── 01 Contract/
  │   ├── 02 Submittals/
  │   ├── 03 RFIs/
  │   ├── 04 Change Orders/
  │   ├── 05 Daily Logs/
  │   ...
```

## OAuth applications

These are app-level registrations you create once and reuse for every tenant:

- [ ] **Google OAuth app** (Gmail + Drive scopes) — `GOOGLE_OAUTH_CLIENT_ID` / `_SECRET`
- [ ] **Microsoft Azure AD app** (Graph mail scopes) for Outlook — credentials in env
- [ ] **QuickBooks Online developer app** — `QBO_CLIENT_ID` / `_SECRET` + sandbox vs prod env flag
- [ ] **Twilio master account** — `TWILIO_ACCOUNT_SID` / `_AUTH_TOKEN`; sub-account per tenant created on signup; numbers provisioned per user

## Branding consistency

- [ ] One Collective logo (used in marketing, login, admin portal)
- [ ] One Collective brand colors (currently using neutral grays — replace when you have brand decided)
- [ ] One Collective tagline/positioning copy if it changes

## Legal / compliance

- [ ] Terms of Service (link in signup flow)
- [ ] Privacy Policy
- [ ] Subscription cancellation policy

## Email sending (platform-level)

- [ ] Resend account → `RESEND_API_KEY`
- [ ] Verified sending domain (e.g., onecollective.app) for transactional emails:
      invite confirmation, trial-end warnings, billing notifications

## Trade-specific custom fields

For each trade, you'll eventually want to define trade-specific CRM/project
fields. For now, all stored in `projects.custom_fields` JSONB. When you're
ready to formalize, list per trade:
- Pipe trades: linear feet of pipe, fitting count, valve count, …
- Concrete: yards, PSI, finish type, …
- Electrical: panel count, conduit footage, …
- Steel: tonnage, beam count, …
- (etc.)
