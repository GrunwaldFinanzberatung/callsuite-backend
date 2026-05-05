// api/webhook.js
// Empfängt neue Kontakte von Kooperationspartnern
// URL: /api/webhook/[TOKEN]
// Jeder Partner hat seinen eigenen Token → landet in der richtigen Liste

const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Webhook-Token');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Token aus URL oder Header
  const token = req.query.token || req.headers['x-webhook-token'];
  if (!token) return res.status(401).json({ error: 'Token fehlt' });

  // Webhook-Config aus Supabase laden
  const { data: wh, error: whErr } = await sb
    .from('cs_webhooks')
    .select('*')
    .eq('token', token)
    .eq('aktiv', true)
    .single();

  if (whErr || !wh) {
    return res.status(404).json({ error: 'Webhook nicht gefunden oder inaktiv' });
  }

  if (req.method === 'GET') {
    // Test-Ping
    return res.json({
      status: 'aktiv',
      partner: wh.partner_name,
      liste: wh.liste_name,
      empfangen: wh.empfangen_count || 0
    });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });

  const body = req.body;
  if (!body) return res.status(400).json({ error: 'Body fehlt' });

  try {
    // Flexibles Mapping – funktioniert mit vielen Formaten
    const mapContact = (data) => {
      // Unterstützt flaches JSON, Immoscout-Format, onOffice-Format, etc.
      const name = data.name || data.Name ||
        [data.vorname || data.firstName || data.Vorname,
         data.nachname || data.lastName || data.Nachname].filter(Boolean).join(' ') ||
        data.kontakt || '–';

      const nr = data.telefon || data.phone || data.Telefon || data.Phone ||
        data.mobile || data.handy || data.Handy || data.tel || '';

      const email = data.email || data.Email || data.mail || '';
      const adresse = data.adresse || data.address || data.Adresse ||
        [data.strasse || data.street, data.ort || data.city].filter(Boolean).join(', ') || '';

      return {
        name: String(name).trim() || '–',
        nr: String(nr).trim(),
        email: String(email).trim(),
        adresse: String(adresse).trim(),
        anlass: data.anlass || data.betreff || data.subject || data.interesse || wh.liste_name || '',
        quelle: wh.partner_name || 'Webhook',
        pb_status: 'Neu via Webhook',
        erlaeuterung: data.nachricht || data.message || data.notiz || data.kommentar || '',
        darlehen: data.darlehen || data.finanzierung || data.darlehenswunsch || '',
        kaufpreis: data.kaufpreis || data.preis || data.price || '',
        status: 'offen',
        liste_id: wh.liste_id,
        berater_id: wh.berater_id,
        zugewiesen_am: new Date().toLocaleDateString('de-DE'),
        letzter_kontakt: '',
        locked_by: null,
        locked_at: null
      };
    };

    // Einzelner Kontakt oder Array
    const contacts = Array.isArray(body) ? body : [body];
    const mapped = contacts.map(mapContact).filter(c => c.name !== '–');

    if (!mapped.length) {
      return res.status(400).json({ error: 'Keine gültigen Kontakte gefunden' });
    }

    // Duplikat-Check per Telefonnummer
    const nummern = mapped.map(c => c.nr).filter(Boolean);
    let existingNrs = [];
    if (nummern.length) {
      const { data: existing } = await sb
        .from('cs_kontakte')
        .select('nr')
        .eq('liste_id', wh.liste_id)
        .in('nr', nummern);
      existingNrs = (existing || []).map(e => e.nr);
    }

    const neu = mapped.filter(c => !c.nr || !existingNrs.includes(c.nr));

    if (!neu.length) {
      return res.json({ success: true, imported: 0, skipped: mapped.length, message: 'Alle Kontakte bereits vorhanden' });
    }

    // Einfügen
    const { error: insertErr } = await sb.from('cs_kontakte').insert(neu);
    if (insertErr) throw insertErr;

    // Webhook-Counter updaten
    await sb.from('cs_webhooks').update({
      empfangen_count: (wh.empfangen_count || 0) + neu.length,
      letzter_empfang: new Date().toISOString()
    }).eq('id', wh.id);

    // Log
    await sb.from('cs_log').insert({
      typ: 'import',
      farbe: 'g',
      text: `Webhook "${wh.partner_name}": ${neu.length} neue Kontakte für Liste "${wh.liste_name}"`,
      berater_name: wh.berater_name || ''
    });

    console.log(`Webhook ${token}: ${neu.length} Kontakte importiert (${mapped.length - neu.length} Duplikate)`);

    res.json({
      success: true,
      imported: neu.length,
      skipped: mapped.length - neu.length,
      message: `${neu.length} Kontakte importiert`
    });

  } catch (err) {
    console.error('Webhook Fehler:', err);
    res.status(500).json({ error: err.message });
  }
};
