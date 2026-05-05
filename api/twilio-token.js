// api/twilio-token.js
// Generiert sicheren Twilio Access Token für Browser-Dialer

const twilio = require('twilio');

const ACCOUNT_SID  = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN   = process.env.TWILIO_AUTH_TOKEN;
const TWIML_APP_SID = process.env.TWILIO_TWIML_APP_SID || 'AP069e13e5a94fb4998e2860a1d1ba7420';
const FROM_NUMBER  = process.env.TWILIO_FROM_NUMBER;

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const agentId = req.query.agent_id || 'agent';

    if (!ACCOUNT_SID || !AUTH_TOKEN) {
      return res.status(500).json({ error: 'Twilio credentials fehlen' });
    }

    // Access Token für Twilio Voice SDK
    const AccessToken = twilio.jwt.AccessToken;
    const VoiceGrant  = AccessToken.VoiceGrant;

    const token = new AccessToken(ACCOUNT_SID, AUTH_TOKEN, AUTH_TOKEN, {
      identity: agentId,
      ttl: 3600
    });

    if (TWIML_APP_SID) {
      const voiceGrant = new VoiceGrant({
        outgoingApplicationSid: TWIML_APP_SID,
        incomingAllow: false
      });
      token.addGrant(voiceGrant);
    }

    res.json({
      token: token.toJwt(),
      identity: agentId,
      from: FROM_NUMBER
    });

  } catch (err) {
    console.error('Token Fehler:', err);
    res.status(500).json({ error: err.message });
  }
};
