import Papa from 'papaparse';

const TRACER_CONFIGS = [
  { 
    id: 'tracer_01', 
    url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSC60psAKcfv3iaypiyAh5jGoNKQJE0VgsZyLnAiWqeJrJEMrTHqel-Y4UWw2XUmWKfn8fxrQDZDXhK/pub?gid=322028166&single=true&output=csv'
  }
];

async function run() {
  for (const config of TRACER_CONFIGS) {
    try {
      const res = await fetch(config.url);
      const text = await res.text();
      const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
      console.log('Columns for T01:', Object.keys(parsed.data[0]));
      console.log('First T01 Row:', JSON.stringify(parsed.data[0], null, 2));
    } catch (e) {
      console.error(e);
    }
  }
}

run();
