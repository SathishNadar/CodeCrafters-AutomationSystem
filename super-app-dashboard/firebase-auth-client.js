const { firebaseApp } = require('./firebase-client');
const {
    initializeAuth,
    browserLocalPersistence,
    indexedDBLocalPersistence,
    browserPopupRedirectResolver,
    GoogleAuthProvider
} = require('firebase/auth/web-extension');

const auth = initializeAuth(firebaseApp, {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence],
    popupRedirectResolver: browserPopupRedirectResolver
});

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

module.exports = { auth, googleProvider };
