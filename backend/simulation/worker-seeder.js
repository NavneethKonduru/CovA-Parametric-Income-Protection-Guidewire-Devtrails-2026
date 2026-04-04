// ============================================================
// WORKER SEEDER — Generates 100 Simulated Worker Profiles
// ============================================================
// Distributes workers across 3 Bangalore zones with realistic
// Indian names, phone numbers, UPI IDs, and work archetypes.

const ZONE_COORDS = {
  ZONE_A: { lat: 12.9347, lon: 77.6101, name: 'Koramangala' },
  ZONE_B: { lat: 12.9698, lon: 77.7499, name: 'Whitefield' },
  ZONE_C: { lat: 12.9784, lon: 77.6408, name: 'Indiranagar' }
};

const ZONE_DISTRIBUTION = { ZONE_A: 35, ZONE_B: 45, ZONE_C: 20 };

const PLATFORMS = ['zepto', 'blinkit', 'swiggy_instamart'];

const ARCHETYPE_CONFIG = {
  heavy_peak: { rate: 150, count: 40 },
  balanced:   { rate: 120, count: 40 },
  casual:     { rate: 80,  count: 20 }
};

const INDIAN_NAMES = [
  'Raju Kumar', 'Priya Sharma', 'Amit Patel', 'Meera Reddy', 'Suresh Yadav',
  'Lakshmi Devi', 'Rahul Singh', 'Anita Kumari', 'Vijay Nair', 'Deepa Rao',
  'Arjun Mehta', 'Sunita Gupta', 'Naveen Prasad', 'Kavitha Rajan', 'Mahesh Shetty',
  'Geeta Pandey', 'Sanjay Mishra', 'Pooja Verma', 'Ramesh Gowda', 'Divya Iyer',
  'Karthik Nair', 'Sneha Bhat', 'Venkatesh Rao', 'Anjali Pillai', 'Manoj Tiwari',
  'Rekha Menon', 'Sunil Joshi', 'Bhavna Shah', 'Arun Hegde', 'Nandini Kulkarni',
  'Pankaj Saxena', 'Swathi Naidu', 'Dinesh Acharya', 'Neha Deshmukh', 'Rajesh Kamath',
  'Usha Shinde', 'Ganesh Patil', 'Rita Chakrabarti', 'Harish Sethi', 'Smitha Nambiar',
  'Prakash Jha', 'Asha Murthy', 'Mohan Das', 'Lata Bhatt', 'Sudhir Srinivasan',
  'Padma Iyengar', 'Kishore Babu', 'Sangeetha Ravi', 'Akash Malhotra', 'Vandana Kashyap',
  'Tarun Kapoor', 'Jyoti Hegde', 'Ajay Devgan', 'Mala Krishnan', 'Vikram Chauhan',
  'Savitha Rao', 'Rohit Ahuja', 'Meenakshi Sundar', 'Prashanth Reddy', 'Aparna Nair',
  'Satish Kumar', 'Hema Malik', 'Deepak Sinha', 'Radha Gopalan', 'Srinivas Murthy',
  'Chitra Suresh', 'Ramakrishna Rao', 'Shobha Kaul', 'Naresh Thakur', 'Kavya Shetty',
  'Jagdish Pandey', 'Sowmya Iyer', 'Balaji Raman', 'Uma Maheshwari', 'Girish Kini',
  'Pallavi Kulkarni', 'Shankar Dev', 'Anupama Bhat', 'Ravi Shankar', 'Pushpa Devi',
  'Ashok Menon', 'Gayathri Krishnamurthy', 'Siddharth Jain', 'Nirmala Reddy', 'Kiran Desai',
  'Yamuna Sharma', 'Sekhar Naidu', 'Jayashree Pillai', 'Dilip Bose', 'Renuka Acharya',
  'Varun Gupta', 'Padmini Raghavan', 'Nagesh Yadav', 'Suma Kamath', 'Vinod Nambiar',
  'Shantha Prasad', 'Mukesh Agarwal', 'Aruna Venkatesh', 'Shyam Sundar', 'Kamala Devi'
];

/**
 * Generate 100 simulated worker profiles
 * @returns {Array} Array of worker objects ready for DB insertion
 */
function generateSimulatedWorkers() {
  const workers = [];
  let globalIdx = 0;

  // Build archetype assignment array: first 40 = heavy_peak, next 40 = balanced, last 20 = casual
  const archetypeAssignment = [];
  for (const [archetype, config] of Object.entries(ARCHETYPE_CONFIG)) {
    for (let i = 0; i < config.count; i++) {
      archetypeAssignment.push(archetype);
    }
  }
  // Shuffle to distribute across zones
  for (let i = archetypeAssignment.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [archetypeAssignment[i], archetypeAssignment[j]] = [archetypeAssignment[j], archetypeAssignment[i]];
  }

  for (const [zone, count] of Object.entries(ZONE_DISTRIBUTION)) {
    for (let i = 0; i < count; i++) {
      const id = globalIdx + 1;
      const archetype = archetypeAssignment[globalIdx] || 'balanced';
      const rate = ARCHETYPE_CONFIG[archetype].rate;
      const coords = ZONE_COORDS[zone];

      // Add slight random offset to coords (within ~500m)
      const latOffset = (Math.random() - 0.5) * 0.009;
      const lonOffset = (Math.random() - 0.5) * 0.009;

      workers.push({
        id: `SIM_W${String(id).padStart(3, '0')}`,
        name: INDIAN_NAMES[globalIdx] || `Worker ${id}`,
        phone: `98765${String(10000 + id).padStart(5, '0')}`,
        zone,
        platform: PLATFORMS[id % PLATFORMS.length],
        archetype,
        hourlyRate: rate,
        status: 'active',
        upiId: `sim.worker${id}@okaxis`,
        enrolledDate: new Date(Date.now() - Math.random() * 30 * 86400000).toISOString().split('T')[0],
        isSimulated: 1,
        lat: parseFloat((coords.lat + latOffset).toFixed(6)),
        lon: parseFloat((coords.lon + lonOffset).toFixed(6))
      });
      globalIdx++;
    }
  }

  return workers;
}

/**
 * Seed simulated workers into the database
 * @param {object} db - better-sqlite3 database instance
 * @returns {number} Number of workers seeded
 */
function seedSimulatedWorkers(db) {
  // Check if simulated workers already exist
  const existingCount = db.prepare("SELECT COUNT(*) as c FROM workers WHERE id LIKE 'SIM_W%'").get().c;
  if (existingCount >= 100) {
    console.log(`[SEEDER] ${existingCount} simulated workers already exist. Skipping.`);
    return 0;
  }

  // Remove any partial simulated workers
  if (existingCount > 0) {
    db.prepare("DELETE FROM workers WHERE id LIKE 'SIM_W%'").run();
  }

  const workers = generateSimulatedWorkers();

  const insert = db.prepare(`
    INSERT OR IGNORE INTO workers (id, name, phone, zone, platform, archetype, hourlyRate, status, enrolledDate, upiId, isSimulated)
    VALUES (@id, @name, @phone, @zone, @platform, @archetype, @hourlyRate, @status, @enrolledDate, @upiId, @isSimulated)
  `);

  const insertMany = db.transaction((workers) => {
    for (const w of workers) {
      insert.run(w);
    }
  });

  insertMany(workers);
  console.log(`[SEEDER] Seeded ${workers.length} simulated workers across 3 zones.`);
  console.log(`[SEEDER]   ZONE_A: 35 workers | ZONE_B: 45 workers | ZONE_C: 20 workers`);

  // Bug Fix 4: Seed worker_signals for all 100 workers
  const insertSignal = db.prepare(`
    INSERT OR IGNORE INTO worker_signals 
      (workerId, lat, lng, gnss_variance, velocity, platform_active, signal_mode, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);
  const seedSignals = db.transaction((wkrs) => {
    for (let i = 0; i < wkrs.length; i++) {
      const w = wkrs[i];
      const isFraud = i % 4 === 3; // Every 4th worker is fraud (25%)
      insertSignal.run(
        w.id,
        w.lat || 12.9716,
        w.lon || 77.5946,
        isFraud ? 0.5 : 5.0,        // fraud has low gnss variance
        isFraud ? 0 : 2.0,          // velocity
        1,                          // platform_active
        isFraud ? 'auto_fraud' : 'auto_genuine'
      );
    }
  });
  seedSignals(workers);
  console.log('[SEEDER] Seeded signal states: 75 genuine, 25 fraud workers');

  // Seed claim history for demo (3-7 past claims per seeded worker)
  const existingClaims = db.prepare("SELECT COUNT(*) as c FROM claims WHERE id LIKE 'SIM_CLM_%'").get().c;
  if (existingClaims === 0) {
    const insertClaim = db.prepare(`
      INSERT OR IGNORE INTO claims (id, workerId, workerName, zone, disruptionType, date, timeSlot, hoursLost, cdi, triggerLevel, validationStatus, validationReason, payoutAmount, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const DISRUPTION_TYPES = ['SEVERE_WEATHER', 'PLATFORM_OUTAGE', 'EXTREME_HEAT', 'CYCLONE'];
    const STATUSES = ['paid', 'paid', 'paid', 'rejected', 'pending'];
    const seedClaims = db.transaction((wkrs) => {
      let claimIdx = 0;
      for (const w of wkrs) {
        const numClaims = 3 + Math.floor(Math.random() * 5);
        for (let j = 0; j < numClaims; j++) {
          claimIdx++;
          const daysAgo = Math.floor(Math.random() * 30) + 1;
          const date = new Date(Date.now() - daysAgo * 86400000).toISOString().split('T')[0];
          const dtype = DISRUPTION_TYPES[claimIdx % DISRUPTION_TYPES.length];
          const status = STATUSES[claimIdx % STATUSES.length];
          const cdi = parseFloat((0.5 + Math.random() * 0.5).toFixed(3));
          const payout = status === 'paid' ? Math.floor(200 + Math.random() * 400) : 0;
          insertClaim.run(
            `SIM_CLM_${String(claimIdx).padStart(5, '0')}`,
            w.id, w.name, w.zone, dtype, date, 'peak',
            Math.floor(2 + Math.random() * 6), cdi, 'standard',
            'approved', 'CDI threshold met', payout, status
          );
        }
      }
      console.log(`[SEEDER] Seeded ${claimIdx} historical claims for demo workers`);
    });
    seedClaims(workers);
  }

  return workers.length;
}

module.exports = { generateSimulatedWorkers, seedSimulatedWorkers, ZONE_COORDS, ZONE_DISTRIBUTION };
