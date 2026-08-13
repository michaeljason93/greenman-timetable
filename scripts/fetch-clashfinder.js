// scripts/fetch-clashfinder.js
const fs = require('fs');
const path = require('path');

// 1. Read secrets / environment variables directly
const username = process.env.CLASHFINDER_USERNAME;
const publicKey = process.env.CLASHFINDER_PUBLIC_KEY;
const eventId = 'gm2026'; // Your Clashfinder event ID

if (!username || !publicKey) {
  console.error('Error: Missing CLASHFINDER_USERNAME or CLASHFINDER_PUBLIC_KEY environment variables.');
  process.exit(1);
}

// 2. Build API URL using the directly passed public key
const API_URL = `https://clashfinder.com/data/event/${eventId}.json?authUsername=${encodeURIComponent(username.trim())}&authPublicKey=${publicKey.trim()}`;

async function updateSchedule() {
  try {
    console.log(`Fetching schedule for event: ${eventId}...`);

    // Must include User-Agent header so Cloudflare/Clashfinder doesn't block GitHub Actions
    const response = await fetch(API_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    // Handle non-JSON / HTML error responses cleanly
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const responseText = await response.text();
      console.error('API Error Response (HTML returned):', responseText.slice(0, 300));
      throw new Error(`Expected JSON but received ${contentType}. Check that your event ID and authentication parameters are valid.`);
    }

    const cfData = await response.json();

    // -------------------------------------------------------------
    // 3. READ EXISTING DATA TO COMPARE (FOR STATUS FLAGGING)
    // -------------------------------------------------------------
    const outputPath = path.join(__dirname, '../data.json');
    let previousActsMap = new Map();

    if (fs.existsSync(outputPath)) {
      try {
        const prevData = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
        prevData.forEach(act => {
          if (act.id) previousActsMap.set(act.id, act);
        });
      } catch (err) {
        console.warn('Could not parse existing data.json, starting fresh.');
      }
    }

    // -------------------------------------------------------------
    // 4. TRANSFORM CLASHFINDER DATA
    // -------------------------------------------------------------
    const extractedActs = [];
    const locations = cfData?.event?.locations || cfData?.locations || [];

    locations.forEach(location => {
      const stageName = location.name;
      const actsOnStage = location.events || location.acts || [];

      actsOnStage.forEach(event => {
        // Use Clashfinder native ID format (cf-<id>)
        const id = event.id ? `cf-${event.id}` : `${stageName}-${event.name}-${event.start}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const name = event.name || event.act || 'TBA';
        const start = event.start;
        const end = event.end;
        const date = start ? start.split(' ')[0] : '';

        const prev = previousActsMap.get(id);
        let status = 'normal';

        if (!prev) {
          status = 'new';
        } else if (prev.start !== start || prev.end !== end || prev.stage !== stageName) {
          status = 'updated';
        }

        extractedActs.push({
          id,
          name,
          stage: stageName,
          date,
          start,
          end,
          status,
          updatedAt: status !== 'normal' ? new Date().toISOString() : (prev?.updatedAt || null)
        });
      });
    });

    // Sort chronologically by start time
    extractedActs.sort((a, b) => new Date(a.start) - new Date(b.start));

    // Write output to data.json
    fs.writeFileSync(outputPath, JSON.stringify(extractedActs, null, 2), 'utf-8');
    console.log(`Successfully processed ${extractedActs.length} acts and updated data.json`);

  } catch (err) {
    console.error('Failed to sync Clashfinder schedule:', err.message);
    process.exit(1);
  }
}

updateSchedule();