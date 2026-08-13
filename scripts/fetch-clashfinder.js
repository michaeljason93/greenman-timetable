const fs = require('fs');
const path = require('path');

const username = process.env.CLASHFINDER_USERNAME;
const publicKey = process.env.CLASHFINDER_PUBLIC_KEY;
const eventId = 'gm2026';

if (!username || !publicKey) {
  console.error('Error: Missing CLASHFINDER_USERNAME or CLASHFINDER_PUBLIC_KEY in environment variables');
  process.exit(1);
}

const API_URL = `https://clashfinder.com/data/event/${eventId}.json?authUsername=${encodeURIComponent(username.trim())}&authPublicKey=${publicKey.trim()}`;

async function updateSchedule() {
  try {
    console.log(`Fetching Clashfinder schedule via native fetch for event: ${eventId}...`);

    const response = await fetch(API_URL, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP Error Status: ${response.status} - ${response.statusText}`);
    }

    const cfData = await response.json();

    if (!cfData || typeof cfData !== 'object') {
      throw new Error('Received invalid JSON payload from Clashfinder API.');
    }

    console.log('Successfully retrieved and parsed Clashfinder schedule data!');

    // -------------------------------------------------------------
    // PROCESS DATA AND UPDATE DATA.JSON
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

    const extractedActs = [];
    const locations = cfData?.event?.locations || cfData?.locations || [];

    locations.forEach(location => {
      const stageName = location.name;
      const actsOnStage = location.events || location.acts || [];

      actsOnStage.forEach(event => {
        const actName = event.name || event.act || event.short || 'TBA';
        const shortName = event.short || actName;

        // Unique ID resolution with fallbacks
        const rawId = event.mbid || event.id || `${stageName}-${shortName}-${event.start}`;
        const id = event.mbid 
          ? `mbid-${event.mbid}` 
          : `cf-${rawId}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-');

        const start = event.start;
        const end = event.end;
        const date = start ? start.split(' ')[0] : '';
        const mbid = event.mbid || null;

        const prev = previousActsMap.get(id);
        let status = 'normal';

        if (!prev) {
          status = 'new';
        } else if (prev.start !== start || prev.end !== end || prev.stage !== stageName) {
          status = 'updated';
        }

        extractedActs.push({
          id,
          mbid,
          name: actName,
          shortName,
          stage: stageName,
          date,
          start,
          end,
          status,
          updatedAt: status !== 'normal' ? new Date().toISOString() : (prev?.updatedAt || null)
        });
      });
    });

    // Sort acts chronologically by start time
    extractedActs.sort((a, b) => new Date(a.start) - new Date(b.start));

    // Save output back to data.json
    fs.writeFileSync(outputPath, JSON.stringify(extractedActs, null, 2), 'utf-8');
    console.log(`Successfully processed ${extractedActs.length} acts and updated data.json`);

  } catch (err) {
    console.error('Failed to sync Clashfinder schedule:', err.message);
    process.exit(1);
  }
}

updateSchedule();