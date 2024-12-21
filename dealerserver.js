const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const expressSession = require("express-session");
const { initializeApp } = require("firebase/app");  // Import Firebase initialization
const { getDatabase, ref, get } = require("firebase/database");  // Import required Firebase functions

// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyD21Si1wvV6eje9XrwkkFDcos1_HgSo0pY",
    authDomain: "qrdatabaseapp-f3836.firebaseapp.com",
    databaseURL: "https://qrdatabaseapp-f3836-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "qrdatabaseapp-f3836",
    storageBucket: "qrdatabaseapp-f3836.firebasestorage.app",
    messagingSenderId: "679141882235",
    appId: "1:679141882235:web:72772e91bc2f740e2025de",
    measurementId: "G-5MP3HNH690"
};


// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const dealerRouter = express.Router();

// Middleware for session management
dealerRouter.use(
  expressSession({
    secret: "your-secret-key",
    resave: false,
    saveUninitialized: true
  })
);

// Middleware to parse incoming form data
dealerRouter.use(bodyParser.urlencoded({ extended: true }));

// Serve the login page
dealerRouter.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "dealer-login.html"));
});

// Handle login form submission
dealerRouter.post("/login", (req, res) => {
  const { email, password } = req.body;

  // Example authentication logic
  if (email === "dealer@example.com" && password === "password123") {
    // Save the session to keep the user logged in
    req.session.isLoggedIn = true;
    req.session.email = email;

    // Redirect to the dealer dashboard
    res.redirect("/dealer/dealer-dashboard");
  } else {
    // Send an error message if login fails
    res.status(401).send("Invalid email or password.");
  }
});

// Dealer dashboard route (only accessible when logged in)
dealerRouter.get("/dealer-dashboard", (req, res) => {
  if (req.session.isLoggedIn) {
    // Show the dealer dashboard page
    res.sendFile(path.join(__dirname, "views", "dealer-dashboard.html"));
  } else {
    // Redirect to login page if not authenticated
    res.redirect("/dealer/login");
  }
});

// Route to get QR code details based on the QR code input
dealerRouter.get("/get-qr-details/:qrCode", async (req, res) => {
    const qrCode = req.params.qrCode;
  
    try {
      // Reference to the Firebase 'coupons' node
      const couponRef = ref(db, 'coupons');
      const snapshot = await get(couponRef);
  
      if (!snapshot.exists()) {
        return res.status(500).json({ success: false, message: "Error reading data." });
      }
  
      const couponData = snapshot.val();
  
       // Find the QR code details
    const qrCodeDetails = Object.values(couponData).find(item => item.qrCode === qrCode);

    if (qrCodeDetails) {
      return res.json({
        success: true,
        qrCode: qrCodeDetails.qrCode,
        scannedBy: qrCodeDetails.fullName,
        mobileNumber: qrCodeDetails.mobileNumber,
        qrBatch: qrCodeDetails.qrBatch || "N/A",  // Fallback for qrBatch if not found
        scanDate: qrCodeDetails.dateScanned,
        transactionAmount: qrCodeDetails.points
      });
    } else {
      return res.json({ success: false });
    }

  } catch (err) {
    console.error("Error fetching coupon data:", err);
    return res.status(500).json({ success: false, message: "Failed to fetch QR code details." });
  }
});

module.exports = dealerRouter;
