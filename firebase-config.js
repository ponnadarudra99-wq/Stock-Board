const firebaseConfig = {
  apiKey: "AIzaSyAQXRn88YcudtjWe2HxwTVI3djqWyi3638",
  authDomain: "stock-board-136a2.firebaseapp.com",
  projectId: "stock-board-136a2",
  storageBucket: "stock-board-136a2.firebasestorage.app",
  messagingSenderId: "820507620404",
  appId: "1:820507620404:web:4d633bb33942b3fda44661"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
console.log("Firebase connected successfully");
