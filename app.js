/* ==========================================================================
   LUNA NUEVA BY CONSUELO · Interacciones y animaciones
   Dependencias (CDN, versiones fijas): GSAP 3.12.5 + ScrollTrigger, Lenis 1.1.20.
   Principios:
   - Mejora progresiva: sin JS/GSAP todo el contenido sigue visible y usable.
   - Respeta prefers-reduced-motion (sin pins, sin smooth scroll, sin loops pesados).
   - Sin listeners de scroll sobre window: todo va por ScrollTrigger.
   ========================================================================== */
(() => {
    'use strict';

    const $ = (s, c = document) => c.querySelector(s);
    const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    const root = document.documentElement;

    const WA_NUMBER = '5216241089831';
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const hasGSAP = typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined';

    const waUrl = (text) => `https://wa.me/${WA_NUMBER}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
    const safe = (name, fn) => { try { fn(); } catch (err) { console.warn(`[luna-nueva] ${name} no se pudo iniciar`, err); } };

    let lenis = null;
    let menuOpen = false;

    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    if (!location.hash) window.scrollTo(0, 0);

    /* ======================================================================
       1. Utilidades de contenido
       ====================================================================== */

    /** Enlaces de WhatsApp con mensaje prellenado según contexto. */
    function wireWhatsApp() {
        $$('[data-wa]').forEach((a) => { a.href = waUrl(a.dataset.wa); });
        const y = $('#year'); if (y) y.textContent = new Date().getFullYear();
    }

    /** Divide el texto en palabras envueltas para animaciones con máscara. Conserva <em> internos. */
    function splitWords(el) {
        if (el.dataset.split_done) return $$('.wi', el);
        const walk = (node) => {
            Array.from(node.childNodes).forEach((n) => {
                if (n.nodeType === 3) {
                    const frag = document.createDocumentFragment();
                    n.textContent.split(/(\s+)/).forEach((part) => {
                        if (!part) return;
                        if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
                        const w = document.createElement('span'); w.className = 'w';
                        const wi = document.createElement('span'); wi.className = 'wi'; wi.textContent = part;
                        w.appendChild(wi); frag.appendChild(w);
                    });
                    n.replaceWith(frag);
                } else if (n.nodeType === 1 && !n.classList.contains('w')) {
                    walk(n);
                }
            });
        };
        walk(el);
        el.classList.add('is-split');
        el.dataset.split_done = '1';
        return $$('.wi', el);
    }

    /* ======================================================================
       2. Polvo dorado (canvas 2D, ligero y pausable)
       ====================================================================== */
    class Dust {
        constructor(canvas, opts = {}) {
            this.c = canvas;
            this.ctx = canvas.getContext('2d');
            this.o = Object.assign({ density: 1 / 15000, min: 22, max: 90, speed: 1, sparkle: 0.08 }, opts);
            this.parts = [];
            this.pointer = { x: -9999, y: -9999 };
            this.w = 0; this.h = 0; this.t = 0; this.last = 0;
            this.running = false; this.visible = true;
            this.sprite = this.makeSprite();
            this.frame = this.frame.bind(this);
            this.resize();

            let rz; new ResizeObserver(() => { clearTimeout(rz); rz = setTimeout(() => this.resize(), 150); }).observe(canvas);
            new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; this.visible ? this.start() : this.stop(); }).observe(canvas);
            document.addEventListener('visibilitychange', () => { document.hidden ? this.stop() : (this.visible && this.start()); });
        }
        makeSprite() {
            const s = document.createElement('canvas'); s.width = s.height = 64;
            const g = s.getContext('2d');
            const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
            grd.addColorStop(0, 'rgba(255,246,208,1)');
            grd.addColorStop(.22, 'rgba(238,204,112,.92)');
            grd.addColorStop(.55, 'rgba(201,160,74,.32)');
            grd.addColorStop(1, 'rgba(201,160,74,0)');
            g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
            return s;
        }
        resize() {
            const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
            const r = this.c.getBoundingClientRect();
            this.w = Math.max(1, r.width); this.h = Math.max(1, r.height);
            this.c.width = Math.round(this.w * dpr); this.c.height = Math.round(this.h * dpr);
            this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            const n = clamp(Math.round(this.w * this.h * this.o.density), this.o.min, this.o.max);
            this.parts = Array.from({ length: n }, () => this.spawn(true));
            if (!this.running) this.draw(0);
        }
        spawn(anywhere) {
            const spark = Math.random() < this.o.sparkle;
            return {
                x: Math.random() * this.w,
                y: anywhere ? Math.random() * this.h : this.h + 20,
                r: spark ? 4 + Math.random() * 5 : 0.7 + Math.random() * 2.6,
                vy: (8 + Math.random() * 30) * this.o.speed,
                sway: 6 + Math.random() * 16,
                freq: 0.3 + Math.random() * 0.8,
                phase: Math.random() * 6.28,
                tw: 0.8 + Math.random() * 1.8,
                spark,
                rot: Math.random() * 3
            };
        }
        start() { if (this.running || reduceMotion) return; this.running = true; this.last = performance.now(); requestAnimationFrame(this.frame); }
        stop() { this.running = false; }
        frame(now) {
            if (!this.running) return;
            const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
            this.draw(dt);
            requestAnimationFrame(this.frame);
        }
        draw(dt) {
            const { ctx, w, h, pointer } = this;
            this.t += dt;
            ctx.clearRect(0, 0, w, h);
            for (const p of this.parts) {
                p.y -= p.vy * dt;
                const sx = Math.sin(this.t * p.freq + p.phase) * p.sway * dt * 2;
                p.x += sx;
                const dx = p.x - pointer.x, dy = p.y - pointer.y, d2 = dx * dx + dy * dy;
                if (d2 < 16900 && d2 > 1) { const d = Math.sqrt(d2), f = (1 - d / 130) * 90 * dt; p.x += (dx / d) * f; p.y += (dy / d) * f; }
                if (p.y < -24 || p.x < -24 || p.x > w + 24) Object.assign(p, this.spawn(false));
                const a = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(this.t * p.tw + p.phase));
                if (p.spark) { this.star(p.x, p.y, p.r * (0.6 + a * 0.6), p.rot + this.t * 0.4, a); }
                else { const s = p.r * 6; ctx.globalAlpha = a * 0.9; ctx.drawImage(this.sprite, p.x - s / 2, p.y - s / 2, s, s); }
            }
            ctx.globalAlpha = 1;
        }
        star(x, y, r, rot, a) {
            const ctx = this.ctx;
            ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.globalAlpha = a;
            ctx.beginPath();
            for (let i = 0; i < 8; i++) { const rr = i % 2 ? r * 0.22 : r; const ang = (Math.PI / 4) * i; ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr); }
            ctx.closePath(); ctx.fillStyle = '#D9B258'; ctx.fill();
            ctx.restore();
        }
    }

    /* ======================================================================
       3. Menú móvil, FAQ y formulario (no dependen de GSAP)
       ====================================================================== */
    function initMenu() {
        const burger = $('#burger'), menu = $('#menu'), nav = $('#nav');
        if (!burger || !menu) return;
        const setBackgroundInert = (on) => $$('main, footer, .wa-float').forEach((el) => { el.inert = on; });
        const open = () => {
            menuOpen = true; menu.hidden = false; void menu.offsetWidth;
            menu.classList.add('is-open'); nav.classList.add('is-menu-open');
            burger.setAttribute('aria-expanded', 'true'); burger.setAttribute('aria-label', 'Cerrar menú');
            root.style.overflow = 'hidden'; if (lenis) lenis.stop();
            setBackgroundInert(true);
            setTimeout(() => { const first = $('a', menu); if (first && menuOpen) first.focus({ preventScroll: true }); }, 450);
        };
        const close = (returnFocus = true) => {
            if (!menuOpen) return;
            menuOpen = false; menu.classList.remove('is-open'); nav.classList.remove('is-menu-open');
            burger.setAttribute('aria-expanded', 'false'); burger.setAttribute('aria-label', 'Abrir menú');
            root.style.overflow = ''; if (lenis) lenis.start();
            setBackgroundInert(false);
            setTimeout(() => { if (!menuOpen) menu.hidden = true; }, 900);
            if (returnFocus) burger.focus({ preventScroll: true });
        };
        burger.addEventListener('click', () => (menuOpen ? close() : open()));
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
        $$('a', menu).forEach((a) => a.addEventListener('click', () => close(false)));
        window.matchMedia('(min-width: 1040px)').addEventListener('change', (e) => { if (e.matches) close(false); });
    }

    function initFaq() {
        const items = $$('.faq__item');
        const refresh = () => { if (hasGSAP) ScrollTrigger.refresh(); };
        let timer;
        items.forEach((item) => {
            const btn = $('.faq__q', item);
            btn.addEventListener('click', () => {
                const willOpen = !item.classList.contains('is-open');
                items.forEach((o) => { if (o !== item) { o.classList.remove('is-open'); $('.faq__q', o).setAttribute('aria-expanded', 'false'); } });
                item.classList.toggle('is-open', willOpen);
                btn.setAttribute('aria-expanded', String(willOpen));
                clearTimeout(timer); timer = setTimeout(refresh, 700);
            });
        });
        if (items[0]) { items[0].classList.add('is-open'); $('.faq__q', items[0]).setAttribute('aria-expanded', 'true'); }
    }

    function initForm() {
        const form = $('#wa-form'); if (!form) return;
        const name = $('#f-name'), therapy = $('#f-therapy'), msg = $('#f-msg'), note = $('#f-note'), err = $('#f-name-err');
        const defaultNote = note.textContent;

        const setError = (text) => {
            err.textContent = text;
            name.setAttribute('aria-invalid', text ? 'true' : 'false');
        };
        name.addEventListener('input', () => { if (name.value.trim().length >= 2) setError(''); });

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const nombre = name.value.trim();
            if (nombre.length < 2) { setError('Cuéntame tu nombre para saber cómo llamarte.'); name.focus(); return; }
            setError('');

            const lines = [`Hola Consuelo, soy ${nombre}.`];
            lines.push(therapy.value ? `Me interesa: ${therapy.value}.` : 'Me gustaría que me orientes sobre qué terapia elegir.');
            if (msg.value.trim()) lines.push(`Hoy me siento así: ${msg.value.trim()}`);
            lines.push('Te escribo desde tu página web Luna Nueva.');
            const url = waUrl(lines.join('\n'));

            form.classList.add('is-sending');
            note.textContent = 'Abriendo WhatsApp...';
            const win = window.open(url, '_blank', 'noopener');
            if (!win) window.location.href = url;

            setTimeout(() => {
                form.classList.remove('is-sending');
                note.innerHTML = 'Listo. Si WhatsApp no se abrió, <a href="' + url + '" target="_blank" rel="noopener" style="border-bottom:1px solid currentColor">toca aquí</a>.';
                setTimeout(() => { note.textContent = defaultNote; }, 9000);
            }, 1100);
        });
    }

    /* ======================================================================
       4. Motor de animación (GSAP + ScrollTrigger + Lenis)
       ====================================================================== */
    function initMotion(heroIntro) {
        gsap.registerPlugin(ScrollTrigger);
        ScrollTrigger.config({ ignoreMobileResize: true });

        /* ---- Scroll suave ---- */
        if (!reduceMotion && typeof window.Lenis !== 'undefined') {
            lenis = new Lenis({ duration: 1.25, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true, wheelMultiplier: 0.9 });
            lenis.on('scroll', ScrollTrigger.update);
            gsap.ticker.add((time) => lenis.raf(time * 1000));
            gsap.ticker.lagSmoothing(0);
            lenis.stop();
        }
        if (!reduceMotion) root.classList.add('anim');

        /* ---- Anclas internas ---- */
        $$('a[href^="#"]').forEach((a) => {
            a.addEventListener('click', (e) => {
                const id = a.getAttribute('href');
                if (!id || id === '#') return;
                const target = $(id); if (!target) return;
                e.preventDefault();
                if (lenis) lenis.scrollTo(target, { offset: id === '#inicio' ? 0 : -72, duration: 1.7 });
                else target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
                history.replaceState(null, '', id);
            });
        });

        /* ---- Navegación, progreso y fase lunar de la marca ---- */
        const nav = $('#nav'), bar = $('#progress-bar'), navShadow = $('#nv-shadow');
        const setNavMoon = (p) => navShadow.setAttribute('cx', (20 - 27 * clamp(p, 0.05, 1)).toFixed(2));
        setNavMoon(0.05);
        ScrollTrigger.create({
            start: 0, end: 'max',
            onUpdate: (self) => {
                const y = self.scroll();
                nav.classList.toggle('is-scrolled', y > 40);
                nav.classList.toggle('is-hidden', y > 520 && self.direction === 1 && !menuOpen);
                bar.style.transform = `scaleX(${self.progress.toFixed(4)})`;
                setNavMoon(self.progress);
            }
        });

        if (reduceMotion) { initSharedUi(); return; }

        /* ---- Estados iniciales (se ocultan solo cuando JS/GSAP están activos) ---- */
        const heroTitle = $('[data-split="hero"]');
        const heroWords = splitWords(heroTitle);
        const heroIn = $$('[data-hero="in"]');
        const stage = $('[data-hero="stage"]');
        gsap.set(heroWords, { yPercent: 118 });
        gsap.set(heroIn, { opacity: 0, y: 26 });
        gsap.set(stage, { opacity: 0, scale: 0.82, rotation: -6, transformPerspective: 1000 });
        gsap.set('#nav', { opacity: 0 });

        heroIntro.add = () => {
            const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
            tl.to(heroWords, { yPercent: 0, duration: 1.4, stagger: 0.075 }, 0.05)
                .to(heroIn, { opacity: 1, y: 0, duration: 1.2, stagger: 0.14, clearProps: 'transform' }, 0.25)
                .to(stage, { opacity: 1, scale: 1, rotation: 0, duration: 1.9 }, 0.1)
                .to('#nav', { opacity: 1, duration: 1.1, ease: 'power2.out' }, 0.5);
            return tl;
        };

        /* ---- Hero: inclinación 3D con el puntero y profundidad por capas ---- */
        if (finePointer) {
            const hero = $('#inicio');
            const rx = gsap.quickTo(stage, 'rotationX', { duration: 0.9, ease: 'power3' });
            const ry = gsap.quickTo(stage, 'rotationY', { duration: 0.9, ease: 'power3' });
            const hx = gsap.quickTo('.stage__halo', 'x', { duration: 1.2, ease: 'power3' });
            const hy = gsap.quickTo('.stage__halo', 'y', { duration: 1.2, ease: 'power3' });
            const ox = gsap.quickTo('.stage__orbits', 'x', { duration: 1.1, ease: 'power3' });
            const oy = gsap.quickTo('.stage__orbits', 'y', { duration: 1.1, ease: 'power3' });
            hero.addEventListener('pointermove', (e) => {
                const r = hero.getBoundingClientRect();
                const nx = (e.clientX - r.left) / r.width - 0.5, ny = (e.clientY - r.top) / r.height - 0.5;
                ry(nx * 16); rx(-ny * 12);
                hx(nx * -26); hy(ny * -20); ox(nx * 14); oy(ny * 10);
            });
            hero.addEventListener('pointerleave', () => { ry(0); rx(0); hx(0); hy(0); ox(0); oy(0); });
        }

        /* ---- Marquee: reacciona a la velocidad del scroll ---- */
        safe('marquee', () => {
            const track = $('#marquee-track'); const anim = track.getAnimations()[0]; if (!anim) return;
            let target = 1, cur = 1;
            ScrollTrigger.create({ start: 0, end: 'max', onUpdate: (self) => { target = 1 + clamp(Math.abs(self.getVelocity()) / 260, 0, 7); } });
            gsap.ticker.add(() => { target += (1 - target) * 0.06; cur += (target - cur) * 0.12; anim.playbackRate = cur; });
        });

        /* ---- Manifiesto: las palabras se iluminan al avanzar ---- */
        safe('manifiesto', () => {
            const text = $('[data-scrub-words]');
            const words = splitWords(text);
            gsap.set(words, { opacity: 0.14 });
            gsap.to(words, { opacity: 1, ease: 'none', stagger: 0.12, scrollTrigger: { trigger: text, start: 'top 80%', end: 'bottom 50%', scrub: true } });
            const moon = $('.manifest__moon');
            gsap.to(moon, { yPercent: -14, rotation: 14, ease: 'none', scrollTrigger: { trigger: '#luna', start: 'top bottom', end: 'bottom top', scrub: true } });
        });

        const mm = gsap.matchMedia();

        /* ---- Refugio: la imagen se abre a pantalla completa (pin + clip-path) ---- */
        safe('refugio', () => {
            const section = $('#refugio'), pin = $('.refuge__pin', section), media = $('#refuge-media');
            const img = $('img', media), title = $('.refuge__title', section), content = $('#refuge-content');
            const wl = $('.refuge__word--l', section), wr = $('.refuge__word--r', section);
            const build = (inset, desktop) => {
                // fromTo con cadenas de 4 valores en ambos extremos: evita que el navegador
                // normalice el inset a 2 valores y GSAP interpole mal.
                const from = `inset(${inset} round 28px)`;
                const to = 'inset(0% 0% 0% 0% round 0px)';
                gsap.set(img, { scale: 1.4, transformOrigin: desktop ? '50% 50%' : '50% 24%' });
                gsap.set(title, { opacity: 1 });
                gsap.set(content.children, { opacity: 0, y: 44 });
                const tl = gsap.timeline({
                    defaults: { ease: 'none' },
                    scrollTrigger: { trigger: section, start: 'top top', end: '+=170%', pin, scrub: 0.7, anticipatePin: 1, refreshPriority: 3 }
                });
                tl.fromTo(media, { clipPath: from }, { clipPath: to, duration: 1, ease: 'power2.inOut', immediateRender: true }, 0)
                    .to(img, { scale: 1, duration: 1 }, 0)
                    .to(wl, desktop ? { xPercent: -140, opacity: 0, duration: 0.7, ease: 'power2.in' } : { yPercent: -260, opacity: 0, duration: 0.7, ease: 'power2.in' }, 0)
                    .to(wr, desktop ? { xPercent: 140, opacity: 0, duration: 0.7, ease: 'power2.in' } : { yPercent: 260, opacity: 0, duration: 0.7, ease: 'power2.in' }, 0)
                    .to(content.children, { opacity: 1, y: 0, stagger: 0.14, duration: 0.45, ease: 'power2.out' }, 0.72)
                    .to({}, { duration: 0.35 });
            };
            mm.add('(min-width: 960px)', () => build('27% 31% 27% 31%', true));
            mm.add('(max-width: 959px)', () => build('25% 10% 25% 10%', false));
        });

        /* ---- Terapias: scroll vertical convertido en recorrido horizontal ---- */
        safe('terapias', () => {
            mm.add('(min-width: 960px)', () => {
                const rail = $('#rail'), pinEl = $('#ther-pin'), progress = $('#rail-progress');
                root.classList.add('pin-ok');
                const dist = () => Math.max(0, rail.scrollWidth - window.innerWidth);
                gsap.to(rail, {
                    x: () => -dist(), ease: 'none',
                    scrollTrigger: {
                        trigger: '#terapias', start: 'top top', end: () => `+=${dist()}`, pin: pinEl, scrub: 0.9,
                        anticipatePin: 1, invalidateOnRefresh: true, refreshPriority: 2,
                        onUpdate: (self) => { progress.style.transform = `scaleX(${self.progress.toFixed(4)})`; }
                    }
                });
                return () => { root.classList.remove('pin-ok'); gsap.set(rail, { clearProps: 'transform' }); };
            });
            gsap.from('.rail__item', {
                opacity: 0, y: 60, duration: 1.2, stagger: 0.08, ease: 'expo.out',
                scrollTrigger: { trigger: '#terapias', start: 'top 75%', once: true }
            });
        });

        /* ---- Todo lo que sigue a los pins se crea aquí, en orden de página (posiciones correctas) ---- */

        /* ---- Tu momento: vista previa que sigue al cursor ---- */
        safe('momento', () => {
            if (!finePointer) return;
            const list = $('#signs-list'), prev = $('#signs-preview'), img = $('img', prev);
            const xTo = gsap.quickTo(prev, 'x', { duration: 0.55, ease: 'power3' });
            const yTo = gsap.quickTo(prev, 'y', { duration: 0.55, ease: 'power3' });
            const rTo = gsap.quickTo(prev, 'rotation', { duration: 0.7, ease: 'power3' });
            gsap.set(prev, { scale: 0.8, opacity: 0, xPercent: 0, yPercent: 0 });
            const cache = new Set();
            $$('.sign', list).forEach((li) => {
                li.addEventListener('pointerenter', () => {
                    const src = li.dataset.preview;
                    if (!cache.has(src)) { const im = new Image(); im.src = src; cache.add(src); }
                    img.src = src;
                    gsap.to(prev, { opacity: 1, scale: 1, duration: 0.55, ease: 'expo.out', overwrite: 'auto' });
                });
                li.addEventListener('pointermove', (e) => {
                    xTo(e.clientX + 36); yTo(e.clientY - 150); rTo(clamp(e.movementX * 0.35, -9, 9));
                });
                li.addEventListener('pointerleave', () => gsap.to(prev, { opacity: 0, scale: 0.8, duration: 0.4, ease: 'power3.in', overwrite: 'auto' }));
            });
        });

        /* ---- Tu sesión: línea de tiempo con fases de la luna ---- */
        safe('sesion', () => {
            gsap.to('#timeline-fill', { scaleY: 1, ease: 'none', scrollTrigger: { trigger: '#timeline', start: 'top 62%', end: 'bottom 72%', scrub: 0.5 } });
            $$('.step').forEach((step) => {
                const node = $('.step__node', step);
                const p = parseFloat(step.dataset.phase || '0');
                const set = (lit) => node.style.setProperty('--cx', `${lit ? 50 - 110 * p : 50}%`);
                ScrollTrigger.create({ trigger: step, start: 'top 66%', onEnter: () => set(true), onLeaveBack: () => set(false) });
            });
        });

        /* ---- Círculo: parallax de la fotografía ---- */
        safe('circulo', () => {
            gsap.fromTo('[data-parallax-img]', { yPercent: -9 }, { yPercent: 9, ease: 'none', scrollTrigger: { trigger: '#circulo', start: 'top bottom', end: 'bottom top', scrub: true } });
        });

        /* ---- Contadores ---- */
        safe('contadores', () => {
            $$('[data-count]').forEach((el) => {
                const target = parseInt(el.dataset.count, 10); const o = { v: 0 };
                el.textContent = '0';
                ScrollTrigger.create({
                    trigger: el, start: 'top 90%', once: true,
                    onEnter: () => gsap.to(o, { v: target, duration: 2.2, ease: 'power3.out', onUpdate: () => { el.textContent = Math.round(o.v); } })
                });
            });
        });

        /* ---- Pie: la marca gigante sube con el scroll ---- */
        safe('footer', () => {
            gsap.from('.footer__mark', { yPercent: 38, opacity: 0, ease: 'none', scrollTrigger: { trigger: '.footer', start: 'top 95%', end: 'top 45%', scrub: true } });
        });

        /* ---- Revelado de titulares (máscara por palabra) ---- */
        $$('[data-split]:not([data-split="hero"])').forEach((el) => {
            const words = splitWords(el);
            gsap.set(words, { yPercent: 118 });
            ScrollTrigger.create({
                trigger: el, start: 'top 86%', once: true,
                onEnter: () => gsap.to(words, { yPercent: 0, duration: 1.25, stagger: 0.06, ease: 'expo.out' })
            });
        });

        /* ---- Revelado general (por lotes) ---- */
        const reveals = $$('[data-reveal]');
        reveals.forEach((el) => {
            const kind = el.dataset.reveal;
            gsap.set(el, kind === 'scale' ? { opacity: 0, scale: 0.92 } : kind === 'fade' ? { opacity: 0 } : { opacity: 0, y: 40 });
        });
        ScrollTrigger.batch(reveals, {
            start: 'top 90%', once: true,
            onEnter: (batch) => gsap.to(batch, { opacity: 1, y: 0, scale: 1, duration: 1.3, stagger: { amount: Math.min(0.5, 0.12 * (batch.length - 1)) }, ease: 'expo.out', clearProps: 'opacity,transform' })
        });

        initSharedUi();
        ScrollTrigger.refresh();
    }

    /** Efectos de puntero (no dependen de ScrollTrigger). */
    function initSharedUi() {
        if (!hasGSAP || reduceMotion || !finePointer) return;

        // Botones magnéticos
        $$('[data-magnetic]').forEach((el) => {
            const xTo = gsap.quickTo(el, 'x', { duration: 0.7, ease: 'elastic.out(1, 0.55)' });
            const yTo = gsap.quickTo(el, 'y', { duration: 0.7, ease: 'elastic.out(1, 0.55)' });
            el.addEventListener('pointermove', (e) => {
                const r = el.getBoundingClientRect();
                xTo((e.clientX - (r.left + r.width / 2)) * 0.28);
                yTo((e.clientY - (r.top + r.height / 2)) * 0.4);
            });
            el.addEventListener('pointerleave', () => { xTo(0); yTo(0); });
        });

        // Tarjetas de terapias: foco de luz + inclinación
        $$('[data-tilt]').forEach((el) => {
            const rx = gsap.quickTo(el, 'rotationX', { duration: 0.6, ease: 'power3' });
            const ry = gsap.quickTo(el, 'rotationY', { duration: 0.6, ease: 'power3' });
            gsap.set(el, { transformPerspective: 900 });
            el.addEventListener('pointermove', (e) => {
                const r = el.getBoundingClientRect();
                const x = e.clientX - r.left, y = e.clientY - r.top;
                el.style.setProperty('--mx', `${x}px`); el.style.setProperty('--my', `${y}px`);
                ry((x / r.width - 0.5) * 7); rx(-(y / r.height - 0.5) * 7);
            });
            el.addEventListener('pointerleave', () => { rx(0); ry(0); });
        });

        // Arco de Consuelo
        const arch = $('[data-tilt-soft]');
        if (arch) {
            gsap.set(arch, { transformPerspective: 1000 });
            const rx = gsap.quickTo(arch, 'rotationX', { duration: 0.8, ease: 'power3' });
            const ry = gsap.quickTo(arch, 'rotationY', { duration: 0.8, ease: 'power3' });
            arch.addEventListener('pointermove', (e) => {
                const r = arch.getBoundingClientRect();
                ry((e.clientX - r.left) / r.width * 16 - 8); rx(-((e.clientY - r.top) / r.height * 12 - 6));
            });
            arch.addEventListener('pointerleave', () => { rx(0); ry(0); });
        }
    }

    /* ======================================================================
       5. Secuencia de carga (ciclo lunar) y arranque
       ====================================================================== */

    /** Espera a que las tipografías de marca estén listas (la hoja de Google Fonts carga sin bloquear el render). */
    function fontsReady() {
        const link = $('link[href*="fonts.googleapis.com"][rel="stylesheet"]');
        const sheet = new Promise((res) => {
            if (!link || link.media === 'all') return res();
            link.addEventListener('load', res, { once: true });
            setTimeout(res, 3500);
        });
        return sheet
            .then(() => (document.fonts ? Promise.all([
                document.fonts.load('600 1em "Cormorant Garamond"'), document.fonts.load('italic 600 1em "Cormorant Garamond"'),
                document.fonts.load('500 1em "Cormorant Garamond"'), document.fonts.load('italic 500 1em "Cormorant Garamond"'),
                document.fonts.load('400 1em Outfit'), document.fonts.load('500 1em Outfit')
            ]) : null))
            .catch(() => {})
            .then(() => root.classList.add('fonts-ok'));
    }

    function boot() {
        const loader = $('#loader');
        const pctEl = $('#ld-pct'), ring = $('#ld-ring'), shadow = $('#ld-shadow');

        const finish = () => {
            root.classList.remove('is-loading');
            loader.style.display = 'none';
            const wa = $('#wa-float');
            const narrow = window.matchMedia('(max-width: 599px)').matches;
            if (narrow && hasGSAP) {
                ScrollTrigger.create({ start: () => window.innerHeight * 0.5, onEnter: () => wa.classList.add('is-ready'), onLeaveBack: () => wa.classList.remove('is-ready') });
            } else {
                wa.classList.add('is-ready');
            }
            setTimeout(() => wa.classList.add('show-tip'), 6500);
            setTimeout(() => wa.classList.remove('show-tip'), 12000);
            if (lenis) lenis.start();
            if (hasGSAP) ScrollTrigger.refresh();
        };

        // Sin GSAP o con movimiento reducido: desvanecido simple.
        if (!hasGSAP || reduceMotion) {
            root.classList.add('fonts-ok');
            const quick = () => {
                loader.style.transition = 'opacity .6s ease'; loader.style.opacity = '0';
                setTimeout(finish, 650);
            };
            if (hasGSAP) safe('motion', () => initMotion({}));
            if (document.readyState === 'complete') setTimeout(quick, 300); else window.addEventListener('load', () => setTimeout(quick, 300));
            return;
        }

        const heroIntro = {};
        safe('motion', () => initMotion(heroIntro));
        if (!heroIntro.add) { finish(); return; }

        // Partículas del loader
        let loaderDust = null;
        safe('loader-dust', () => { loaderDust = new Dust($('#fx-loader'), { min: 26, max: 48, speed: 1.6, sparkle: 0.12, density: 1 / 20000 }); loaderDust.start(); });

        const state = { p: 0 };
        const render = () => {
            const p = state.p;
            pctEl.textContent = Math.round(p * 100);
            ring.style.strokeDashoffset = String(100 - p * 100);
            shadow.setAttribute('cx', (100 - 126 * p).toFixed(2));
        };
        render();

        const logo = new Image(); const logoReady = new Promise((res) => { logo.onload = logo.onerror = res; logo.src = 'logo.webp'; });
        const assetsReady = Promise.race([
            Promise.all([fontsReady(), logoReady, new Promise((res) => (document.readyState === 'complete' ? res() : window.addEventListener('load', res, { once: true })))]),
            new Promise((res) => setTimeout(res, 6500))
        ]);

        const tl = gsap.timeline();
        tl.to(state, { p: 0.9, duration: 2.1, ease: 'power2.inOut', onUpdate: render });
        tl.add(() => { assetsReady.then(() => { gsap.to(state, { p: 1, duration: 0.55, ease: 'power2.out', onUpdate: render, onComplete: exit }); }); });

        function exit() {
            const out = gsap.timeline({ onComplete: () => { finish(); if (loaderDust) loaderDust.stop(); } });
            out.to('.loader__moon', { scale: 1.12, duration: 0.7, ease: 'power2.out' }, 0)
                .to('.loader__glow', { opacity: 1, scale: 1.3, duration: 0.7, ease: 'power2.out' }, 0)
                .to('.loader__stage', { opacity: 0, y: -26, duration: 0.55, ease: 'power2.in' }, 0.55)
                .to(loader, { yPercent: -100, duration: 1.25, ease: 'expo.inOut' }, 0.8)
                .add(() => { heroIntro.add(); }, 1.25);
        }
    }

    /* ======================================================================
       Arranque
       ====================================================================== */
    wireWhatsApp();
    safe('menu', initMenu);
    safe('faq', initFaq);
    safe('form', initForm);

    // Polvo dorado en hero y contacto
    safe('hero-dust', () => {
        const dust = new Dust($('#fx-hero'), { density: 1 / 11000, max: 110, speed: 1 });
        dust.start();
        if (finePointer) {
            const hero = $('#inicio');
            hero.addEventListener('pointermove', (e) => { const r = hero.getBoundingClientRect(); dust.pointer.x = e.clientX - r.left; dust.pointer.y = e.clientY - r.top; });
            hero.addEventListener('pointerleave', () => { dust.pointer.x = dust.pointer.y = -9999; });
        }
    });
    safe('contact-dust', () => { const d = new Dust($('#fx-contact'), { density: 1 / 26000, max: 40, min: 12, speed: 0.7, sparkle: 0.1 }); d.start(); });

    if (hasGSAP) boot();
    else {
        // Si el CDN no carga, el sitio queda completamente legible.
        root.classList.remove('is-loading'); root.classList.add('fonts-ok');
        const l = $('#loader'); if (l) l.style.display = 'none';
        const wa = $('#wa-float'); if (wa) wa.classList.add('is-ready');
        $$('[data-count]').forEach((el) => { el.textContent = el.dataset.count; });
    }
})();
