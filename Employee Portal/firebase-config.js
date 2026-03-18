/* ============================================
   Firebase Configuration — Qualium AI
   ============================================ */

const firebaseConfig = {
    apiKey: "AIzaSyDnEkv4FziCDgrJdnI-eYjEsnYw1RpQ9Nk",
    authDomain: "qualium-ai.firebaseapp.com",
    projectId: "qualium-ai",
    storageBucket: "qualium-ai.firebasestorage.app",
    messagingSenderId: "36403666167",
    appId: "1:36403666167:web:121b8caf9fd4d64564c7f2",
    measurementId: "G-36HFF21MH5"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// Auth persistence
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
