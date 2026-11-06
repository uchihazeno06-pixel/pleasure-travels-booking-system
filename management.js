import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc, getDoc, getDocs, collection, query, where, onSnapshot,
  addDoc, updateDoc, deleteDoc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
const naira = (n) => "NGN " + Number(n || 0).toLocaleString("en-NG");
const state = {
  user: null,
  routes: {}, vehicles: {}, trips: {}, bookings: [],
  selectedTrip: null
};

onAuthStateChanged(auth, async (user) => {
  if (!user) return (location.href = "index.html");
  const snap = await getDoc(doc(db, "users", user.uid));
  if (!snap.exists() || snap.data().role !== "management") return (location.href = "index.html");
  state.user = { uid: user.uid, email: user.email };
  init();
});
$("logout").onclick = async () => { await signOut(auth); location.href = "index.html"; };

document.querySelectorAll("#m-tabs button").forEach((b) => {
  b.onclick = () => {
    document.querySelectorAll("#m-tabs button").forEach((x) => x.setAttribute("aria-selected", "false"));
    b.setAttribute("aria-selected", "true");
    document.querySelectorAll(".m-panel").forEach((p) => (p.hidden = true));
    $("panel-" + b.dataset.tab).hidden = false;
  };
});

function init() {
  onSnapshot(doc(db, "settings", "season"), (s) => {
    const d = s.exists() ? s.data() : {};
    $("season-line").textContent = d.pickup ? d.pickup + " | " + (d.start || "?") + " to " + (d.end || "?") : "Season not configured";
    $("s-pickup").value = d.pickup || "";
    $("s-start").value = d.start || "";
    $("s-end").value = d.end || "";
  });

  onSnapshot(collection(db, "routes"), (s) => {
    state.routes = {};
    s.forEach((d) => (state.routes[d.id] = { id: d.id, ...d.data() }));
    renderRoutes();
    renderTrips();
  });

  onSnapshot(collection(db, "vehicles"), (s) => {
    state.vehicles = {};
    s.forEach((d) => (state.vehicles[d.id] = { id: d.id, ...d.data() }));
    renderVehicles();
    renderTrips();
  });

  onSnapshot(collection(db, "trips"), (s) => {
    state.trips = {};
    s.forEach((d) => (state.trips[d.id] = { id: d.id, ...d.data() }));
    renderTrips();
    renderDispatch();
  });

  onSnapshot(collection(db, "bookings"), (s) => {
    state.bookings = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderPayments();
    renderDispatch();
    if (state.selectedTrip) renderManifest(state.selectedTrip);
  });
}

function renderRoutes() {
  const rows = Object.values(state.routes);
  $("routes-list").innerHTML = rows.length
    ? rows.map((r) => '<div class="m-row"><div><strong>' + r.label + '</strong><br><span class="mono">' + naira(r.price) + ' | ' + (r.active ? "Active" : "Inactive") + '</span></div><div class="m-actions"><button class="btn-sm outline" data-edit-route="' + r.id + '">Edit</button><button class="btn-sm outline" data-del-route="' + r.id + '">Delete</button></div></div>').join("")
    : '<p class="hint">No routes yet. Add one to get started.</p>';
  $("routes-list").onclick = (e) => {
    const ed = e.target.closest("[data-edit-route]");
    const dl = e.target.closest("[data-del-route]");
    if (ed) openRouteModal(state.routes[ed.dataset.editRoute]);
    if (dl && confirm("Delete this route?")) deleteDoc(doc(db, "routes", dl.dataset.delRoute));
  };
}

$("add-route").onclick = () => openRouteModal(null);
function openRouteModal(route) {
  openModal(route ? "Edit route" : "Add route",
    '<div class="field"><label>Label</label><input type="text" id="f-label" value="' + (route?.label || "") + '" placeholder="e.g. Lagos - Lekki"></div>' +
    '<div class="field"><label>Price</label><input type="number" id="f-price" value="' + (route?.price || "") + '"></div>' +
    '<label class="check"><input type="checkbox" id="f-active" ' + (route ? (route.active ? "checked" : "") : "checked") + '> Active (visible to passengers)</label>',
    async () => {
      const label = $("f-label").value.trim();
      const price = Number($("f-price").value);
      const active = $("f-active").checked;
      if (!label || !price) throw new Error("Label and price are required.");
      const data = { label, price, active };
      if (route) await updateDoc(doc(db, "routes", route.id), data);
      else await addDoc(collection(db, "routes"), data);
    });
}

function renderVehicles() {
  const rows = Object.values(state.vehicles);
  $("vehicles-list").innerHTML = rows.length
    ? rows.map((v) => '<div class="m-row"><div><strong>' + v.type + '</strong><br><span class="mono">' + v.totalSeats + ' seats | ' + ((v.zones || []).join(", ") || "-") + '</span></div><div class="m-actions"><button class="btn-sm outline" data-edit-veh="' + v.id + '">Edit</button><button class="btn-sm outline" data-del-veh="' + v.id + '">Delete</button></div></div>').join("")
    : '<p class="hint">No vehicles yet.</p>';
  $("vehicles-list").onclick = (e) => {
    const ed = e.target.closest("[data-edit-veh]");
    const dl = e.target.closest("[data-del-veh]");
    if (ed) openVehicleModal(state.vehicles[ed.dataset.editVeh]);
    if (dl && confirm("Delete this vehicle?")) deleteDoc(doc(db, "vehicles", dl.dataset.delVeh));
  };
}

$("add-vehicle").onclick = () => openVehicleModal(null);
function openVehicleModal(v) {
  openModal(v ? "Edit vehicle" : "Add vehicle",
    '<div class="field"><label>Type name</label><input type="text" id="f-type" value="' + (v?.type || "") + '" placeholder="e.g. Hiace bus"></div>' +
    '<div class="field"><label>Total seats</label><input type="number" id="f-seats" value="' + (v?.totalSeats || "") + '"></div>' +
    '<div class="field"><label>Zones (comma separated)</label><input type="text" id="f-zones" value="' + ((v?.zones || []).join(", ")) + '" placeholder="e.g. Front, Middle, Back"></div>',
    async () => {
      const type = $("f-type").value.trim();
      const totalSeats = Number($("f-seats").value);
      const zones = $("f-zones").value.split(",").map((s) => s.trim()).filter(Boolean);
      if (!type || !totalSeats) throw new Error("Type and total seats are required.");
      const data = { type, totalSeats, zones };
      if (v) await updateDoc(doc(db, "vehicles", v.id), data);
      else await addDoc(collection(db, "vehicles"), data);
    });
}

function renderTrips() {
  const rows = Object.values(state.trips).sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  $("trips-list").innerHTML = rows.length
    ? rows.map((t) => {
        const r = state.routes[t.routeId];
        const v = state.vehicles[t.vehicleId];
        return '<div class="m-row"><div><strong>' + (r?.label || "Unknown route") + '</strong><br><span class="mono">' + (v?.type || "?") + ' | ' + t.date + ' | ' + (t.bookedSeats || []).length + '/' + (v?.totalSeats || 0) + ' seats | ' + (t.active ? "Active" : "Inactive") + '</span></div><div class="m-actions"><button class="btn-sm outline" data-edit-trip="' + t.id + '">Edit</button><button class="btn-sm outline" data-del-trip="' + t.id + '">Delete</button></div></div>';
      }).join("")
    : '<p class="hint">No trips scheduled yet.</p>';
  $("trips-list").onclick = (e) => {
    const ed = e.target.closest("[data-edit-trip]");
    const dl = e.target.closest("[data-del-trip]");
    if (ed) openTripModal(state.trips[ed.dataset.editTrip]);
    if (dl && confirm("Delete this trip?")) deleteDoc(doc(db, "trips", dl.dataset.delTrip));
  };
}

$("add-trip").onclick = () => openTripModal(null);
function openTripModal(t) {
  const routeOpts = Object.values(state.routes).map((r) => '<option value="' + r.id + '" ' + (t?.routeId === r.id ? "selected" : "") + '>' + r.label + '</option>').join("");
  const vehOpts = Object.values(state.vehicles).map((v) => '<option value="' + v.id + '" ' + (t?.vehicleId === v.id ? "selected" : "") + '>' + v.type + ' (' + v.totalSeats + ' seats)</option>').join("");
  openModal(t ? "Edit trip" : "Create trip",
    '<div class="field"><label>Route</label><select id="f-route">' + (routeOpts || '<option value="">No routes yet</option>') + '</select></div>' +
    '<div class="field"><label>Vehicle</label><select id="f-veh">' + (vehOpts || '<option value="">No vehicles yet</option>') + '</select></div>' +
    '<div class="field"><label>Date</label><input type="date" id="f-date" value="' + (t?.date || "") + '"></div>' +
    '<label class="check"><input type="checkbox" id="f-tactive" ' + (t ? (t.active ? "checked" : "") : "checked") + '> Active (bookable by passengers)</label>',
    async () => {
      const routeId = $("f-route").value;
      const vehicleId = $("f-veh").value;
      const date = $("f-date").value;
      const active = $("f-tactive").checked;
      if (!routeId || !vehicleId || !date) throw new Error("Route, vehicle and date are required.");
      const data = { routeId, vehicleId, date, active };
      if (t) await updateDoc(doc(db, "trips", t.id), data);
      else await addDoc(collection(db, "trips"), { ...data, bookedSeats: [] });
    });
}

function renderPayments() {
  const pending = state.bookings.filter((b) => b.paymentMethod === "manual" && b.paymentStatus === "Pending");
  const decided = state.bookings.filter((b) => b.paymentMethod === "manual" && b.paymentStatus !== "Pending");

  const pendingHtml = pending.length
    ? pending.map((b) => '<div class="m-row"><div><strong>' + b.name + ' - seat ' + b.seat + '</strong><br><span class="mono">' + b.bookingCode + ' | ' + naira(b.amount) + ' | ' + (b.phone || "") + '</span>' + (b.receiptRef ? '<br><span class="mono">Ref: ' + b.receiptRef + '</span>' : "") + '</div><div class="m-actions"><button class="btn-sm" data-approve="' + b.id + '">Approve</button><button class="btn-sm outline" data-reject="' + b.id + '">Reject</button></div></div>').join("")
    : '<p class="hint">No pending manual payments.</p>';

  const decidedHtml = decided.length
    ? decided.map((b) => '<div class="m-row"><div><strong>' + b.name + ' - seat ' + b.seat + '</strong><br><span class="mono">' + b.bookingCode + ' | ' + naira(b.amount) + ' | ' + b.paymentStatus + '</span></div><div class="m-actions"><button class="btn-sm outline" data-reset="' + b.id + '">Reset to Pending</button></div></div>').join("")
    : '<p class="hint">No decided payments yet.</p>';

  $("payments-list").innerHTML =
    '<h3 style="font:700 1rem var(--font-head);margin:0 0 .5rem">Pending</h3>' + pendingHtml +
    '<h3 style="font:700 1rem var(--font-head);margin:1.5rem 0 .5rem">Decided (can be reset)</h3>' + decidedHtml;

  $("payments-list").onclick = async (e) => {
    const ap = e.target.closest("[data-approve]");
    const rj = e.target.closest("[data-reject]");
    const rs = e.target.closest("[data-reset]");
    if (ap) await updateDoc(doc(db, "bookings", ap.dataset.approve), { paymentStatus: "Approved" });
    if (rj) await updateDoc(doc(db, "bookings", rj.dataset.reject), { paymentStatus: "Rejected" });
    if (rs && confirm("Reset this payment back to Pending?")) await updateDoc(doc(db, "bookings", rs.dataset.reset), { paymentStatus: "Pending" });
  };
}

function renderDispatch() {
  const trips = Object.values(state.trips).sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  $("dispatch").innerHTML = trips.length
    ? trips.map((t) => {
        const r = state.routes[t.routeId];
        const v = state.vehicles[t.vehicleId];
        const booked = (t.bookedSeats || []).length;
        const cap = v?.totalSeats || 0;
        const pct = cap ? Math.round((booked / cap) * 100) : 0;
        const sold = pct >= 100;
        return '<div class="d-card" data-trip="' + t.id + '"><div class="d-route">' + (r?.label || "Unknown") + '</div><div class="d-meta mono">' + (v?.type || "?") + ' | ' + t.date + '</div><div class="cap-bar"><div class="cap-fill ' + (sold ? "sold" : "") + '" style="width:' + pct + '%"></div></div><div class="cap-text mono"><span>' + booked + '/' + cap + ' seats</span><span>' + (sold ? "SOLD OUT" : pct + "%") + '</span></div></div>';
      }).join("")
    : '<p class="hint">No trips yet. Create a trip to see it here.</p>';
  $("dispatch").onclick = (e) => {
    const c = e.target.closest("[data-trip]");
    if (c) { state.selectedTrip = c.dataset.trip; renderManifest(state.selectedTrip); }
  };
}

function renderManifest(tripId) {
  const t = state.trips[tripId];
  if (!t) return;
  const r = state.routes[t.routeId];
  const v = state.vehicles[t.vehicleId];
  const rows = state.bookings.filter((b) => b.tripId === tripId).sort((a, b) => a.seat - b.seat);
  $("manifest").hidden = false;
  $("manifest-title").textContent = (r?.label || "") + " | " + (v?.type || "") + " | " + t.date;
  $("manifest-body").innerHTML = rows.length
    ? '<table class="m-table"><thead><tr><th>Name</th><th>Phone</th><th>Seat</th><th>Bags</th><th>Address</th><th>Payment</th></tr></thead><tbody>' + rows.map((b) => '<tr><td>' + b.name + '</td><td>' + (b.phone || "-") + '</td><td>#' + b.seat + '</td><td>' + (b.bags || 0) + '</td><td>' + (b.address || "-") + '</td><td><span class="tag">' + (b.paymentStatus || "Pending") + '</span></td></tr>').join("") + '</tbody></table>'
    : '<p class="hint">No passengers on this trip yet.</p>';
  $("manifest").scrollIntoView({ behavior: "smooth" });
}
$("close-manifest").onclick = () => { $("manifest").hidden = true; state.selectedTrip = null; };

function currentManifestRows() {
  return state.bookings.filter((b) => b.tripId === state.selectedTrip).sort((a, b) => a.seat - b.seat);
}

$("export-csv").onclick = () => {
  const rows = currentManifestRows();
  if (!rows.length) return alert("No passengers to export.");
  let csv = "Name,Phone,Seat,Bags,Address,Payment\n";
  rows.forEach((b) => { csv += '"' + b.name + '","' + (b.phone || "") + '",' + b.seat + ',' + (b.bags || 0) + ',"' + (b.address || "") + '","' + (b.paymentStatus || "Pending") + '"\n'; });
  download(new Blob([csv], { type: "text/csv" }), "manifest-" + state.selectedTrip + ".csv");
};

$("export-pdf").onclick = async () => {
  const rows = currentManifestRows();
  if (!rows.length) return alert("No passengers to export.");
  await import("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const t = state.trips[state.selectedTrip];
  const r = state.routes[t.routeId];
  const v = state.vehicles[t.vehicleId];
  doc.setFillColor(228, 36, 27);
  doc.rect(0, 0, 210, 16, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.text("PLEASURE TRAVELS AND LOGISTICS", 14, 11);
  doc.setTextColor(20, 20, 20);
  doc.setFontSize(11);
  doc.text("Passenger manifest - " + (r?.label || ""), 14, 26);
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text((v?.type || "") + " | " + t.date + " | " + rows.length + " passengers", 14, 32);
  let y = 44;
  doc.setTextColor(120, 120, 120);
  doc.text("NAME", 14, y);
  doc.text("PHONE", 74, y);
  doc.text("SEAT", 116, y);
  doc.text("BAGS", 134, y);
  doc.text("ADDRESS", 154, y);
  y += 3;
  doc.setDrawColor(230, 225, 216);
  doc.line(14, y, 196, y);
  y += 6;
  doc.setTextColor(20, 20, 20);
  rows.forEach((b) => {
    doc.text(String(b.name).slice(0, 26), 14, y);
    doc.text(String(b.phone || ""), 74, y);
    doc.text("#" + b.seat, 116, y);
    doc.text(String(b.bags || 0), 134, y);
    doc.text(String(b.address || "").slice(0, 26), 154, y);
    y += 7;
    if (y > 270) { doc.addPage(); y = 20; }
  });
  doc.save("manifest-" + state.selectedTrip + ".pdf");
};

function download(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
}

$("save-season").onclick = async () => {
  const data = { pickup: $("s-pickup").value.trim(), start: $("s-start").value, end: $("s-end").value };
  try {
    await setDoc(doc(db, "settings", "season"), data, { merge: true });
    $("s-msg").textContent = "Saved.";
  } catch (e) { $("s-msg").textContent = e.message; }
};

let modalSave = null;
function openModal(title, html, onSave) {
  $("modal-title").textContent = title;
  $("modal-body").innerHTML = html;
  $("modal-msg").textContent = "";
  $("modal-bg").hidden = false;
  modalSave = onSave;
}
$("modal-cancel").onclick = () => { $("modal-bg").hidden = true; modalSave = null; };
$("modal-save").onclick = async () => {
  if (!modalSave) return;
  try { await modalSave(); $("modal-bg").hidden = true; modalSave = null; }
  catch (e) { $("modal-msg").textContent = e.message; }
};
