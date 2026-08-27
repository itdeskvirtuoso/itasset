// --- AUTH.JS MERGED CONTENT ---
var API_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? 'http://localhost:5000/api' : '/api';

document.addEventListener('DOMContentLoaded', () => {
    if (window.location.pathname.includes('auth.html') || window.location.pathname.endsWith('/frontend/') || window.location.pathname.endsWith('/frontend')) {
        const token = localStorage.getItem('token');
        if (token) {
            window.location.href = 'index.html';
        }
    }

    // Slide to Unlock Logic
    initSlider();
    
    // Typewriter Label Animation
    setTimeout(() => {
        typeWriterEffect('system-welcome-label', 'Welcome to the IT Asset Management');
    }, 500); // Slight delay for dramatic effect
});

function typeWriterEffect(elementId, text) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.textContent = '';
    let i = 0;
    
    function type() {
        if (i < text.length) {
            el.textContent += text.charAt(i);
            i++;
            // Randomize typing speed slightly for organic feel
            let speed = Math.random() * 50 + 30; 
            setTimeout(type, speed);
        } else {
            // Typing finished, let cursor blink
        }
    }
    type();
}

window.switchTab = function (tab) {
    // Left empty or removed, tabs no longer exist
}

function initSlider() {
    const container = document.getElementById('slide-container');
    const thumb = document.getElementById('slide-thumb');
    const fill = document.getElementById('slide-fill');

    if (!container || !thumb || !fill) return;

    let isDragging = false;
    let startX = 0;
    let currentX = 5; // Initial left position
    const maxDrag = container.offsetWidth - thumb.offsetWidth - 5;

    const startDrag = (e) => {
        isDragging = true;
        startX = e.type.includes('mouse') ? e.pageX : e.touches[0].pageX;
        thumb.style.transition = 'none';
        fill.style.transition = 'none';
    };

    const onDrag = (e) => {
        if (!isDragging) return;
        const pageX = e.type.includes('mouse') ? e.pageX : e.touches[0].pageX;
        let walk = pageX - startX;
        let newLeft = Math.max(5, Math.min(maxDrag, currentX + walk));

        thumb.style.left = newLeft + 'px';
        fill.style.width = (newLeft + (thumb.offsetWidth / 2)) + 'px';

        // Unlock threshold
        if (newLeft >= maxDrag - 5) {
            isDragging = false;
            thumb.style.left = maxDrag + 'px';
            fill.style.width = '100%';
            setTimeout(() => {
                window.showLoginForm();
                // Reset after showing form so it's ready if they go back
                setTimeout(() => {
                    thumb.style.transition = 'left 0.3s ease';
                    fill.style.transition = 'width 0.3s ease';
                    thumb.style.left = '5px';
                    fill.style.width = '0';
                    currentX = 5;
                }, 1000);
            }, 100);
        }
    };

    const stopDrag = () => {
        if (!isDragging) return;
        isDragging = false;
        const currentLeft = parseInt(thumb.style.left || 5);
        if (currentLeft < maxDrag - 5) {
            // Snap back
            thumb.style.transition = 'left 0.3s ease';
            fill.style.transition = 'width 0.3s ease';
            thumb.style.left = '5px';
            fill.style.width = '0';
            currentX = 5;
        }
    };

    thumb.addEventListener('mousedown', startDrag);
    thumb.addEventListener('touchstart', startDrag, { passive: true });

    document.addEventListener('mousemove', onDrag);
    document.addEventListener('touchmove', onDrag, { passive: true });

    document.addEventListener('mouseup', stopDrag);
    document.addEventListener('touchend', stopDrag);
}

window.showLoginForm = function () {
    const welcomeStep = document.getElementById('step-welcome');
    const loginForm = document.getElementById('login-form');
    const authSubtitle = document.getElementById('auth-subtitle');

    // Surprise Blast Animation!
    if (typeof confetti !== 'undefined') {
        const count = 200;
        const defaults = {
            origin: { y: 0.7 }
        };

        function fire(particleRatio, opts) {
            confetti(Object.assign({}, defaults, opts, {
                particleCount: Math.floor(count * particleRatio)
            }));
        }

        fire(0.25, { spread: 26, startVelocity: 55 });
        fire(0.2, { spread: 60 });
        fire(0.35, { spread: 100, decay: 0.91, scalar: 0.8 });
        fire(0.1, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 });
        fire(0.1, { spread: 120, startVelocity: 45 });
    }

    if (welcomeStep && loginForm) {
        welcomeStep.style.opacity = '0';
        welcomeStep.style.transform = 'scale(0.8)';
        if (authSubtitle) {
            authSubtitle.style.opacity = '0';
            setTimeout(() => { authSubtitle.textContent = 'Enter your credentials'; authSubtitle.style.opacity = '1'; }, 300);
        }

        setTimeout(() => {
            welcomeStep.style.display = 'none';
            loginForm.style.display = 'block';

            // Force reflow for animation
            void loginForm.offsetWidth;

            loginForm.style.opacity = '1';
            loginForm.style.transform = 'translateY(0) scale(1)';
            document.getElementById('login-username').focus();
        }, 300);
    }
}

window.hideLoginForm = function () {
    const welcomeStep = document.getElementById('step-welcome');
    const loginForm = document.getElementById('login-form');
    const authSubtitle = document.getElementById('auth-subtitle');

    if (welcomeStep && loginForm) {
        loginForm.style.opacity = '0';
        loginForm.style.transform = 'translateY(30px)';
        if (authSubtitle) {
            authSubtitle.style.opacity = '0';
            setTimeout(() => { authSubtitle.textContent = 'Sign in to continue'; authSubtitle.style.opacity = '1'; }, 300);
        }

        setTimeout(() => {
            loginForm.style.display = 'none';
            welcomeStep.style.display = 'flex';

            // Force reflow
            void welcomeStep.offsetWidth;

            welcomeStep.style.opacity = '1';
            welcomeStep.style.transform = 'scale(1)';
        }, 400);
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

