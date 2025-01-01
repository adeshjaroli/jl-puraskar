const express = require('express');
const path = require('path');
const session = require('express-session');
const bodyParser = require('body-parser');
const { initializeApp } = require('firebase/app');
const { getDatabase, ref, set, get, update, push } = require('firebase/database');

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

// Fast2SMS API details
const FAST2SMS_URL = 'https://www.fast2sms.com/dev/bulkV2';
const FAST2SMS_API_KEY = 'haltVXGKcRr1psUDTBv8HQWMkw6YJ3moSOgCn5yEfd79NZi2I0c7FQRq5sgLVJWf3HvbS8ICoMty0Bn4'; // Replace with your Fast2SMS API Key
const SENDER_ID = 'RJHIND';
const TEMPLATE_ID = '161703'; // Replace with your DLT-approved template ID

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

// Middleware to check if the user is logged in and active
async function isAuthenticated(req, res, next) {
    if (req.session && req.session.mobileNumber) {
        const mobileNumber = req.session.mobileNumber;

        try {
            const userRef = ref(db, `users/${mobileNumber}`);
            const snapshot = await get(userRef);

            if (snapshot.exists()) {
                const user = snapshot.val();

                if (user.isActive) {
                    return next();
                } else {
                    return res.status(403).send('User account is deactivated. Please contact support.');
                }
            } else {
                return res.status(404).send('User not found');
            }
        } catch (err) {
            console.error('Error verifying user:', err);
            return res.status(500).send('Internal server error');
        }
    } else {
        res.redirect('/user'); // Redirect to login if not authenticated
    }
}

// OTP Sending Route
userRouter.post('/send-otp', async (req, res) => {
    const { mobileNumber } = req.body;

    if (!mobileNumber) {
        return res.status(400).send('Mobile number is required.');
    }

    const otp = Math.floor(100000 + Math.random() * 900000); // Generate OTP

    try {
        req.session.otp = otp;
        req.session.mobileNumber = mobileNumber;

        const response = await axios.get(FAST2SMS_URL, {
            params: {
                authorization: FAST2SMS_API_KEY,
                route: 'dlt',
                sender_id: SENDER_ID,
                message: TEMPLATE_ID,
                variables_values: otp,
                numbers: mobileNumber
            }
        });

        if (response.data.return) {
            res.status(200).send('OTP sent successfully.');
        } else {
            res.status(500).send('Failed to send OTP.');
        }
    } catch (err) {
        console.error('Error sending OTP:', err);
        res.status(500).send('Error sending OTP.');
    }
});

// OTP Verification Route
userRouter.post('/verify-otp', (req, res) => {
    const { otp } = req.body;

    if (!otp) {
        return res.status(400).send('OTP is required.');
    }

    if (otp == req.session.otp) {
        req.session.otp = null; // Clear OTP from session
        res.status(200).send('OTP verified successfully.');
    } else {
        res.status(400).send('Invalid OTP. Please try again.');
    }
});

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

// Serve the create-beneficiary page when visiting /create-beneficiary
userRouter.get('/add-bank', isAuthenticated, async (req, res) => {
    const mobileNumber = req.session.mobileNumber;
    console.log('Mobile Number from Session:', mobileNumber);
  
    if (!mobileNumber) {
      return res.status(400).json({ message: 'Mobile number not found in session' });
    }
  
    try {
      res.render('add-bank', { mobileNumber }); // Pass the mobile number to the EJS template
    } catch (error) {
      console.error('Error rendering add-bank page:', error.message);
      res.status(500).json({ message: 'Error loading page', error: error.message });
    }
  });

// POST endpoint for adding a beneficiary
// Your Cashfree credentials
const CLIENT_ID = 'CF73772CTNU5FL7QDUC73BAM3DG';
const CLIENT_SECRET = 'cfsk_ma_test_0a290e0b7f1a3fae1b989d161af85646_948f4605';

// POST endpoint for adding a beneficiary
userRouter.post('/add-beneficiary', async (req, res) => {
  const {
    beneficiaryName,
    bankAccountNumber,
    bankIFSC,
    vpa,
    beneficiaryPhone,
    beneficiaryCountryCode,
  } = req.body;

  if (!beneficiaryName || !bankAccountNumber || !bankIFSC || !beneficiaryPhone) {
    return res.status(400).json({ message: 'Required fields are missing' });
  }

  // Generate Beneficiary ID
  const beneficiaryId = `JL${ req.session.mobileNumber}`;

  const options = {
    method: 'POST',
    url: 'https://sandbox.cashfree.com/payout/beneficiary',
    headers: {
      accept: 'application/json',
      'x-api-version': '2024-01-01',
      'content-type': 'application/json',
      'x-client-id': CLIENT_ID,
      'x-client-secret': CLIENT_SECRET,
    },
    data: {
      beneficiary_id: beneficiaryId,
      beneficiary_name: beneficiaryName,
      beneficiary_instrument_details: {
        bank_account_number: bankAccountNumber,
        bank_ifsc: bankIFSC,
        vpa: vpa || null, // Optional field
      },
      beneficiary_contact_details: {
        beneficiary_country_code: beneficiaryCountryCode || '+91',
        beneficiary_phone: beneficiaryPhone,
      },
    },
  };

  try {
    const response = await axios.request(options);
    res.status(200).json({
      message: 'Bank Account added successfully',
      beneficiaryId: beneficiaryId,
      data: response.data,
    });
  } catch (error) {
    console.error('Error adding beneficiary:', error.response?.data || error.message);
    res.status(500).json({
      message: 'Error adding bank account',
      error: error.response?.data || error.message,
    });
  }
});

// Render the withdraw page
userRouter.get("/withdraw", isAuthenticated, async (req, res) => {
  const mobileNumber = req.session.mobileNumber;

  if (!mobileNumber) {
    return res.status(400).render("withdraw", {
      walletBalance: 0,
      message: "Mobile number not found in session.",
      beneficiary_id: null,
    });
  }

  try {
    // Fetch user data from Firebase Realtime Database
    const userRef = ref(db, `users/${mobileNumber}`);
    const snapshot = await get(userRef);

    if (!snapshot.exists()) {
      return res.status(404).render("withdraw", {
        walletBalance: 0,
        message: "User not found.",
        beneficiary_id: null,
      });
    }

    const user = snapshot.val();
    const walletBalance = user.walletBalance || 0; // Fetch wallet balance
    const beneficiary_id = `JL${mobileNumber}`;

    return res.render("withdraw", {
      walletBalance,
      message: null, // No message on initial load
      beneficiary_id,
    });
  } catch (error) {
    console.error("Error fetching user data from Firebase:", error);
    return res.status(500).render("withdraw", {
      walletBalance: 0,
      message: "Failed to fetch wallet balance.",
      beneficiary_id: null,
    });
  }
});

// Handle withdraw form submission
userRouter.post("/withdraw", isAuthenticated, async (req, res) => {
  const mobileNumber = req.session.mobileNumber;
  const { withdrawAmount } = req.body;

  if (!mobileNumber) {
    return res.status(400).render("withdraw", {
      walletBalance: 0,
      message: "Mobile number not found in session.",
      beneficiary_id: null,
    });
  }

  try {
    // Fetch user data from Firebase Realtime Database
    const userRef = ref(db, `users/${mobileNumber}`);
    const snapshot = await get(userRef);

    if (!snapshot.exists()) {
      return res.status(404).render("withdraw", {
        walletBalance: 0,
        message: "User not found.",
        beneficiary_id: `JL${mobileNumber}`,
      });
    }

    const user = snapshot.val();
    const walletBalance = user.walletBalance || 0; // Fetch wallet balance

    if (!withdrawAmount || withdrawAmount < 50) {
      return res.render("withdraw", {
        walletBalance,
        message: "Minimum withdrawal amount is 50.",
        beneficiary_id: `JL${mobileNumber}`,
      });
    }

    if (withdrawAmount > walletBalance) {
      return res.render("withdraw", {
        walletBalance,
        message: "Insufficient balance to withdraw.",
        beneficiary_id: `JL${mobileNumber}`,
      });
    }

    const transfer_id = `JL${mobileNumber}${Math.floor(1000 + Math.random() * 9000)}`;
    const beneficiary_id = `JL${mobileNumber}`;

    const cashfreePayload = {
      transfer_id,
      transfer_amount: withdrawAmount,
      beneficiary_details: {
        beneficiary_id,
        name: "User Name", // Replace with actual user data
        email: `${mobileNumber}@example.com`, // Replace with actual user email
        phone: mobileNumber,
        bankAccount: "123456789", // Replace with actual beneficiary details
        ifsc: "IFSC0001234", // Replace with actual IFSC code
      },
    };

    // Initiate the withdrawal process via Cashfree API
    const response = await axios.post(
      "https://sandbox.cashfree.com/payout/transfers",
      cashfreePayload,
      {
        headers: {
          accept: "application/json",
          "x-api-version": "2024-01-01",
          "content-type": "application/json",
          "x-client-id": CLIENT_ID,
          "x-client-secret": CLIENT_SECRET,
        },
      }
    );

    const status = response.data.status;

    if (["RECEIVED", "APPROVAL_PENDING", "PENDING", "SUCCESS"].includes(status)) {
      // Deduct wallet balance and log withdrawal request in Firebase
      const newWalletBalance = walletBalance - withdrawAmount;

      await update(ref(db, `users/${mobileNumber}`), {
        walletBalance: newWalletBalance, // Update wallet balance
      });

      // Log the withdrawal request in the `withdrawals` node
      const withdrawalsRef = ref(db, `withdrawals/${mobileNumber}`);
      const newWithdrawalRef = push(withdrawalsRef);

      await set(newWithdrawalRef, {
        transfer_id,
        transfer_amount: withdrawAmount,
        status,
        created_at: new Date().toISOString(),
      });

      return res.render("withdraw", {
        walletBalance: newWalletBalance,
        message: "Withdrawal successful!",
        beneficiary_id,
      });
    } else if (["FAILED", "REJECTED"].includes(status)) {
      return res.render("withdraw", {
        walletBalance,
        message: "Withdrawal failed. Please try again later.",
        beneficiary_id,
      });
    } else {
      console.error(`Unexpected status: ${status}`);
      return res.render("withdraw", {
        walletBalance,
        message: "An unexpected error occurred. Please try again.",
        beneficiary_id,
      });
    }
  } catch (error) {
    console.error("Error during withdrawal:", error.message);

    return res.status(500).render("withdraw", {
      walletBalance: 0,
      message: "Please Add Bank Account.. Go to Add Bank On Main Page",
      beneficiary_id: null,
    });
  }
});

// Function to fetch transfer status from Cashfree using the correct GET endpoint
async function fetchStatusFromCashfree(transferId) {
  try {
    // Send GET request to Cashfree's payout API to get transfer status
    const response = await axios.get(
      `https://sandbox.cashfree.com/payout/transfers`,
      {
        headers: {
          'X-Client-Id': CLIENT_ID,
          'X-Client-Secret': CLIENT_SECRET,
          'x-api-version': '2024-01-01'
        },
        params: {
          transfer_id: transferId // Pass transfer_id as a query parameter
        }
      }
    );

    // Now, we need to check the response structure correctly
    if (response.data && response.data.status) {
      const status = response.data.status || 'Unknown'; // Accessing status directly
      return status; // Return the status
    } else {
      return 'Unknown'; // Return 'Unknown' if no status field is found
    }
  } catch (error) {
    return 'Error'; // Return 'Error' if there was an issue
  }
}

// GET /user-withdraw
userRouter.get('/user-withdraw', async (req, res) => {
  const mobileNumber = req.session.mobileNumber;

  try {
    // Fetch user data from Firebase Realtime Database
    const withdrawRef = ref(db, `withdrawals/${mobileNumber}`);
    const snapshot = await get(withdrawRef);
    const withdrawals = [];

    if (snapshot.exists()) {
      const data = snapshot.val();

      for (const key in data) {
        const { transfer_id, transfer_amount, created_at } = data[key];

        // Fetch transfer status from Cashfree
        const status = await fetchStatusFromCashfree(transfer_id);

        withdrawals.push({
          transfer_id,
          transfer_amount,
          created_at,
          status,
        });
      }
    }

    // Sort the withdrawals array by created_at in descending order
    withdrawals.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // Send the withdrawals array to the EJS template
    res.render('user-withdraw', { withdrawals });
  } catch (error) {
    res.status(500).send('Internal Server Error');
  }
});

// Function to fetch beneficiary details from Cashfree
async function fetchBeneficiaryFromCashfree(beneficiary_id) {
  try {
    // Fetch beneficiary details from Cashfree
    const options = {
      method: 'GET',
      url: `https://sandbox.cashfree.com/payout/beneficiary`,
      headers: {
        accept: 'application/json',
        'x-api-version': '2024-01-01',
        'x-client-id': CLIENT_ID,
        'x-client-secret': CLIENT_SECRET,
      },
      params: {
        beneficiary_id: beneficiary_id, // Pass the beneficiary_id here
      },
    };

    const response = await axios.request(options);
    console.log('Beneficiary API Response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error fetching beneficiary details:', error.response?.data || error.message || 'Unknown error');
    
    // If beneficiary not found, return null so we can handle it in the route
    if (error.response?.data?.code === 'beneficiary_not_found') {
      return null;
    }

    // Throw error if any other issue occurs
    throw new Error('Failed to fetch beneficiary details.');
  }
}

// Render the Edit Details page
userRouter.get('/edit-details', isAuthenticated, async (req, res) => {
  const mobileNumber = req.session.mobileNumber;

  if (!mobileNumber) {
    console.error('Mobile number not found in session.');
    return res.status(400).render('error', { message: 'Mobile number not found in session.' });
  }

  const beneficiary_id = `JL${mobileNumber}`;
  console.log('Fetching beneficiary details for ID:', beneficiary_id);

  try {
    // Fetch beneficiary details using the helper function
    const beneficiary = await fetchBeneficiaryFromCashfree(beneficiary_id);

    // If beneficiary not found, redirect to add-bank
    if (!beneficiary) {
      console.warn(`Beneficiary not found for ID: ${beneficiary_id}`);
      return res.redirect('/user/add-bank');  // Redirect to add-bank if beneficiary is not found
    }

    // Check if beneficiary status is VERIFIED
    if (beneficiary.beneficiary_status !== 'VERIFIED') {
      console.warn(`Beneficiary not VERIFIED for ID: ${beneficiary_id}`);
      return res.redirect('/user/add-bank');  // Redirect to add-bank if not verified
    }

    // Render the edit-details page with beneficiary information
    return res.render('edit-details', {
      beneficiary: beneficiary,
      message: null,
    });
  } catch (error) {
    console.error('Error rendering edit-details page:', error.message);
    // Handle error rendering for cases where error view is missing
    return res.status(500).send('An error occurred while fetching beneficiary details. Please try again later.');
  }
});

// Remove bank account route
userRouter.post('/edit-details/remove', isAuthenticated, async (req, res) => {
  const mobileNumber = req.session.mobileNumber;

  if (!mobileNumber) {
    console.error('Mobile number not found in session.');
    return res.status(400).render('error', { message: 'Mobile number not found in session.' });
  }

  const beneficiary_id = `JL${mobileNumber}`;
  console.log('Removing beneficiary with ID:', beneficiary_id);

  try {
    // Constructing DELETE request options to remove beneficiary with params
    const options = {
      method: 'DELETE',
      url: 'https://sandbox.cashfree.com/payout/beneficiary',  // URL for deleting beneficiary
      headers: {
        accept: 'application/json',
        'x-api-version': '2024-01-01',
        'x-client-id': CLIENT_ID,  // Your client ID
        'x-client-secret': CLIENT_SECRET  // Your client secret
      },
      params: {
        beneficiary_id: beneficiary_id,  // Correctly pass the beneficiary_id as a query parameter
      },
    };

    // Send DELETE request to remove beneficiary
    const response = await axios.request(options);
    console.log('Delete Beneficiary Response:', response.data);

    // Check if the deletion was successful based on 'beneficiary_status'
    if (response.data.beneficiary_status === 'DELETED') {
      console.log('Beneficiary removed successfully');
      // Redirect to the add-bank page after successful removal
      return res.redirect('/user/add-bank');
    } else {
      console.warn('Failed to remove beneficiary:', response.data);
      // If removal fails, redirect to add-bank page
      return res.redirect('/user/add-bank');
    }
  } catch (error) {
    console.error('Error removing beneficiary:', error.response?.data || error.message || 'Unknown error');
    return res.status(500).send('An error occurred while removing the bank account. Please try again later.');
  }
});

/////////////////////////////////////

// Endpoint to get all schemes
userRouter.get('/schemes', (req, res) => {
  const notificationsRef = ref(db, 'notifications');
  
  get(notificationsRef)
      .then((snapshot) => {
          const notifications = snapshot.val();
          const notificationArray = [];
          for (let id in notifications) {
              notificationArray.push({ text: notifications[id].text });
          }
          res.render('schemes', { schemes: notificationArray }); // Render schemes.ejs with the data
      })
      .catch((error) => {
          res.status(500).json({ error: 'Failed to fetch schemes' });
      });
});

module.exports = userRouter;















































