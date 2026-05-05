// api/call-status.js
// Twilio ruft diese URL auf wenn sich der Anruf-Status ändert
// Aktualisiert Supabase mit Anruf-Dauer und Status

const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const {
    CallSid, CallStatus, Duration,
    To, From, Direction
  } = req.body || req.query;

  console.log(`Call Status: ${CallSid} → ${CallStatus} (${Duration}s)`);

  try {
    if (CallStatus === 'completed' && Duration) {
      // Anruf beendet – Dauer in Log speichern
      await sb.from('cs_log').insert({
        typ: 'anruf_beendet',
        farbe: 'b',
        text: `Anruf beendet: ${Duration}s Gesprächsdauer → ${To}`,
        status_after: CallStatus
      });

      // Arbeitszeit-Tracking updaten
      await sb.from('cs_arbeitszeit').insert({
        call_sid: CallSid,
        dauer_sekunden: parseInt(Duration) || 0,
        telefon: To,
        status: CallStatus,
        created_at: new Date().toISOString()
      }).catch(() => {}); // Tabelle optional
    }
  } catch (err) {
    console.error('Status-Update Fehler:', err);
  }

  res.status(200).send('<Response></Response>');
};
