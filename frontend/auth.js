// --- AUTH.JS MERGED CONTENT ---
var API_URL = 'http://localhost:5000/api';

document.addEventListener('DOMContentLoaded', () => {
    if (window.location.pathname.includes('auth.html') || window.location.pathname.endsWith('/frontend/') || window.location.pathname.endsWith('/frontend')) {
        const token = localStorage.getItem('token');
        if (token) {
            window.location.href = 'index.html';
        }
    }
});

window.switchTab = function (tab) {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const btnLogin = document.getElementById('btn-login');
    const btnRegister = document.getElementById('btn-register');
    const subtitle = document.getElementById('auth-subtitle');
    const alertMsg = document.getElementById('alert-message');

    if (!loginForm) return;
    alertMsg.style.display = 'none';

    if (tab === 'login') {
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
        btnLogin.classList.add('active');
        btnRegister.classList.remove('active');
        subtitle.textContent = 'Sign in to continue';
    } else {
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
        btnLogin.classList.remove('active');
        btnRegister.classList.add('active');
        subtitle.textContent = 'Create a new account';
    }
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
            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;
            const btn = document.getElementById('login-submit');

            btn.disabled = true;
            btn.innerHTML = '<span>Logging in...</span> <i class="fa-solid fa-spinner fa-spin"></i>';

            try {
                const response = await fetch(API_URL + '/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
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

    const registerForm = document.getElementById('register-form');
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('register-name').value;
            const email = document.getElementById('register-email').value;
            const role = document.getElementById('register-role').value;
            const password = document.getElementById('register-password').value;
            const btn = document.getElementById('register-submit');

            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                window.showAlert('Please enter a valid email address.');
                return;
            }
            if (password.length < 6) {
                window.showAlert('Password must be at least 6 characters.');
                return;
            }
            if (!role) {
                window.showAlert('Please select a role.');
                return;
            }

            btn.disabled = true;
            btn.innerHTML = '<span>Registering...</span> <i class="fa-solid fa-spinner fa-spin"></i>';

            try {
                const response = await fetch(API_URL + '/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, email, role, password })
                });

                const data = await response.json();

                if (response.ok) {
                    window.showAlert('Registration successful! Logging in...', 'success');
                    localStorage.setItem('token', data.token);
                    localStorage.setItem('user', JSON.stringify(data.user));
                    setTimeout(() => {
                        window.location.href = 'index.html';
                    }, 1000);
                } else {
                    window.showAlert(data.message || 'Registration failed');
                }
            } catch (err) {
                window.showAlert('Cannot connect to server.');
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<span>Register Account</span> <i class="fa-solid fa-arrow-right"></i>';
            }
        });
    }
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

