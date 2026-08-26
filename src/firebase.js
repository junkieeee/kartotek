// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCVzVV69LCglpvwFBGlD-hf246-xlcn0LU",
  authDomain: "kartotek-47137.firebaseapp.com",
  projectId: "kartotek-47137",
  storageBucket: "kartotek-47137.firebasestorage.app",
  messagingSenderId: "23983300712",
  appId: "1:23983300712:web:408a776e75509316969bdd"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export Auth and Firestore instances to use them in other components
export const auth = getAuth(app);
export const db = getFirestore(app);