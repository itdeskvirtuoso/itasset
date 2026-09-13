// ==========================================
// LOGIN FLOW
// 1. Welcome  — swipe the slider (or focus it and press Enter)
// 2. Sign in  — username + password, checked by the server against MongoDB
// 3. Success  — greet the user, then open the dashboard
// A saved token is re-checked with /api/auth/me before the login is skipped.
// ==========================================
var API_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? 'http://localhost:5000/api' : '/api';

(function () {
    const STEPS = ['welcome', 'login', 'enter'];
    const $ = (id) => document.getElementById(id);
    let step = 'welcome';

    // --- Step state: drives the guide badge (CSS) and the progress list ---
    function setStep(next) {
        step = next;
        document.body.dataset.step = next;
        const current = STEPS.indexOf(next === 'success' ? 'enter' : next);
        document.querySelectorAll('.auth-steps li').forEach((li) => {
            const i = STEPS.indexOf(li.dataset.step);
            li.classList.toggle('is-done', i < current || next === 'success');
            li.classList.toggle('is-current', i === current && next !== 'success');
            if (i === current) li.setAttribute('aria-current', 'step');
            else li.removeAttribute('aria-current');
        });
    }

    function swapPanel(from, to) {
        from.classList.add('is-leaving');
        setTimeout(() => {
            from.hidden = true;
            from.classList.remove('is-leaving');
            to.hidden = false;
            to.classList.remove('is-entering');
            void to.offsetWidth; // restart the entrance animation
            to.classList.add('is-entering');
        }, 250);
    }

    function setSubtitle(text) {
        const el = $('auth-subtitle');
        el.classList.add('is-fading');
        setTimeout(() => {
            el.textContent = text;
            el.classList.remove('is-fading');
        }, 200);
    }

    function showAlert(message, type = 'error') {
        if (type === 'error') {
            new Audio('freesound_community-beep-warning-6387.mp3').play().catch(() => { });
        }
        const box = $('alert-message');
        box.textContent = message;
        box.className = 'alert-message ' + type;
        box.hidden = false;
    }

    function clearAlert() {
        $('alert-message').hidden = true;
    }

    function shakeCard() {
        const card = $('auth-card');
        card.classList.remove('is-shaking');
        void card.offsetWidth;
        card.classList.add('is-shaking');
    }

    function typeWriterEffect(el, text) {
        el.textContent = '';
        let i = 0;
        (function type() {
            if (i >= text.length) return;
            el.textContent += text.charAt(i++);
            setTimeout(type, Math.random() * 50 + 30); // uneven speed feels typed
        })();
    }

    function celebrate() {
        if (typeof confetti === 'undefined') return;
        const count = 200;
        const fire = (ratio, opts) => confetti(Object.assign({ origin: { y: 0.7 } }, opts, {
            particleCount: Math.floor(count * ratio)
        }));
        fire(0.25, { spread: 26, startVelocity: 55 });
        fire(0.2, { spread: 60 });
        fire(0.35, { spread: 100, decay: 0.91, scalar: 0.8 });
        fire(0.1, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 });
        fire(0.1, { spread: 120, startVelocity: 45 });
    }

    // --- Step 1: swipe slider (pointer = mouse, touch and pen) ---
    function initSlider() {
        const track = $('slide-container');
        const thumb = $('slide-thumb');
        const fill = $('slide-fill');
        const PAD = 5;
        let dragging = false;
        let startX = 0;
        let maxX = 0;

        // measured at drag time, so resizes and the card's entrance animation can't skew it
        const measure = () => { maxX = track.clientWidth - thumb.offsetWidth - PAD * 2; };

        const render = (p) => {
            thumb.style.transform = `translateX(${p * maxX}px)`;
            fill.style.width = p >= 1 ? '100%' : p > 0 ? `${PAD + p * maxX + thumb.offsetWidth / 2}px` : '0';
        };

        const unlock = () => {
            dragging = false;
            track.classList.remove('is-dragging');
            track.classList.add('is-unlocked');
            render(1);
            setTimeout(showLoginForm, 300);
        };

        thumb.addEventListener('pointerdown', (e) => {
            if (step !== 'welcome') return;
            measure();
            dragging = true;
            startX = e.clientX;
            track.classList.add('is-dragging');
            thumb.setPointerCapture(e.pointerId);
        });

        thumb.addEventListener('pointermove', (e) => {
            if (!dragging) return;
            const p = Math.max(0, Math.min(1, (e.clientX - startX) / maxX));
            if (p >= 0.95) unlock();
            else render(p);
        });

        const release = () => {
            if (!dragging) return;
            dragging = false;
            track.classList.remove('is-dragging');
            render(0); // CSS transition snaps it back
        };
        thumb.addEventListener('pointerup', release);
        thumb.addEventListener('pointercancel', release);

        thumb.addEventListener('keydown', (e) => {
            if (step !== 'welcome' || !['Enter', ' ', 'ArrowRight'].includes(e.key)) return;
            e.preventDefault();
            measure();
            unlock();
        });

        return function resetSlider() {
            track.classList.remove('is-unlocked');
            render(0);
        };
    }

    let resetSlider = () => { };

    function showLoginForm() {
        if (step !== 'welcome') return;
        setStep('login');
        clearAlert();
        celebrate();
        setSubtitle('Enter your credentials');
        swapPanel($('step-welcome'), $('login-form'));
        setTimeout(() => $('login-username').focus(), 320);
    }

    function hideLoginForm() {
        if (step !== 'login' || $('login-submit').disabled) return;
        setStep('welcome');
        clearAlert();
        setSubtitle('Sign in to continue');
        swapPanel($('login-form'), $('step-welcome'));
        resetSlider();
        setTimeout(() => $('slide-thumb').focus(), 320);
    }

    // --- Step 2: credentials ---
    function setBusy(busy) {
        const btn = $('login-submit');
        btn.disabled = busy;
        $('login-back').disabled = busy;
        $('login-username').readOnly = busy;
        $('login-password').readOnly = busy;
        btn.innerHTML = busy
            ? '<span>Verifying…</span> <i class="fa-solid fa-spinner fa-spin"></i>'
            : '<span>Sign In</span> <i class="fa-solid fa-arrow-right"></i>';
    }

    async function submitLogin(e) {
        e.preventDefault();
        if (step !== 'login' || $('login-submit').disabled) return;

        const userInput = $('login-username');
        const passInput = $('login-password');
        const username = userInput.value.trim();
        const password = passInput.value;

        clearAlert();
        if (!username || !password) {
            showAlert(!username ? 'Please enter your username.' : 'Please enter your password.');
            (username ? passInput : userInput).focus();
            shakeCard();
            return;
        }

        setBusy(true);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        try {
            const res = await fetch(API_URL + '/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
                signal: controller.signal
            });
            const data = await res.json().catch(() => ({}));

            if (res.ok && data.token && data.user) {
                localStorage.setItem('token', data.token);
                localStorage.setItem('user', JSON.stringify(data.user));
                enterDashboard(data.user);
                return;
            }

            showAlert(data.message || 'Login failed. Please try again.');
            passInput.value = '';
            passInput.focus();
            shakeCard();
        } catch (err) {
            showAlert(err.name === 'AbortError'
                ? 'The server is taking too long to respond. Please try again.'
                : 'Cannot connect to the server. Please check your connection.');
        } finally {
            clearTimeout(timer);
        }
        setBusy(false);
    }

    // --- Step 3: success, then the dashboard ---
    function enterDashboard(user) {
        setStep('success');
        $('success-name').textContent = user.username;
        setSubtitle('Signed in successfully');
        swapPanel($('login-form'), $('step-success'));
        setTimeout(() => window.location.replace('index.html'), 1600);
    }

    // A saved token only skips the login if the server still accepts it
    async function resumeSession() {
        const token = localStorage.getItem('token');
        if (!token) return;
        try {
            const res = await fetch(API_URL + '/auth/me', { headers: { Authorization: 'Bearer ' + token } });
            if (res.ok) {
                const data = await res.json();
                localStorage.setItem('user', JSON.stringify(data.user));
                window.location.replace('index.html');
            } else if (res.status === 401 || res.status === 403) {
                localStorage.removeItem('token');
                localStorage.removeItem('user');
            }
        } catch (err) {
            // server unreachable: stay on the login screen so the user can retry
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        setStep('welcome');
        resumeSession();
        resetSlider = initSlider();

        $('login-form').addEventListener('submit', submitLogin);
        $('login-back').addEventListener('click', hideLoginForm);
        $('auth-card').addEventListener('animationend', (e) => {
            if (e.animationName === 'cardShake') e.currentTarget.classList.remove('is-shaking');
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && step === 'login') hideLoginForm();
        });

        const toggle = $('toggle-password');
        const password = $('login-password');
        toggle.addEventListener('click', () => {
            const show = password.type === 'password';
            password.type = show ? 'text' : 'password';
            toggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
            toggle.firstElementChild.className = show ? 'fa-regular fa-eye' : 'fa-regular fa-eye-slash';
            password.focus();
        });

        setTimeout(() => typeWriterEffect($('system-welcome-label'), 'Welcome to the IT Asset Management'), 500);
    });
})();
