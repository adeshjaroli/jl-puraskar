document.getElementById('enter-code-btn').addEventListener('click', async () => {
    const qrCode = document.getElementById('manual-code').value.trim();
    const statusMessage = document.getElementById('status-message');

    if (!qrCode) {
        statusMessage.textContent = 'Please enter a QR code.';
        statusMessage.style.color = 'red';
        return;
    }

    try {
        const response = await fetch('/user/scan-qr', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ qrCode }),
        });

        const result = await response.json();

        if (result.success) {
            statusMessage.textContent = `${result.message} Points added: ${result.points}`;
            statusMessage.style.color = 'green';
        } else {
            statusMessage.textContent = result.message;
            statusMessage.style.color = 'red';
        }
    } catch (error) {
        console.error('Error scanning QR Code:', error);
        statusMessage.textContent = 'Error scanning QR Code.';
        statusMessage.style.color = 'red';
    }
});

document.addEventListener("DOMContentLoaded", () => {
    const cameraStatus = document.getElementById("camera-status");

    // Initialize the QR Code scanner
    const qrReader = new Html5Qrcode("qr-reader");

    // Start the scanner
    qrReader.start(
        { facingMode: "environment" }, // Use rear camera
        {
            fps: 10, // Frames per second
            qrbox: 250, // Scanning area size
        },
        (decodedText) => {
            // Successfully scanned QR code
            cameraStatus.textContent = `QR Code Scanned: ${decodedText}`;
            addPoints(decodedText);
        },
        (errorMessage) => {
            // Continually provide feedback while scanning
            console.warn("Scanning error:", errorMessage);
            cameraStatus.textContent = "Scanning...";
        }
    ).catch((error) => {
        // Handle errors during camera initialization
        console.error("Camera initialization failed:", error);
        cameraStatus.textContent = `Camera error: ${error.message || error}`;
    });

    // Fallback for Manual Code Entry
    document.getElementById("enter-code-btn").addEventListener("click", () => {
        const code = document.getElementById("manual-code").value.trim();
        if (code) {
            addPoints(code);
        } else {
            cameraStatus.textContent = "Please enter a valid code.";
        }
    });

    // Function to send scanned code to the backend
    function addPoints(code) {
        fetch("/add-points", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ code }),
        })
            .then((response) => response.json())
            .then((data) => {
                if (data.success) {
                    cameraStatus.textContent = "Points added successfully!";
                } else {
                    cameraStatus.textContent = "Failed to add points.";
                }
            })
            .catch((error) => {
                console.error("Error submitting code:", error);
                cameraStatus.textContent = "An error occurred while adding points.";
            });
    }
});

   // Initialize the QR Code scanner using html5-qrcode
   function onScanSuccess(decodedText, decodedResult) {
    // Display the decoded text (QR code data)
    console.log("Scanned QR Code: " + decodedText);

    // Automatically fill the input field with the scanned code
    document.getElementById("manual-code").value = decodedText;

    // Display status message
    document.getElementById("status-message").innerHTML = "QR Code Scanned: " + decodedText;
    document.getElementById("camera-status").innerText = 'QR Code scanned, please click submit.';
}

function onScanError(errorMessage) {
    // Log scan errors for debugging
    console.log(errorMessage);
    document.getElementById("camera-status").innerText = "Error: " + errorMessage;
}

// Start the QR scanner when the page loads
function startScanner() {
    const cameraStatus = document.getElementById("camera-status");

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        cameraStatus.innerText = "Camera access is not supported on this device.";
        return;
    }

    // Request camera permission and start scanner
    navigator.mediaDevices.getUserMedia({ video: true })
        .then(() => {
            const html5QrcodeScanner = new Html5QrcodeScanner(
                "qr-reader", {
                    fps: 10,   // Frames per second
                    qrbox: 250, // The size of the scanning box (for QR code detection)
                    aspectRatio: 1, // Maintain aspect ratio for the scanner box
                }
            );
            html5QrcodeScanner.render(onScanSuccess, onScanError);
        })
        .catch(err => {
            cameraStatus.innerText = "Camera access denied or unavailable.";
            console.error("Camera permission error:", err);
        });
}

// Handle the manual submission of QR code
document.getElementById("enter-code-btn").addEventListener("click", function() {
    const qrCode = document.getElementById("manual-code").value.trim();

    if (!qrCode || qrCode.length !== 9) {
        alert("Please enter a valid 9-digit QR code.");
        return;
    }

    // Send the QR code data to the backend for processing
    fetch('/user/scan-qr', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            qrCode: qrCode
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Notify user that points have been added
            document.getElementById("status-message").innerHTML = `QR Code Scanned Successfully! Points: ${data.points}`;
            alert("Points have been added to your wallet!");
            // Optionally, trigger a server-side action to mark the coupon as scanned
        } else {
            document.getElementById("status-message").innerHTML = data.message || 'Error processing QR Code';
        }
    })
    .catch(error => {
        document.getElementById("status-message").innerHTML = 'Error sending QR Code to server.';
        console.error('Error:', error);
    });
});

// Start the camera scan when the page loads
window.onload = function() {
    startScanner();
};
