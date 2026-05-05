// api/sheets-sync.js
// Synchronisiert Google Sheets mit CallSuite
// Wird von Vercel Cron alle 2 Stunden aufgerufen
// Kann auch manuell per GET mit ?token=ADMIN_TOKEN getriggert werden

const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Auth check
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  if (token !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Alle aktiven Sheets-Sync-Configs laden
    const { data: syncs, error } = await sb
      .from('cs_sheets_sync')
      .select('*')
      .eq('aktiv', true);

    if (error) throw error;
    if (!syncs?.length) return res.json({ message: 'Keine aktiven Syncs', synced: 0 });

    let totalImported = 0;

    for (const sync of syncs) {
      try {
        console.log(`Sync: ${sync.name} → ${sync.sheet_url}`);

        // CSV von Google Sheets laden
        let url = sync.sheet_url;
        if (url.includes('/edit') || url.includes('/pub')) {
          url = url.split('?')[0].replace('/edit', '') + '/export?format=csv&gid=' + (sync.gid || '0');
        }

        const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const csv = await response.text();
        const rows = parseCSV(csv);
        if (!rows.length) continue;

        // Mapping
        const headers = rows[0];
        const contacts = rows.slice(1).map(row => {
          const obj = {};
          headers.forEach((h, i) => { obj[h.trim()] = (row[i] || '').trim(); });

          const name = obj['Name'] || obj['Vorname'] && obj['Nachname'] ?
            `${obj['Vorname']} ${obj['Nachname']}`.trim() : obj[headers[0]] || '–';

          const nr = obj['Telefon'] || obj['Handy'] || obj['Phone'] || obj['Tel'] || '';

          return {
            name: name || '–',
            nr,
            email: obj['E-Mail'] || obj['Email'] || obj['email'] || '',
            adresse: obj['Adresse'] || obj['Straße'] || '',
            anlass: obj['Anlass'] || obj['Interesse'] || obj['Betreff'] || sync.name || '',
            quelle: sync.quelle || sync.name || 'Google Sheets',
            darlehen: obj['Darlehen'] || obj['Darlehenswunsch'] || '',
            kaufpreis: obj['Kaufpreis'] || '',
            erlaeuterung: obj['Notiz'] || obj['Kommentar'] || obj['Beschreibung'] || '',
            status: 'offen',
            liste_id: sync.liste_id,
            berater_id: sync.berater_id,
            zugewiesen_am: new Date().toLocaleDateString('de-DE'),
            letzter_kontakt: '',
            locked_by: null,
            locked_at: null
          };
        }).filter(c => c.name && c.name !== '–');

        if (!contacts.length) continue;

        // Duplikat-Check
        const nummern = contacts.map(c => c.nr).filter(Boolean);
        let existingNrs = [];
        if (nummern.length) {
          const { data: existing } = await sb
            .from('cs_kontakte')
            .select('nr')
            .eq('liste_id', sync.liste_id)
            .in('nr', nummern);
          existingNrs = (existing || []).map(e => e.nr);
        }

        const neu = contacts.filter(c => !c.nr || !existingNrs.includes(c.nr));
        if (!neu.length) {
          console.log(`${sync.name}: Keine neuen Kontakte`);
          continue;
        }

        // Insert in Batches
        for (let i = 0; i < neu.length; i += 200) {
          await sb.from('cs_kontakte').insert(neu.slice(i, i + 200));
        }

        totalImported += neu.length;

        // Sync-Status updaten
        await sb.from('cs_sheets_sync').update({
          letzter_sync: new Date().toISOString(),
          letzte_anzahl: neu.length,
          fehler: null
        }).eq('id', sync.id);

        // Log
        await sb.from('cs_log').insert({
          typ: 'import',
          farbe: 'g',
          text: `Sheets-Sync "${sync.name}": ${neu.length} neue Kontakte`,
          berater_name: sync.berater_name || ''
        });

        console.log(`${sync.name}: ${neu.length} neue Kontakte importiert`);

      } catch (syncErr) {
        console.error(`Sync Fehler für ${sync.name}:`, syncErr.message);
        await sb.from('cs_sheets_sync').update({
          fehler: syncErr.message,
          letzter_sync: new Date().toISOString()
        }).eq('id', sync.id);
      }
    }

    res.json({ success: true, synced: syncs.length, imported: totalImported });

  } catch (err) {
    console.error('Sheets-Sync Fehler:', err);
    res.status(500).json({ error: err.message });
  }
};

function parseCSV(text) {
  const rows = [];
  const lines = text.split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = [];
    let cur = '', inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { cols.push(cur); cur = ''; }
      else { cur += ch; }
    }
    cols.push(cur);
    rows.push(cols);
  }
  return rows;
}
