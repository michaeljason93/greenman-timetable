const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const username = process.env.CLASHFINDER_USERNAME;
const publicKey = process.env.CLASHFINDER_PUBLIC_KEY;
const eventId = 'gm2026';

if (!username || !publicKey) {
  console.error('Error: Missing CLASHFINDER_USERNAME or CLASHFINDER_PUBLIC_KEY');
  process.exit(1);
}

const API_URL = `https://clashfinder.com/data/event/${eventId}.json?authUsername=${encodeURIComponent(username.trim())}&authPublicKey=${publicKey.trim()}`;

async function updateSchedule() {
  let browser;
  try {
    console.log(`Launching headless browser to bypass CAPTCHA for event: ${eventId}...`);
    
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // Set a standard User-Agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

    // Step 1: Visit main Clashfinder page first to establish cookies / pass CAPTCHA
    await page.goto('https://clashfinder.com', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Step 2: Perform fetch directly inside the browser context to get clean JSON
    const cfData = await page.evaluate(async (url) => {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      return await res.json();
    }, API_URL);

    console.log('Successfully retrieved clean JSON via Puppeteer browser fetch!');

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

    extractedActs.sort((a, b) => new Date(a.start) - new Date(b.start));

    fs.writeFileSync(outputPath, JSON.stringify(extractedActs, null, 2), 'utf-8');
    console.log(`Successfully processed ${extractedActs.length} acts and updated data.json`);

  } catch (err) {
    console.error('Failed to sync Clashfinder schedule:', err.message);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
}

updateSchedule();