import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBIYG1MRBYNUTclk0scB6Pzzj-EGt2f5FA",
  authDomain: "medtrack-f8799.firebaseapp.com",
  projectId: "medtrack-f8799",
  storageBucket: "medtrack-f8799.firebasestorage.app",
  messagingSenderId: "827294236931",
  appId: "1:827294236931:web:e77ad7e827d2920e432936",
  measurementId: "G-CDHQL0HN89"
};


const app = initializeApp(firebaseConfig);


export const auth = getAuth(app);
export const db = getFirestore(app);