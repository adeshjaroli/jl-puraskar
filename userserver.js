const express = require('express');
const path = require('path');
const session = require('express-session');
const bodyParser = require('body-parser');
const { initializeApp } = require('firebase/app');
const { getDatabase, ref, set, get, update } = require('firebase/database');
const axios = require('axios');

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

const cashfreeCredentials = {
    appId: 'YCF73772CTL92M57QDUC73BAM27G',
    secretKey: 'cfsk_ma_test_667dadf1ea171b403f44a56e9b035bff_b2e11877',
  };

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
        // Fetch user data
        const userRef = ref(db, `users/${mobileNumber}`);
        const snapshot = await get(userRef);

        if (!snapshot.exists()) {
            return res.status(404).send('User not found');
        }

        const user = snapshot.val();

        if (!user.isRegistered) {
            return res.redirect('/user/register');
        }

        // Fetch banners from Firebase
        const bannersRef = ref(db, 'banners');
        const bannersSnapshot = await get(bannersRef);

        if (!bannersSnapshot.exists()) {
            console.log('No banners found');
            // If no banners found, send an empty array
            banners = [];
        } else {
            const bannersData = bannersSnapshot.val();
            // Extract banner URLs from the banners object
            banners = Object.values(bannersData).map(banner => banner.url);
        }

        // Render the dashboard and pass user and banner data
        res.render('dashboard', {
            userName: user.fullName,
            walletBalance: user.walletBalance,
            banners: banners // Passing the banners array
        });

    } catch (err) {
        console.error('Error fetching user or banner data:', err);
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

// Define the route for the product page
userRouter.get('/products', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'products.html')); // Serve the product page HTML
});

// Route to serve the withdrawal page
userRouter.get('/withdrawl', (req, res) => {
    res.sendFile(path.join(__dirname, 'views','withdrawl.html') );
});

// Route to handle withdrawal form submission
// Route for initiating withdrawal
userRouter.post('/withdraw', async (req, res) => {
    const { userId, amount } = req.body;

    // Log the incoming request details
    console.log(`Received withdrawal request: UserID=${userId}, Amount=${amount}`);

    // Basic validation
    if (!amount || amount < 50) {
        return res.status(400).json({
            success: false,
            message: 'Minimum withdrawal amount is ₹50',
        });
    }

    // Construct the Cashfree payout request payload
    const payoutData = {
        order_id: `ORD${Date.now()}`, // Unique order ID based on current timestamp
        order_amount: amount,
        beneficiary_id: userId, // Use userId as beneficiary id (assumes userId maps to Cashfree beneficiary)
        transfer_mode: 'NEFT', // You can change this to any valid payout mode (e.g., IMPS, UPI)
        transfer_date: new Date().toISOString(),
        remarks: 'Withdrawal from application',
    };

    const cashfreePayoutUrl = 'https://sandbox.cashfree.com/api/v2/cashfree/payouts'; // Use sandbox for testing

    // Set headers with Cashfree API credentials
    const headers = {
        'Content-Type': 'application/json',
        'x-api-version': '1.0', // Cashfree API version
        'x-client-id': cashfreeCredentials.appId,
        'x-client-secret': cashfreeCredentials.secretKey,
    };

    try {
        // Log the payout request data before sending
        console.log('Sending payout request to Cashfree:', payoutData);

        // Make the API call to Cashfree
        const response = await axios.post(cashfreePayoutUrl, payoutData, { headers });

        // Log the full Cashfree API response
        console.log("Cashfree API response:", response.data);

        // Check if the response indicates success
        if (response.data && response.data.status === 'SUCCESS') {
            // Log the successful transaction
            console.log('Withdrawal processed successfully:', response.data);

            return res.status(200).json({
                success: true,
                message: 'Withdrawal processed successfully!',
                transactionId: response.data.transaction_id,
                amount: amount,
                status: 'SUCCESS',
            });
        } else {
            // Log any error from Cashfree response
            console.log('Error in Cashfree response:', response.data);
            throw new Error('Cashfree API call failed');
        }
    } catch (error) {
        // Log any errors that occur during the request
        console.error('Error during Cashfree API call:', error.response ? error.response.data : error.message);
        return res.status(500).json({
            success: false,
            message: 'An error occurred while processing the withdrawal.',
            error: error.response ? error.response.data : error.message,
        });
    }
});

// Serve the create-beneficiary page when visiting /create-beneficiary
userRouter.get('/beneficiary', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'beneficiary.html'));
});

// Cashfree API credentials
const CASHFREE_API_ID = 'YCF73772CTL92M57QDUC73BAM27G'; // Replace with your actual API ID
const CASHFREE_API_SECRET = 'cfsk_ma_test_667dadf1ea171b403f44a56e9b035bff_b2e11877'; // Replace with your actual API secret

// Cashfree API URL (check Cashfree documentation for the correct endpoint)
const CASHFREE_API_URL = 'https://payout-gamma.cashfree.com/payout/v1/addBeneficiary'; // Ensure this is correct

// Route to handle adding a beneficiary
userRouter.post('/add-beneficiary', async (req, res) => {
    const { name, phone , email, accountNumber , ifsc , address1, beneId    } = req.body;

    // Replace with your actual Cashfree Bearer Token
    const CASHFREE_TOKEN = 'Bearer eyJhbGciOiJIUzM4NCIsInR5cCI6IkpXVCJ9.eyJjbGllbnRJZCI6IkNGMjAyNjBDTDBFM00wSk81UktTN0tPRzA1RyIsImFjY291bnRJZCI6NDc0NTI5LCJzaWduYXR1cmVDaGVjayI6ZmFsc2UsImlwIjoiIiwiYWdlbnQiOiJQQVlPVVQiLCJjaGFubmVsIjoiIiwiYWdlbnRJZCI6NDc0NTI5LCJraWQiOiJDRjIwMjYwQ0wwRTNNMEpPNVJLUzdLT0cwNUciLCJlbmFibGVBcGkiOnRydWUsImV4cCI6MTczNTA0MzY0MSwiaWF0IjoxNzM1MDQzMDQxLCJzdWIiOiJQQVlPVVRBUElfQVVUSCJ9.vjEGpRDkFLDIrknQ8fjXcnxeSeN7mBiCquMezCy7a-YcO69qKmv8vLWF7bO3HAV0'; // Replace with your actual Bearer token

    // Log the token for debugging
    console.log("Using Token:", CASHFREE_TOKEN);

    // Headers for Cashfree API request
    const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': CASHFREE_TOKEN, // Ensure the token is set correctly
    };

    // Data for the beneficiary
    const data = {
      name,
      phone, 
      email,
      accountNumber,
      ifsc,
      address1,
      beneId,
    };

    try {
        // Sending the POST request to Cashfree API
        const response = await axios.post(CASHFREE_API_URL, data, { headers });

        // Log the response from Cashfree API for debugging
        console.log("Cashfree API Response:", response.data);

        // Success - Beneficiary added successfully
        if (response.data.status === 'SUCCESS') {
            res.status(200).json({ message: 'Beneficiary added successfully!', data: response.data });
        } else {
            // Error - Response returned failure
            res.status(400).json({ message: response.data.message, data: response.data });
        }
    } catch (error) {
        // Error - If the Cashfree API call fails
        console.error('Error during Cashfree API call:', error.response ? error.response.data : error.message);
        res.status(500).json({ message: 'Error during Cashfree API call', error: error.response ? error.response.data : error.message });
    }
});
module.exports = userRouter;
