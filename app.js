/**
 * ECOLAP - JavaScript Principal
 * Controla: menú móvil, banner promocional, header dinámico,
 *           animaciones de entrada, simulación del mapa, etc.
 */

(() => {
    'use strict';

    // ============================================================
    // UTILIDADES
    // ============================================================

    const $ = (selector, context = document) => context.querySelector(selector);
    const $$ = (selector, context = document) => [...context.querySelectorAll(selector)];

    const storage = {
        get: (key) => {
            try { return JSON.parse(localStorage.getItem(key)); }
            catch { return null; }
        },
        set: (key, value) => {
            try { localStorage.setItem(key, JSON.stringify(value)); }
            catch (e) { console.warn('ECOLAP: localStorage no disponible', e); }
        }
    };

    // ============================================================
    // MENÚ MÓVIL HAMBURGUESA
    // ============================================================

    function initMobileMenu() {
        const burger = $('#ecolapBurger');
        const menu = $('#ecolapMenu');
        if (!burger || !menu) return;

        const toggleMenu = (forceClose = false) => {
            const isOpen = burger.classList.contains('active');
            const shouldOpen = forceClose ? false : !isOpen;
            burger.classList.toggle('active', shouldOpen);
            menu.classList.toggle('active', shouldOpen);
            burger.setAttribute('aria-expanded', shouldOpen);
            document.body.style.overflow = shouldOpen ? 'hidden' : '';
        };

        burger.addEventListener('click', () => toggleMenu());
        $$('.ecolap-menu a', menu).forEach(link => {
            link.addEventListener('click', () => toggleMenu(true));
        });
        document.addEventListener('click', (e) => {
            if (menu.classList.contains('active') &&
                !menu.contains(e.target) &&
                !burger.contains(e.target)) {
                toggleMenu(true);
            }
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && menu.classList.contains('active')) {
                toggleMenu(true);
                burger.focus();
            }
        });
        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                if (window.innerWidth > 768 && menu.classList.contains('active')) {
                    toggleMenu(true);
                }
            }, 100);
        });
    }

    // ============================================================
    // BANNER PROMOCIONAL APP MÓVIL
    // ============================================================

    function initAppBanner() {
        const banner = $('#ecolapAppBanner');
        const closeBtn = $('#ecolapBannerClose');
        if (!banner || !closeBtn) return;

        // El banner está insertado directamente en el HTML y es VISIBLE POR
        // DEFECTO (CSS), sin depender de scripts ni de almacenamiento local.
        // El botón X únicamente lo oculta durante la sesión actual:
        // al recargar la página vuelve a aparecer siempre.
        const dismissBanner = () => {
            if (banner.classList.contains('hidden')) return;
            banner.classList.add('hidden');
            setTimeout(() => {
                banner.style.display = 'none';
            }, 400);
        };

        closeBtn.addEventListener('click', dismissBanner);
        closeBtn.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                dismissBanner();
            }
        });
    }

    // ============================================================
    // SMOOTH SCROLL PARA ANCLAS
    // ============================================================

    function initSmoothScroll() {
        $$('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function (e) {
                const targetId = this.getAttribute('href');
                if (targetId === '#') return;
                const target = $(targetId);
                if (target) {
                    e.preventDefault();
                    const headerOffset = 80;
                    const elementPosition = target.getBoundingClientRect().top;
                    const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
                    window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
                    target.setAttribute('tabindex', '-1');
                    target.focus({ preventScroll: true });
                }
            });
        });
    }

    // ============================================================
    // HEADER SCROLL EFFECT (glass más sólido al hacer scroll)
    // ============================================================

    function initHeaderScroll() {
        const header = $('.ecolap-header');
        if (!header) return;

        const onScroll = () => {
            header.classList.toggle('scrolled', window.pageYOffset > 60);
        };
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
    }

    // ============================================================
    // ANIMACIONES DE ENTRADA (Intersection Observer)
    // ============================================================

    function initScrollAnimations() {
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (prefersReducedMotion) return;

        const targets = $$('.ecolap-card, .ecolap-stat-card, .ecolap-game-card, .ecolap-section-header, .ecolap-floating-card');

        if (!('IntersectionObserver' in window)) {
            targets.forEach(el => el.classList.add('ecolap-visible'));
            return;
        }

        targets.forEach((el, i) => {
            el.style.opacity = '0';
            el.style.transform = 'translateY(30px)';
            el.style.transition = 'opacity 0.7s cubic-bezier(0.22, 1, 0.36, 1), transform 0.7s cubic-bezier(0.22, 1, 0.36, 1)';
            el.style.transitionDelay = `${Math.min(i * 0.06, 0.4)}s`;
        });

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.style.opacity = '1';
                    entry.target.style.transform = 'translateY(0)';
                    observer.unobserve(entry.target);
                }
            });
        }, { root: null, rootMargin: '0px 0px -60px 0px', threshold: 0.08 });

        targets.forEach(el => observer.observe(el));
    }

    // ============================================================
    // CONTADORES ANIMADOS (STATS)
    // ============================================================

    function animateCounter(el, finalText, duration = 1400) {
        const match = finalText.match(/(\D*)([\d.,]+)(.*)/);
        if (!match) { el.textContent = finalText; return; }
        const [, prefix, numStr, suffix] = match;
        const isFloat = numStr.includes(',') || (numStr.includes('.') && numStr.split('.')[1].length <= 2);
        const target = parseFloat(numStr.replace(',', '.'));
        if (isNaN(target)) { el.textContent = finalText; return; }

        const start = performance.now();
        const tick = (now) => {
            const progress = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = target * eased;
            const formatted = isFloat
                ? current.toFixed(numStr.includes(',') ? numStr.split(',')[1].length : (numStr.split('.')[1]?.length || 0))
                : Math.floor(current).toString();
            el.textContent = `${prefix}${formatted}${suffix}`;
            if (progress < 1) requestAnimationFrame(tick);
            else el.textContent = finalText;
        };
        requestAnimationFrame(tick);
    }

    function initCounters() {
        const stats = $$('.ecolap-stat-number');
        if (!stats.length) return;

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const el = entry.target;
                    const finalText = el.textContent.trim();
                    animateCounter(el, finalText);
                    observer.unobserve(el);
                }
            });
        }, { threshold: 0.4 });

        stats.forEach(s => observer.observe(s));
    }

    // ============================================================
    // EFECTO PARALAJO SUAVE EN HERO
    // ============================================================

    function initParallax() {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const hero = $('.ecolap-hero');
        if (!hero) return;

        const blobs = $$('.ecolap-hero::before, .ecolap-hero::after');
        // CSS-only via scroll position: usamos transform en el hero-content
        const content = $('.ecolap-hero-content');
        if (!content) return;

        let ticking = false;
        window.addEventListener('scroll', () => {
            if (!ticking) {
                requestAnimationFrame(() => {
                    const y = window.pageYOffset;
                    if (y < 600) {
                        content.style.transform = `translateY(${y * 0.05}px)`;
                    }
                    ticking = false;
                });
                ticking = true;
            }
        }, { passive: true });
    }

    // ============================================================
    // EFECTO TILT 3D EN TARJETAS DE JUEGOS
    // ============================================================

    function initTiltCards() {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const cards = $$('.ecolap-game-card, .ecolap-stat-card');
        const max = 6;

        cards.forEach(card => {
            card.addEventListener('mousemove', (e) => {
                const rect = card.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                const rx = ((y / rect.height) - 0.5) * -max;
                const ry = ((x / rect.width) - 0.5) * max;
                card.style.transform = `perspective(800px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-6px)`;
            });
            card.addEventListener('mouseleave', () => {
                card.style.transform = '';
            });
        });
    }

    // ============================================================
    // MAPA: FILTROS + SIMULACIÓN ETA
    // ============================================================

    function initMap() {
        const filters = $$('.ecolap-filter-group select');
        filters.forEach(select => {
            select.addEventListener('change', (e) => {
                console.log(`ECOLAP Filtro "${e.target.name}" cambiado a: ${e.target.value}`);
            });
        });

        const etaElement = $('.ecolap-eta-time');
        if (!etaElement) return;

        let minutos = 15;
        setInterval(() => {
            if (minutos > 1) {
                minutos--;
                etaElement.textContent = `⏱️ Próximo en ${minutos} min`;
            } else {
                minutos = 15;
            }
        }, 30000);
    }

    // ============================================================
    // LAZY LOADING DE IMÁGENES
    // ============================================================

    function initLazyLoading() {
        if (!('IntersectionObserver' in window)) return;
        const imageObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    if (img.dataset.src) {
                        img.src = img.dataset.src;
                        img.removeAttribute('data-src');
                        img.classList.add('loaded');
                    }
                    imageObserver.unobserve(img);
                }
            });
        });
        $$('img[data-src]').forEach(img => imageObserver.observe(img));
    }

    // ============================================================
    // DETECCIÓN PWA / INSTALABILIDAD
    // ============================================================

    function initPWA() {
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                            window.navigator.standalone === true;

        if (isStandalone) {
            document.body.classList.add('ecolap-pwa-mode');
        }

        let deferredPrompt;
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
        });

        window.ecolapInstallApp = async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                if (outcome === 'accepted') deferredPrompt = null;
            }
        };
    }

    // ============================================================
    // INICIALIZACIÓN
    // ============================================================

    function init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
            return;
        }

        initMobileMenu();
        initAppBanner();
        initSmoothScroll();
        initHeaderScroll();
        initScrollAnimations();
        initCounters();
        initParallax();
        initTiltCards();
        initMap();
        initLazyLoading();
        initPWA();

        document.body.classList.add('ecolap-initialized');
    }

    init();
})();
