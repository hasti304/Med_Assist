/**
 * Seeds directory doctors (US cities, no login accounts).
 * Replaces prior directory rows (user_id IS NULL) when US seed is not present.
 */
const pool = require('./pool');

const US_CITIES = [
  'New York', 'Los Angeles', 'Chicago', 'Houston',
  'Phoenix', 'Philadelphia', 'San Antonio', 'Dallas',
];

const DOCTORS = [
  { name: 'Dr. James Wilson', specialization: 'Cardiologist', hospital: 'Mount Sinai Hospital', city: 'New York', state: 'NY', lat: 40.7900, lng: -73.9520, phone: '+1 (212) 241-6500', available: true },
  { name: 'Dr. Emily Carter', specialization: 'Dermatologist', hospital: 'NYU Langone Health', city: 'New York', state: 'NY', lat: 40.7421, lng: -73.9740, phone: '+1 (212) 263-7300', available: true },
  { name: 'Dr. Michael Brooks', specialization: 'Neurologist', hospital: 'NewYork-Presbyterian', city: 'New York', state: 'NY', lat: 40.8407, lng: -73.9416, phone: '+1 (212) 305-2500', available: true },
  { name: 'Dr. Sarah Nguyen', specialization: 'Pediatrician', hospital: 'Memorial Sloan Kettering', city: 'New York', state: 'NY', lat: 40.7644, lng: -73.9555, phone: '+1 (212) 639-2000', available: true },

  { name: 'Dr. Robert Chen', specialization: 'Orthopedic', hospital: 'Cedars-Sinai Medical Center', city: 'Los Angeles', state: 'CA', lat: 34.0753, lng: -118.3813, phone: '+1 (310) 423-3277', available: true },
  { name: 'Dr. Lisa Martinez', specialization: 'General Physician', hospital: 'UCLA Medical Center', city: 'Los Angeles', state: 'CA', lat: 34.0652, lng: -118.4450, phone: '+1 (310) 825-9111', available: true },
  { name: 'Dr. David Kim', specialization: 'Psychiatrist', hospital: 'Kaiser Permanente LA', city: 'Los Angeles', state: 'CA', lat: 34.0522, lng: -118.2437, phone: '+1 (323) 783-3000', available: true },
  { name: 'Dr. Jennifer Walsh', specialization: 'Diabetologist', hospital: 'Children\'s Hospital Los Angeles', city: 'Los Angeles', state: 'CA', lat: 34.0970, lng: -118.2880, phone: '+1 (323) 361-4600', available: false },

  { name: 'Dr. Thomas Anderson', specialization: 'Cardiologist', hospital: 'Northwestern Memorial Hospital', city: 'Chicago', state: 'IL', lat: 41.8953, lng: -87.6210, phone: '+1 (312) 926-2000', available: true },
  { name: 'Dr. Rachel Green', specialization: 'Dermatologist', hospital: 'Rush University Medical Center', city: 'Chicago', state: 'IL', lat: 41.8745, lng: -87.6690, phone: '+1 (312) 942-5000', available: true },
  { name: 'Dr. Kevin O\'Brien', specialization: 'Neurologist', hospital: 'University of Chicago Medicine', city: 'Chicago', state: 'IL', lat: 41.7891, lng: -87.6047, phone: '+1 (773) 702-1000', available: true },
  { name: 'Dr. Amanda Foster', specialization: 'Pediatrician', hospital: 'Lurie Children\'s Hospital', city: 'Chicago', state: 'IL', lat: 41.8962, lng: -87.6205, phone: '+1 (312) 227-4000', available: true },

  { name: 'Dr. William Jackson', specialization: 'Orthopedic', hospital: 'Houston Methodist Hospital', city: 'Houston', state: 'TX', lat: 29.7098, lng: -95.3984, phone: '+1 (713) 790-3311', available: true },
  { name: 'Dr. Priya Patel', specialization: 'General Physician', hospital: 'MD Anderson Cancer Center', city: 'Houston', state: 'TX', lat: 29.7074, lng: -95.3979, phone: '+1 (713) 792-2121', available: true },
  { name: 'Dr. Christopher Lee', specialization: 'Diabetologist', hospital: 'Memorial Hermann-TMC', city: 'Houston', state: 'TX', lat: 29.7111, lng: -95.3985, phone: '+1 (713) 704-4000', available: true },
  { name: 'Dr. Michelle Torres', specialization: 'Psychiatrist', hospital: 'Texas Children\'s Hospital', city: 'Houston', state: 'TX', lat: 29.7078, lng: -95.4010, phone: '+1 (832) 824-1000', available: false },

  { name: 'Dr. Richard Hayes', specialization: 'Cardiologist', hospital: 'Mayo Clinic Arizona', city: 'Phoenix', state: 'AZ', lat: 33.6589, lng: -111.9543, phone: '+1 (480) 301-8000', available: true },
  { name: 'Dr. Susan Mitchell', specialization: 'Dermatologist', hospital: 'Banner University Medical Center', city: 'Phoenix', state: 'AZ', lat: 33.4794, lng: -112.0384, phone: '+1 (602) 839-2000', available: true },
  { name: 'Dr. Ahmed Hassan', specialization: 'Neurologist', hospital: 'Barrow Neurological Institute', city: 'Phoenix', state: 'AZ', lat: 33.4942, lng: -112.0740, phone: '+1 (602) 406-3000', available: true },
  { name: 'Dr. Laura Bennett', specialization: 'Pediatrician', hospital: 'Phoenix Children\'s Hospital', city: 'Phoenix', state: 'AZ', lat: 33.4484, lng: -112.0740, phone: '+1 (602) 933-1000', available: true },

  { name: 'Dr. Daniel Cooper', specialization: 'Orthopedic', hospital: 'Hospital of the University of Pennsylvania', city: 'Philadelphia', state: 'PA', lat: 39.9502, lng: -75.1936, phone: '+1 (215) 662-4000', available: true },
  { name: 'Dr. Jessica Rivera', specialization: 'General Physician', hospital: 'Jefferson Health', city: 'Philadelphia', state: 'PA', lat: 39.9489, lng: -75.1577, phone: '+1 (215) 955-6000', available: true },
  { name: 'Dr. Mark Sullivan', specialization: 'Diabetologist', hospital: 'Children\'s Hospital of Philadelphia', city: 'Philadelphia', state: 'PA', lat: 39.9486, lng: -75.1925, phone: '+1 (215) 590-1000', available: true },
  { name: 'Dr. Nicole Adams', specialization: 'Psychiatrist', hospital: 'Penn Medicine', city: 'Philadelphia', state: 'PA', lat: 39.9445, lng: -75.1920, phone: '+1 (800) 789-7366', available: true },

  { name: 'Dr. Brian Phillips', specialization: 'Cardiologist', hospital: 'Methodist Hospital San Antonio', city: 'San Antonio', state: 'TX', lat: 29.5094, lng: -98.4482, phone: '+1 (210) 575-4000', available: true },
  { name: 'Dr. Karen Wright', specialization: 'Dermatologist', hospital: 'University Health System', city: 'San Antonio', state: 'TX', lat: 29.4241, lng: -98.4936, phone: '+1 (210) 358-4000', available: true },
  { name: 'Dr. Steven Ramirez', specialization: 'Neurologist', hospital: 'Baptist Medical Center', city: 'San Antonio', state: 'TX', lat: 29.5201, lng: -98.4808, phone: '+1 (210) 297-7000', available: false },
  { name: 'Dr. Heather Collins', specialization: 'Pediatrician', hospital: 'CHRISTUS Santa Rosa', city: 'San Antonio', state: 'TX', lat: 29.4375, lng: -98.4610, phone: '+1 (210) 704-2011', available: true },

  { name: 'Dr. Gregory Turner', specialization: 'Orthopedic', hospital: 'Baylor University Medical Center', city: 'Dallas', state: 'TX', lat: 32.7896, lng: -96.7784, phone: '+1 (214) 820-0111', available: true },
  { name: 'Dr. Ashley Morgan', specialization: 'General Physician', hospital: 'UT Southwestern Medical Center', city: 'Dallas', state: 'TX', lat: 32.8174, lng: -96.8358, phone: '+1 (214) 645-8300', available: true },
  { name: 'Dr. Ryan Edwards', specialization: 'Diabetologist', hospital: 'Parkland Memorial Hospital', city: 'Dallas', state: 'TX', lat: 32.7895, lng: -96.8380, phone: '+1 (214) 590-8000', available: true },
  { name: 'Dr. Brittany Scott', specialization: 'Psychiatrist', hospital: 'Children\'s Health Dallas', city: 'Dallas', state: 'TX', lat: 32.8065, lng: -96.8387, phone: '+1 (214) 456-7000', available: true },
];

async function seedIndianDoctors() {
  await pool.query(`ALTER TABLE doctor_profiles ADD COLUMN IF NOT EXISTS name VARCHAR(255)`);
  await pool.query(`ALTER TABLE doctor_profiles ALTER COLUMN user_id DROP NOT NULL`);

  const { rows: usCount } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM doctor_profiles
     WHERE user_id IS NULL AND city = ANY($1::text[])`,
    [US_CITIES]
  );
  if (usCount[0].n >= 30) {
    console.log(`[seed] US directory doctors already present (${usCount[0].n}), skipping`);
    return;
  }

  await pool.query(`DELETE FROM doctor_profiles WHERE user_id IS NULL`);

  let inserted = 0;
  for (const d of DOCTORS) {
    await pool.query(
      `INSERT INTO doctor_profiles
         (user_id, name, specialization, hospital_name, city, state,
          latitude, longitude, phone, available)
       VALUES (NULL, $1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [d.name, d.specialization, d.hospital, d.city, d.state, d.lat, d.lng, d.phone, d.available]
    );
    inserted++;
  }

  console.log(`[seed] Inserted ${inserted} US directory doctors (${DOCTORS.length} defined)`);
}

module.exports = { seedIndianDoctors, DOCTORS, US_CITIES };
