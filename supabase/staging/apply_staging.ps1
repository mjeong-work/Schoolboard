# Apply the staging schema (S2) or the staging seed (S4) to the Supabase
# project, with production safety checks around each step.
#
#   powershell -ExecutionPolicy Bypass -File supabase\staging\apply_staging.ps1 -Step schema
#   powershell -ExecutionPolicy Bypass -File supabase\staging\apply_staging.ps1 -Step seed -Emails a@x.com,b@x.com,admin@x.com
#
# The DB password is read without echo, kept only in this process, and
# never written to disk. Before and after each step the script records a
# fingerprint of the production public schema (tables, policies,
# functions, grants) and the row count of every public table. If either
# changes, it stops and says so.

param(
  [Parameter(Mandatory)] [ValidateSet('schema', 'seed')] [string] $Step,
  [string[]] $Emails,
  # Rehearsal against the local test Postgres (localhost:54329, db from -LocalDb); no password prompt.
  [switch] $LocalTest,
  [string] $LocalDb = 'staging_apply_rehearsal'
)
$ErrorActionPreference = 'Stop'
$bin  = "$env:USERPROFILE\scoop\apps\postgresql17\current\bin"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$tmp  = Join-Path $env:TEMP "staging_apply_$PID"
New-Item -ItemType Directory -Force $tmp | Out-Null

$env:PGCLIENTENCODING = 'UTF8'
$env:PGOPTIONS = '-c client_min_messages=warning'
# -File passes "a,b,c" as one string
$Emails = @($Emails | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })
if ($LocalTest) {
  $env:PGHOST = 'localhost'; $env:PGPORT = '54329'; $env:PGUSER = 'postgres'; $env:PGDATABASE = $LocalDb
} else {
  $env:PGHOST = 'aws-0-us-west-2.pooler.supabase.com'; $env:PGPORT = '5432'
  $env:PGUSER = 'postgres.blqryjhjwtygafjwxbup'; $env:PGDATABASE = 'postgres'; $env:PGSSLMODE = 'require'
}

function Psql([string[]] $a) { & "$bin\psql.exe" -X -q -v ON_ERROR_STOP=1 @a; if ($LASTEXITCODE -ne 0) { throw "psql failed" } }
function Scalar([string] $sql) { (& "$bin\psql.exe" -X -q -t -A -c $sql).Trim() }

function Fingerprint {
  $f = Join-Path $tmp 'public.sql'
  & "$bin\pg_dump.exe" --schema-only --no-owner -n public -f $f
  if ($LASTEXITCODE -ne 0) { throw 'pg_dump failed' }
  $clean = Get-Content $f | Where-Object { $_ -notmatch '^\\(un)?restrict ' }
  $hash = [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash(
            [Text.Encoding]::UTF8.GetBytes(($clean -join "`n")))).Replace('-', '').Substring(0, 16)
  $counts = Scalar @"
select string_agg(t || '=' || n, ' ' order by t) from (
  select c.relname t, (xpath('/row/n/text()', query_to_xml(format('select count(*) n from public.%I', c.relname), false, true, '')))[1]::text n
  from pg_class c join pg_namespace s on s.oid = c.relnamespace
  where s.nspname = 'public' and c.relkind = 'r') x
"@
  [pscustomobject]@{ Schema = $hash; Rows = $counts }
}

if (-not $LocalTest) {
  $secure = Read-Host 'Supabase DB password (Project Settings > Database)' -AsSecureString
  $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
}

try {
  Write-Host "Connected to: $(Scalar 'select current_database() || '' as '' || current_user')"
  Write-Host 'Fingerprinting production public schema...'
  $before = Fingerprint
  Write-Host "  schema $($before.Schema)"

  if ($Step -eq 'schema') {
    if ((Scalar "select count(*) from pg_namespace where nspname in ('staging','staging_private')") -ne '0') {
      throw 'staging schema already exists - nothing applied. (Run staging_teardown.sql first to rebuild it.)'
    }
    Write-Host 'Applying staging_schema.sql (one transaction)...'
    Psql @('-f', (Join-Path $here 'staging_schema.sql'))
  }
  else {
    if ($Emails.Count -ne 3) { throw 'pass exactly 3 emails: -Emails userA,userB,admin' }
    $seed = (Get-Content (Join-Path $here 'staging_seed.sql') -Raw).
      Replace('REPLACE-user-a@example.com', $Emails[0]).
      Replace('REPLACE-user-b@example.com', $Emails[1]).
      Replace('REPLACE-admin@example.com',  $Emails[2])
    $seedFile = Join-Path $tmp 'seed.sql'
    [IO.File]::WriteAllText($seedFile, $seed)
    Write-Host 'Applying staging_seed.sql...'
    Psql @('-f', $seedFile)
  }

  Write-Host 'Re-checking production public schema...'
  $after = Fingerprint
  if ($after.Schema -ne $before.Schema -or $after.Rows -ne $before.Rows) {
    Write-Host 'STOP: the production public schema or row counts changed during this step.' -ForegroundColor Red
    Write-Host "  before: $($before.Schema) $($before.Rows)"
    Write-Host "  after:  $($after.Schema) $($after.Rows)"
    exit 2
  }
  Write-Host "OK  production public schema unchanged ($($after.Schema)), row counts unchanged" -ForegroundColor Green

  Write-Host 'Staging summary:'
  Psql @('-c', @"
select (select count(*) from pg_tables where schemaname = 'staging') as staging_tables,
       (select count(*) from pg_policies where schemaname = 'staging') as staging_policies,
       (select count(*) from pg_policies where schemaname = 'staging' and policyname = 'Staging: test accounts only') as gated_tables,
       (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('staging','staging_private')) as staging_functions,
       (select count(*) from staging.profiles) as testers,
       (select count(*) from staging.posts) as staging_posts
"@)
}
finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
