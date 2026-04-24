const pg = require('../data/pg');
const { checkFraud } = require('../engines/fraud');

async function runDemo() {
  await pg.initialize();
  
  const workers = [
    { id: 'W_GENUINE', name: 'Genuine Ramesh', phone_hash: 'h1' },
    { id: 'W_SPOOF', name: 'Spoofing Suresh', phone_hash: 'h2' },
    { id: 'W_TELEPORT', name: 'Teleporting Tony', phone_hash: 'h3' },
    { id: 'W_INDOOR', name: 'Stationary Salma', phone_hash: 'h4' }
  ];

  const scenarios = [
    {
      workerId: 'W_GENUINE',
      telemetry: {
        gpsHistory: [
          { lat: 12.9347, lng: 77.6101, gnss_variance: 4.5, velocity: 15, timestamp: Date.now() - 60000 },
          { lat: 12.9350, lng: 77.6105, gnss_variance: 5.2, velocity: 18, timestamp: Date.now() }
        ]
      },
      desc: 'Normal movement, natural GNSS jitter'
    },
    {
      workerId: 'W_SPOOF',
      telemetry: {
        gpsHistory: [
          { lat: 12.9347, lng: 77.6101, gnss_variance: 0.0, velocity: 20, timestamp: Date.now() - 60000 },
          { lat: 12.9355, lng: 77.6110, gnss_variance: 0.0, velocity: 22, timestamp: Date.now() }
        ]
      },
      desc: 'Synthetic GPS (0.000 variance while in motion)'
    },
    {
      workerId: 'W_TELEPORT',
      telemetry: {
        gpsHistory: [
          { lat: 12.9347, lng: 77.6101, gnss_variance: 5.0, velocity: 10, timestamp: Date.now() - 60000 },
          { lat: 13.0347, lng: 77.7101, gnss_variance: 5.0, velocity: 600, timestamp: Date.now() }
        ]
      },
      desc: 'Teleportation (15km jump in 60 seconds)'
    },
    {
      workerId: 'W_INDOOR',
      telemetry: {
        gpsHistory: [
          { lat: 12.9347, lng: 77.6101, gnss_variance: 0.0, velocity: 0, timestamp: Date.now() - 60000 },
          { lat: 12.9347, lng: 77.6101, gnss_variance: 0.0, velocity: 0, timestamp: Date.now() }
        ]
      },
      desc: 'Stationary Indoor (0 variance, but 0 velocity -> Pardoned)'
    }
  ];

  console.log('=== CovA TCHC FRAUD ENGINE DEMO ===');
  console.log('--------------------------------------------------');

  for (const s of scenarios) {
    const worker = workers.find(w => w.id === s.workerId);
    const result = checkFraud(
      { telemetry: s.telemetry, payout_amount: 500 },
      worker,
      [], // no history for this demo
      { activePeersPercent: 80 }
    );

    console.log(`WORKER: ${worker.name}`);
    console.log(`SCENARIO: ${s.desc}`);
    console.log(`FRAUD SCORE: ${(result.fraudScore * 100).toFixed(1)}%`);
    console.log(`ACTION: ${result.action.toUpperCase()}`);
    console.log(`FLAGS: ${result.flags.map(f => f.rule).join(', ') || 'NONE'}`);
    console.log('--------------------------------------------------');
  }

  process.exit(0);
}

runDemo();
