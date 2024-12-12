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
