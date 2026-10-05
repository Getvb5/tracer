import Papa from 'papaparse';

const TRACER_CONFIGS = [
  { 
    id: 'tracer_01', 
    url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSC60psAKcfv3iaypiyAh5jGoNKQJE0VgsZyLnAiWqeJrJEMrTHqel-Y4UWw2XUmWKfn8fxrQDZDXhK/pub?gid=322028166&single=true&output=csv'
  },
  { 
    id: 'tracer_02', 
    url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQPHGA77UVgNeDPZtg_7YXqLKFJE3Fezfr2Oy2Xl02eXwLr0ZbdkqjxPdhJv0AXFI8DJWJQoMTRpgQw/pub?gid=836928129&single=true&output=csv'
  },
  { 
    id: 'tracer_03', 
    url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT8pDmvLv8C5Ikqj4-5O8XBOax4YUUliyh8IlyuHM8UugyGUN8URqSs7V-BH7BPwmFzFsrUZQvPGXBw/pub?gid=842761097&single=true&output=csv'
  }
];

async function run() {
  for (const config of TRACER_CONFIGS) {
    console.log(`\n=== FETCHING ${config.id} ===`);
    try {
      const res = await fetch(config.url);
      const text = await res.text();
      const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
      console.log('Parsed rows:', parsed.data.length);
      if (parsed.data.length > 0) {
        console.log('Columns:', Object.keys(parsed.data[0]));
        console.log('First row sample:', JSON.stringify(parsed.data[0], null, 2));
      }
    } catch (e) {
      console.error(e);
    }
  }
}

run();
