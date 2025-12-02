// src/config/firebase.js

import { initializeApp } from 'firebase/app';
import { 
    getAuth, 
    signInAnonymously, 
    signInWithCustomToken, 
    onAuthStateChanged 
} from 'firebase/auth';
import { 
    getFirestore, 
    collection, 
    doc, 
    onSnapshot, 
    getDocs, 
    setDoc,
    addDoc, // <-- EKLENDİ
    query, 
    updateDoc, 
    deleteDoc, 
    where 
} from 'firebase/firestore';
import { 
    getStorage, 
    ref, 
    uploadBytes, 
    getDownloadURL 
} from 'firebase/storage';

// --- FIREBASE AYARLARI ---
const firebaseConfig = {
  apiKey: "AIzaSyA-xtCT_i8uf9yMRXgy6fA3YJuJ4uGbV-I",
  authDomain: "kaliphane-v2.firebaseapp.com",
  projectId: "kaliphane-v2",
  storageBucket: "kaliphane-v2.firebasestorage.app",
  messagingSenderId: "672464221781",
  appId: "1:672464221781:web:2ff1d25f4490c4d56306dc",
  measurementId: "G-80GKBHFELZ"
};

// --- FIREBASE BAŞLATMA ---
const app = initializeApp(firebaseConfig);

// Servisleri başlat
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app); 

// Diğer dosyaların kullanabilmesi için export et
export { 
    db, 
    auth, 
    storage, 
    
    // Firestore fonksiyonları
    collection,
    doc, 
    onSnapshot, 
    getDocs, 
    setDoc,
    addDoc,
    query, 
    updateDoc, 
    deleteDoc, 
    where,
    
    // Storage fonksiyonları
    ref,
    uploadBytes,
    getDownloadURL,

    // Auth fonksiyonları
    signInAnonymously,
    signInWithCustomToken,
    onAuthStateChanged
};