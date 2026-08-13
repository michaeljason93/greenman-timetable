const fs = require('fs');
const path = require('path');

const username = process.env.CLASHFINDER_USERNAME?.trim();
const publicKey = process.env.CLASHFINDER_PUBLIC_KEY?.trim();

const eventId = 'gm2026';

if (!username || !publicKey) {
  console.error(
    'Error: Missing CLASHFINDER_USERNAME or CLASHFINDER_PUBLIC_KEY environment variables.'
  );
  process.exit(1);
}

const API_URL =
  `https://clashfinder.com/data/event/${encodeURIComponent(eventId)}.json` +
  `?authUsername=${encodeURIComponent(username)}` +
  `&authPublicKey=${encodeURIComponent(publicKey)}`;

async function fetchClashfinder() {
  console.log(`Fetching Clashfinder schedule for event: ${eventId}...`);

  const response = await fetch(API_URL, {
    method: 'GET',
    headers: {
      'Accept': 'application/json'
    }
  });

  const contentType = response.headers.get('content-type') || '';

  console.log(`Clashfinder HTTP status: ${response.status}`);
  console.log(`Content-Type: ${contentType}`);

  /*
   * Read the response as text first.
   *
   * This is intentional. If Clashfinder/Cloudflare sends a CAPTCHA
   * or challenge page, attempting response.json() immediately would
   * hide the useful response.
   */
  const responseText = await response.text();

  console.log(`Response length: ${responseText.length} bytes`);

  if (!response.ok) {
    console.error('');
    console.error('Clashfinder returned an HTTP error.');
    console.error(`Status: ${response.status} ${response.statusText}`);
    console.error('');
    console.error('First 2000 characters of response:');
    console.error('--------------------------------------------------');
    console.error(responseText.substring(0, 2000));
    console.error('--------------------------------------------------');
    console.error('');

    if (response.status === 401) {
      console.error(
        'HTTP 401 indicates an authentication problem. Check your Clashfinder username/public key.'
      );
    } else if (response.status === 403) {
      console.error(
        'HTTP 403 indicates the request was forbidden. ' +
        'If the response contains a CAPTCHA or Cloudflare challenge, ' +
        'the GitHub Actions runner is likely being challenged.'
      );
    } else if (response.status === 429) {
      console.error(
        'HTTP 429 indicates rate limiting.'
      );
    }

    throw new Error(
      `Clashfinder API request failed: HTTP ${response.status} ${response.statusText}`
    );
  }

  /*
   * A successful API response should be JSON.
   * If Clashfinder returns HTML instead, show enough information
   * to diagnose it.
   */
  let cfData;

  try {
    cfData = JSON.parse(responseText);
  } catch (error) {
    console.error('');
    console.error('Clashfinder returned a non-JSON response.');
    console.error('This may be a CAPTCHA, Cloudflare challenge, or error page.');
    console.error('');
    console.error('First 2000 characters of response:');
    console.error('--------------------------------------------------');
    console.error(responseText.substring(0, 2000));
    console.error('--------------------------------------------------');
    console.error('');

    throw new Error(
      'Clashfinder response was not valid JSON.'
    );
  }

  if (!cfData || typeof cfData !== 'object') {
    throw new Error(
      'Received invalid JSON payload from Clashfinder API.'
    );
  }

  console.log('Successfully retrieved Clashfinder JSON.');

  return cfData;
}

function processSchedule(cfData) {
  const outputPath = path.join(__dirname, '../data.json');

  /*
   * Load existing data so we can determine whether an act is:
   * - new
   * - updated
   * - unchanged
   */
  let previousActsMap = new Map();

  if (fs.existsSync(outputPath)) {
    try {
      const previousData = JSON.parse(
        fs.readFileSync(outputPath, 'utf-8')
      );

      if (Array.isArray(previousData)) {
        previousData.forEach(act => {
          if (act.id) {
            previousActsMap.set(act.id, act);
          }
        });
      }
    } catch (error) {
      console.warn(
        'Could not parse existing data.json. Starting with an empty previous dataset.'
      );
    }
  }

  const extractedActs = [];

  /*
   * Clashfinder data can potentially expose locations through
   * either:
   *
   *   cfData.event.locations
   *
   * or:
   *
   *   cfData.locations
   */
  const locations =
    cfData?.event?.locations ||
    cfData?.locations ||
    [];

  if (!Array.isArray(locations)) {
    throw new Error(
      'Could not find a valid locations array in the Clashfinder response.'
    );
  }

  console.log(`Found ${locations.length} locations/stages.`);

  locations.forEach(location => {
    const stageName = location?.name || 'Unknown Stage';

    const actsOnStage =
      location?.events ||
      location?.acts ||
      [];

    if (!Array.isArray(actsOnStage)) {
      return;
    }

    actsOnStage.forEach(event => {
      const actName =
        event?.name ||
        event?.act ||
        event?.short ||
        'TBA';

      const shortName =
        event?.short ||
        actName;

      /*
       * Prefer MBID where available because it should remain stable.
       * Otherwise fall back to Clashfinder's event ID.
       * Finally use a combination of stage/name/start time.
       */
      const rawId =
        event?.mbid ||
        event?.id ||
        `${stageName}-${shortName}-${event?.start || ''}`;

      let id;

      if (event?.mbid) {
        id = `mbid-${event.mbid}`;
      } else {
        id = `cf-${rawId}`
          .toLowerCase()
          .replace(/[^a-z0-9-]+/g, '-')
          .replace(/^-+|-+$/g, '');
      }

      const start = event?.start || null;
      const end = event?.end || null;

      const date = start
        ? start.split(' ')[0]
        : '';

      const mbid =
        event?.mbid ||
        null;

      const previousAct =
        previousActsMap.get(id);

      let status = 'normal';

      if (!previousAct) {
        status = 'new';
      } else if (
        previousAct.start !== start ||
        previousAct.end !== end ||
        previousAct.stage !== stageName ||
        previousAct.name !== actName
      ) {
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
        updatedAt:
          status !== 'normal'
            ? new Date().toISOString()
            : (previousAct?.updatedAt || null)
      });
    });
  });

  /*
   * Sort chronologically.
   */
  extractedActs.sort((a, b) => {
    if (!a.start) return 1;
    if (!b.start) return -1;

    return new Date(a.start) - new Date(b.start);
  });

  /*
   * Write the updated data.
   */
  fs.writeFileSync(
    outputPath,
    JSON.stringify(extractedActs, null, 2),
    'utf-8'
  );

  console.log(
    `Successfully processed ${extractedActs.length} acts.`
  );

  console.log(`Updated: ${outputPath}`);

  /*
   * Useful summary for GitHub Actions logs.
   */
  const newActs = extractedActs.filter(
    act => act.status === 'new'
  ).length;

  const updatedActs = extractedActs.filter(
    act => act.status === 'updated'
  ).length;

  console.log(`New acts: ${newActs}`);
  console.log(`Updated acts: ${updatedActs}`);
}

async function updateSchedule() {
  try {
    const cfData = await fetchClashfinder();

    processSchedule(cfData);

    console.log('');
    console.log('Clashfinder sync completed successfully.');
  } catch (error) {
    console.error('');
    console.error('========================================');
    console.error('Clashfinder sync failed');
    console.error('========================================');
    console.error(error?.message || error);
    console.error('');

    process.exit(1);
  }
}

updateSchedule();