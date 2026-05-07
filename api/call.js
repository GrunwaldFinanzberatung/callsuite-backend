// api/call.js - Click-to-Call + Cancel

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
  const AUTH_TOKEN  = process.env.TWILIO_AUTH_TOKEN;
  const FROM_NUMBER = process.env.TWILIO_FROM_NUMBER;
  const authHeader  = 'Basic ' + Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64');

  // DELETE /api/call?sid=CAXXX → Anruf beenden
  if (req.method === 'DELETE' || (req.method === 'POST' && req.body?.action === 'cancel')) {
    const callSid = req.query.sid || req.body?.call_sid;
    if (!callSid) return res.status(400).json({ error: 'call_sid fehlt' });
    try {
      const r = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Calls/${callSid}.json`,
        {
          method: 'POST',
          headers: { 'Authorization': authHeader, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'Status=completed'
        }
      );
      const d = await r.json();
      return res.json({ success: r.ok, status: d.status });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });

  const { to, agent_telefon, kontakt_name } = req.body;

  const cleanNr = (nr) => {
    if (!nr) return null;
    let n = String(nr).replace(/[\s\-\(\)]/g, '');
    if (n.startsWith('0')) n = '+49' + n.substring(1);
    if (!n.startsWith('+')) n = '+49' + n;
    return n;
  };

  const agentNr  = cleanNr(agent_telefon);
  const kundenNr = cleanNr(to);

  console.log('Click-to-Call:', agentNr, '→', kundenNr);

  const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say language="de-DE">Verbindung wird hergestellt zu ${kontakt_name || 'Kontakt'}.</Say><Dial callerId="${FROM_NUMBER}" timeout="30"><Number>${kundenNr}</Number></Dial></Response>`;

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Calls.json`,
      {
        method: 'POST',
        headers: { 'Authorization': authHeader, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ To: agentNr, From: FROM_NUMBER, Twiml: twiml }).toString()
      }
    );
    const data = await response.json();
    console.log('Twilio:', response.status, data.sid);
    if (response.ok) {
      res.json({ success: true, call_sid: data.sid, status: data.status });
    } else {
      res.status(500).json({ error: data.message, code: data.code });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
