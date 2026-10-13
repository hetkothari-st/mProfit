(function () {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasGsap = typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined';
  if (hasGsap) gsap.registerPlugin(ScrollTrigger);

  document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });

  /* ---------- header ---------- */
  const header = document.querySelector('.site-header');
  const onScroll = () => header && header.classList.toggle('scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const toggle = document.querySelector('.nav-toggle');
  const nav = document.querySelector('.nav');
  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
      toggle.textContent = open ? 'Close' : 'Menu';
    });
    document.querySelectorAll('.mobile-menu a').forEach((a) => a.addEventListener('click', () => {
      nav.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.textContent = 'Menu';
    }));
  }

  /* ---------- headline reveals (one per section) ---------- */
  const reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !reduce) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.3 });
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add('in'));
  }

  /* ---------- hero: the ledger opens ---------- */
  const stage = document.getElementById('book-stage');
  if (stage) {
    const book = document.getElementById('book');
    const scaler = document.getElementById('book-scaler');
    const cover = book.querySelector('.cover');
    const leaves = [1, 2, 3].map((n) => book.querySelector(`[data-leaf="${n}"]`));
    const caption = document.getElementById('hero-caption');
    const captions = ['Scroll to open the ledger', 'Your net worth, on the first page', 'Every alert, waiting for a nod', 'Tax, worked out lot by lot'];

    const narrow = window.matchMedia('(max-width: 960px)').matches;
    const fit = () => {
      const pw = parseFloat(getComputedStyle(stage).getPropertyValue('--pw')) || 300;
      const avail = stage.clientWidth;
      const s = Math.min(1, avail / (pw * 2 + 24));
      scaler.style.transform = `scale(${s})`;
      const ph = parseFloat(getComputedStyle(stage).getPropertyValue('--ph')) || 410;
      stage.style.height = s < 1 ? `${Math.round((ph + 110) * s)}px` : '';
    };
    fit();
    window.addEventListener('resize', fit);

    const pwNow = () => parseFloat(getComputedStyle(stage).getPropertyValue('--pw')) || 300;
    const setCaption = (i) => { if (caption && caption.dataset.i !== String(i)) { caption.dataset.i = i; caption.textContent = captions[i]; } };

    // z keeps stacking right: unturned leaves stack 3,2,1; turned ones 1,2,3 on the left
    const closedPose = { x: 0, rotationX: 22, rotationY: -30, rotationZ: 5 };
    const openPose = () => ({ x: pwNow() / 2, rotationX: 16, rotationY: 0, rotationZ: 0 });

    if (!hasGsap || reduce) {
      // static open spread on the dashboard
      book.style.transform = `translateX(${pwNow() / 2}px) rotateX(10deg)`;
      cover.style.transform = 'translateZ(0.5px) rotateY(-180deg)';
      leaves.forEach((l, i) => { l.style.transform = `translateZ(${3 - i}px)`; });
      setCaption(1);
    } else {
      gsap.set(book, closedPose);
      gsap.set(cover, { z: 14, rotationY: 0, transformOrigin: 'left center' });
      leaves.forEach((l, i) => gsap.set(l, { z: 3 - i, rotationY: 0, transformOrigin: 'left center' }));

      // a gentle idle sway while closed, so the object reads as 3D before any scroll
      const idle = gsap.to(book, { rotationY: -24, rotationX: 18, duration: 3.2, yoyo: true, repeat: -1, ease: 'sine.inOut' });

      const tl = gsap.timeline({
        defaults: { ease: 'power2.inOut' },
        scrollTrigger: {
          trigger: narrow ? '.hero-visual' : '.hero',
          start: narrow ? 'center 52%' : 'top top+=72',
          end: narrow ? '+=200%' : '+=260%',
          pin: narrow ? '.hero-visual' : '.hero-pin',
          scrub: 0.8,
          invalidateOnRefresh: true,
          onUpdate: (st) => {
            if (st.progress > 0.001) idle.pause();
            else idle.resume();
            const p = st.progress;
            setCaption(p < 0.2 ? 0 : p < 0.55 ? 1 : p < 0.85 ? 2 : 3);
          },
        },
      });
      tl.to(book, { ...openPose(), duration: 1 }, 0)
        .to(cover, { rotationY: -180, z: 0.5, duration: 1 }, 0.1)
        .to({}, { duration: 0.5 })
        .to(leaves[0], { rotationY: -179, z: 1, duration: 1 })
        .to({}, { duration: 0.5 })
        .to(leaves[1], { rotationY: -179, z: 2, duration: 1 })
        .to({}, { duration: 0.4 });
        }
  }

  /* ---------- the scattered paperwork comes together ---------- */
  const scatter = document.getElementById('scatter-stage');
  if (scatter) {
    const slips = Array.from(scatter.querySelectorAll('.slip'));
    const ledger = scatter.querySelector('.scatter-ledger');
    const spots = [
      [-0.38, -0.30, 60, -8], [0.30, -0.34, -40, 6], [-0.08, -0.06, 120, -3],
      [0.36, 0.06, 20, 9], [-0.40, 0.18, -80, 5], [0.06, 0.32, 40, -7],
      [0.30, 0.34, -120, 4], [-0.22, 0.38, 90, -10], [0.02, -0.38, -60, 3],
    ];
    const place = () => {
      const w = scatter.clientWidth, h = scatter.clientHeight;
      slips.forEach((s, i) => {
        const [fx, fy, z, r] = spots[i % spots.length];
        s.dataset.x = fx * w; s.dataset.y = fy * h; s.dataset.z = z; s.dataset.r = r;
      });
    };
    place();
    if (!hasGsap || reduce) {
      slips.forEach((s) => { s.style.transform = `translate(-50%,-50%) translate(${s.dataset.x}px, ${s.dataset.y}px) rotate(${s.dataset.r}deg)`; });
    } else {
      slips.forEach((s) => gsap.set(s, { xPercent: -50, yPercent: -50, x: +s.dataset.x, y: +s.dataset.y, z: +s.dataset.z, rotation: +s.dataset.r, rotationX: 8 }));
      // drift while you read
      slips.forEach((s, i) => gsap.to(s, { y: '+=' + (8 + (i % 3) * 5), rotation: '+=' + (i % 2 ? 2 : -2), duration: 2.6 + (i % 4) * 0.4, yoyo: true, repeat: -1, ease: 'sine.inOut' }));
      const tl = gsap.timeline({
        scrollTrigger: { trigger: scatter, start: 'center 52%', end: '+=120%', pin: true, scrub: 1 },
      });
      tl.to(slips, { x: 0, y: 0, z: 0, rotation: 0, rotationX: 0, scale: 0.55, opacity: 0, duration: 1, stagger: 0.05, ease: 'power3.in' }, 0)
        .fromTo(ledger, { opacity: 0, scale: 0.7, rotationY: -30 }, { opacity: 1, scale: 1, rotationY: 0, duration: 0.6, ease: 'power2.out' }, 0.7);
    }
  }

  /* ---------- how it works: the film ---------- */
  const film = document.getElementById('film');
  if (film && hasGsap) {
    const $ = (id) => document.getElementById(id);
    const fields = $('f-fields'), mail = $('f-mail'), queue = $('f-queue'), worth = $('f-worth'), cursor = $('f-cursor');
    const marks = ['f-amt', 'f-date', 'f-fund'].map($);
    const evs = Array.from(queue.querySelectorAll('[data-ev]'));
    const chips = evs.map((e) => e.querySelector('.st'));
    const approve = $('f-approve');
    const nw = $('f-nw');
    const steps = Array.from(document.querySelectorAll('#steps li'));
    const stepsList = document.getElementById('steps');
    const label = $('film-label');
    const bar = $('film-bar');
    const btn = $('film-toggle');
    const labels = ['Reading the alert', 'Pulling out the details', 'Waiting for your approval', 'Updating the ledger'];

    const setStep = (i) => () => {
      steps.forEach((s, j) => s.classList.toggle('active', j === i));
      label.textContent = labels[i];
    };
    const fmt = (n) => '₹' + Math.round(n).toLocaleString('en-IN');

    const reset = () => {
      gsap.set([mail, queue, fields], { opacity: 0, y: 14 });
      gsap.set(evs, { opacity: 0, x: 16 });
      gsap.set(worth, { opacity: 0, scale: 0.98 });
      gsap.set(cursor, { opacity: 0, left: '62%', top: '88%' });
      marks.forEach((m) => m.classList.remove('hl'));
      chips.forEach((c) => { c.textContent = 'Review'; c.classList.remove('on'); });
      nw.textContent = fmt(18407215);
    };

    const tl = gsap.timeline({ repeat: -1, paused: true, onRepeat: reset, onUpdate: () => { bar.style.transform = `scaleX(${tl.progress()})`; } });
    reset();
    tl.call(setStep(0), null, 0)
      .to(mail, { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' }, 0.2)
      .call(setStep(1), null, 1.6)
      .call(() => marks[0].classList.add('hl'), null, 1.8)
      .call(() => marks[1].classList.add('hl'), null, 2.2)
      .call(() => marks[2].classList.add('hl'), null, 2.6)
      .to(fields, { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' }, 2.4)
      .to(queue, { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' }, 2.9)
      .to(evs, { opacity: 1, x: 0, duration: 0.45, stagger: 0.5, ease: 'power2.out' }, 3.2)
      .call(setStep(2), null, 4.8)
      .to(cursor, { opacity: 1, duration: 0.2 }, 5.0)
      .to(cursor, { left: () => (approve.offsetLeft + queue.offsetLeft + approve.offsetWidth / 2) + 'px', top: () => (approve.offsetTop + queue.offsetTop + approve.offsetHeight / 2) + 'px', duration: 1.1, ease: 'power2.inOut' }, 5.0)
      .to(approve, { scale: 0.92, duration: 0.1, yoyo: true, repeat: 1 }, 6.2)
      .call(() => chips.forEach((c, i) => setTimeout(() => { c.textContent = 'Committed'; c.classList.add('on'); }, i * 140)), null, 6.3)
      .call(setStep(3), null, 7.6)
      .to([mail, fields, queue, cursor], { opacity: 0, y: -10, duration: 0.5 }, 7.6)
      .to(worth, { opacity: 1, scale: 1, duration: 0.6, ease: 'power2.out' }, 8.0)
      .to({ v: 18407215 }, { v: 18462310, duration: 1.6, ease: 'power3.out', onUpdate() { nw.textContent = fmt(this.targets()[0].v); } }, 8.3)
      .to({}, { duration: 2.6 }, 9.9);

    let userPaused = false;
    btn.addEventListener('click', () => {
      userPaused = !userPaused;
      btn.setAttribute('aria-pressed', String(userPaused));
      btn.textContent = userPaused ? 'Play' : 'Pause';
      if (userPaused) tl.pause(); else tl.play();
      stepsList.classList.toggle('playing', !userPaused);
    });

    if (reduce) {
      tl.progress(0.7).pause(); // show the approved queue as a still
      userPaused = true; btn.textContent = 'Play'; btn.setAttribute('aria-pressed', 'true');
    } else {
      ScrollTrigger.create({
        trigger: film, start: 'top 85%', end: 'bottom 10%',
        onToggle: (st) => {
          if (userPaused) return;
          if (st.isActive) { tl.play(); stepsList.classList.add('playing'); }
          else { tl.pause(); stepsList.classList.remove('playing'); }
        },
      });
    }
  }

  /* ---------- asset index ---------- */
  const list = document.getElementById('folio-list');
  const card = document.getElementById('folio-card');
  if (list && card) {
    const A = [
      ['Bank accounts', 'Balances, statements and every credit and debit, matched to the rest of your money.', ['Savings, current and salary accounts', 'Statement and alert imports', 'Bank reconciliation report']],
      ['Stocks', 'Equity holdings from every broker and demat, priced daily and taxed correctly.', ['Contract notes and tradebooks', 'Splits, bonuses, dividends, mergers', 'FIFO gains with grandfathering']],
      ['F & O', 'Futures and options positions with realised and unrealised P&L by expiry.', ['Broker P&L and tradebook imports', 'Speculative vs non-speculative split', 'Turnover for tax audit checks']],
      ['Mutual funds', 'Every folio from your CAS, with research-grade analysis of each fund.', ['CAS from CAMS & KFintech, MF Central', 'Fund score, rolling returns, overlap', 'Debt vs equity tax treatment']],
      ['Bonds', 'Corporate bonds, G-secs and SGBs with coupons and maturities.', ['Coupons and maturity dates', 'Sovereign gold bonds', 'Maturity reminders']],
      ['FDs & RDs', 'Fixed and recurring deposits across banks, with interest worked out for you.', ['Interest accrued to date', 'Maturity value worked out', 'Maturity alerts']],
      ['Gold & Silver', 'Jewellery, coins, digital gold and SGBs at today\'s price.', ['Live gold and silver rates', 'Weight and purity for physical gold', 'Gains on sale']],
      ['Crypto', 'Coins across exchanges and wallets in rupee terms.', ['Holdings across exchanges and wallets', 'Cost basis and gains', 'Value in rupees']],
      ['Forex', 'Foreign stocks, foreign currency cash and your LRS limit.', ['US stocks and ETFs', 'Forex cash in any currency', 'LRS usage for the year']],
      ['PPF & EPF', 'Provident funds with contributions, interest and passbook sync.', ['EPF passbook import', 'PPF contributions and maturity', 'Interest credited each year']],
      ['NPS', 'Tier I and II with scheme allocation and current NAV.', ['Tier I and Tier II', 'Equity, corporate, government allocation', 'Current value from NAV']],
      ['Post Office', 'NSC, KVP, SCSS, MIS, Sukanya and the rest of the small-savings family.', ['Scheme-specific interest rules', 'Payout schedules', 'Maturity reminders']],
      ['Real estate', 'Homes, plots and commercial property at cost and current value.', ['Purchase cost and improvements', 'Indexed capital gains on sale', 'Linked loans and rental income']],
      ['Rental', 'Tenancies, rent due dates and receipts, for each property you let out.', ['Monthly receipts generated for you', 'Overdue reminders', 'Rent matched to bank credits']],
      ['Vehicles', 'Cars and bikes from the registration number: RC, expiries and value.', ['RC details from the registration number', 'PUC, insurance and fitness alerts', 'Challans and a value estimate']],
      ['Insurance', 'Life, health, motor and home policies with coverage and renewals.', ['Coverage gap check', 'Premium history and reminders', 'Printable emergency sheet']],
      ['Loans', 'Loans you have taken and money you have lent.', ['Amortisation and prepayment', 'Tax benefits on home loans', 'Money lent to friends and family']],
      ['Credit cards', 'Cards, statement dates, dues and limits.', ['Due-date reminders', 'Utilisation across cards', 'Statement imports']],
      ['Others', 'Art, collectables, unlisted shares, a stake in a friend\'s business.', ['Any asset with a value', 'Manual valuation history', 'Counts toward net worth']],
    ];
    list.innerHTML = A.map((a, i) => `<li><button role="tab" id="folio-${i}" aria-selected="${i === 3}" aria-controls="folio-card" data-i="${i}"><span>${a[0]}</span><span class="dots" aria-hidden="true"></span><span class="pg">f. ${i + 1}</span></button></li>`).join('');
    const show = (i) => {
      const a = A[i];
      list.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(+b.dataset.i === i)));
      card.setAttribute('aria-labelledby', `folio-${i}`);
      card.innerHTML = `<div class="folio-anim"><div class="no">Folio ${i + 1} of ${A.length}</div><h3>${a[0]}</h3><p>${a[1]}</p><ul>${a[2].map((x) => `<li>${x}</li>`).join('')}</ul></div>`;
    };
    list.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) show(+b.dataset.i); });
    list.addEventListener('keydown', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const i = +b.dataset.i;
      const next = e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowUp' ? i - 1 : null;
      if (next === null) return;
      e.preventDefault();
      const n = (next + A.length) % A.length;
      show(n);
      list.querySelector(`[data-i="${n}"]`).focus();
    });
    show(3);
  }

  /* ---------- tour: chapters swap the laptop screen ---------- */
  const chaps = document.querySelectorAll('.chap');
  const stack = document.getElementById('screen-stack');
  if (chaps.length && stack && 'IntersectionObserver' in window) {
    const setActive = (key) => {
      stack.querySelectorAll('.scr').forEach((s) => s.classList.toggle('on', s.dataset.for === key));
      chaps.forEach((c) => c.classList.toggle('dim', c.dataset.chap !== key));
    };
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) setActive(e.target.dataset.chap); });
    }, { rootMargin: '-45% 0px -45% 0px' });
    chaps.forEach((c) => io.observe(c));
    setActive(chaps[0].dataset.chap);
  }

  /* ---------- privacy seal turns as you scroll ---------- */
  const seal = document.getElementById('seal');
  if (seal && hasGsap && !reduce) {
    gsap.fromTo(seal, { rotationY: -25, rotationX: 10 }, {
      rotationY: 335, rotationX: -6, ease: 'none',
      scrollTrigger: { trigger: '#privacy', start: 'top bottom', end: 'bottom top', scrub: 1 },
    });
  }

  /* ---------- devices: slight parallax ---------- */
  if (hasGsap && !reduce) {
    const phone = document.querySelector('.devices .phone');
    if (phone) gsap.fromTo(phone, { y: 60 }, { y: -30, ease: 'none', scrollTrigger: { trigger: '.devices', start: 'top bottom', end: 'bottom top', scrub: 1 } });
  }

  /* ---------- early access form ---------- */
  const form = document.getElementById('signup');
  if (form) {
    const msg = document.getElementById('signup-msg');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = form.querySelector('input[type=email]');
      const v = input.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
        msg.textContent = 'Enter an email address like name@example.com.';
        input.focus();
        return;
      }
      window.EP_CONTACT.send({ subject: 'Early access request', body: `Please add ${v} to the EveryPaisa early-access list.` });
      msg.textContent = 'Your mail app should open with the request ready to send. Thank you.';
      form.reset();
    });
  }
})();
