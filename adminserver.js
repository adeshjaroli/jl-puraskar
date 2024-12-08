const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const fs = require("fs");
const QRCode = require("qrcode");
const archiver = require("archiver"); // To create ZIP files

const adminRouter = express.Router();

// Middleware for static files and body parsing
adminRouter.use(express.static(path.join(__dirname, "public")));
adminRouter.use(bodyParser.urlencoded({ extended: true }));
adminRouter.use(bodyParser.json());

// Directory where batches are stored
const batchesDir = path.join(__dirname, "qr_batches");
const couponDataFile = path.join(__dirname, 'data', 'couponData.json');
const USERS_FILE_PATH = path.join(__dirname, 'data', 'users.json');

// Ensure the batches directory exists
if (!fs.existsSync(batchesDir)) {
    fs.mkdirSync(batchesDir, { recursive: true });
}

// Function to get the next batch ID
function getNextBatchId() {
    const batchFolders = fs.readdirSync(batchesDir).filter(folder =>
        folder.startsWith("QR") && !folder.includes(".")
    );

    if (batchFolders.length === 0) {
        return "QR0001"; // Start with QR0001 if no batches exist
    }

    // Get the highest batch number
    const highestBatch = Math.max(
        ...batchFolders.map(folder => parseInt(folder.slice(2), 10))
    );

    // Return the next batch ID
    return `QR${String(highestBatch + 1).padStart(4, "0")}`;
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
    const batchId = getNextBatchId(); // Get the next batch ID
    const timestamp = new Date().toISOString();

    const batchDir = path.join(batchesDir, batchId);
    fs.mkdirSync(batchDir, { recursive: true });

    const batchFile = path.join(batchDir, `${batchId}_batch.txt`); // Consolidated batch file
    const batchStream = fs.createWriteStream(batchFile, { flags: "a" });

    for (let i = 0; i < numQrs; i++) {
        const qrCodeData = generateRandomString(9);

        batchStream.write(
            `QR Code: ${qrCodeData}\nPoints: ${points}\nStatus: Not Scanned\nCreated At: ${timestamp}\n\n`
        );
    }

    batchStream.end();

    res.send(`
        <h2>Generated QR Codes (Batch: ${batchId}) successfully!</h2>
        <p>Batch saved in folder: ${batchId}</p>
    `);
});

// Serve the home page (admin dashboard)
adminRouter.get("/", (req, res) => {
    if (req.session.loggedIn) {
        res.redirect("/home");
    } else {
        res.redirect("/login");
    }
});

adminRouter.get("/view-qr", (req, res) => {
    if (req.session.loggedIn) {
        // Fetch all QR batch directories from the "qr_batches" directory
        const qrBatchDirs = fs.readdirSync(batchesDir).filter((file) =>
            fs.statSync(path.join(batchesDir, file)).isDirectory()
        );

        // Create an array to store the batch details (batch name, date, points, total QR codes)
        const qrBatches = qrBatchDirs.map((batchDir) => {
            const batchFilePath = path.join(batchesDir, batchDir, `${batchDir}_batch.txt`);

            // Check if the batch file exists, then read its content
            if (fs.existsSync(batchFilePath)) {
                const batchContent = fs.readFileSync(batchFilePath, 'utf8');
                const qrCodes = [];
                let batchDate = '';
                let points = '';
                
                // Loop through the batch content and extract the relevant data
                const lines = batchContent.split('\n');
                lines.forEach((line) => {
                    // Extract batch creation date
                    if (line.startsWith('Created At:')) {
                        batchDate = line.split(':')[1].trim();
                    }

                    // Extract points associated with each QR code
                    if (line.startsWith('Points:')) {
                        points = line.split(':')[1].trim();
                    }

                    // Extract QR codes
                    if (line.startsWith('QR Code:')) {
                        const qrCode = line.split(':')[1].trim();
                        qrCodes.push(qrCode);
                    }
                });

                return {
                    id: batchDir,             // Batch code (e.g., QR0001)
                    createdAt: batchDate,     // Batch creation date
                    points: points,           // Points associated with each QR code
                    couponCount: qrCodes.length,  // Total number of QR codes in the batch
                    active: true              // Example: add logic to track active status
                };
            }
            return null;
        }).filter(batch => batch !== null); // Filter out null results

        // Render the 'view-qr' page with qrBatches data
        res.render('view-qr', { qrBatches });
    } else {
        res.redirect("/admin/login");
    }
});

// Serve the QR codes of a specific batch
adminRouter.get("/view-qr/:batchId", (req, res) => {
    const batchId = req.params.batchId;
    const batchDir = path.join(batchesDir, batchId);
    
    // Read the batch file
    const batchFilePath = path.join(batchDir, `${batchId}_batch.txt`);
    
    fs.readFile(batchFilePath, "utf8", (err, data) => {
        if (err) {
            return res.status(500).send("Unable to read the batch file.");
        }

        // Parse the QR code details from the file content
        const qrCodes = parseBatchData(data);

        // Render the view-qr-batch page with the QR code data
        res.render("view-qr-batch", { qrCodes, batchId });
    });
});

// Helper function to parse batch file content
function parseBatchData(batchData) {
    const qrCodes = [];
    const lines = batchData.split("\n");
    
    let qrCode = {};
    lines.forEach(line => {
        if (line.includes("QR Code:")) {
            if (qrCode.code) {
                qrCodes.push(qrCode);
            }
            qrCode = { code: line.split(":")[1].trim() };
        }
        if (line.includes("Points:")) {
            qrCode.points = line.split(":")[1].trim();
        }
        if (line.includes("Status:")) {
            qrCode.status = line.split(":")[1].trim();
        }
        if (line.includes("Created At:")) {
            qrCode.createdAt = line.split(":")[1].trim();
        }
    });
    if (qrCode.code) {
        qrCodes.push(qrCode);
    }
    return qrCodes;
}

// Add a new function for editing QR code points
adminRouter.put("/edit-qr/:qrCode", (req, res) => {
    const qrCode = req.params.qrCode;
    const newPoints = req.body.points;
    const batchId = findBatchForQRCode(qrCode); // Find the batch

    if (!batchId) {
        return res.status(404).send("QR code not found in any batch.");
    }

    const batchFilePath = path.join(batchesDir, batchId, `${batchId}_batch.txt`);
    let batchData = fs.readFileSync(batchFilePath, "utf8");
    
    // Modify the points for the given QR code
    batchData = batchData.replace(
        new RegExp(`(QR Code: ${qrCode}\\s+Points:)(.*)`),
        `$1 ${newPoints}`
    );

    // Write the updated batch file
    fs.writeFileSync(batchFilePath, batchData);

    res.send({ success: true, message: "Points updated successfully" });
});

// Helper function to find the batch for a QR code
function findBatchForQRCode(qrCode) {
    const batchDirs = fs.readdirSync(batchesDir);

    for (const batchId of batchDirs) {
        const batchFilePath = path.join(batchesDir, batchId, `${batchId}_batch.txt`);
        
        if (fs.existsSync(batchFilePath)) {
            const batchData = fs.readFileSync(batchFilePath, "utf8");
            
            if (batchData.includes(`QR Code: ${qrCode}`)) {
                return batchId;
            }
        }
    }

    return null; // Return null if not found
}

adminRouter.put("/toggle-qr-status/:qrCode", (req, res) => {
    const { qrCode } = req.params;
    let isUpdated = false; // Flag to check if the QR code was updated
    let newStatus = null; // To hold the updated status

    // Read all batch directories
    fs.readdir(batchesDir, (err, batchDirs) => {
        if (err) {
            console.error("Error reading batches directory:", err);
            return res.status(500).send("Internal server error");
        }

        // Loop through all batch files
        for (const batchDir of batchDirs) {
            const batchFilePath = path.join(batchesDir, batchDir, `${batchDir}_batch.txt`);

            if (fs.existsSync(batchFilePath)) {
                let fileContent = fs.readFileSync(batchFilePath, "utf8");

                if (fileContent.includes(`QR Code: ${qrCode}`)) {
                    // If QR Code is found, toggle its status
                    const updatedContent = fileContent.replace(
                        new RegExp(`QR Code: ${qrCode}\\nPoints: (\\d+)\\nStatus: (Scanned|Not Scanned)`, "g"),
                        (match, points, status) => {
                            newStatus = status === "Scanned" ? "Not Scanned" : "Scanned";
                            isUpdated = true;
                            return `QR Code: ${qrCode}\nPoints: ${points}\nStatus: ${newStatus}`;
                        }
                    );

                    // Write the updated content back to the file
                    fs.writeFileSync(batchFilePath, updatedContent, "utf8");

                    // Send a success response
                    return res.status(200).json({
                        message: "QR Code status updated successfully",
                        qrCode,
                        newStatus,
                    });
                }
            }
        }

        if (!isUpdated) {
            return res.status(404).send(`QR Code ${qrCode} not found in any batch.`);
        }
    });
});

// Route to generate QR code image
adminRouter.get("/view-qr-image/:qrCode", (req, res) => {
    const { qrCode } = req.params;

    // Generate QR Code as a PNG data URL
    QRCode.toDataURL(qrCode, { width: 300 }, (err, url) => {
        if (err) {
            console.error("Error generating QR code:", err);
            return res.status(500).send("Error generating QR code.");
        }

        // Render the QR code in an HTML page
        res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>QR Code for ${qrCode}</title>
                <style>
                    body {
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        height: 100vh;
                        background-color: #f9f9f9;
                        font-family: Arial, sans-serif;
                        margin: 0;
                    }
                    .qr-container {
                        text-align: center;
                    }
                    .qr-container img {
                        max-width: 100%;
                        height: auto;
                    }
                    .qr-container h1 {
                        font-size: 24px;
                        color: #333;
                        margin-bottom: 20px;
                    }
                </style>
            </head>
            <body>
                <div class="qr-container">
                    <h1>QR Code for: ${qrCode}</h1>
                    <img src="${url}" alt="QR Code">
                    <button onclick="window.close()">Close</button>
                </div>
            </body>
            </html>
        `);
    });
});

// Download batch QR codes as a ZIP file
adminRouter.get("/download-batch/:batchId", async (req, res) => {
    const batchId = req.params.batchId;
    const batchDir = path.join(batchesDir, batchId);
    const batchFilePath = path.join(batchDir, `${batchId}_batch.txt`);

    // Ensure batch file exists
    if (!fs.existsSync(batchFilePath)) {
        return res.status(404).send("Batch not found.");
    }

    // Read QR code data from the batch file
    const batchContent = fs.readFileSync(batchFilePath, "utf8");
    const qrCodes = [];
    batchContent.split("\n").forEach(line => {
        if (line.startsWith("QR Code:")) {
            qrCodes.push(line.split(":")[1].trim());
        }
    });

    // Create a ZIP file stream
    const zipFilePath = path.join(batchDir, `${batchId}.zip`);
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

    // Function to generate and append QR code image to the ZIP file
    const generateAndAppendQR = async (qrCode) => {
        const buffer = await QRCode.toBuffer(qrCode);
        // Use the 9-digit QR code as the filename
        const fileName = `${qrCode}.png`; // Use the QR code value as the file name
        archive.append(buffer, { name: fileName });
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
});

// Helper function to ensure the directory exists
function ensureDirectoryExistence(filePath) {
    const dirname = path.dirname(filePath);
    if (fs.existsSync(dirname)) {
        return true;
    } else {
        fs.mkdirSync(dirname, { recursive: true });
        return false;
    }
}

// Helper function to read a batch file and return its contents
function readBatchFile(batchId) {
    const batchFilePath = path.join(__dirname, `../jl puraskar/qr_batches/${batchId}/${batchId}_batch.txt`);
    
    // Ensure the directory exists
    ensureDirectoryExistence(batchFilePath);

    return new Promise((resolve, reject) => {
        fs.readFile(batchFilePath, 'utf8', (err, data) => {
            if (err) {
                reject(err);
            } else {
                resolve(data);
            }
        });
    });
}

// Helper function to write to the batch file
function writeBatchFile(batchId, data) {
    const batchFilePath = path.join(__dirname, `../jl puraskar/qr_batches/${batchId}/${batchId}_batch.txt`);
    
    // Ensure the directory exists
    ensureDirectoryExistence(batchFilePath);

    return new Promise((resolve, reject) => {
        fs.writeFile(batchFilePath, data, 'utf8', (err) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

// PUT route to handle batch point update
adminRouter.put('/edit-batch/:batchId', async (req, res) => {
    const batchId = req.params.batchId;
    const newPoints = req.body.points; // Points are passed in the request body

    // Check if the points are valid
    if (!newPoints || isNaN(newPoints)) {
        return res.status(400).json({ message: "Invalid points provided" });
    }

    try {
        // Read the batch file to get all QR code data
        let batchData = await readBatchFile(batchId);

        // Split the data by QR code entry
        let qrCodes = batchData.split('QR Code:');

        // Update points for each QR code in the batch
        qrCodes = qrCodes.map(qrCode => {
            if (qrCode.includes('Points:')) {
                // Replace the existing points with the new points
                return qrCode.replace(/Points: \d+/g, `Points: ${newPoints}`);
            }
            return qrCode;
        });

        // Rebuild the batch data
        let updatedBatchData = qrCodes.join('QR Code:');

        // Write the updated data back to the batch file
        await writeBatchFile(batchId, updatedBatchData);

        res.status(200).json({ message: "Batch points updated successfully" });
    } catch (error) {
        console.error("Error updating batch points:", error);
        res.status(500).json({ message: "Failed to update batch points" });
    }
});

// Define the correct password at the top of the file
const correctPassword = "1234";  // Password to delete the batch

// Route to delete a batch with password authentication
adminRouter.delete("/delete-batch/:batchId", (req, res) => {
    const batchId = req.params.batchId;
    const batchDir = path.join(batchesDir, batchId);
    const { password } = req.body;  // Get the password from the request body

    // Check if password is correct
    if (password !== correctPassword) {
        return res.status(403).send({ success: false, message: "Invalid password." });
    }

    // Check if the batch directory exists
    if (!fs.existsSync(batchDir)) {
        return res.status(404).send({ success: false, message: "Batch not found." });
    }

    // Delete the batch directory and its contents
    try {
        // Use recursive removal to delete the directory and all its files
        fs.rmSync(batchDir, { recursive: true, force: true });

        res.status(200).send({ success: true, message: "Batch deleted successfully" });
    } catch (err) {
        console.error("Error deleting batch:", err);
        res.status(500).send({ success: false, message: "Failed to delete batch." });
    }
});

// Route for user management page
adminRouter.get('/user-management', (req, res) => {
    // Read data from users.json file
    fs.readFile('data/users.json', 'utf8', (err, data) => {
        if (err) {
            return res.status(500).send('Error reading users data');
        }

        let users = JSON.parse(data); // Parse the JSON data

        // Reverse the order of users to show the latest first
        users.reverse();

        res.render('user-management', { users }); // Pass the reversed users data to EJS template
    });
});


// Route for QR History Page (Admin)
adminRouter.get('/qr-history/:mobileNumber',  (req, res) => {
    const mobileNumber = req.params.mobileNumber;  // Get the mobile number from the URL parameter

    // Read the coupon data file to get the history of scanned QR codes
    fs.readFile(couponDataFile, 'utf8', (err, data) => {
        if (err) {
            return res.json({ success: false, message: 'Failed to fetch QR history.' });
        }

        let coupons = JSON.parse(data);

        // Filter coupons by the given mobile number (for the admin)
        const userCoupons = coupons.filter(coupon => coupon.mobileNumber === mobileNumber);

        // Render the QR history page with the filtered coupon data
        res.render('qr-history-admin', { coupons: userCoupons });
    });
});

// Utility function to read users from the file
function readUsers() {
    const data = fs.readFileSync(USERS_FILE_PATH, 'utf8');
    return JSON.parse(data);
}

// Utility function to write users back to the file
function writeUsers(users) {
    fs.writeFileSync(USERS_FILE_PATH, JSON.stringify(users, null, 2), 'utf8');
}

// Route to serve the edit form
adminRouter.get('/edit-user/:mobileNumber', (req, res) => {
    const mobileNumber = req.params.mobileNumber;
    const users = readUsers();
    const user = users.find(u => u.mobileNumber === mobileNumber);

    if (!user) {
        return res.status(404).send('User not found');
    }

    res.render('edit-user', { user }); // Render the edit-user.ejs with user data
});

// Route to handle form submission and update user
adminRouter.post('/edit-user/:mobileNumber', (req, res) => {
    const mobileNumber = req.params.mobileNumber;
    const users = readUsers();
    const userIndex = users.findIndex(u => u.mobileNumber === mobileNumber);

    if (userIndex === -1) {
        return res.status(404).send('User not found');
    }

    // Convert the wallet balance to a number (parse float or parse int depending on your needs)
    if (req.body.walletBalance) {
        req.body.walletBalance = parseFloat(req.body.walletBalance);
    }

    // Update user details
    users[userIndex] = {
        ...users[userIndex], // Keep existing data
        ...req.body // Overwrite with new data from form
    };

    writeUsers(users); // Save updated data

    res.redirect('/admin/user-management'); // Redirect back to User Management page
});


// Route to get QR scan history
adminRouter.get('/qr-admin-history', (req, res) => {
    const filePath = path.join(__dirname, 'data', 'coupondata.json');
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error("Error reading coupon data", err);
            return res.status(500).send("Server Error");
        }
        const qrHistory = JSON.parse(data);
        res.render('qr-admin-history', { qrHistory });
    });
});

// Route to display all users' wallet balances
adminRouter.get('/wallet', (req, res) => {
    const users = readUsers();

    // Render the wallet balances page with the users' data
    res.render('wallet', { users });
});

// Backup route
adminRouter.post('/backup', (req, res) => {
    const { password } = req.body;

    // Check for password
    if (password !== '1234') {
        return res.status(401).send('Unauthorized');
    }

    // Create a backup folder
    const backupFolder = path.join(__dirname, 'backup');
    const date = new Date().toISOString().split('T')[0];  // Get the current date
    const backupDir = path.join(backupFolder, `backup-${date}`);

    // Make sure the backup directory exists
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }

    // Copy qr_batches and data folders to the backup folder
    const qrBatchesFolder = path.join(__dirname, 'qr_batches');
    const dataFolder = path.join(__dirname, 'data');
    
    // Add these folders to a zip file
    const output = fs.createWriteStream(path.join(backupDir, `backup-${date}.zip`));
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', function() {
        console.log(`Backup has been created, total bytes: ${archive.pointer()}`);
        res.download(path.join(backupDir, `backup-${date}.zip`)); // Trigger the download
    });

    archive.on('error', function(err) {
        throw err;
    });

    archive.pipe(output);

    // Add the qr_batches and data folders to the zip archive
    archive.directory(qrBatchesFolder, 'qr_batches');
    archive.directory(dataFolder, 'data');

    // Finalize the archive
    archive.finalize();
});

module.exports = adminRouter;
