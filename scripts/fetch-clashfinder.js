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
    console.log(`Launching headless browser for event: ${eventId}...`);
    
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled'
      ]
    });

    const page = await browser.newPage();

    // Set standard browser user agent
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    );

    console.log(`Navigating to API endpoint...`);
    
    // Use domcontentloaded so background tracking connections don't hang execution
    await page.goto(API_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    // Wait 4 seconds for SiteGround CAPTCHA meta-refresh/redirects to execute
    await new Promise(resolve => setTimeout(resolve, 4000));

    // Extract text from <pre> (Chrome's default JSON viewer wrapper) or <body>
    const rawText = await page.evaluate(() => {
      const pre = document.querySelector('pre');
      return pre ? pre.textContent : document.body.textContent;
    });

    if (!rawText || !rawText.trim().startsWith('{')) {
      throw new Error(`Failed to retrieve valid JSON string. Received page content:\n${rawText.slice(0, 200)}`);
    }

    const cfData = JSON.parse(rawText.trim());
    console.log('Successfully parsed Clashfinder schedule data!');

    // -------------------------------------------------------------
    // PROCESS DATA & WRITE TO DATA.JSON
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