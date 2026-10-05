import Papa from 'papaparse';

const TRACER_CONFIGS = [
  { 
    id: 'tracer_01', 
    url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSC60psAKcfv3iaypiyAh5jGoNKQJE0VgsZyLnAiWqeJrJEMrTHqel-Y4UWw2XUmWKfn8fxrQDZDXhK/pub?gid=322028166&single=true&output=csv'
  },
  { 
    id: 'tracer_02', 
    url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQPHGA77UVgNeDPZtg_7YXqLKFJE3Fezfr2Oy2Xl02eXwLr0ZbdkqjxPdhJv0AXFI8DJWJQoMTRpgQw/pub?gid=836928129&single=true&output=csv'
  }
];

async function run() {
  for (const config of TRACER_CONFIGS) {
    console.log(`\n=== ANALYZING ${config.id} ===`);
    try {
      const res = await fetch(config.url);
      const text = await res.text();
      const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
      console.log('Total parsed rows:', parsed.data.length);
      
      const dateStats: Record<string, number> = {};
      const hospitalStats: Record<string, number> = {};
      
      for (const row of parsed.data as any[]) {
        let dateVal = String(
          row['03- Data do Tracer:'] ||
          row['03- Data do Tracer'] ||
          row['Data do Tracer:'] ||
          row['Data do Tracer'] ||
          row['DATA DO TRACER'] ||
          row['DATA'] ||
          row['Carimbo de data/hora'] ||
          row['CARIMBO DE DATA/HORA']
        ).trim();
        
        let hospVal = String(
          row['Nome do Hospital/Maternidade'] ||
          row['Unidade de Saúde'] ||
          row['UNIDADE'] ||
          row['HOSPITAL'] ||
          row['ESTABELECIMENTO']
        ).trim();
        
        dateStats[dateVal] = (dateStats[dateVal] || 0) + 1;
        hospitalStats[hospVal] = (hospitalStats[hospVal] || 0) + 1;
      }
      
      console.log('Date Counts:', JSON.stringify(dateStats, null, 2));
      console.log('Hospital Counts:', JSON.stringify(hospitalStats, null, 2));
    } catch (e) {
      console.error(e);
    }
  }
}

run();
