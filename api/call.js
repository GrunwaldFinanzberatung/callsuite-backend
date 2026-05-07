// api/call.js - Click-to-Call via Twilio REST API (kein SDK)

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });

  const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
  const AUTH_TOKEN  = process.env.TWILIO_AUTH_TOKEN;
  const FROM_NUMBER = process.env.TWILIO_FROM_NUMBER;

  console.log('SID:', ACCOUNT_SID ? ACCOUNT_SID.substring(0,8)+'...' : 'FEHLT');
  console.log('TOKEN:', AUTH_TOKEN ? AUTH_TOKEN.substring(0,8)+'...' : 'FEHLT');
  console.log('FROM:', FROM_NUMBER);

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

  console.log('Agent:', agentNr, 'Kunde:', kundenNr);

  const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say language="de-DE">Verbindung wird hergestellt zu ${kontakt_name || 'Kontakt'}.</Say><Dial callerId="${FROM_NUMBER}" timeout="30"><Number>${kundenNr}</Number></Dial></Response>`;

  const params = new URLSearchParams({
    To: agentNr,
    From: FROM_NUMBER,
    Twiml: twiml
  });

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Calls.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
      }
    );

    const data = await response.json();
    console.log('Twilio:', response.status, JSON.stringify(data).substring(0,200));

    if (response.ok) {
      res.json({ success: true, call_sid: data.sid, status: data.status });
    } else {
      res.status(500).json({ error: data.message, code: data.code });
    }
  } catch (err) {
    console.error('Fehler:', err.message);
    res.status(500).json({ error: err.message });
  }
};
