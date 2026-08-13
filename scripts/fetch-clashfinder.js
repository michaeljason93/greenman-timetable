// scripts/fetch-clashfinder.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 1. Read secrets securely from environment variables
const username = process.env.CLASHFINDER_USERNAME;
const publicKey = process.env.CLASHFINDER_PUBLIC_KEY;
const eventId = 'gm2026'; // Your Clashfinder event ID

if (!username || !privateKey) {
  console.error('Error: Missing CLASHFINDER_USERNAME or CLASHFINDER_PRIVATE_KEY environment variables.');
  process.exit(1);
}

// 3. Construct API URL with authentication parameters
const API_URL = `https://clashfinder.com/data/event/${eventId}.json?authUsername=${encodeURIComponent(username)}&authPublicKey=${publicKey}`;

async function updateSchedule() {
  try {
    console.log(`Fetching schedule securely for event: ${eventId}`);
    const response = await fetch(API_URL);

    if (!response.ok) {
      throw new Error(`Clashfinder API returned status ${response.status}`);
    }

    const cfData = await response.json();

    // -------------------------------------------------------------
    // 1. READ EXISTING DATA TO COMPARE (FOR STATUS FLAGGING)
    // -------------------------------------------------------------
    const outputPath = path.join(__dirname, '../data.json');
    let previousActsMap = new Map();

    if (fs.existsSync(outputPath)) {
      try {
        const prevData = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
        prevData.forEach(act => previousActsMap.set(act.id, act));
      } catch (err) {
        console.warn('Could not parse existing data.json, starting fresh.');
      }
    }

    // -------------------------------------------------------------
    // 2. FLATTEN / TRANSFORM CLASHFINDER DATA
    // -------------------------------------------------------------
    const extractedActs = [];
    
    // Clashfinder organizes data under event.locations -> events
    const locations = cfData?.event?.locations || cfData?.locations || [];

    locations.forEach(location => {
      const stageName = location.name;
      const actsOnStage = location.events || location.acts || [];

      actsOnStage.forEach(event => {
        // Extract basic details
        const id = String(event.id || `${stageName}-${event.name}-${event.start}`);
        const name = event.name || event.act;
        const start = event.start;
        const end = event.end;
        
        // Extract date (e.g. "2026-08-21")
        const date = start ? start.split(' ')[0] : '';

        // Check against previous run
        const prev = previousActsMap.get(id);
        let status = 'normal';

        if (!prev) {
          // Act was not present in the last data.json run
          status = 'new';
        } else if (prev.start !== start || prev.end !== end || prev.stage !== stageName) {
          // Act timing or stage shifted
          status = 'updated';
        }

        extractedActs.push({
          id,
          name,
          stage: stageName,
          date,
          start,
          end,
          status, // 'normal' | 'new' | 'updated'
          updatedAt: status !== 'normal' ? new Date().toISOString() : (prev?.updatedAt || null)
        });
      });
    });

    // Sort chronologically by start time
    extractedActs.sort((a, b) => new Date(a.start) - new Date(b.start));

    // -------------------------------------------------------------
    // 3. WRITE TO DATA.JSON
    // -------------------------------------------------------------
    fs.writeFileSync(
      outputPath, 
      JSON.stringify(extractedActs, null, 2), 
      'utf-8'
    );

    console.log(`Successfully processed ${extractedActs.length} acts and written to data.json`);

    console.log('Successfully updated data.json');
  } catch (err) {
    console.error('Failed to sync Clashfinder schedule:', err);
    process.exit(1);
  }
}

updateSchedule();