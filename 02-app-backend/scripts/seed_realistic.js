const pg = require('../data/pg');

const REALISTIC_NAMES = [
  "Rajesh Kumar", "Amit Singh", "Priya Sharma", "Sanjay Verma", "Deepak Gupta",
  "Anil Yadav", "Sunil Mishra", "Vijay Patil", "Ramesh Babu", "Suresh Goud",
  "Arun Krishnan", "Karthik Raja", "Manish Tiwari", "Rahul Deshmukh", "Santosh Shinde",
  "Abhishek Nair", "Vikram Reddy", "Sandip Ghosh", "Manoj Das", "Kavita Reddy",
  "Prakash Jha", "Rakesh Choubey", "Gaurav Saxena", "Nitin Kulkarni", "Prasanna Venkatesh",
  "Ashok Gehlot", "Jagdish Prasad", "Mahendra Singh", "Dinesh Karthik", "Vinay Kumar",
  "Shashank Singh", "Pradeep Rawat", "Hitesh Modi", "Bharat Shah", "Pankaj Advani",
  "Rohit Sharma", "Virat Kohli", "Shubman Gill", "Hardik Pandya", "Jasprit Bumrah",
  "Siddharth Malhotra", "Varun Dhawan", "Ranbir Kapoor", "Ayushmann Khurrana", "Rajkummar Rao",
  "Nawazuddin Siddiqui", "Pankaj Tripathi", "Manoj Bajpayee", "Irrfan Khan", "Sushant Singh",
  "Aditya Roy Kapur", "Ishaan Khatter", "Kartik Aaryan", "Vicky Kaushal", "Riteish Deshmukh",
  "Vivek Oberoi", "Emraan Hashmi", "Tushar Kapoor", "Arshad Warsi", "Sanjay Dutt",
  "Suniel Shetty", "Akshay Kumar", "Salman Khan", "Shah Rukh Khan", "Aamir Khan",
  "Saif Ali Khan", "Ajay Devgn", "Hrithik Roshan", "Tiger Shroff", "John Abraham",
  "Bobby Deol", "Sunny Deol", "Jackie Shroff", "Anil Kapoor", "Govinda",
  "Amitabh Bachchan", "Rishi Kapoor", "Vinod Khanna", "Rajesh Khanna", "Dharmendra",
  "Jeetendra", "Mithun Chakraborty", "Nana Patekar", "Paresh Rawat", "Naseeruddin Shah",
  "Anupam Kher", "Boman Irani", "Kay Kay Menon", "Randeep Hooda", "Jim Sarbh",
  "Vikrant Massey", "Jaideep Ahlawat", "Pratik Gandhi", "Vijay Varma", "Divyendu Sharma",
  "Ali Fazal", "Mohit Raina", "Barun Sobti", "Gurmeet Choudhary", "Karan Singh Grover"
];

const PLATFORMS = ["Zepto", "Blinkit", "Swiggy Instamart", "BigBasket Now", "Dunzo"];

async function seed() {
  await pg.initialize();
  
  console.log('--- PURGING OLD MOCK DATA ---');
  await pg.query('DELETE FROM public.worker_signals');
  await pg.query('DELETE FROM public.claims');
  await pg.query('DELETE FROM fraud.detection_log');
  await pg.query('DELETE FROM public.workers');

  console.log('--- SEEDING REALISTIC WORKERS ---');
  
  const zones = ['ZONE_A', 'ZONE_B', 'ZONE_C'];
  
  for (let i = 0; i < REALISTIC_NAMES.length; i++) {
    const name = REALISTIC_NAMES[i];
    const workerId = `W_${String(i + 1).padStart(3, '0')}`;
    const zone = zones[i % 3];
    const platform = PLATFORMS[i % PLATFORMS.length];
    const upiId = `${name.toLowerCase().replace(' ', '.')}@okaxis`;
    
    // Create worker
    await pg.query(`
      INSERT INTO public.workers (
        id, name, zone, status, data_mode, 
        current_platform, upi_id, hourly_rate, daily_claims_cap, peak_hours
      ) VALUES ($1, $2, $3, 'active', 'REAL', $4, $5, $6, 8.0, $7)
    `, [workerId, name, zone, platform, upiId, 120 + (i % 5) * 10, i % 2 === 0]);

    // Create signal
    await pg.query(`
      INSERT INTO public.worker_signals (
        worker_id, lat, lng, gnss_variance, velocity, platform_active, signal_mode
      ) VALUES ($1, $2, $3, $4, $5, true, 'auto_genuine')
    `, [
      workerId, 
      12.9 + (Math.random() * 0.1), 
      77.5 + (Math.random() * 0.1), 
      4.0 + Math.random() * 2, 
      5.0 + Math.random() * 10
    ]);
  }

  console.log(`Successfully seeded ${REALISTIC_NAMES.length} realistic workers.`);
  process.exit(0);
}

seed();
