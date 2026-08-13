const fs = require('fs');
const path = require('path');

const username = process.env.CLASHFINDER_USERNAME;
const publicKey = process.env.CLASHFINDER_PUBLIC_KEY;
const eventId = 'gm2026';

const PROXY_URL = `https://clashfinder-proxy.michaeljason93.workers.dev/?eventId=${eventId}&username=${encodeURIComponent(username)}&publicKey=${publicKey}`;

async function updateSchedule() {
  try {
    console.log(`Fetching Clashfinder schedule via Cloudflare proxy...`);

    const response = await fetch(PROXY_URL);

    if (!response.ok) {
      throw new Error(`Proxy Error: ${response.status} ${response.statusText}`);
    }

    const cfData = await response.json();

    if (!cfData || typeof cfData !== 'object' || cfData.error) {
      throw new Error(`Invalid response: ${JSON.stringify(cfData)}`);
    }

    console.log('Successfully received data from proxy!');

    // -------------------------------------------------------------
    // PROCESS DATA AND WRITE TO DATA.JSON
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

    extractedActs.sort((a, b) => new Date(a.start) - new Date(b.start));

    fs.writeFileSync(outputPath, JSON.stringify(extractedActs, null, 2), 'utf-8');
    console.log(`Successfully updated data.json with ${extractedActs.length} acts!`);

  } catch (err) {
    console.error('Failed to sync Clashfinder schedule:', err.message);
    process.exit(1);
  }
}

updateSchedule();