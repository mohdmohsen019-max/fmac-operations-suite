import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const xlsx = require('xlsx');
const fs = require('fs');
const { initializeApp } = require('firebase/app');
const { getFirestore, initializeFirestore, collection, setDoc, doc, getDocs, deleteDoc } = require('firebase/firestore');

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
const db = initializeFirestore(app, {
  experimentalForceLongPolling: true
});

try {
  const filePath = 'C:\\Users\\HP\\Desktop\\Players Data (13).xlsx';
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  const data = xlsx.utils.sheet_to_json(sheet);
  
  const mappedData = data.map((row) => {
    // Find keys case-insensitively
    const findValue = (possibleNames) => {
      const key = Object.keys(row).find(k => 
        possibleNames.some(name => k.toLowerCase().trim() === name.toLowerCase())
      );
      return key ? row[key] : null;
    };

    const id = findValue(['id', 'player id', 'student id', 'id number']) || `FMAC-V2-${Math.floor(Math.random() * 10000)}`;
    const name = findValue(['name', 'player name', 'full name', 'student name']) || 'Unknown Name';
    const rawSports = findValue(['sports', 'sport', 'discipline']) || '';
    const coach = findValue(['coach', 'coach name', 'trainer']) || 'N/A';
    
    // Helper to convert Excel decimal time (e.g. 0.6875) to "04:30 PM"
    const convertExcelTime = (val) => {
      if (val === undefined || val === null || val === '') return '';
      if (typeof val === 'string' && val.includes(':')) return val.trim();
      const totalMinutes = Math.round(parseFloat(val) * 24 * 60);
      const hours24 = Math.floor(totalMinutes / 60) % 24;
      const minutes = totalMinutes % 60;
      const period = hours24 >= 12 ? 'PM' : 'AM';
      const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
      return `${String(hours12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${period}`;
    };

    let fromTime = convertExcelTime(findValue(['training from time', 'from time', 'start time']));
    let toTime = convertExcelTime(findValue(['training to time', 'to time', 'end time']));
    let classTiming = (fromTime || toTime) ? `${fromTime} - ${toTime}` : 'N/A';
    
    const sportsArray = String(rawSports)
      .split(/[,\n]/)
      .map(s => s.trim())
      .filter(Boolean);
      
    return {
      id,
      name,
      sports: sportsArray,
      classTiming,
      coach,
      source: 'v2'
    };
  });

  // Function to upload to Firestore
  const uploadToFirestore = async (players) => {
    try {
      console.log("Starting Firestore upload for players_v2...");
      
      const querySnapshot = await getDocs(collection(db, "players_v2"));
      if (querySnapshot.size > 0) {
        console.log(`Found ${querySnapshot.size} existing players in v2 collection to delete.`);
        for (const d of querySnapshot.docs) {
          await deleteDoc(d.ref);
        }
        console.log("Cleared existing players_v2.");
      }

      let count = 0;
      for (const player of players) {
        // Use the Excel ID as the document ID if available, otherwise slugify the name
        const docId = player.id ? String(player.id).replace(/\//g, '-') : `v2-${count}`;
        await setDoc(doc(db, "players_v2", String(docId)), player);
        count++;
        if (count % 10 === 0) console.log(`Uploaded ${count}/${players.length} players...`);
      }
      console.log("Upload complete!");
      process.exit(0);
    } catch (err) {
      console.error("Upload failed with error:", err);
      process.exit(1);
    }
  };

  if (process.argv.includes('--upload')) {
    uploadToFirestore(mappedData);
  } else {
    console.log("Run with --upload flag to sync with Firebase Firestore 'players_v2' collection.");
    console.log(`Successfully mapped ${mappedData.length} players ready for upload.`);
  }
} catch (error) {
  console.error("Error:", error);
}
