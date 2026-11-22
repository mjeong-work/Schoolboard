# Production rollout of reporting / blocking / admin dashboard
# (supabase/rollout/rollout_reporting.sql), with safety checks.
#
#   powershell -ExecutionPolicy Bypass -File supabase\rollout\apply_rollout.ps1
#
# Before and after, it records:
#   - row counts of every existing production public table (must be equal:
#     the rollout adds tables and columns but must not add or remove rows)
#   - a fingerprint of the staging schemas, schema and rows (must be equal)
# The SQL itself runs in one transaction and rolls back on any error.
# The DB password is read without echo and never written to disk.

param(
  [switch] $LocalTest,
  [string] $LocalDb = 'rollout_rehearsal'
)
$ErrorActionPreference = 'Stop'
$bin  = "$env:USERPROFILE\scoop\apps\postgresql17\current\bin"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$tmp  = Join-Path $env:TEMP "rollout_$PID"
New-Item -ItemType Directory -Force $tmp | Out-Null

$env:PGCLIENTENCODING = 'UTF8'
$env:PGOPTIONS = '-c client_min_messages=warning'
if ($LocalTest) {
  $env:PGHOST = 'localhost'; $env:PGPORT = '54329'; $env:PGUSER = 'postgres'; $env:PGDATABASE = $LocalDb
} else {
  $env:PGHOST = 'aws-0-us-west-2.pooler.supabase.com'; $env:PGPORT = '5432'
  $env:PGUSER = 'postgres.blqryjhjwtygafjwxbup'; $env:PGDATABASE = 'postgres'; $env:PGSSLMODE = 'require'
}

function Scalar([string] $sql) { (& "$bin\psql.exe" -X -q -t -A -c $sql).Trim() }

function RowCounts([string] $schemas) {
  Scalar @"
select coalesce(string_agg(s.nspname || '.' || c.relname || '=' ||
  (xpath('/row/n/text()', query_to_xml(format('select count(*) n from %I.%I', s.nspname, c.relname), false, true, '')))[1]::text,
  ' ' order by s.nspname, c.relname), '')
from pg_class c join pg_namespace s on s.oid = c.relnamespace
where s.nspname in ($schemas) and c.relkind = 'r'
"@
}

function StagingFingerprint {
  $f = Join-Path $tmp 'staging.sql'
  & "$bin\pg_dump.exe" --schema-only --no-owner -n staging -n staging_private -f $f
  if ($LASTEXITCODE -ne 0) { throw 'pg_dump failed' }
  $clean = (Get-Content $f | Where-Object { $_ -notmatch '^\\(un)?restrict ' }) -join "`n"
  $hash = [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash(
            [Text.Encoding]::UTF8.GetBytes($clean))).Replace('-', '').Substring(0, 16)
  "$hash $(RowCounts "'staging'")"
}

if (-not $LocalTest) {
  $secure = Read-Host 'Supabase DB password (Project Settings > Database)' -AsSecureString
  $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
}

try {
  Write-Host "Connected to: $(Scalar 'select current_database() || '' as '' || current_user')"
  $rowsBefore    = RowCounts "'public'"
  $stagingBefore = StagingFingerprint
  Write-Host "Recorded row counts of $(($rowsBefore -split ' ').Count) public tables and the staging fingerprint."

  Write-Host 'Applying rollout (one transaction)...'
  & "$bin\psql.exe" -X -q -v ON_ERROR_STOP=1 -f (Join-Path $here 'rollout_reporting.sql')
  if ($LASTEXITCODE -ne 0) {
    Write-Host 'Rollout failed and was rolled back. Nothing was changed.' -ForegroundColor Red
    exit 1
  }

  $rowsAfter    = RowCounts "'public'"
  $stagingAfter = StagingFingerprint
  $before = @{}; foreach ($kv in $rowsBefore -split ' ') { $k, $v = $kv -split '='; $before[$k] = $v }
  $after  = @{}; foreach ($kv in $rowsAfter  -split ' ') { $k, $v = $kv -split '='; $after[$k]  = $v }
  $changed = @($before.Keys | Where-Object { $after[$_] -ne $before[$_] })
  $added   = @($after.Keys  | Where-Object { -not $before.ContainsKey($_) } | Sort-Object)

  if ($changed.Count -gt 0) {
    Write-Host "STOP: row counts changed in existing tables: $($changed -join ', ')" -ForegroundColor Red
    exit 2
  }
  if ($stagingAfter -ne $stagingBefore) {
    Write-Host 'STOP: the staging schema changed during the production rollout.' -ForegroundColor Red
    exit 2
  }
  Write-Host "OK  existing production rows unchanged ($($before.Count) tables)" -ForegroundColor Green
  Write-Host "OK  staging unchanged" -ForegroundColor Green
  Write-Host "New tables: $($added -join ', ')"
  & "$bin\psql.exe" -X -q -c "select version, name from supabase_migrations.schema_migrations where version >= '20260829000000' order by version"
}
finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
