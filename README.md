# 🚌 Pleasure Travels and Logistics - Booking System

**Developed by [@uchihazeno06-pixel](https://github.com/uchihazeno06-pixel) (BuildWithZeno)**

A custom, automated booking system designed specifically for Pleasure Travels' Bowen University operations. This system replaces manual Google Forms, stops overbooking, automates payments, and provides drivers with accurate passenger manifests via a QR code check-in system.

## ✨ Features

*   **Live Seat Selection:** Interactive map where students see exactly which seats are available in real-time.
*   **Overbooking Prevention:** Automatic "Sold Out" lock when a bus reaches full capacity.
*   **Dynamic Pricing:** Route-based pricing (Abuja, Lagos, Ilorin, etc.).
*   **Passenger Details:** Collects name, phone, drop-off address, and number of bags.
*   **Payment Integration:** 
    *   **Paystack:** Instant online card/bank payments.
    *   **Manual Transfer:** Displays bank details and allows students to upload payment receipts for admin approval.
*   **QR Code Check-In:** Unique QR codes are generated for confirmed bookings to prevent strangers from boarding.
*   **Mobile-First Design:** Works perfectly on all smartphone devices.

## 🛠️ Tech Stack

*   **Frontend:** HTML5, CSS3, Vanilla JavaScript
*   **Backend / Database:** Firebase (Firestore, Authentication, Storage)
*   **Payments:** Paystack API
*   **Libraries:** `qrcodejs` (for ticket generation)

## 📂 Project Structure

*   `index.html` - The main login and signup page for passengers and management.
*   `customer.html` - The main booking page (seat selection, payment, ticket).
*   `customer.js` - Handles the logic for fetching trips, reserving seats, and processing payments.
*   `firebase-config.js` - Configuration file for Firebase and Paystack keys.
*   *(Note: `styles.css`, `auth.js`, `admin.html`, and `driver.html` are currently in development).*

## 🚀 How to Run (Local Setup)

Because this project uses Firebase and Paystack, you need to configure your API keys before it will work.

1. **Clone the repository:**
   ```bash
   git clone https://github.com/uchihazeno06-pixel/Pleasure-Travels.git
   cd Pleasure-Travels
