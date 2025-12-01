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
    addDoc, // <-- EKLENDİ (Compile hatasını çözer)
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
// DİKKAT: Buradaki bilgileri kendi Firebase konsolundan alıp güncellemelisin!
const firebaseConfig = {
  apiKey: "AIzaSyA-xtCT_i8uf9yMRXgy6fA3YJuJ4uGbV-I", // <-- BU ANAHTAR GEÇERSİZ OLABİLİR, KENDİNKİNİ KONTROL ET
  authDomain: "kaliphane-v2.firebaseapp.com",
  projectId: "kaliphane-v2",
  storageBucket: "kaliphane-v2.firebasestorage.app",
  messagingSenderId: "672464221781",
  appId: "1:672464221781:web:2ff1d25f4490c4d56306dc",
  measurementId: "G-80GKBHFELZ"
};

// --- UYGULAMA SABİTLERİ ---
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
    addDoc, // <-- DIŞA AKTARILDI (Compile hatasını çözer)
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