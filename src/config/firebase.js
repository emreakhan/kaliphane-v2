// src/config/firebase.js

import { initializeApp, getApps, getApp } from "firebase/app";
import { 
    getFirestore, 
    collection, 
    getDocs, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    doc, 
    onSnapshot, 
    query, 
    where, 
    setDoc,
    arrayUnion,
    increment,
    orderBy,
    limit // YENİ EKLENDİ
} from "firebase/firestore";
import { 
    getAuth, 
    signInWithCustomToken, 
    signInAnonymously, 
    onAuthStateChanged 
} from "firebase/auth";
import { 
    getStorage, 
    ref, 
    uploadBytes, 
    getDownloadURL 
} from "firebase/storage";

// --- FİREBASE KONFİGÜRASYONU ---
const firebaseConfig = {
  apiKey: "AIzaSyA-xtCT_i8uf9yMRXgy6fA3YJuJ4uGbV-I",
  authDomain: "kaliphane-v2.firebaseapp.com",
  projectId: "kaliphane-v2",
  storageBucket: "kaliphane-v2.firebasestorage.app",
  messagingSenderId: "672464221781",
  appId: "1:672464221781:web:2ff1d25f4490c4d56306dc",
  measurementId: "G-80GKBHFELZ"
};

// Uygulamayı Başlat
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Servisleri Başlat
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

// Dışa Aktarmalar
export { 
    db, 
    auth, 
    storage, 
    collection, 
    getDocs, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    doc, 
    onSnapshot, 
    query, 
    where, 
    setDoc, 
    signInWithCustomToken, 
    signInAnonymously, 
    onAuthStateChanged,
    ref,
    uploadBytes,
    getDownloadURL,
    arrayUnion,
    increment,
    orderBy,
    limit // YENİ EKLENDİ
};