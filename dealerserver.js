const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const expressSession = require("express-session");
const fs = require("fs");
const dealerRouter = express.Router();

// Middleware for session management
dealerRouter.use(expressSession({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: true
}));

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
dealerRouter.get("/get-qr-details/:qrCode", (req, res) => {
    const qrCode = req.params.qrCode;

    // Read the coupon data from JSON file
    fs.readFile(path.join(__dirname, "data", "coupondata.json"), "utf8", (err, data) => {
        if (err) {
            return res.status(500).json({ success: false, message: "Error reading data." });
        }

        const couponData = JSON.parse(data);
        const qrCodeDetails = couponData.find(item => item.qrCode === qrCode);

        if (qrCodeDetails) {
            return res.json({
                success: true,
                qrCode: qrCodeDetails.qrCode,
                scannedBy: qrCodeDetails.name,
              mobileNumber: qrCodeDetails.mobileNumber,
              Qrbatch: qrCodeDetails.qrBatch,
                scanDate: qrCodeDetails.dateScanned,
                transactionAmount: qrCodeDetails.points

            });
        } else {
            return res.json({ success: false });
        }
    });
});


module.exports = dealerRouter;