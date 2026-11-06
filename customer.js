import { auth, db, PAYSTACK_PUBLIC_KEY, BANK_DETAILS } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc, getDoc, getDocs, collection, query, where, onSnapshot,
  runTransaction, updateDoc, arrayUnion, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
const naira = (n) => "NGN " + Number(n || 0).toLocaleString("en-NG");
const state = { user: null, season: null, routes: {}, vehicles: {}, trips: [], trip: null, seat: null, bags: 0, unsub: null };

onAuthStateChanged(auth, async (user) => {
  if (!user) return (location.href = "index.html");
  const snap = await getDoc(doc(db, "users", user.uid));
  if (!snap.exists() || snap.data().role !== "passenger") return (location.href = "index.html");
  state.user = { uid: user.uid, email: user.email, name: snap.data().displayName || "" };
  $("pname").value ||= state.user.name;
  init();
});
$("logout").onclick = async () => { await signOut(auth); location.href = "index.html"; };

async function init() {
  const [season, routes, vehicles] = await Promise.all([
    getDoc(doc(db, "settings", "season")),
    getDocs(query(collection(db, "routes"), where("active", "==", true))),
    getDocs(collection(db, "vehicles"))
  ]);
  state.season = season.exists() ? season.data() : null;
  routes.forEach((d) => (state.routes[d.id] = { id: d.id, ...d.data() }));
  vehicles.forEach((d) => (state.vehicles[d.id] = { id: d.id, ...d.data() }));

  const s = state.season;
  $("hero-title").textContent = s?.pickup ? "Leaving from " + s.pickup : "Book your seat";
  $("hero-sub").textContent = s?.start && s?.end ? "Booking open " + s.start + " to " + s.end : "Booking dates have not been announced yet.";

  $("route").innerHTML = '<option value="">Choose destination</option>' +
    Object.values(state.routes).map((r) => '<option value="' + r.id + '">' + r.label + ' (' + naira(r.price) + ')</option>').join("");
  $("b-bank").textContent = BANK_DETAILS.bank;
  $("b-num").textContent = BANK_DETAILS.accountNumber;
  $("b-name").textContent = BANK_DETAILS.accountName;
  watchMine();
}

$("route").onchange = async () => {
  resetTrip();
  const rid = $("route").value;
  $("date").disabled = $("vehicle").disabled = true;
  if (!rid) return;
  const snap = await getDocs(query(collection(db, "trips"), where("routeId", "==", rid), where("active", "==", true)));
  const today = new Date().toISOString().slice(0, 10);
  const { start, end } = state.season || {};
  state.trips = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .filter((t) => t.date >= today && (!start || t.date >= start) && (!end || t.date <= end));
  const dates = [...new Set(state.trips.map((t) => t.date))].sort();
  $("date").innerHTML = dates.length
    ? '<option value="">Choose a date</option>' + dates.map((d) => '<option>' + d + '</option>').join("")
    : '<option value="">No trips available for this destination</option>';
  $("date").disabled = !dates.length;
};

$("date").onchange = () => {
  resetTrip();
  const opts = state.trips.filter((t) => t.date === $("date").value).map((t) => {
    const v = state.vehicles[t.vehicleId];
    const left = v ? v.totalSeats - (t.bookedSeats || []).length : 0;
    return '<option value="' + t.id + '" ' + (left <= 0 ? "disabled" : "") + '>' + (v ? v.type : "Vehicle") + ' (' + (left <= 0 ? "sold out" : left + " seats left") + ')</option>';
  });
  $("vehicle").innerHTML = '<option value="">Choose vehicle type</option>' + opts.join("");
  $("vehicle").disabled = !opts.length;
};

$("vehicle").onchange = () => {
  resetTrip();
  const t = state.trips.find((x) => x.id === $("vehicle").value);
  if (!t) return;
  state.trip = t;
  $("seat-step").hidden = false;
  state.unsub = onSnapshot(doc(db, "trips", t.id), (snap) => {
    state.trip = { id: snap.id, ...snap.data() };
    if (state.seat && state.trip.bookedSeats.includes(state.seat)) state.seat = null;
    drawSeats(); refresh();
  });
};

function resetTrip() {
  if (state.unsub) state.unsub();
  state.unsub = null; state.trip = null; state.seat = null;
  $("seat-step").hidden = true; $("seatmap").innerHTML = "";
  refresh();
}

function drawSeats() {
  const v = state.vehicles[state.trip.vehicleId];
  if (!v) return;
  const zones = v.zones?.length ? v.zones : ["Seats"];
  const per = Math.ceil(v.totalSeats / zones.length);
  const booked = new Set(state.trip.bookedSeats || []);
  let n = 0, html = "";
  zones.forEach((z) => {
    html += '<div class="zone">' + z + '</div><div class="seats">';
    for (let i = 0; i < per && n < v.totalSeats; i++) {
      n++;
      if (i % 2 === 0 && i % 4 === 2) html += '<span class="aisle"></span>';
      const cls = booked.has(n) ? "seat booked" : n === state.seat ? "seat sel" : "seat";
      html += '<button class="' + cls + '" data-n="' + n + '" ' + (booked.has(n) ? "disabled" : "") + ' aria-label="Seat ' + n + (booked.has(n) ? ", booked" : "") + '">' + (booked.has(n) ? "X" : n) + '</button>';
    }
    html += "</div>";
  });
  $("seatmap").innerHTML = html;
}
$("seatmap").onclick = (e) => {
  const b = e.target.closest(".seat");
  if (!b || b.disabled) return;
  state.seat = Number(b.dataset.n);
  drawSeats(); refresh();
};

$("bag-plus").onclick = () => { state.bags = Math.min(10, state.bags + 1); refresh(); };
$("bag-minus").onclick = () => { state.bags = Math.max(0, state.bags - 1); refresh(); };
document.querySelectorAll("input[name=pm]").forEach((r) => (r.onchange = () => { $("bank").hidden = payMethod() !== "manual"; }));
["pname", "phone", "address", "refund"].forEach((id) => $(id).addEventListener("input", refresh));
const payMethod = () => document.querySelector("input[name=pm]:checked").value;

function price() { return state.routes[$("route").value]?.price || 0; }
function refresh() {
  $("bags").textContent = state.bags;
  $("sum-seat").textContent = state.seat ? "Seat " + state.seat : "No seat selected";
  $("sum-bags").textContent = state.bags + " bag" + (state.bags === 1 ? "" : "s");
  $("sum-price").textContent = naira(state.seat ? price() : 0);
  $("book").disabled = !(state.seat && $("pname").value.trim() && $("refund").checked);
}

const CODE_CHARS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const newCode = () => "PT-" + new Date().getFullYear() + "-" + Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");

async function reserveSeat(data) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newCode();
    const tripRef = doc(db, "trips", state.trip.id);
    const bookRef = doc(db, "bookings", code);
    try {
      await runTransaction(db, async (tx) => {
        const [t, b] = await Promise.all([tx.get(tripRef), tx.get(bookRef)]);
        if (b.exists()) throw { code: "CODE_TAKEN" };
        if (!t.exists() || !t.data().active) throw { code: "TRIP_CLOSED" };
        if ((t.data().bookedSeats || []).includes(data.seat)) throw { code: "SEAT_TAKEN" };
        tx.update(tripRef, { bookedSeats: arrayUnion(data.seat) });
        tx.set(bookRef, { ...data, bookingCode: code, createdAt: serverTimestamp() });
      });
      return code;
    } catch (e) { if (e.code !== "CODE_TAKEN") throw e; }
  }
  throw new Error("Could not create a booking code. Try again.");
}

$("book").onclick = async () => {
  const msg = $("msg"); msg.textContent = "";
  const phone = $("phone").value.trim(), address = $("address").value.trim();
  const method = payMethod();
  if (!phone || !address) return (msg.textContent = "Enter your phone number and drop-off address.");

  $("book").disabled = true; $("book").textContent = "Booking...";
  try {
    const data = {
      userId: state.user.uid, tripId: state.trip.id, seat: state.seat, bags: state.bags,
      name: $("pname").value.trim(), phone, address, amount: price(),
      paymentMethod: method, paymentStatus: "Pending", receiptRef: $("receiptRef").value || "", checkedIn: false, checkedInAt: null
    };
    const code = await reserveSeat(data);
    if (method === "paystack") payWithPaystack(code, data);
    else showTicket(code, data, "Pending", "Seat reserved. It becomes valid for boarding once we confirm your transfer.");
  } catch (e) {
    msg.textContent = { SEAT_TAKEN: "Someone just booked that seat. Pick another one.", TRIP_CLOSED: "This trip is no longer open for booking." }[e.code] || e.message;
    if (e.code === "SEAT_TAKEN") { state.seat = null; }
  } finally { $("book").textContent = "Book seat"; refresh(); }
};

function payWithPaystack(code, data) {
  PaystackPop.setup({
    key: PAYSTACK_PUBLIC_KEY, email: state.user.email, amount: data.amount * 100, currency: "NGN", ref: code,
    callback: function (res) {
      updateDoc(doc(db, "bookings", code), { paymentStatus: "Paid", paystackRef: res.reference })
        .then(() => showTicket(code, data, "Paid", "Payment received. Show this QR code to the driver when you board."));
    },
    onClose: function () {
      $("msg").innerHTML = 'Payment not completed. Seat ' + data.seat + ' is held for you. <a href="#" id="retry">Try payment again</a>';
      $("retry").onclick = (e) => { e.preventDefault(); payWithPaystack(code, data); };
    }
  }).openIframe();
}

function showTicket(code, data, status, note) {
  $("ticket").hidden = false;
  $("t-title").textContent = (status === "Paid" || status === "Approved") ? "You are booked" : "Booking pending approval";
  $("t-code").textContent = code;
  $("t-detail").textContent = data.name + ", seat " + data.seat;
  $("t-note").textContent = note;
  $("qr").innerHTML = "";
  new QRCode($("qr"), { text: code, width: 180, height: 180, colorDark: "#0A0A0A", colorLight: "#ffffff" });
  $("ticket").scrollIntoView({ behavior: "smooth" });
  $("msg").textContent = "";
}

function watchMine() {
  onSnapshot(query(collection(db, "bookings"), where("userId", "==", state.user.uid)), (snap) => {
    const rows = snap.docs.map((d) => d.data());
    $("mine").innerHTML = rows.length
      ? rows.map((b) => '<li data-c="' + b.bookingCode + '"><span>' + b.bookingCode + ', seat ' + b.seat + '</span><span class="tag">' + b.paymentStatus + (b.checkedIn ? ", boarded" : "") + '</span></li>').join("")
      : "<li>No bookings yet</li>";
    $("mine").onclick = (e) => {
      const li = e.target.closest("li[data-c]");
      const b = rows.find((x) => x.bookingCode === li?.dataset.c);
      if (b) showTicket(b.bookingCode, b, b.paymentStatus, b.paymentStatus === "Rejected" ? "This receipt was rejected. Contact Pleasure Travels." : "Show this QR code to the driver when you board.");
    };
  });
}
