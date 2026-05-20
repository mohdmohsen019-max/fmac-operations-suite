import { initializeApp } from "firebase/app";
import { getFirestore, collection, query, where, getDocs, updateDoc, deleteDoc, addDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyB-mUHApk_20yRJsQEKs9--VhZmXpkE3EM",
  authDomain: "fmac-attendance.firebaseapp.com",
  projectId: "fmac-attendance",
  storageBucket: "fmac-attendance.firebasestorage.app",
  messagingSenderId: "79220864890",
  appId: "1:79220864890:web:37c7b292be4cdf5e1288c3",
  measurementId: "G-V89EG3S24N"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const vehicleList = [
  { plate: 'M85750', bus: 'Bus 1', model: 'Toyota Coaster', driver: 'Zahid' },
  { plate: 'M85751', bus: 'Bus 2', model: 'Toyota Coaster', driver: 'Saif Al Rahman' },
  { plate: 'M85759', bus: 'Bus 3', model: 'Toyota Coaster', driver: 'Jamshid' },
  { plate: 'M99268', bus: 'Bus 4', model: 'Toyota Coaster', driver: 'Mohamed Khalifa' },
  { plate: 'C37069', bus: 'Bus 5', model: 'Toyota Hi-Ace', driver: 'Fouad' },
  { plate: 'A21248', bus: 'Bus 6', model: 'Toyota Coaster', driver: 'Manzoor' },
  { plate: 'C37075', bus: 'Bus 7', model: 'Toyota Coaster', driver: 'Kashif' },
  { plate: 'A33867', bus: 'Bus 8', model: 'Toyota Coaster', driver: 'Abdulmalik' },
  { plate: 'A33876', bus: 'Bus 9', model: 'Toyota Coaster', driver: 'Abdulnawaz' },
  { plate: 'C37072', bus: 'Bus 10', model: 'Toyota Coaster', driver: 'Uzair' },
  { plate: 'M99270', bus: 'Bus 11', model: 'Toyota Coaster', driver: 'Tafeel Khan' },
  { plate: 'C37074', bus: 'Bus 12', model: 'Toyota Coaster', driver: 'Shah Fahad' },
  { plate: 'M85756', bus: 'Bus 13', model: 'Toyota Coaster', driver: 'Mohamed Noor' },
  { plate: 'C29769', bus: 'Bus 14', model: 'Toyota Coaster', driver: 'Ziaullah' }
];

async function sync() {
  try {
    console.log('--- STEP 1: DELETE C23530 ---');
    const vRef = collection(db, 'vehicles');
    const qDelete = query(vRef, where('plateNumber', '==', 'C23530'));
    const snapDelete = await getDocs(qDelete);
    for (const doc of snapDelete.docs) {
      await deleteDoc(doc.ref);
      console.log('Deleted C23530 successfully.');
    }

    console.log('\n--- STEP 2: UPDATE VEHICLES ---');
    for (const v of vehicleList) {
      const q = query(vRef, where('plateNumber', '==', v.plate));
      const snap = await getDocs(q);
      if (!snap.empty) {
        await updateDoc(snap.docs[0].ref, {
          busNumber: v.bus,
          driverName: v.driver,
          makeAndModel: v.model
        });
        console.log(`Updated: ${v.plate} (${v.driver})`);
      } else {
        await addDoc(vRef, {
          plateNumber: v.plate,
          busNumber: v.bus,
          driverName: v.driver,
          makeAndModel: v.model,
          status: 'Active',
          odometer: 0
        });
        console.log(`Created: ${v.plate} (${v.driver})`);
      }
    }
    console.log('\nSync Complete.');
    process.exit(0);
  } catch (err) {
    console.error('Sync failed:', err);
    process.exit(1);
  }
}

sync();
