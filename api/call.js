// api/call.js
// Click-to-Call: Ruft erst den Agent an, dann verbindet mit Kunden

const twilio = require('twilio');

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN  = process.env.TWILIO_AUTH_TOKEN;
const FROM_NUMBER = process.env.TWILIO_FROM_NUMBER;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });

  const { to, agent_telefon, agent_id, kontakt_id, kontakt_name } = req.body;

  if (!to) return res.status(400).json({ error: 'Kundennummer fehlt' });
  if (!agent_telefon) return res.status(400).json({ error: 'Agent-Nummer fehlt – bitte im Admin hinterlegen' });

  // Nummern bereinigen
  const cleanNr = (nr) => {
    let n = String(nr).replace(/[\s\-\(\)]/g, '');
    if (n.startsWith('0')) n = '+49' + n.substring(1);
    if (!n.startsWith('+')) n = '+49' + n;
    return n;
  };

  const kundenNr = cleanNr(to);
  const agentNr  = cleanNr(agent_telefon);

  try {
    const client = twilio(ACCOUNT_SID, AUTH_TOKEN);

    // Schritt 1: Agent anrufen
    // Wenn Agent abhebt → TwiML verbindet ihn mit Kunden
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="de-DE" voice="Polly.Marlene">Verbindung wird hergestellt zu ${kontakt_name || 'Kontakt'}.</Say>
  <Dial callerId="${FROM_NUMBER}" timeout="30" record="record-from-answer">
    <Number>${kundenNr}</Number>
  </Dial>
</Response>`;

    const call = await client.calls.create({
      to: agentNr,
      from: FROM_NUMBER,
      twiml,
      statusCallback: `${process.env.VERCEL_URL ? 'https://'+process.env.VERCEL_URL : 'https://callsuite-backend.vercel.app'}/api/call-status`,
      statusCallbackMethod: 'POST',
      statusCallbackEvent: ['answered', 'completed']
    });

    console.log(`Click-to-Call: ${agentNr} → ${kundenNr} (${call.sid})`);

    res.json({
      success: true,
      call_sid: call.sid,
      agent: agentNr,
      kunde: kundenNr,
      status: call.status
    });

  } catch (err) {
    console.error('Call Fehler:', err);
    res.status(500).json({ error: err.message, code: err.code });
  }
};
