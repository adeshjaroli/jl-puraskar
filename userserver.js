const express = require('express');
const path = require('path');
const session = require('express-session');
const bodyParser = require('body-parser');
const { initializeApp } = require('firebase/app');
const { getDatabase, ref, set, get, update } = require('firebase/database');

// Initialize Firebase
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

const app = initializeApp(firebaseConfig);
const db = getDatabase(app); // Get reference to the Firebase Realtime Database

const userRouter = express.Router();

// Initialize session middleware
userRouter.use(
    session({
        secret: 'your_secret_key',
        resave: false,
        saveUninitialized: true,
        cookie: {
            secure: false, // Set to true if using HTTPS
            httpOnly: true,
            maxAge: 3600000 // 1 hour
        }
    })
);

// Middleware
userRouter.use(bodyParser.urlencoded({ extended: true }));
userRouter.use(bodyParser.json());
userRouter.use(express.urlencoded({ extended: true }));

// Middleware to check if the user is logged in
function isAuthenticated(req, res, next) {
    if (req.session && req.session.mobileNumber) {
        return next(); // Proceed if the user is logged in
    }
    res.redirect('/user'); // Redirect to login if not authenticated
}

// Default route: Login page
userRouter.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// Registration page: Only accessible after login
userRouter.get('/register', isAuthenticated, async (req, res) => {
    const mobileNumber = req.session.mobileNumber;

    try {
        const userRef = ref(db, `users/${mobileNumber}`);
        const snapshot = await get(userRef);

        if (!snapshot.exists()) {
            return res.status(404).send('User not found');
        }

        const user = snapshot.val();

        if (user.isRegistered) {
            return res.redirect('/user/dashboard'); // Redirect if already registered
        }

        res.render('register', { mobileNumber });
    } catch (err) {
        return res.status(500).send('Error reading user data');
    }
});

// Dashboard: Protected route
userRouter.get('/dashboard', isAuthenticated, async (req, res) => {
    const mobileNumber = req.session.mobileNumber;

    try {
        const userRef = ref(db, `users/${mobileNumber}`);
        const snapshot = await get(userRef);

        if (!snapshot.exists()) {
            return res.status(404).send('User not found');
        }

        const user = snapshot.val();

        if (!user.isRegistered) {
            return res.redirect('/user/register');
        }

        res.render('dashboard', {
            userName: user.fullName,
            walletBalance: user.walletBalance
        });
    } catch (err) {
        return res.status(500).send('Error reading user data');
    }
});

// Mobile number submission route
userRouter.post('/submit-mobile', async (req, res) => {
    const { mobileNumber } = req.body;

    if (!mobileNumber) {
        return res.status(400).send('Mobile number is required.');
    }

    req.session.mobileNumber = mobileNumber;

    try {
        const userRef = ref(db, `users/${mobileNumber}`);
        const snapshot = await get(userRef);

        if (snapshot.exists()) {
            const user = snapshot.val();
            return res.redirect(user.isRegistered ? '/user/dashboard' : '/user/register');
        }

        // Create new user
        const newUser = {
            mobileNumber,
            fullName: '',
            dob: '',
            userType: '',
            address: '',
            pinCode: '',
            state: '',
            city: '',
            walletBalance: 0.0,
            serialNumber: Date.now(),
            status: 'active',
            isRegistered: false,
            isActive: true // Added isActive flag
        };

        await set(userRef, newUser);
        res.redirect('/user/register');
    } catch (err) {
        res.status(500).send('Error creating user');
    }
});

// Registration form submission
userRouter.post('/register', async (req, res) => {
    const { mobileNumber, fullName, dob, userType, address, pinCode, state, city } = req.body;

    try {
        const userRef = ref(db, `users/${mobileNumber}`);
        const snapshot = await get(userRef);

        if (!snapshot.exists()) {
            return res.status(404).send('User not found');
        }

        const user = snapshot.val();
        await update(userRef, {
            fullName,
            dob,
            userType,
            address,
            pinCode,
            state,
            city,
            walletBalance: user.walletBalance || 0,
            isRegistered: true,
            isActive: true // Added isActive flag
        });

        res.redirect('/user/dashboard');
    } catch (err) {
        return res.status(500).send('Error saving user data');
    }
});

// QR Code scanning logic
// QR Code scanning page: Protected route
userRouter.get('/scan-qr', isAuthenticated, async (req, res) => {
    const mobileNumber = req.session.mobileNumber;

    try {
        // Fetch user data from Firebase
        const userRef = ref(db, `users/${mobileNumber}`);
        const userSnapshot = await get(userRef);

        if (!userSnapshot.exists()) {
            return res.status(404).send('User not found');
        }

        const user = userSnapshot.val();

        if (!user.isRegistered) {
            return res.status(403).send('You need to be registered to access this page.');
        }

        // Render the scan QR page if everything is fine
        res.sendFile(path.join(__dirname, 'views', 'scan-qr.html'));
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).send('Error checking user registration.');
    }
});

// QR Code scanning logic (POST request)
userRouter.post('/scan-qr', isAuthenticated, async (req, res) => {
    const qrCode = req.body.qrCode.trim(); // QR code from manual or camera scan
    const mobileNumber = req.session.mobileNumber;

    try {
        // Fetch all batches from the database
        const batchRef = ref(db, 'batches');
        const snapshot = await get(batchRef);

        if (!snapshot.exists()) {
            return res.json({ success: false, message: 'No batches found.' });
        }

        const batches = snapshot.val();
        let qrData = null;
        let qrBatch = '';

        // Iterate through each batch to find the QR code
        for (const batchId in batches) {
            const batch = batches[batchId];

            // Convert qrCodes to an array if it's an object
            const qrCodesArray = Array.isArray(batch.qrCodes)
                ? batch.qrCodes
                : Object.values(batch.qrCodes || {});

            const qr = qrCodesArray.find(qr => qr.code === qrCode);
            if (qr) {
                qrData = qr;
                qrBatch = batchId;
                break;
            }
        }

        if (!qrData) {
            return res.json({ success: false, message: 'QR Code not found.' });
        }

        if (qrData.status === 'Scanned') {
            return res.json({ success: false, message: 'QR Code already scanned.' });
        }

        // Update the QR code status to 'Scanned'
        const qrCodesRef = ref(db, `batches/${qrBatch}/qrCodes`);
        const qrCodesSnapshot = await get(qrCodesRef);

        // Retrieve the unique key of the QR code
        if (qrCodesSnapshot.exists()) {
            const qrCodes = qrCodesSnapshot.val();
            const qrCodeKey = Object.keys(qrCodes).find(key => qrCodes[key].code === qrCode);

            if (qrCodeKey) {
                const qrCodeRef = ref(db, `batches/${qrBatch}/qrCodes/${qrCodeKey}`);
                await update(qrCodeRef, { status: 'Scanned' });
            } else {
                console.error('QR Code key not found.');
            }
        }

        // Get the user's current data
        const userRef = ref(db, `users/${mobileNumber}`);
        const userSnapshot = await get(userRef);

        if (!userSnapshot.exists()) {
            return res.json({ success: false, message: 'User not found.' });
        }

        const user = userSnapshot.val();
        const points = Number(qrData.points); // Ensure points is treated as a number

        // Convert walletBalance to a number and handle invalid values
        let currentBalance = 0;
        if (user.walletBalance !== undefined) {
            currentBalance = Number(user.walletBalance); // Explicitly convert to a number
            if (isNaN(currentBalance)) {
                currentBalance = 0; // Fallback
            }
        }

        // Ensure addition happens as a numerical operation
        const updatedBalance = currentBalance + points;

        // Update walletBalance in Firebase
        await update(userRef, { walletBalance: updatedBalance });

        // Save coupon data with serialNumber
        const couponId = `${mobileNumber}_${qrCode}_${Date.now()}`;  // Use timestamp to generate a unique coupon ID
        const couponRef = ref(db, `coupons/${couponId}`);
        const couponData = {
            mobileNumber,
            fullName: user.fullName,
            qrCode,
            points,
            dateScanned: new Date().toISOString().split('T')[0],  // Date format: YYYY-MM-DD
            qrBatch,
            serialNumber: Date.now()  // Assign serialNumber as the current timestamp
        };
        await set(couponRef, couponData);

        res.json({
            success: true,
            message: 'QR Code scanned successfully!',
            points
        });
    } catch (err) {
        console.error('Error scanning QR:', err);
        res.json({ success: false, message: 'Failed to scan QR code' });
    }
});


// Sample route for handling logout
userRouter.post('/logout', (req, res) => {
    // If using sessions
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).send('Failed to log out');
        }
        res.redirect('/user'); // Redirect to login page after successful logout
    });
});

// Route for QR Apply History Page
userRouter.get('/qr-apply-history', isAuthenticated, async (req, res) => {
    const mobileNumber = req.session.mobileNumber;  // Get the logged-in user's mobile number

    try {
        // Fetch the user's coupon data from Firebase
        const couponRef = ref(db, `coupons`);
        const snapshot = await get(couponRef);

        if (!snapshot.exists()) {
            return res.json({ success: false, message: 'No coupon history found.' });
        }

        const coupons = snapshot.val();

        // Filter coupons by the logged-in user's mobile number
        let userCoupons = Object.values(coupons).filter(coupon => coupon.mobileNumber === mobileNumber);

        // Sort coupons by serialNumber (desc), and then by dateScanned (desc) if serials are the same
        userCoupons.sort((a, b) => {
            // Sort by serialNumber first (desc)
            if (b.serialNumber !== a.serialNumber) {
                return b.serialNumber - a.serialNumber;
            }
            // If serialNumber is the same, sort by dateScanned (desc)
            const dateA = new Date(a.dateScanned);
            const dateB = new Date(b.dateScanned);
            return dateB - dateA;
        });

        // Calculate total points by summing the points from each coupon
        const totalPoints = userCoupons.reduce((sum, coupon) => sum + coupon.points, 0);

        // Render the page with the filtered and sorted coupon data, and total points
        res.render('qr-apply-history', { coupons: userCoupons, totalPoints });
    } catch (err) {
        console.error('Error fetching coupon history:', err);
        res.json({ success: false, message: 'Failed to fetch QR apply history.' });
    }
});

// Helper function to save scanned coupon data to Firebase
async function saveScannedCoupon(couponData) {
    try {
        const couponId = `${couponData.mobileNumber}_${couponData.qrCode}_${Date.now()}`;
        const couponRef = ref(db, `coupons/${couponId}`);
        
        // Save the coupon data to Firebase
        await set(couponRef, couponData);
    } catch (err) {
        console.error('Error saving scanned coupon data:', err);
    }
}


module.exports = userRouter;
