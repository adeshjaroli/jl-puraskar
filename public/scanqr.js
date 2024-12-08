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
