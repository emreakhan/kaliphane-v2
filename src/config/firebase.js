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
    query, 
    updateDoc, 
    deleteDoc, 
    where 
} from 'firebase/firestore';

// --- FIREBASE AYARLARI ---
// Firebase konsolundan aldığınız kodlar buraya eklendi
const firebaseConfig = {
  apiKey: "AIzaSyA-xtCT_i8uf9yMRXgy6fA3YJuJ4uGbV-I",
  authDomain: "kaliphane-v2.firebaseapp.com",
  projectId: "kaliphane-v2",
  storageBucket: "kaliphane-v2.firebasestorage.app",
  messagingSenderId: "672464221781",
  appId: "1:672464221781:web:2ff1d25f4490c4d56306dc",
  measurementId: "G-80GKBHFELZ"
};

// --- UYGULAMA SABİTLERİ ---
// Eski kodda bu değerler dışarıdan geliyordu, şimdi burada sabitliyoruz.
const appId = 'default-app-id'; 
export const initialAuthToken = null; 

// Veritabanı Koleksiyon Yolları
export const PROJECT_COLLECTION = `artifacts/${appId}/public/data/moldProjects`;
export const PERSONNEL_COLLECTION = `artifacts/${appId}/public/data/personnel`;
export const MACHINES_COLLECTION = `artifacts/${appId}/public/data/machines`;
export const MOLD_NOTES_COLLECTION = `artifacts/${appId}/public/data/moldNotes`;

// --- FIREBASE BAŞLATMA ---
const app = initializeApp(firebaseConfig);

// Servisleri başlat
const db = getFirestore(app);
const auth = getAuth(app);

// Diğer dosyaların kullanabilmesi için export et
export { 
    db, 
    auth, 
    
    // Firestore fonksiyonları
    collection,
    doc, 
    onSnapshot, 
    getDocs, 
    setDoc, 
    query, 
    updateDoc, 
    deleteDoc, 
    where,
    
    // Auth fonksiyonları
    signInAnonymously,
    signInWithCustomToken,
    onAuthStateChanged
};