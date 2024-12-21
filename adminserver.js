const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const QRCode = require("qrcode");
const { initializeApp } = require('firebase/app');  // Firebase App
const { getDatabase, ref, set, get, update } = require('firebase/database');
const fs = require('fs');
const archiver = require("archiver"); // To create ZIP files
const { remove } = require('firebase/database');

// Firebase configuration
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

// Initialize Firebase Realtime Database
const db = getDatabase(app);

// Log a success message to confirm the connection
console.log("Firebase connected successfully!");

const adminRouter = express.Router();

// Middleware for static files and body parsing
adminRouter.use(express.static(path.join(__dirname, "public")));
adminRouter.use(bodyParser.urlencoded({ extended: true }));
adminRouter.use(bodyParser.json());

// Directory where batches are stored (kept as is for consistency)
const batchesDir = path.join(__dirname, "qr_batches");

// Function to get the next batch ID (still based on existing folders)
function getNextBatchId() {
    // Fetching from Firebase (instead of filesystem)
    const batchRef = ref(db, 'batches/');
    return get(batchRef).then(snapshot => {
        if (snapshot.exists()) {
            const batches = snapshot.val();
            const batchIds = Object.keys(batches);
            const highestBatch = batchIds.length === 0 ? 0 : Math.max(...batchIds.map(id => parseInt(id.slice(2), 10)));
            return `QR${String(highestBatch + 1).padStart(4, "0")}`;
        } else {
            return "QR0001"; // Start with QR0001 if no batches exist
        }
    });
}

// Function to generate random alphanumeric string of length 9
function generateRandomString(length) {
    const charset = "abcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
        result += charset[Math.floor(Math.random() * charset.length)];
    }
    return result;
}

// Serve the login page
adminRouter.get("/login", (req, res) => {
    res.sendFile(path.join(__dirname, "views", "login.html"));
});

// Handle login POST request
adminRouter.post("/login", (req, res) => {
    const { email, password } = req.body;
    const adminEmail = "admin@example.com";
    const adminPassword = "password123";

    if (email === adminEmail && password === adminPassword) {
        req.session.loggedIn = true;
        res.redirect("/admin/home");
    } else {
        res.sendFile(path.join(__dirname, "views", "login.html"), {
            errorMessage: "Invalid email or password. Please try again.",
        });
    }
});

// Protect the /home route
adminRouter.get("/home", (req, res) => {
    if (req.session.loggedIn) {
        res.sendFile(path.join(__dirname, "views", "home.html"));
    } else {
        res.redirect("/admin/login");
    }
});

// Handle logout
adminRouter.get("/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) return res.redirect("/admin/home");
        res.redirect("/admin/login");
    });
});

// Serve the QR code creation page
adminRouter.get("/create-qr", (req, res) => {
    if (req.session.loggedIn) {
        res.sendFile(path.join(__dirname, "views", "create-qr.html"));
    } else {
        res.redirect("/admin/login");
    }
});

// Handle QR code creation POST request
adminRouter.post("/create-qr", async (req, res) => {
    const numQrs = parseInt(req.body.numQrs); // Number of QR codes to generate
    const points = req.body.points; // Points associated with each QR code
    const batchId = await getNextBatchId(); // Get the next batch ID
    const timestamp = new Date().toISOString();

    // Create the batch object for Firebase with QR codes and points
    const batch = {
        createdAt: timestamp,
        points: points,
        couponCount: numQrs,
        qrCodes: []
    };

    // Create QR codes and add them to the batch in Firebase
    for (let i = 0; i < numQrs; i++) {
        const qrCodeData = generateRandomString(9);
        batch.qrCodes.push({
            code: qrCodeData,
            status: "Not Scanned",
            points: points, // Points for each coupon
            createdAt: timestamp
        });
    }

    // Save the batch data to Firebase
    const batchRef = ref(db, `batches/${batchId}`);
    set(batchRef, batch)
        .then(() => {
            res.send(`
                <h2>Generated QR Codes (Batch: ${batchId}) successfully!</h2>
                <p>Batch saved to Firebase with ID: ${batchId}</p>
            `);
        })
        .catch((error) => {
            console.error("Error saving batch data:", error);
            res.status(500).send("Error saving QR batch.");
        });
});

// Serve the home page (admin dashboard)
adminRouter.get("/", (req, res) => {
    if (req.session.loggedIn) {
        res.redirect("/home");
    } else {
        res.redirect("/login");
    }
});

// Fetch and view all QR batches
adminRouter.get("/view-qr", (req, res) => {
    if (req.session.loggedIn) {
        // Fetch all QR batch data from Firebase
        const batchRef = ref(db, 'batches/');
        get(batchRef).then((snapshot) => {
            if (snapshot.exists()) {
                const qrBatches = Object.keys(snapshot.val()).map(batchId => {
                    const batch = snapshot.val()[batchId];
                    return {
                        id: batchId,
                        createdAt: batch.createdAt,
                        points: batch.points,
                        couponCount: batch.couponCount,
                        active: true // Example: logic to track active status
                    };
                });
                res.render('view-qr', { qrBatches });
            } else {
                res.render('view-qr', { qrBatches: [] });
            }
        }).catch((error) => {
            console.error("Error fetching batches:", error);
            res.status(500).send("Error fetching batches.");
        });
    } else {
        res.redirect("/admin/login");
    }
});

// Serve the QR codes of a specific batch
adminRouter.get("/view-qr/:batchId", (req, res) => {
    const batchId = req.params.batchId;

    // Fetch the batch data from Firebase
    const batchRef = ref(db, `batches/${batchId}`);
    get(batchRef).then((snapshot) => {
        if (snapshot.exists()) {
            const batch = snapshot.val();
            res.render("view-qr-batch", {
                qrCodes: batch.qrCodes,
                batchId: batchId
            });
        } else {
            res.status(404).send("Batch not found.");
        }
    }).catch((error) => {
        console.error("Error fetching batch:", error);
        res.status(500).send("Error fetching batch.");
    });
});

// Add a new function for editing QR code points
adminRouter.put("/edit-qr/:qrCode", (req, res) => {
    const qrCode = req.params.qrCode;
    const newPoints = req.body.points;

    // Find the batch that contains the QR code
    const batchRef = ref(db, 'batches/');
    get(batchRef).then((snapshot) => {
        if (snapshot.exists()) {
            const batches = snapshot.val();
            for (const batchId in batches) {
                const batch = batches[batchId];
                const qr = batch.qrCodes.find(qr => qr.code === qrCode);
                if (qr) {
                    qr.points = newPoints;
                    update(ref(db, `batches/${batchId}`), { qrCodes: batch.qrCodes })
                        .then(() => res.send({ success: true, message: "Points updated successfully" }))
                        .catch((error) => res.status(500).send("Error updating points"));
                    return;
                }
            }
            res.status(404).send("QR code not found.");
        } else {
            res.status(404).send("No batches found.");
        }
    }).catch((error) => {
        console.error("Error fetching batches:", error);
        res.status(500).send("Error fetching batches.");
    });
});

// Route for toggling the status of a QR code (Activate/Deactivate)
adminRouter.put("/toggle-qr-status/:qrCode", async (req, res) => {
    const { qrCode } = req.params;
    let isUpdated = false;  // Flag to check if the QR code was updated
    let newStatus = null;   // To hold the updated status

    const batchRef = ref(db, 'batches/');

    try {
        const snapshot = await get(batchRef);

        if (snapshot.exists()) {
            const batches = snapshot.val();

            // Loop through each batch to find the QR code
            for (const batchId in batches) {
                const batch = batches[batchId];
                const qr = batch.qrCodes.find(qr => qr.code === qrCode);

                if (qr) {
                    // Toggle the QR code status between 'Active' and 'Inactive'
                    newStatus = qr.status === "Scanned" ? "Not Scanned" : "Scanned";
                    qr.status = newStatus;  // Update the status to the new status

                    // Update the batch in Firebase
                    await update(ref(db, `batches/${batchId}`), { qrCodes: batch.qrCodes });

                    // Mark as updated
                    isUpdated = true;

                    // Send a success response
                    return res.status(200).json({
                        message: "QR Code status updated successfully",
                        qrCode,
                        newStatus,
                    });
                }
            }

            // If QR code was not found in any batch
            if (!isUpdated) {
                return res.status(404).send(`QR Code ${qrCode} not found in any batch.`);
            }

        } else {
            return res.status(404).send("No batches found.");
        }

    } catch (error) {
        console.error("Error fetching batches:", error);
        return res.status(500).send("Error fetching batches.");
    }
});


// Route to generate QR code image
adminRouter.get("/view-qr-image/:qrCode", (req, res) => {
    const { qrCode } = req.params;

    // Generate QR Code as a PNG data URL
    QRCode.toDataURL(qrCode, { width: 300 }, (err, url) => {
        if (err) {
            res.status(500).send("Error generating QR code");
        } else {
            res.send(`<img src="${url}" alt="QR Code" />`);
        }
    });
});

// Download batch QR codes as a ZIP file
adminRouter.get("/download-batch/:batchId", async (req, res) => {
    const batchId = req.params.batchId;
    console.log(`Fetching batch with ID: ${batchId}`);

    const batchRef = ref(db, `batches/${batchId}`);

    try {
        // Fetch batch data from Firebase
        const snapshot = await get(batchRef);

        // Log the response from Firebase to check what is returned
        console.log("Batch data fetched from Firebase:", snapshot.val());

        if (!snapshot.exists()) {
            console.error(`Batch with ID ${batchId} not found in Firebase.`);
            return res.status(404).send("Batch not found.");
        }

        const batchData = snapshot.val();

        // Check if QR codes exist and are in the expected format
        if (!batchData.qrCodes || batchData.qrCodes.length === 0) {
            return res.status(404).send("No QR codes found in batch.");
        }

        const qrCodes = batchData.qrCodes; // Get the QR code array

        // Create a ZIP file stream
        const zipFilePath = path.join(__dirname, `${batchId}.zip`);
        const output = fs.createWriteStream(zipFilePath);
        const archive = archiver("zip", { zlib: { level: 9 } });

        archive.on("error", err => res.status(500).send({ error: err.message }));

        output.on("close", () => {
            // Send the ZIP file as a download
            res.download(zipFilePath, `${batchId}.zip`, err => {
                if (err) {
                    console.error("Error sending file:", err);
                } else {
                    // Optionally, delete the ZIP file after download
                    fs.unlinkSync(zipFilePath);
                }
            });
        });

        // Pipe the archive into the response stream
        archive.pipe(output);

        // Generate and append QR code images to the ZIP file
        const generateAndAppendQR = async (qrCode) => {
            try {
                // Validate QR code data (ensure it's a string and not empty)
                if (typeof qrCode.code !== 'string' || qrCode.code.trim() === '') {
                    console.warn(`Skipping invalid QR code data: ${qrCode.code}`);
                    return; // Skip invalid QR code
                }

                // Generate QR code image buffer
                const buffer = await QRCode.toBuffer(qrCode.code);
                const fileName = `${qrCode.code}.png`; // Use the QR code value as the file name
                archive.append(buffer, { name: fileName });
                console.log(`QR code generated for: ${qrCode.code}`);
            } catch (error) {
                console.error("Error generating QR code:", error);
            }
        };

        // Process QR codes in smaller batches (to avoid memory issues)
        const batchSize = 500; // Process 500 QR codes at a time
        for (let i = 0; i < qrCodes.length; i += batchSize) {
            const batch = qrCodes.slice(i, i + batchSize);
            const imagePromises = batch.map((qrCode) => generateAndAppendQR(qrCode));

            try {
                await Promise.all(imagePromises); // Generate and add the QR codes to the archive
            } catch (error) {
                console.error("Error generating QR codes:", error);
                return res.status(500).send({ error: "Error generating QR codes." });
            }
        }

        // Finalize the ZIP file
        archive.finalize();
    } catch (error) {
        console.error("Error fetching batch data:", error);
        res.status(500).send("Error fetching batch data.");
    }
});


// PUT route to handle batch point update
adminRouter.put('/edit-batch/:batchId', async (req, res) => {
    const batchId = req.params.batchId;
    const newPoints = req.body.points; // Points are passed in the request body

    // Check if the points are valid
    if (!newPoints || isNaN(newPoints)) {
        return res.status(400).json({ message: "Invalid points provided" });
    }

    const batchRef = ref(db, `batches/${batchId}`);

    try {
        // Fetch batch data from Firebase
        const snapshot = await get(batchRef);
        if (!snapshot.exists()) {
            return res.status(404).json({ message: "Batch not found." });
        }

        const batchData = snapshot.val();
        const qrCodes = batchData.qrCodes;

        // Update the batch-level points
        batchData.points = newPoints;

        // Update points for each QR code in the batch
        qrCodes.forEach(qr => {
            qr.points = newPoints; // Update the points field for each QR code
        });

        // Update the batch in Firebase (both batch-level points and QR codes)
        await update(batchRef, { points: batchData.points, qrCodes });

        // After updating, fetch the updated batch again to ensure it's reflected in the response
        const updatedSnapshot = await get(batchRef);
        const updatedBatch = updatedSnapshot.val();
        
        // Redirect back to view-qr page with updated batch info
        res.redirect(`/admin/view-qr/${batchId}`);
    } catch (error) {
        console.error("Error updating batch points:", error);
        res.status(500).json({ message: "Failed to update batch points" });
    }
});

// DELETE route to delete a batch
adminRouter.delete("/delete-batch/:batchId", async (req, res) => {
    const batchId = req.params.batchId;
    const { password } = req.body;  // Get the password from the request body

    // Check if password is correct
    const correctPassword = "1234";  // Password to delete the batch
    if (password !== correctPassword) {
        return res.status(403).send({ success: false, message: "Invalid password." });
    }

    const batchRef = ref(db, `batches/${batchId}`); // Reference to the specific batch in Firebase

    try {
        // Check if the batch exists in Firebase
        const snapshot = await get(batchRef);
        if (!snapshot.exists()) {
            return res.status(404).send({ success: false, message: "Batch not found." });
        }

        // Delete the batch from Firebase
        await remove(batchRef);

        res.status(200).send({ success: true, message: "Batch deleted successfully" });
    } catch (error) {
        console.error("Error deleting batch:", error);
        res.status(500).send({ success: false, message: "Failed to delete batch." });
    }
});

// Route for user management page
adminRouter.get('/user-management', async (req, res) => {
    try {
        const usersRef = ref(db, 'users');
        const snapshot = await get(usersRef);

        if (!snapshot.exists()) {
            return res.status(500).send('Error reading users data');
        }

        let users = snapshot.val(); // Get all users data from Firebase

        // Convert the users object into an array
        users = Object.values(users);

        // Sort users by serialNumber (if available) or createdAt in descending order
        users.sort((a, b) => {
            // Ensure serialNumber is treated as a number, fall back to createdAt if serialNumber is missing
            const aSerial = a.serialNumber ? parseInt(a.serialNumber, 10) : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
            const bSerial = b.serialNumber ? parseInt(b.serialNumber, 10) : (b.createdAt ? new Date(b.createdAt).getTime() : 0);

            return bSerial - aSerial; // Sort in descending order (latest first)
        });

        res.render('user-management', { users });
    } catch (err) {
        return res.status(500).send('Error fetching users data');
    }
});


// Route for QR History Page (Admin)
adminRouter.get('/qr-history/:mobileNumber', async (req, res) => {
    const mobileNumber = req.params.mobileNumber;  // Get the mobile number from the URL parameter

    try {
        const couponsRef = ref(db, 'coupons');
        const snapshot = await get(couponsRef);

        if (!snapshot.exists()) {
            return res.json({ success: false, message: 'Failed to fetch QR history.' });
        }

        let coupons = snapshot.val();
        coupons = Object.values(coupons);  // Convert Firebase object to array

        // Filter coupons by the given mobile number (for the admin)
        const userCoupons = coupons.filter(coupon => coupon.mobileNumber === mobileNumber);
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

        // Render the QR history page with the filtered coupon data
        res.render('qr-history-admin', { coupons: userCoupons });
    } catch (err) {
        return res.json({ success: false, message: 'Error fetching QR history.' });
    }
});

// Route to serve the edit form for user data
adminRouter.get('/edit-user/:mobileNumber', async (req, res) => {
    const mobileNumber = req.params.mobileNumber;

    try {
        const userRef = ref(db, `users/${mobileNumber}`);
        const snapshot = await get(userRef);

        if (!snapshot.exists()) {
            return res.status(404).send('User not found');
        }

        const user = snapshot.val(); // Get user data from Firebase
        res.render('edit-user', { user });
    } catch (err) {
        return res.status(500).send('Error fetching user data');
    }
});

// Route to handle form submission and update user data in Firebase
adminRouter.post('/edit-user/:mobileNumber', async (req, res) => {
    const mobileNumber = req.params.mobileNumber;

    try {
        const userRef = ref(db, `users/${mobileNumber}`);
        const snapshot = await get(userRef);

        if (!snapshot.exists()) {
            return res.status(404).send('User not found');
        }

        const updatedUserData = req.body;

        // Convert the wallet balance to a number (parse float or parse int depending on your needs)
        if (updatedUserData.walletBalance) {
            updatedUserData.walletBalance = parseFloat(updatedUserData.walletBalance);
        }

        // Update user details in Firebase
        await update(userRef, updatedUserData);

        res.redirect('/admin/user-management'); // Redirect to User Management page
    } catch (err) {
        return res.status(500).send('Error updating user data');
    }
});

// Route to get QR scan history (Admin)
adminRouter.get('/qr-admin-history', async (req, res) => {
    try {
        const qrHistoryRef = ref(db, 'coupons');
        const snapshot = await get(qrHistoryRef);

        if (!snapshot.exists()) {
            return res.status(500).send('Error reading coupon data');
        }

        let qrHistory = snapshot.val();
        qrHistory = Object.values(qrHistory);  // Convert Firebase object to array

        // Sort qrHistory by serialNumber in descending order (latest first)
        qrHistory.sort((a, b) => a.serialNumber - b.serialNumber);  // Assuming serialNumber is present in each coupon data

        res.render('qr-admin-history', { qrHistory });
    } catch (err) {
        return res.status(500).send('Error fetching QR history');
    }
});

// Route to display all users' wallet balances (Admin)
adminRouter.get('/wallet', async (req, res) => {
    try {
        const usersRef = ref(db, 'users');
        const snapshot = await get(usersRef);

        if (!snapshot.exists()) {
            return res.status(500).send('Error reading users data');
        }

        const users = snapshot.val();
        res.render('wallet', { users: Object.values(users) });
    } catch (err) {
        return res.status(500).send('Error fetching users data');
    }
});

// Backup route (using Firebase data)
adminRouter.post('/backup', (req, res) => {
    const { password } = req.body;

    // Check for password
    if (password !== '1234') {
        return res.status(401).send('Unauthorized');
    }

    // Firebase does not store data as files, so we need to fetch all necessary data
    // Use Firebase Admin SDK to get data (if necessary for backup purposes)
    // This is typically not required for Firebase-based backups, but can be implemented if needed.
    
    // Trigger backup logic here based on your database structure
    res.status(200).send('Backup process not implemented');
});

module.exports = adminRouter;
