// api/call.js
// Startet ausgehenden Anruf über Twilio REST API (Click-to-Call)

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

  const { to, agent_id, kontakt_id, kontakt_name } = req.body;

  if (!to) return res.status(400).json({ error: 'Telefonnummer fehlt' });

  // Nummer bereinigen
  let number = to.replace(/[\s\-\(\)]/g, '');
  if (number.startsWith('0')) number = '+49' + number.substring(1);
  if (!number.startsWith('+')) number = '+49' + number;

  try {
    const client = twilio(ACCOUNT_SID, AUTH_TOKEN);

    const call = await client.calls.create({
      to: number,
      from: FROM_NUMBER,
      twiml: `<Response>
        <Say language="de-DE">Verbindung wird hergestellt für ${kontakt_name || 'Kontakt'}.</Say>
        <Dial callerId="${FROM_NUMBER}" record="record-from-answer" recordingStatusCallback="/api/recording">
          <Number>${number}</Number>
        </Dial>
      </Response>`,
      statusCallback: `${process.env.VERCEL_URL ? 'https://'+process.env.VERCEL_URL : ''}/api/call-status`,
      statusCallbackMethod: 'POST',
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed']
    });

    console.log(`Anruf gestartet: ${call.sid} → ${number} (Agent: ${agent_id})`);

    res.json({
      success: true,
      call_sid: call.sid,
      to: number,
      status: call.status
    });

  } catch (err) {
    console.error('Call Fehler:', err);
    res.status(500).json({ error: err.message, code: err.code });
  }
};
