import { auth, db } from "./firebase-config.js";
import {
  setPersistence, browserLocalPersistence, browserSessionPersistence,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile,
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const HOME = { passenger: "customer.html", management: "management.html", driver: "checkin.html" };

const $ = (id) => document.getElementById(id);
let tab = "passenger";
let mode = "login";
let busy = false;

function render() {
  const isPassenger = tab === "passenger";
  $("tab-passenger").setAttribute("aria-selected", isPassenger);
  $("tab-management").setAttribute("aria-selected", !isPassenger);
  $("modes").hidden = !isPassenger;
  if (!isPassenger) mode = "login";
  $("mode-login").setAttribute("aria-selected", mode === "login");
  $("mode-signup").setAttribute("aria-selected", mode === "signup");
  $("name-field").hidden = mode !== "signup";
  $("hint").hidden = isPassenger;
  $("submit").textContent = mode === "signup" ? "Create account" : "Log in";
  $("password").autocomplete = mode === "signup" ? "new-password" : "current-password";
  $("msg").textContent = "";
}

$("tab-passenger").onclick = () => { tab = "passenger"; render(); };
$("tab-management").onclick = () => { tab = "management"; render(); };
$("mode-login").onclick = () => { mode = "login"; render(); };
$("mode-signup").onclick = () => { mode = "signup"; render(); };

async function getRole(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data().role : null;
}

function friendly(err) {
  const map = {
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/email-already-in-use": "An account with this email already exists. Log in instead.",
    "auth/weak-password": "Use a password of at least 6 characters.",
    "auth/too-many-requests": "Too many attempts. Wait a few minutes and try again.",
    "auth/network-request-failed": "No connection. Check your internet and try again."
  };
  return map[err.code] || err.message;
}

async function submit() {
  if (busy) return;
  const email = $("email").value.trim();
  const password = $("password").value;
  const name = $("name").value.trim();
  if (!email || !password) return ($("msg").textContent = "Enter your email and password.");
  if (mode === "signup" && !name) return ($("msg").textContent = "Enter your full name.");

  busy = true;
  $("submit").disabled = true;
  $("msg").textContent = "";

  try {
    await setPersistence(auth, $("remember").checked ? browserLocalPersistence : browserSessionPersistence);

    if (mode === "signup") {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: name });
      await setDoc(doc(db, "users", cred.user.uid), {
        uid: cred.user.uid,
        email,
        displayName: name,
        role: "passenger",
        createdAt: serverTimestamp()
      });
      return (location.href = HOME.passenger);
    }

    const cred = await signInWithEmailAndPassword(auth, email, password);
    const role = await getRole(cred.user.uid);
    const allowed = tab === "passenger" ? role === "passenger" : role === "management" || role === "driver";
    
    if (!allowed) {
      await signOut(auth);
      throw {
        message: tab === "passenger"
          ? "This account is not a passenger account. Use the Management tab."
          : "This account does not have management access."
      };
    }
    location.href = HOME[role];
  } catch (err) {
    $("msg").textContent = friendly(err);
  } finally {
    busy = false;
    $("submit").disabled = false;
  }
}

$("submit").onclick = submit;
document.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });

onAuthStateChanged(auth, async (user) => {
  if (!user || busy) return;
  const role = await getRole(user.uid);
  if (role && HOME[role]) location.href = HOME[role];
});

render();
