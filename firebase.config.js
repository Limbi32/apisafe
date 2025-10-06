import { initializeApp } from "firebase/app";
import { getAuth, initializeAuth, getReactNativePersistence } from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";

const firebaseConfig = {
  apiKey: "AIzaSyDq_-nv_5NoZ06ujjT2VG4pxT0FGshJ7kE",
  authDomain: "safeland02-201f5.firebaseapp.com",
  projectId: "safeland02-201f5",
  storageBucket: "safeland02-201f5.firebasestorage.app",
  messagingSenderId: "1033048565404",
  appId: "1:1033048565404:web:1fc12785b9f395cf312f59",
  measurementId: "G-KR5R5FM347"
};

const app = initializeApp(firebaseConfig);

export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
  });

export default app;