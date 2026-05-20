import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc, setDoc, query, where } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';

// Note: In the prompt, the config labels were accidentally swapped. 
// I am assigning the configs based on their actual projectId properties to ensure data moves in the correct direction.

// SOURCE: fmac-fleet-management-system
const fleetConfig = {
  apiKey: "AIzaSyB2nfzm7mRL2tE1Msf2yZFKimdd1AIQpI8",
  authDomain: "fmac-fleet-management-system.firebaseapp.com",
  projectId: "fmac-fleet-management-system",
  storageBucket: "fmac-fleet-management-system.firebasestorage.app",
  messagingSenderId: "835939061602",
  appId: "1:835939061602:web:bdd5391aef2e94039d263b",
  measurementId: "G-KBF24CNXYM"
};

// TARGET: fmac-ops
const opsConfig = {
  apiKey: "AIzaSyA5InvG3QoCQXgYUDCAA6IwuIGe7ZhIQxY",
  authDomain: "fmac-ops.firebaseapp.com",
  databaseURL: "https://fmac-ops-default-rtdb.firebaseio.com",
  projectId: "fmac-ops",
  storageBucket: "fmac-ops.firebasestorage.app",
  messagingSenderId: "461928660272",
  appId: "1:461928660272:web:b07b6563f641ebfb955cf5",
  measurementId: "G-H8B99DVWBJ"
};

const fleetApp = initializeApp(fleetConfig, 'fleetSource');
const opsApp = initializeApp(opsConfig, 'opsTarget');

const fleetDb = getFirestore(fleetApp);
const opsDb = getFirestore(opsApp);

const collectionsToMigrate = [
  'users',
  'vehicles',
  'trips',
  'odometerLogs',
  'maintenance',
  'monthlyStatements',
  'violations',
  'scorecards'
];

async function migrateCollection(collectionName) {
  console.log(`\n===========================================`);
  console.log(`Starting migration for collection: [${collectionName}]`);
  console.log(`===========================================`);

  try {
    const sourceColRef = collection(fleetDb, collectionName);
    const querySnapshot = await getDocs(sourceColRef);

    if (querySnapshot.empty) {
      console.log(`No documents found in [${collectionName}]. Skipping...`);
      return;
    }

    console.log(`Found ${querySnapshot.size} documents in source [${collectionName}].`);

    let successCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const document of querySnapshot.docs) {
      const docId = document.id;
      const data = document.data();
      
      const targetDocRef = doc(opsDb, collectionName, docId);
      
      try {
        // Special handling for users to resolve cross-project UID mismatches
        if (collectionName === 'users') {
          if (data.email) {
            // Find if this user exists in Ops under a different UID but same email
            const opsUsersRef = collection(opsDb, 'users');
            const q = query(opsUsersRef, where('email', '==', data.email));
            const querySnapshot = await getDocs(q);
            
            if (!querySnapshot.empty) {
              // Match found! Merge into the existing Ops user's document ID
              const opsDocId = querySnapshot.docs[0].id;
              const actualTargetRef = doc(opsDb, 'users', opsDocId);
              await setDoc(actualTargetRef, data, { merge: true });
              successCount++;
              console.log(`[SUCCESS] Merged Fleet user into Ops user (matched by email: ${data.email})`);
              continue; // Skip the rest of the loop for this document
            }
          }
          
          // Fallback: If no email match, or email missing, write using the fleet docId
          const existingDoc = await getDoc(targetDocRef);
          if (existingDoc.exists()) {
             await setDoc(targetDocRef, data, { merge: true });
             successCount++;
             console.log(`[SUCCESS] Merged existing user by ID ${docId}`);
          } else {
             await setDoc(targetDocRef, data);
             successCount++;
             console.log(`[SUCCESS] Migrated new user ${docId}`);
          }
        } else {
          // Normal logic for non-user collections
          const existingDoc = await getDoc(targetDocRef);
          if (existingDoc.exists()) {
            console.warn(`[WARNING] Document ${docId} already exists in [${collectionName}]. Skipping.`);
            skippedCount++;
          } else {
            await setDoc(targetDocRef, data);
            successCount++;
            console.log(`[SUCCESS] Migrated ${docId} to [${collectionName}]`);
          }
        }
      } catch (docError) {
        console.error(`[ERROR] Failed to migrate doc ${docId}:`, docError.message);
        errorCount++;
      }
    }

    console.log(`\n--- Summary for [${collectionName}] ---`);
    console.log(`Total Found: ${querySnapshot.size}`);
    console.log(`Successfully Migrated: ${successCount}`);
    console.log(`Skipped (Already Exists): ${skippedCount}`);
    console.log(`Errors: ${errorCount}`);

  } catch (error) {
    console.error(`[FATAL ERROR] Could not read collection ${collectionName}:`, error);
  }
}

async function runMigration() {
  const email = process.argv[2];
  const password = process.argv[3];

  if (!email || !password) {
    console.error('\n[ERROR] Missing credentials!');
    console.error('Usage: node scripts/migrate-fleet-to-ops.js <email> <password>\n');
    process.exit(1);
  }

  console.log('Authenticating with Fleet database...');
  const fleetAuth = getAuth(fleetApp);
  const opsAuth = getAuth(opsApp);

  try {
    await signInWithEmailAndPassword(fleetAuth, email, password);
    console.log('✔ Successfully logged into Fleet database.');
    
    console.log('Authenticating with Ops database...');
    await signInWithEmailAndPassword(opsAuth, email, password);
    console.log('✔ Successfully logged into Ops database.\n');
  } catch (authError) {
    console.error('\n[FATAL ERROR] Authentication failed! Check your email/password or ensure you have an account on both platforms.');
    console.error(authError.message);
    process.exit(1);
  }

  console.log('Initiating Fleet -> Ops Data Migration...\n');
  
  for (const coll of collectionsToMigrate) {
    await migrateCollection(coll);
  }

  console.log('\nMigration script finished completely.');
  process.exit(0);
}

runMigration();
