const express = require('express');
const path = require('path');
const session = require('express-session');
const bodyParser = require('body-parser');
const fs = require('fs');


const userRouter = express.Router();
const usersFile = path.join(__dirname, 'data', 'users.json');
const qrBatchesDir = path.join(__dirname, 'qr_batches');
const couponDataFile = path.join(__dirname, 'data', 'couponData.json');



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
userRouter.get('/register', isAuthenticated, (req, res) => {
    const mobileNumber = req.session.mobileNumber;

    fs.readFile(usersFile, 'utf8', (err, data) => {
        if (err) return res.status(500).send('Error reading users file');

        let users = JSON.parse(data);
        const user = users.find(u => u.mobileNumber === mobileNumber);

        if (!user) {
            return res.status(404).send('User not found');
        }

        if (user.isRegistered) {
            return res.redirect('/user/dashboard'); // Redirect if already registered
        }

        res.render('register', { mobileNumber });
    });
});

// Dashboard: Protected route
userRouter.get('/dashboard', isAuthenticated, (req, res) => {
    const mobileNumber = req.session.mobileNumber;

    fs.readFile(usersFile, 'utf8', (err, data) => {
        if (err) return res.status(500).send('Error reading users file');

        let users = JSON.parse(data);
        const user = users.find(u => u.mobileNumber === mobileNumber);

        if (!user) {
            return res.status(404).send('User not found');
        }

        if (!user.isRegistered) {
            return res.redirect('/user/register');
        }

        res.render('dashboard', {
            userName: user.fullName,
            walletBalance: user.walletBalance
        });
    });
});

// Mobile number submission route
userRouter.post('/submit-mobile', (req, res) => {
    const { mobileNumber } = req.body;

    if (!mobileNumber) {
        return res.status(400).send('Mobile number is required.');
    }

    req.session.mobileNumber = mobileNumber;

    let users = [];
    if (fs.existsSync(usersFile)) {
        users = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
    }

    const existingUser = users.find(user => user.mobileNumber === mobileNumber);
    if (existingUser) {
        return res.redirect(
            existingUser.isRegistered ? '/user/dashboard' : '/user/register'
        );
    }

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
        status: 'active',
        isRegistered: false
    };

    users.push(newUser);
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2), 'utf8');

    res.redirect('/user/register');
});

// Registration form submission
userRouter.post('/register', (req, res) => {
    const { mobileNumber, fullName, dob, userType, address, pinCode, state, city } = req.body;

    fs.readFile(usersFile, 'utf8', (err, data) => {
        if (err) return res.status(500).send('Error reading users file');

        let users = data ? JSON.parse(data) : [];
        const userIndex = users.findIndex(user => user.mobileNumber === mobileNumber);

        if (userIndex === -1) {
            return res.status(404).send('User not found');
        }

        users[userIndex] = {
            ...users[userIndex],
            fullName,
            dob,
            userType,
            address,
            pinCode,
            state,
            city,
            walletBalance: users[userIndex].walletBalance || 0,
            isRegistered: true
        };

        fs.writeFile(usersFile, JSON.stringify(users, null, 2), err => {
            if (err) {
                return res.status(500).send('Error saving user data');
            }
            res.redirect('/user/dashboard');
        });
    });
});

// QR Code scanning page: Protected route
userRouter.get('/scan-qr', isAuthenticated, (req, res) => {
    const mobileNumber = req.session.mobileNumber;

    fs.readFile(usersFile, 'utf8', (err, data) => {
        if (err) return res.status(500).send('Error reading users file');

        let users = JSON.parse(data);
        const user = users.find(u => u.mobileNumber === mobileNumber);

        if (!user || !user.isRegistered) {
            return res.status(403).send('You need to be registered to access this page.');
        }

        res.sendFile(path.join(__dirname, 'views', 'scan-qr.html'));
    });
});


// QR Code scanning logic
userRouter.post('/scan-qr', isAuthenticated, (req, res) => {
    const qrCode = req.body.qrCode.trim();
    const mobileNumber = req.session.mobileNumber;
    let qrData = null;
    let filePath = '';
    let qrBatch = '';
    let userName = '';

    // Search for the QR code in batch directories and text files
    const batchDirs = fs.readdirSync(qrBatchesDir);
    for (let batchDir of batchDirs) {
        const batchFilePath = path.join(qrBatchesDir, batchDir, `${batchDir}_batch.txt`);
        if (fs.existsSync(batchFilePath)) {
            const batchData = fs.readFileSync(batchFilePath, 'utf8');
            const qrCodeMatch = batchData.match(new RegExp(`QR Code:\\s*${qrCode}\\s*([\\s\\S]*?)Status:\\s*(Not Scanned|Scanned)`, 'i'));
            
            if (qrCodeMatch) {
                qrData = qrCodeMatch[0];
                filePath = batchFilePath;
                qrBatch = batchDir;  // Capture the batch name
                break;
            }
        }
    }

    if (!qrData) {
        return res.json({ success: false, message: 'Please enter correct code.' });
    }

    // Check if the QR code has already been scanned
    if (qrData.includes('Status: Scanned')) {
        return res.json({ success: false, message: 'QR Code already scanned.' });
    }

    // Extract points from QR data
    const pointsMatch = qrData.match(/Points:\s*(\d+)/);
    const points = pointsMatch ? parseInt(pointsMatch[1], 10) : 0;

    if (isNaN(points)) {
        return res.json({ success: false, message: 'Invalid QR Code data.' });
    }

    // Update the QR code status to 'Scanned'
    const updatedQRData = qrData.replace('Status: Not Scanned', 'Status: Scanned');

    try {
        // Replace the old QR code data with the updated one in the text file
        const updatedBatchData = fs.readFileSync(filePath, 'utf8').replace(qrData, updatedQRData);
        fs.writeFileSync(filePath, updatedBatchData);
    } catch (error) {
        return res.json({ success: false, message: 'Failed to update QR Code status.' });
    }

    // Read users file and update wallet balance
    fs.readFile(usersFile, 'utf8', (err, data) => {
        if (err) return res.json({ success: false, message: 'Failed to update user wallet.' });

        let users = JSON.parse(data);
        const userIndex = users.findIndex(user => user.mobileNumber === mobileNumber);

        if (userIndex === -1) {
            return res.json({ success: false, message: 'User not found.' });
        }

        // Get user details (name and mobile number)
        const user = users[userIndex];
        userName = user.fullName;

        // Add points to the user's wallet balance
        user.walletBalance += points;

        // Save updated user data (only wallet balance)
        fs.writeFile(usersFile, JSON.stringify(users, null, 2), writeErr => {
            if (writeErr) {
                return res.json({ success: false, message: 'Failed to update user wallet.' });
            }

            // Save scanned coupon details in coupondata.json
            const scannedCoupon = {
                mobileNumber: user.mobileNumber,
                name: userName,
                qrBatch,
                qrCode,
                dateScanned: new Date().toISOString().split('T')[0],  // Format: YYYY-MM-DD
                points
            };

            fs.readFile(couponDataFile, 'utf8', (couponErr, couponData) => {
                if (couponErr) return res.json({ success: false, message: 'Failed to save coupon details.' });

                let coupons = couponData ? JSON.parse(couponData) : [];

                // Add the new coupon details
                coupons.push(scannedCoupon);

                // Save coupon details
                fs.writeFile(couponDataFile, JSON.stringify(coupons, null, 2), (writeCouponErr) => {
                    if (writeCouponErr) {
                        return res.json({ success: false, message: 'Failed to save coupon details.' });
                    }

                    res.json({
                        success: true,
                        message: 'QR Code scanned successfully!',
                        points
                    });
                });
            });
        });
    });
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
userRouter.get('/qr-apply-history', isAuthenticated, (req, res) => {
    const mobileNumber = req.session.mobileNumber;  // Get the logged-in user's mobile number

    // Read the coupon data file to get the history of scanned QR codes
    fs.readFile(couponDataFile, 'utf8', (err, data) => {
        if (err) {
            return res.json({ success: false, message: 'Failed to fetch QR apply history.' });
        }

        let coupons = JSON.parse(data);

        // Filter coupons by the logged-in user's mobile number
        const userCoupons = coupons.filter(coupon => coupon.mobileNumber === mobileNumber);

        // Render the page with the filtered coupon data for the current user
        res.render('qr-apply-history', { coupons: userCoupons });
    });
});

// Helper function to write in coupondata file
function saveScannedCoupon(couponData) {
    if (!fs.existsSync(couponDataFile)) {
        fs.writeFileSync(couponDataFile, JSON.stringify([], null, 2));
    }

    let existingData = JSON.parse(fs.readFileSync(couponDataFile, 'utf8'));
    existingData.push(couponData);

    fs.writeFileSync(couponDataFile, JSON.stringify(existingData, null, 2));
}





module.exports = userRouter;
