import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBrMsxAxhZdDxoREzPXa-EIClzT_Yib_i4",
  authDomain: "pleasure-travels-6b1e1.firebaseapp.com",
  projectId: "pleasure-travels-6b1e1",
  storageBucket: "pleasure-travels-6b1e1.firebasestorage.app",
  messagingSenderId: "722870538678",
  appId: "1:722870538678:web:33f67adf4a94194885f117"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

export const PAYSTACK_PUBLIC_KEY = "pk_test_69f1489c6b34f5e1b4b7c7e5c9f4e1b6f2c8a3d9";

export const BANK_DETAILS = {
  bank: "Globus Bank",
  accountName: "Pleasure Travels and Logistics",
  accountNumber: "0000000000"
};
