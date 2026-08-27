// --- AUTH.JS MERGED CONTENT ---
var API_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? 'http://localhost:5000/api' : '/api';

document.addEventListener('DOMContentLoaded', () => {
    if (window.location.pathname.includes('auth.html') || window.location.pathname.endsWith('/frontend/') || window.location.pathname.endsWith('/frontend')) {
        const token = localStorage.getItem('token');
        if (token) {
            window.location.href = 'index.html';
        }
    }
});

window.switchTab = function (tab) {
    // Left empty or removed, tabs no longer exist
}

window.togglePasswordVisibility = function (inputId, iconElement) {
    const input = document.getElementById(inputId);
    if (!input) return;
    if (input.type === 'password') {
        input.type = 'text';
        iconElement.classList.remove('fa-eye-slash');
        iconElement.classList.add('fa-eye');
    } else {
        input.type = 'password';
        iconElement.classList.remove('fa-eye');
        iconElement.classList.add('fa-eye-slash');
    }
}

window.showAlert = function (message, type = 'error') {
    if (type === 'error' || type === 'warning') {
        const audio = new Audio('freesound_community-beep-warning-6387.mp3');
        audio.play().catch(e => console.log('Audio play failed:', e));
    }
    const alertBox = document.getElementById('alert-message');
    if (alertBox) {
        alertBox.textContent = message;
        alertBox.className = "alert-message " + type;
        alertBox.style.display = 'block';
    }
}

window.validateEmailRealtime = function (email) {
    const icon = document.getElementById('email-valid-icon');
    if (!icon) return;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (emailRegex.test(email)) {
        icon.style.display = 'block';
    } else {
        icon.style.display = 'none';
    }
}

window.validatePasswordRealtime = function (password) {
}

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('login-username').value;
            const password = document.getElementById('login-password').value;
            const btn = document.getElementById('login-submit');

            btn.disabled = true;
            btn.innerHTML = '<span>Logging in...</span> <i class="fa-solid fa-spinner fa-spin"></i>';

            try {
                const response = await fetch(API_URL + '/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });

                const data = await response.json();

                if (response.ok) {
                    localStorage.setItem('token', data.token);
                    localStorage.setItem('user', JSON.stringify(data.user));
                    window.location.href = 'index.html';
                } else {
                    window.showAlert(data.message || 'Login failed');
                }
            } catch (err) {
                window.showAlert('Cannot connect to server.');
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<span>Login</span> <i class="fa-solid fa-arrow-right"></i>';
            }
        });
    }

    // Registration logic moved to authenticated settings panel
});

// --- Interactive Ambient Background Logic ---
document.addEventListener("DOMContentLoaded", () => {
    const ambientBg = document.getElementById("ambient-bg");
    if (ambientBg) {
        document.addEventListener("mousemove", (e) => {
            const x = (e.clientX / window.innerWidth) * 100;
            const y = (e.clientY / window.innerHeight) * 100;
            ambientBg.style.backgroundImage = `radial-gradient(circle at ${x}% ${y}%, rgba(225, 29, 72, 0.20) 0%, rgba(255, 255, 255, 0) 60%)`;
        });
    }
});

