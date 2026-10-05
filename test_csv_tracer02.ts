import Papa from 'papaparse';

const config = { 
  id: 'tracer_02', 
  url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQPHGA77UVgNeDPZtg_7YXqLKFJE3Fezfr2Oy2Xl02eXwLr0ZbdkqjxPdhJv0AXFI8DJWJQoMTRpgQw/pub?gid=836928129&single=true&output=csv'
};

async function run() {
  try {
    const res = await fetch(config.url);
    const text = await res.text();
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
    if (parsed.data.length > 0) {
      console.log('COLUMNS:', Object.keys(parsed.data[0]));
      console.log('FIRST ROW SAMPLE:', parsed.data[0]);
    } else {
      console.log('No data found');
    }
  } catch (e) {
    console.error(e);
  }
}

run();
