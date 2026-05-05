# CallSuite Backend – Setup Anleitung

## 1. Supabase SQL ausführen

Im Supabase SQL Editor folgendes ausführen:

```sql
-- Webhooks pro Partner
create table if not exists cs_webhooks (
  id uuid default gen_random_uuid() primary key,
  token text unique not null,
  partner_name text not null,
  liste_id uuid references cs_listen(id) on delete cascade,
  liste_name text,
  berater_id uuid references cs_berater(id) on delete cascade,
  berater_name text,
  quelle text,
  aktiv boolean default true,
  empfangen_count integer default 0,
  letzter_empfang timestamptz,
  created_at timestamptz default now()
);
alter table cs_webhooks disable row level security;

-- Google Sheets Auto-Sync
create table if not exists cs_sheets_sync (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  sheet_url text not null,
  gid text default '0',
  liste_id uuid references cs_listen(id) on delete cascade,
  berater_id uuid references cs_berater(id) on delete cascade,
  berater_name text,
  quelle text,
  aktiv boolean default true,
  letzter_sync timestamptz,
  letzte_anzahl integer default 0,
  fehler text,
  created_at timestamptz default now()
);
alter table cs_sheets_sync disable row level security;

-- Arbeitszeit-Tracking
create table if not exists cs_arbeitszeit (
  id uuid default gen_random_uuid() primary key,
  agent_id text,
  agent_name text,
  session_start timestamptz,
  session_end timestamptz,
  aktive_sekunden integer default 0,
  anrufe_gesamt integer default 0,
  anrufe_erreicht integer default 0,
  termine_gesetzt integer default 0,
  created_at timestamptz default now()
);
alter table cs_arbeitszeit disable row level security;
```

## 2. GitHub Repository erstellen

1. github.com → New repository → Name: `callsuite-backend`
2. Alle Dateien hochladen
3. Repository public oder private (egal)

## 3. Vercel deployen

1. vercel.com → New Project → callsuite-backend importieren
2. Environment Variables setzen:

| Variable | Wert |
|---|---|
| TWILIO_ACCOUNT_SID | AC0655ee0fb7fe4faaf04b4504d240f78c |
| TWILIO_AUTH_TOKEN | da93b5897bfeac18a6d8f80daae80cf1 |
| TWILIO_FROM_NUMBER | +4944885949019 |
| SUPABASE_URL | https://yxspethowleasvqeqnvc.supabase.co |
| SUPABASE_SERVICE_KEY | [Service Role Key aus Supabase Settings → API] |
| ADMIN_SECRET | [Beliebiges sicheres Passwort für Sync-Trigger] |

3. Deploy klicken
4. Du bekommst eine URL: z.B. `https://callsuite-backend-xxx.vercel.app`

## 4. Backend-URL in CallSuite eintragen

In CallSuite Admin → System → Backend-URL eintragen.

## 5. Webhooks anlegen

In Supabase direkt oder über CallSuite Admin:

```sql
insert into cs_webhooks (token, partner_name, liste_id, liste_name, berater_id, berater_name)
values (
  gen_random_uuid()::text,
  'Makler Müller – Birkenweg 5',
  'LISTE_ID_HIER',
  'Birkenweg 5 Interessenten',
  'BERATER_ID_HIER',
  'Nico Grunwald'
);
```

Webhook-URL für Partner:
`https://callsuite-backend-xxx.vercel.app/api/webhook?token=DER_GENERIERTE_TOKEN`

Kontaktformular-URL:
`https://callsuite-backend-xxx.vercel.app/formular?token=DER_GENERIERTE_TOKEN`

## 6. Google Sheets Sync anlegen

```sql
insert into cs_sheets_sync (name, sheet_url, liste_id, berater_id, berater_name, quelle)
values (
  'Makler Schmidt – Immoscout Leads',
  'https://docs.google.com/spreadsheets/d/XXXX/pub?output=csv',
  'LISTE_ID_HIER',
  'BERATER_ID_HIER',
  'Nico Grunwald',
  'Immoscout'
);
```

Sync manuell triggern:
`GET https://callsuite-backend-xxx.vercel.app/api/sheets-sync?token=ADMIN_SECRET`

Automatisch läuft Sync alle 2 Stunden.
