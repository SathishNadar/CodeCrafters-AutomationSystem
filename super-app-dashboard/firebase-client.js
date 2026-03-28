const { initializeApp } = require('firebase/app');
const { getFirestore } = require('firebase/firestore');

const firebaseConfig = {
    apiKey: "AIzaSyBOo_2MQMu28kRXFrtcQYYc54M15_C057I",
    authDomain: "automationsystem-atrangss.firebaseapp.com",
    projectId: "automationsystem-atrangss",
    storageBucket: "automationsystem-atrangss.firebasestorage.app",
    messagingSenderId: "145891927022",
    appId: "1:145891927022:web:c1a7de76e2e19aa2b164ff",
    measurementId: "G-4WE31T1HN1"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

module.exports = { firebaseApp, firebaseConfig, db };
