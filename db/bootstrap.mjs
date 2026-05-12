#!/usr/bin/env node
//
// One-shot bootstrap for the Supabase project.
//   1. Apply every SQL migration in db/migrations/ in order
//   2. Create the three Storage buckets (logos, contracts, documents)
//   3. Create the first platform operator account (if OPERATOR_EMAIL env set)
//   4. Verify post-conditions
//
// Required env (in .env.local):
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   DATABASE_URL  (Supabase: Project Settings → Database → Connection string)
//
// Optional env:
//   OPERATOR_EMAIL    (default: jorge@jwallerenterprise.com)
//   OPERATOR_PASSWORD (default: randomly generated; printed at end)
//

import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envFile = readFileSync(resolve(__dirname, "../.env.local"), "utf8");
const env = Object.fromEntries(
  envFile
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = env.DATABASE_URL;
const operatorEmail = env.OPERATOR_EMAIL || "jorge@jwallerenterprise.com";
let operatorPassword = env.OPERATOR_PASSWORD;

if (!supabaseUrl || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
if (!databaseUrl) {
  console.error(
    "\nMissing DATABASE_URL in .env.local.\n\n" +
      "Get it from: Supabase Dashboard → Project Settings → Database\n" +
      "Choose 'Connection string' → 'URI', mode: 'Session'.\n" +
      "Copy the full string and paste it as:\n" +
      "  DATABASE_URL=postgresql://postgres:[PASSWORD]@db.xxxx.supabase.co:5432/postgres\n"
  );
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function header(s) {
  console.log("\n" + "=".repeat(60));
  console.log(s);
  console.log("=".repeat(60));
}

// ============================================================
// STEP 1: Apply migrations
// ============================================================
async function applyMigrations() {
  header("Applying migrations");
  const migrationsDir = resolve(__dirname, "migrations");
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    for (const file of files) {
      const content = readFileSync(resolve(migrationsDir, file), "utf8");
      process.stdout.write(`  → ${file} ... `);
      try {
        await sql.unsafe(content);
        console.log("ok");
      } catch (err) {
        const msg = String(err.message || err);
        // Idempotent re-runs: ignore "already exists" errors.
        if (/already exists|duplicate object|duplicate_object/i.test(msg)) {
          console.log("already applied (skipped)");
          continue;
        }
        throw err;
      }
    }
  } finally {
    await sql.end();
  }
}

// ============================================================
// STEP 2: Create Storage buckets
// ============================================================
async function ensureBuckets() {
  header("Storage buckets");
  const want = [
    { name: "logos", public: true, fileSizeLimit: 5 * 1024 * 1024 },
    { name: "contracts", public: false, fileSizeLimit: 50 * 1024 * 1024 },
    { name: "documents", public: false, fileSizeLimit: 50 * 1024 * 1024 },
  ];
  const { data: existing, error } = await admin.storage.listBuckets();
  if (error) throw error;
  const have = new Set(existing.map((b) => b.name));

  for (const b of want) {
    if (have.has(b.name)) {
      console.log(`  ${b.name}: already exists`);
      continue;
    }
    const { error: createErr } = await admin.storage.createBucket(b.name, {
      public: b.public,
      fileSizeLimit: b.fileSizeLimit,
    });
    if (createErr) throw createErr;
    console.log(`  ${b.name}: created (public=${b.public})`);
  }
}

// ============================================================
// STEP 3: Create platform operator account
// ============================================================
async function ensurePlatformOperator() {
  header("Platform operator account");
  if (!operatorPassword) {
    operatorPassword = "OC-" + randomBytes(12).toString("base64url");
  }

  const { data: users } = await admin.auth.admin.listUsers({ perPage: 200 });
  const existing = users.users.find((u) => u.email?.toLowerCase() === operatorEmail.toLowerCase());

  let userId;
  if (existing) {
    userId = existing.id;
    console.log(`  auth user exists: ${operatorEmail} (${userId})`);
    if (env.OPERATOR_PASSWORD) {
      await admin.auth.admin.updateUserById(userId, { password: operatorPassword });
      console.log("  password updated from OPERATOR_PASSWORD env");
    }
  } else {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: operatorEmail,
      password: operatorPassword,
      email_confirm: true,
      user_metadata: { full_name: "Jorge Mendoza" },
    });
    if (createErr) throw createErr;
    userId = created.user.id;
    console.log(`  created auth user: ${operatorEmail} (${userId})`);
  }

  // Make sure users table does NOT have this id (operator/user disjointness)
  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    await sql`delete from users where id = ${userId}`;
    const inserted = await sql`
      insert into platform_operators (id, email, full_name, operator_role)
      values (${userId}, ${operatorEmail}, 'Jorge Mendoza', 'super')
      on conflict (id) do update set
        email = excluded.email,
        operator_role = excluded.operator_role
      returning id, email, operator_role
    `;
    console.log(`  platform_operators row: ${JSON.stringify(inserted[0])}`);
  } finally {
    await sql.end();
  }

  return { userId, email: operatorEmail, password: operatorPassword };
}

// ============================================================
// STEP 4: Verify
// ============================================================
async function verify() {
  header("Post-bootstrap verification");
  const probes = [
    "tenants",
    "users",
    "platform_operators",
    "roles",
    "role_permissions",
    "invite_links",
    "admin_checklist_items",
    "admin_clause_library",
    "admin_folder_templates",
    "projects",
    "contracts",
    "tenant_billing",
  ];
  for (const t of probes) {
    const { error, count } = await admin
      .from(t)
      .select("id", { count: "exact", head: true });
    if (error) {
      console.log(`  ${t}: FAIL (${error.message})`);
    } else {
      console.log(`  ${t}: ok (${count ?? 0} rows)`);
    }
  }

  // Storage check
  const { data: buckets } = await admin.storage.listBuckets();
  console.log(`  buckets: ${buckets.map((b) => b.name).join(", ")}`);
}

// ============================================================
// RUN
// ============================================================
try {
  await applyMigrations();
  await ensureBuckets();
  const operator = await ensurePlatformOperator();
  await verify();

  console.log("\n" + "=".repeat(60));
  console.log("✓ Bootstrap complete");
  console.log("=".repeat(60));
  console.log("\nOperator credentials:");
  console.log(`  Email:    ${operator.email}`);
  console.log(`  Password: ${operator.password}`);
  console.log("\nSign in at /admin/login");
  console.log("\nNEXT STEP: enable the JWT custom claim hook:");
  console.log(
    "  Supabase Dashboard → Authentication → Hooks → Custom Access Token Hook\n" +
      "  → Enable, choose function `public.custom_access_token_hook`"
  );
} catch (err) {
  console.error("\n✗ Bootstrap failed:");
  console.error(err);
  process.exit(1);
}
