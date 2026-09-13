// ==========================================
// APP SHELL — presentation-only behaviour for the header band,
// sidebar rail / drawer and page-zoom lock. No data logic here.
// ==========================================
(function () {
    const DESKTOP = window.matchMedia('(min-width: 981px)');
    const RAIL_KEY = 'vpel.sidebarCollapsed';

    function safeGet(key) {
        try { return localStorage.getItem(key); } catch (e) { return null; }
    }

    function safeSet(key, value) {
        try { localStorage.setItem(key, value); } catch (e) { /* storage blocked */ }
    }

    // --- Page zoom lock: cancel Ctrl+wheel and Ctrl +/-, allow Ctrl+0 ---
    window.addEventListener('wheel', (e) => {
        if (e.ctrlKey) e.preventDefault();
    }, { passive: false });

    document.addEventListener('keydown', (e) => {
        const mod = e.ctrlKey || e.metaKey;
        if (!mod) return;

        if (['+', '-', '=', '_'].includes(e.key)) {
            e.preventDefault();
            return;
        }

        const key = e.key.toLowerCase();
        if (key === 'k') {
            const search = document.getElementById('global-search-input');
            if (search) {
                e.preventDefault();
                search.focus();
                search.select();
            }
        } else if (key === 'b' && DESKTOP.matches) {
            e.preventDefault();
            toggleRail();
        }
    });

    // --- Sidebar rail mode (desktop) ---
    function setRail(collapsed) {
        document.body.classList.toggle('sidebar-collapsed', collapsed);
        const btn = document.getElementById('menu-toggle');
        if (btn) btn.setAttribute('aria-expanded', String(!collapsed));
        safeSet(RAIL_KEY, collapsed ? '1' : '0');
        hideTooltip();
    }

    function toggleRail() {
        setRail(!document.body.classList.contains('sidebar-collapsed'));
    }

    // --- Rail tooltips (fixed to the viewport, outside the zoomed root) ---
    let tooltip = null;

    function showTooltip(target, text) {
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.className = 'rail-tooltip';
            tooltip.setAttribute('role', 'tooltip');
            document.body.appendChild(tooltip);
        }
        const rect = target.getBoundingClientRect();
        tooltip.textContent = text;
        tooltip.style.left = (rect.right + 10) + 'px';
        tooltip.style.top = (rect.top + rect.height / 2) + 'px';
        tooltip.hidden = false;
    }

    function hideTooltip() {
        if (tooltip) tooltip.hidden = true;
    }

    // --- Mobile drawer ---
    function closeDrawer() {
        const sidebar = document.querySelector('.sidebar');
        if (sidebar) sidebar.classList.remove('show-menu');
    }

    document.addEventListener('DOMContentLoaded', () => {
        if (safeGet(RAIL_KEY) === '1') setRail(true);

        const menuToggle = document.getElementById('menu-toggle');
        if (menuToggle) {
            menuToggle.addEventListener('click', () => {
                if (DESKTOP.matches) toggleRail();
            });
        }

        const sidebar = document.querySelector('.sidebar');
        if (sidebar) {
            sidebar.addEventListener('mouseover', (e) => {
                if (!DESKTOP.matches || !document.body.classList.contains('sidebar-collapsed')) return;
                const target = e.target.closest('[data-tip], .nav-links a');
                if (!target) return;
                const text = target.getAttribute('data-tip') || target.textContent.trim();
                if (text) showTooltip(target, text);
            });
            sidebar.addEventListener('mouseout', (e) => {
                const target = e.target.closest('[data-tip], .nav-links a');
                if (target && !target.contains(e.relatedTarget)) hideTooltip();
            });
            sidebar.addEventListener('click', (e) => {
                if (!DESKTOP.matches && e.target.closest('.nav-links a')) closeDrawer();
            });
        }

        const backdrop = document.querySelector('.drawer-backdrop');
        if (backdrop) backdrop.addEventListener('click', closeDrawer);

        DESKTOP.addEventListener('change', () => {
            closeDrawer();
            hideTooltip();
        });

        // --- Header spotlight follows the pointer (zoom-aware) ---
        const header = document.querySelector('.app-header');
        const spot = document.querySelector('.hdr-spotlight');
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
        if (header && spot && !reduceMotion.matches) {
            let frame = 0;
            header.addEventListener('mousemove', (e) => {
                cancelAnimationFrame(frame);
                frame = requestAnimationFrame(() => {
                    const rect = header.getBoundingClientRect();
                    const zoom = header.currentCSSZoom || 1;
                    const x = (e.clientX - rect.left) / zoom;
                    const y = (e.clientY - rect.top) / zoom;
                    spot.style.transform = `translate(${x}px, ${y}px)`;
                });
            });
        }

        // --- Header banner slideshow: crossfades .is-active through the slides ---
        // Timing comes from the active dot's CSS fill animation, so hover-pause
        // and reduced motion (no animation, no autoplay) need no extra timers.
        const show = document.querySelector('.hdr-slideshow');
        const slides = show ? Array.from(show.querySelectorAll('.hdr-slide')) : [];
        if (slides.length) {
            const dotsBox = show.querySelector('.hdr-dots');
            let current = 0;

            const dots = slides.map((_, i) => {
                const dot = document.createElement('i');
                dot.addEventListener('click', () => go(i));
                dotsBox.appendChild(dot);
                return dot;
            });

            function go(index) {
                current = (index + slides.length) % slides.length;
                slides.forEach((slide, i) => slide.classList.toggle('is-active', i === current));
                dots.forEach((dot) => dot.classList.remove('on'));
                void dotsBox.offsetWidth; // restart the fill even when re-selecting the same dot
                dots[current].classList.add('on');
            }

            dotsBox.addEventListener('animationend', (e) => {
                if (e.target.classList.contains('on')) go(current + 1);
            });
            show.addEventListener('mouseenter', () => show.classList.add('is-paused'));
            show.addEventListener('mouseleave', () => show.classList.remove('is-paused'));

            go(0);
            show.classList.add('is-ready');
        }

        // --- Right scroll rail: keep the beacon on the scrollbar thumb ---
        // Same maths as the browser's thumb: length = visible share of the page,
        // offset = scroll progress. Hidden when the page doesn't scroll.
        const scroller = document.querySelector('.content-area');
        const rail = document.querySelector('.content-drl');
        if (scroller && rail) {
            let railTimer = 0;
            const syncRail = () => {
                const { scrollTop, scrollHeight, clientHeight } = scroller;
                const maxScroll = scrollHeight - clientHeight;
                const scrollable = maxScroll > 1;
                rail.classList.toggle('is-scrollable', scrollable);
                if (!scrollable) return;
                const thumb = Math.max(clientHeight * clientHeight / scrollHeight, 24);
                const top = (clientHeight - thumb) * Math.min(scrollTop / maxScroll, 1);
                rail.style.setProperty('--thumb-h', thumb + 'px');
                rail.style.setProperty('--thumb-top', top + 'px');
            };
            // Scroll events already arrive once per frame, so they update directly
            scroller.addEventListener('scroll', syncRail, { passive: true });
            window.addEventListener('resize', syncRail);
            // Page height changes when a view switches or its data arrives; batch those bursts
            const queueRail = () => {
                clearTimeout(railTimer);
                railTimer = setTimeout(syncRail, 60);
            };
            new MutationObserver(queueRail).observe(scroller, {
                childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'hidden']
            });
            syncRail();
        }

        // --- Avatar initial follows the user name that main.js fills in ---
        const nameEl = document.getElementById('user-name');
        const initialEl = document.getElementById('user-initial');
        if (nameEl && initialEl) {
            const sync = () => {
                const name = nameEl.textContent.trim();
                initialEl.textContent = name && name !== 'Loading...' ? name.charAt(0) : '';
            };
            sync();
            new MutationObserver(sync).observe(nameEl, { childList: true, characterData: true, subtree: true });
        }
    });

    window.toggleSidebarRail = toggleRail;
})();
