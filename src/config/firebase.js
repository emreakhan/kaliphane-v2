/* global __app_id, __firebase_config, __initial_auth_token */
// src/config/firebase.js

// Firebase importları (Eski dosyadan KESİP buraya taşıyın)
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, onSnapshot, getDocs, setDoc, query, updateDoc, deleteDoc, where } from 'firebase/firestore';

// --- CONFIGURATION & CONSTANTS ---
const appId = typeof __app_id !== 'undefined' ?
    __app_id : 'default-app-id';
const firebaseConfig = {
  apiKey: "AIzaSyA-xtCT_i8uf9yMRXgy6fA3YJuJ4uGbV-I",
  authDomain: "kaliphane-v2.firebaseapp.com",
  projectId: "kaliphane-v2",
  storageBucket: "kaliphane-v2.firebasestorage.app",
  messagingSenderId: "672464221781",
  appId: "1:672464221781:web:2ff1d25f4490c4d56306dc",
  measurementId: "G-80GKBHFELZ"
};
export const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// --- DÜZELTME: EKSİK SABİTLER EKLENDİ ---
// (Bu sabitler artık veritabanı ile doğrudan ilgili olduğu için burada durmaları daha mantıklı)
export const PROJECT_COLLECTION = `artifacts/${appId}/public/data/moldProjects`;
export const PERSONNEL_COLLECTION = `artifacts/${appId}/public/data/personnel`;
export const MACHINES_COLLECTION = `artifacts/${appId}/public/data/machines`;
export const MOLD_NOTES_COLLECTION = `artifacts/${appId}/public/data/moldNotes`; // YENİ: Notlar için
// --- DÜZELTME SONU ---


// --- FIREBASE BAŞLATMA ---
// (Bu kodları da eski dosyadan KESİP buraya taşıyın)

// Firebase'i başlat
const app = initializeApp(firebaseConfig);

// Firestore (Veritabanı) ve Auth (Kullanıcı) servislerini başlat
const db = getFirestore(app);
const auth = getAuth(app);

// Diğer dosyaların kullanabilmesi için db ve auth'u export et
export { 
    db, 
    auth, 
    
    // Firestore fonksiyonlarını da buradan export edebiliriz (opsiyonel ama temiz)
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