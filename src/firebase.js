// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

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

export { auth, db, app };
