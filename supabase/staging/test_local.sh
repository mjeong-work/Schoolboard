#!/bin/sh
# Local rehearsal of the staging schema against a copy of PRODUCTION's
# public schema (from a schema-only pg_dump), on a throwaway local
# Postgres. Never point this at a real project.
#
#   1. load the prod schema dump into public, apply the hotfix (as prod has it)
#   2. fingerprint public, apply staging_schema.sql, fingerprint again:
#      public must be byte-for-byte unchanged
#   3. run the reporting/blocking scenarios against staging
#   4. gate and isolation checks (non-member, anon, writes stay in staging)
#
# usage: PGPORT=54329 sh supabase/staging/test_local.sh <prod_schema_dump.sql>
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
DUMP=${1:?usage: test_local.sh <prod_schema_dump.sql>}
DB=schoolboard_staging_test
P="psql -h ${PGHOST:-localhost} -p ${PGPORT:-5432} -U ${PGUSER:-postgres} -q"
TMP=${TMPDIR:-/tmp}/staging_test_$$
mkdir -p "$TMP"

fingerprint() {
  pg_dump -h "${PGHOST:-localhost}" -p "${PGPORT:-5432}" -U "${PGUSER:-postgres}" -d "$DB" -n public --no-owner \
    | grep -v '^\\\(un\)\?restrict' | md5sum | cut -d' ' -f1
}

$P -c "DROP DATABASE IF EXISTS $DB" 2>/dev/null
$P -c "CREATE DATABASE $DB" || exit 1
$P -d "$DB" -v ON_ERROR_STOP=1 -f "$HERE/test_stubs.sql" >/dev/null || { echo "stubs failed"; exit 1; }
$P -d "$DB" -v ON_ERROR_STOP=1 -f "$DUMP" >"$TMP/dump.log" 2>&1 || { echo "prod dump load failed"; grep ERROR "$TMP/dump.log"; exit 1; }
$P -d "$DB" -v ON_ERROR_STOP=1 -1 -f "$HERE/../migrations/20261120000000_security_hotfix.sql" >/dev/null 2>&1 || { echo "hotfix on public failed"; exit 1; }
echo "ok   production public schema loaded (+ hotfix, as on prod)"

before=$(fingerprint)
$P -d "$DB" -v ON_ERROR_STOP=1 -f "$HERE/staging_schema.sql" >"$TMP/staging.log" 2>&1 || { echo "FAIL staging_schema.sql"; grep -v NOTICE "$TMP/staging.log"; exit 1; }
grep WARNING "$TMP/staging.log" | sed 's/^.*WARNING:/  WARNING:/'
after=$(fingerprint)
[ "$before" = "$after" ] && echo "ok   staging_schema.sql applied; public schema unchanged ($after)" \
  || { echo "FAIL public schema changed by staging_schema.sql"; exit 1; }
$P -d "$DB" -v ON_ERROR_STOP=1 -1 -f "$HERE/staging_schema.sql" >/dev/null 2>&1 \
  && { echo "FAIL staging_schema.sql ran twice (it should refuse: schema exists)"; exit 1; } \
  || echo "ok   second run refused (schema already exists)"

# Local-only stand-in for staging_seed.sql: enrol every new auth user.
$P -d "$DB" -v ON_ERROR_STOP=1 -f "$HERE/test_enrol.sql" >/dev/null || { echo "enrol failed"; exit 1; }

sed -e 's/\bpublic\./staging./g' -e 's/\bapp_private\b/staging_private/g' \
  "$HERE/../tests/10_reporting_blocking_scenarios.sql" > "$TMP/scenarios.sql"
out=$(PGOPTIONS='-c search_path=staging' $P -d "$DB" -t -f "$TMP/scenarios.sql" 2>&1); code=$?
echo "$out" | grep -o 'FAIL.*' | sed 's/^/  /'
echo "scenarios on staging: exit=$code pass=$(echo "$out" | grep -c 'PASS:') fail=$(echo "$out" | grep -c 'FAIL')"

# The scenarios only touch staging, so public must still be identical.
[ "$(fingerprint)" = "$before" ] && echo "ok   public schema and data unchanged after the staging scenarios"   || { echo "FAIL public changed during staging scenarios"; code=1; }

# Isolation checks (these deliberately add a production-side member/post).
out2=$($P -d "$DB" -t -f "$HERE/test_isolation.sql" 2>&1); code2=$?
echo "$out2" | grep -o 'PASS: .*\|FAIL.*\|ERROR.*' | sed 's/^/  /'

rm -rf "$TMP"
[ $code -eq 0 ] && [ $code2 -eq 0 ]
