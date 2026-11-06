import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc, getDoc, collection, onSnapshot, updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
const state = { user: null, trips: {}, routes: {}, bookings: [], selectedTrip: null, scanner: null };

onAuthStateChanged(auth, async (user) => {
  if (!user) return (location.href = "index.html");
  const snap = await getDoc(doc(db, "users", user.uid));
  const role = snap.exists() ? snap.data().role : null;
  if (role !== "management" && role !== "driver") return (location.href = "index.html");
  state.user = { uid: user.uid };
  init();
});
$("logout").onclick = async () => { await signOut(auth); location.href = "index.html"; };

function init() {
  onSnapshot(collection(db, "routes"), (s) => {
    state.routes = {};
    s.forEach((d) => (state.routes[d.id] = d.data()));
    renderTripDropdown();
  });

  onSnapshot(collection(db, "trips"), (s) => {
    state.trips = {};
    s.forEach((d) => (state.trips[d.id] = { id: d.id, ...d.data() }));
    renderTripDropdown();
  });

  onSnapshot(collection(db, "bookings"), (s) => {
    state.bookings = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderBoarded();
  });
}

function renderTripDropdown() {
  const trips = Object.values(state.trips).sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const current = $("trip").value;
  $("trip").innerHTML = '<option value="">Choose a trip</option>' +
    trips.map((t) => {
      const r = state.routes[t.routeId];
      return '<option value="' + t.id + '"' + (current === t.id ? " selected" : "") + '>' + t.date + " - " + (r?.label || "Unknown") + '</option>';
    }).join("");
  state.selectedTrip = $("trip").value || null;
}

$("trip").onchange = () => { state.selectedTrip = $("trip").value; renderBoarded(); };

$("start-scan").onclick = () => {
  if (state.scanner) return;
  $("start-scan").hidden = true;
  $("stop-scan").hidden = false;
  state.scanner = new Html5Qrcode("qr-reader");
  state.scanner.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: { width: 250, height: 250 } },
    (text) => { stopScan(); verify(text); },
    () => {}
  ).catch(() => {
    $("start-scan").hidden = false;
    $("stop-scan").hidden = true;
    state.scanner = null;
    alert("Camera unavailable. Use manual entry below.");
  });
};

$("stop-scan").onclick = stopScan;

function stopScan() {
  if (!state.scanner) return;
  state.scanner.stop().then(() => state.scanner.clear()).catch(() => {});
  state.scanner = null;
  $("start-scan").hidden = false;
  $("stop-scan").hidden = true;
}

$("manual-check").onclick = () => verify($("manual").value);

async function verify(code) {
  const result = $("result");
  code = (code || "").trim().toUpperCase();
  if (!code) return;
  if (!state.selectedTrip) { result.innerHTML = err("Select a trip above first."); return; }

  const snap = await getDoc(doc(db, "bookings", code));
  if (!snap.exists()) { result.innerHTML = err("Booking code " + code + " not found."); return; }
  const b = snap.data();

  if (b.tripId !== state.selectedTrip) {
    result.innerHTML = err(b.name + " is booked for a different trip.");
    return;
  }
  if (b.paymentStatus !== "Paid" && b.paymentStatus !== "Approved") {
    result.innerHTML = err(b.name + "'s payment is not confirmed (" + b.paymentStatus + ").");
    return;
  }
  if (b.checkedIn) {
    const time = b.checkedInAt?.toDate ? b.checkedInAt.toDate().toLocaleTimeString() : "earlier";
    result.innerHTML = err(b.name + " (seat " + b.seat + ") already boarded at " + time + ".");
    return;
  }

  await updateDoc(doc(db, "bookings", code), { checkedIn: true, checkedInAt: serverTimestamp() });

  result.innerHTML = '<div class="ticket" style="border-color:#2F8F46;background:#e8f5e9">' +
    '<h2 style="color:#2F8F46">VERIFIED</h2>' +
    '<p style="font:600 1.05rem var(--font-body);margin:.5rem 0">' + b.name + '</p>' +
    '<p class="mono">Seat ' + b.seat + ' | ' + (b.bags || 0) + ' bag(s)</p>' +
    '<p class="hint">' + (b.address || "") + '</p></div>';
  $("manual").value = "";
}

function err(msg) {
  return '<div class="ticket" style="border-color:var(--red);background:#fdecea">' +
    '<h2 style="color:var(--red)">NOT VERIFIED</h2>' +
    '<p style="margin-top:.5rem">' + msg + '</p></div>';
}

function renderBoarded() {
  const rows = state.bookings
    .filter((b) => b.tripId === state.selectedTrip && b.checkedIn)
    .sort((a, b) => (a.checkedInAt?.seconds || 0) - (b.checkedInAt?.seconds || 0));
  $("boarded").innerHTML = rows.length
    ? rows.map((b) => '<li><span>' + b.name + ' - seat ' + b.seat + '</span><span class="tag">OK</span></li>').join("")
    : "<li>No one boarded yet</li>";
}
