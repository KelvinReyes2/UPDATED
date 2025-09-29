// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBGBgq5alDf1i_Ey5D8YE_N3D0s3bo1vq4",
  authDomain: "ticketeaseapp.firebaseapp.com",
  projectId: "ticketeaseapp",
  storageBucket: "ticketeaseapp.appspot.com",
  messagingSenderId: "997356481422",
  appId: "1:997356481422:web:88ca6150e8efb9bb3592df",
};

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);
const db = getFirestore(app);

// Enable offline persistence for better cross-tab real-time updates
enableIndexedDbPersistence(db, {
  synchronizeTabs: true // Enable multi-tab synchronization
}).catch((err) => {
  if (err.code === 'failed-precondition') {
    // Multiple tabs open, persistence can only be enabled in one tab at a time.
    console.warn('Firestore persistence failed: Multiple tabs open. Only one tab can have persistence enabled.');
  } else if (err.code === 'unimplemented') {
    // The current browser doesn't support persistence
    console.warn('Firestore persistence is not supported in this browser.');
  } else {
    console.error('Error enabling Firestore persistence:', err);
  }
});

export { auth, db, app };