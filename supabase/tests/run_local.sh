#!/bin/sh
# Applies every migration, in order, to a throwaway local Postgres database
# and runs the reporting/blocking RLS scenarios against it.
#
# NOT Supabase: 00_local_bootstrap.sql stubs auth.uid(), the anon /
# authenticated roles, storage tables and the tables that were created
# outside the migrations folder. Never point this at a real project.
#
# usage: PGPORT=54329 sh supabase/tests/run_local.sh [dbname]
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
DIR="$HERE/../migrations"
DB=${1:-schoolboard_rls_test}
P="psql -h ${PGHOST:-localhost} -p ${PGPORT:-5432} -U ${PGUSER:-postgres} -q"

$P -c "DROP DATABASE IF EXISTS $DB" 2>/dev/null
$P -c "CREATE DATABASE $DB" || exit 1
$P -d "$DB" -v ON_ERROR_STOP=1 -f "$HERE/00_local_bootstrap.sql" >/dev/null 2>&1 || { echo "bootstrap failed"; exit 1; }
for f in "$DIR"/*.sql; do
  b=$(basename "$f")
  out=$($P -d "$DB" -v ON_ERROR_STOP=1 -1 -f "$f" 2>&1) || { echo "FAIL $b"; echo "$out" | grep -v NOTICE; exit 1; }
  echo "$out" | grep WARNING | sed "s|^.*WARNING:|  WARNING ($b):|"
  echo "ok   $b"
done

out=$($P -d "$DB" -t -f "$HERE/10_reporting_blocking_scenarios.sql" 2>&1); code=$?
echo "$out" | grep -o 'PASS: .*\|FAIL: .*' | sed 's/^/  /'
echo "scenarios: exit=$code pass=$(echo "$out" | grep -c 'PASS:') fail=$(echo "$out" | grep -c 'FAIL')"
exit $code
