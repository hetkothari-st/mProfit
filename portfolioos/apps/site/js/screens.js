/* App screens, drawn in the product's own dark theme.
   Each screen is a plain HTML string so the same screen can appear in the
   hero ledger, the laptop in the tour, and the inline mobile layout. */
(function () {
  const top = (title, pill) =>
    `<div class="scr-top"><span class="scr-dot"></span><b>${title}</b>${pill ? `<span class="scr-pill">${pill}</span>` : ''}</div>`;

  const S = {};

  S.dashboard = `
  <div class="scr s-dash">${top('Dashboard', 'Family · 4 members')}
    <div class="scr-body">
      <div class="scr-h">Your financial <em>portrait</em></div>
      <div class="s-dash-grid">
        <div class="scr-card s-nw">
          <div class="scr-label">Total net worth</div>
          <div class="scr-big">₹1,84,62,310</div>
          <div class="pos">+₹22,48,905 unrealised · XIRR 14.2%</div>
          <svg class="spark" viewBox="0 0 200 54" preserveAspectRatio="none"><defs><linearGradient id="g1" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#e2fe53" stop-opacity=".35"/><stop offset="1" stop-color="#e2fe53" stop-opacity="0"/></linearGradient></defs><path d="M0 46 L20 44 L40 40 L60 42 L80 33 L100 35 L120 26 L140 24 L160 18 L180 15 L200 8 L200 54 L0 54Z" fill="url(#g1)"/><path d="M0 46 L20 44 L40 40 L60 42 L80 33 L100 35 L120 26 L140 24 L160 18 L180 15 L200 8" fill="none" stroke="#e2fe53" stroke-width="1.6"/></svg>
        </div>
        <div class="scr-card s-alloc">
          <div class="donut"></div>
          <div class="legend"><span><i style="background:#e2fe53"></i>Equities 40%</span><span><i style="background:#b69cf0"></i>Mutual funds 25%</span><span><i style="background:#f08c4a"></i>Real estate 19%</span><span><i style="background:#b3b3b3"></i>Other 16%</span></div>
        </div>
        <div class="scr-card s-kpis">
          <div><div class="scr-label">Invested</div><b>₹1,38,40,500</b></div>
          <div><div class="scr-label">Today</div><b class="pos">+₹55,095</b></div>
          <div><div class="scr-label">Liabilities</div><b class="neg">₹31,20,000</b></div>
        </div>
        <div class="scr-card s-alerts">
          <div class="scr-row"><span>Car insurance renews</span><span class="scr-chip warn">12 days</span></div>
          <div class="scr-row"><span>SBI FD matures</span><span class="scr-chip">18 Mar</span></div>
          <div class="scr-row"><span>October rent, Flat 302</span><span class="scr-chip on">Received</span></div>
        </div>
      </div>
    </div>
  </div>`;

  S.review = `
  <div class="scr">${top('Inbox imports', 'Pending review · 4')}
    <div class="scr-body">
      <div class="scr-row"><div class="scr-h">Pending <em>review</em></div><button class="scr-btn" tabindex="-1">Approve all</button></div>
      <div class="s-tabs"><span class="scr-chip on">Pending</span><span class="scr-chip">Auto-committed</span><span class="scr-chip">Rejected</span></div>
      <div class="scr-card s-list">
        <div class="s-ev"><div><div class="scr-label">SIP installment · HDFC Bank</div>Parag Parikh Flexi Cap</div><b>₹12,500.00</b></div>
        <div class="s-ev"><div><div class="scr-label">Buy · Zerodha</div>INFY × 25 @ 1,536.50</div><b>₹38,412.50</b></div>
        <div class="s-ev"><div><div class="scr-label">Interest credit · SBI</div>Fixed deposit ••4417</div><b class="pos">₹4,183.00</b></div>
        <div class="s-ev"><div><div class="scr-label">Premium paid · insurer</div>Term plan, annual</div><b>₹18,400.00</b></div>
      </div>
      <div class="scr-card s-banner"><b>HDFC Bank has filed 5 clean entries.</b><span class="mut">Let future alerts from this sender go straight to the ledger?</span><div class="scr-row" style="justify-content:flex-start;gap:6px;margin-top:6px"><button class="scr-btn" tabindex="-1">Auto-commit</button><span class="scr-chip">Not yet</span></div></div>
    </div>
  </div>`;

  S.tax = `
  <div class="scr">${top('Tax', 'FY 2025–26')}
    <div class="scr-body">
      <div class="scr-h">Capital <em>gains</em></div>
      <div class="scr-grid3 s-tax-kpi">
        <div class="scr-card"><div class="scr-label">STCG</div><b>₹1,12,340</b></div>
        <div class="scr-card"><div class="scr-label">LTCG</div><b>₹2,86,910</b></div>
        <div class="scr-card"><div class="scr-label">Exempt used</div><b class="lime">₹1,25,000</b></div>
      </div>
      <div class="scr-card">
        <div class="scr-row" style="margin-bottom:4px"><b>Schedule 112A</b><span class="scr-chip">FIFO</span></div>
        <table class="scr-table">
          <tr><th>Scrip</th><th>Cost</th><th>Gain</th></tr>
          <tr><td>HDFCBANK <span class="scr-chip">GF</span></td><td>₹2,41,800</td><td class="pos">₹96,420</td></tr>
          <tr><td>ITC</td><td>₹88,150</td><td class="pos">₹41,075</td></tr>
          <tr><td>Axis Bluechip</td><td>₹1,50,000</td><td class="pos">₹62,310</td></tr>
          <tr class="s-hide-sm"><td>TATAMOTORS</td><td>₹64,900</td><td class="neg">−₹8,240</td></tr>
        </table>
      </div>
      <div class="scr-card s-harvest"><span class="lime">Harvest</span> Book ₹31,600 of losses in 2 funds to cut STCG tax by about ₹6,300.</div>
    </div>
  </div>`;

  S.mf = `
  <div class="scr">${top('Mutual funds', 'Fund analysis')}
    <div class="scr-body">
      <div class="scr-row"><div><div class="scr-label">Flexi cap · Direct growth</div><div class="scr-h">Parag Parikh <em>Flexi Cap</em></div></div><div class="s-score"><b>82</b><span>/100</span></div></div>
      <div class="s-mf-grid">
        <div class="scr-card s-pillars">
          <div class="s-pill"><span>Returns</span><div class="bar"><i style="width:84%"></i></div></div>
          <div class="s-pill"><span>Risk</span><div class="bar"><i style="width:78%"></i></div></div>
          <div class="s-pill"><span>Cost</span><div class="bar"><i style="width:90%"></i></div></div>
          <div class="s-pill"><span>Consistency</span><div class="bar"><i style="width:74%"></i></div></div>
        </div>
        <div class="scr-card">
          <div class="scr-label" style="margin-bottom:6px">3-year rolling returns</div>
          <div class="s-hist">${[8,14,22,34,48,62,55,40,26,15,8,4].map(h=>`<i style="height:${h}px"></i>`).join('')}</div>
          <div class="scr-row scr-label" style="margin-top:4px"><span>6%</span><span>median 17.8%</span><span>28%</span></div>
        </div>
        <div class="scr-card s-overlap">
          <div class="scr-label">Overlap with what you hold</div>
          <div class="scr-row"><span>vs Axis Bluechip</span><b class="lime">38%</b></div>
          <div class="scr-row"><span>vs Mirae Large Cap</span><b>24%</b></div>
        </div>
        <div class="scr-card s-wide s-find"><span class="lime">Why 82</span> Beat its category in 81% of rolling 3-year windows, with a shallower worst fall (−21% vs −29%) and one of the lowest costs in flexi cap.</div>
      </div>
    </div>
  </div>`;

  S.insurance = `
  <div class="scr">${top('Insurance', 'Coverage')}
    <div class="scr-body">
      <div class="scr-h">Is the family <em>covered?</em></div>
      <div class="scr-grid2">
        <div class="scr-card"><div class="scr-label">Life cover</div><b>₹2.0 Cr</b><div class="bar" style="margin:6px 0 4px"><i style="width:77%;background:#f2c14e"></i></div><span class="mut">Need ≈ ₹2.6 Cr · gap ₹60 L</span></div>
        <div class="scr-card"><div class="scr-label">Health, family floater</div><b>₹10 L + ₹40 L top-up</b><div class="bar" style="margin:6px 0 4px"><i style="width:100%"></i></div><span class="mut">Room rent: no cap</span></div>
      </div>
      <div class="scr-card">
        <div class="scr-row"><span>Term plan · annual</span><span class="scr-chip warn">Due 4 Nov</span></div>
        <div class="scr-row" style="margin-top:6px"><span>Car · comprehensive</span><span class="scr-chip warn">12 days</span></div>
        <div class="scr-row" style="margin-top:6px"><span>Home · contents</span><span class="scr-chip">Mar 2027</span></div>
      </div>
      <div class="scr-card s-sheet"><b>Emergency sheet</b><span class="mut">Policies, nominees, claim numbers and who to call, on one printable page.</span><button class="scr-btn" tabindex="-1">Print for the family</button></div>
    </div>
  </div>`;

  S.vehicle = `
  <div class="scr">${top('Vehicles', 'Refreshed today')}
    <div class="scr-body">
      <div class="s-veh-head">
        <img src="assets/vehicle-generic-sedan.svg" alt="" />
        <div><div class="s-plate">MH 01 XX 4821</div><div class="scr-label">Sedan · Petrol · 2019 · Owner 1</div><div class="scr-label">Est. value <b style="color:#ece6d9">₹6,40,000</b></div></div>
      </div>
      <div class="scr-grid2">
        <div class="scr-card"><div class="scr-label">PUC</div><b class="neg">Expired 12 Oct</b></div>
        <div class="scr-card"><div class="scr-label">Insurance</div><b style="color:#f2c14e">25 Oct 2026</b></div>
        <div class="scr-card"><div class="scr-label">Fitness</div><b>Jun 2034</b></div>
        <div class="scr-card"><div class="scr-label">Challans</div><b class="pos">None pending</b></div>
      </div>
      <div class="scr-card s-wide"><div class="scr-row"><span class="mut">Petrol today, Mumbai</span><b>₹103.50 / L</b></div><div class="scr-row" style="margin-top:4px"><span class="mut">Road tax valid till</span><b>2034</b></div></div>
      <div class="scr-card"><div class="scr-row"><span>Flat 302 · tenant R. Sharma</span><span class="scr-chip on">Oct rent received</span></div><div class="scr-row" style="margin-top:6px"><span class="mut">Next due 5 Nov · ₹32,000</span><span class="mut">Lease ends Mar 2027</span></div></div>
    </div>
  </div>`;

  S.emi = `
  <div class="scr">${top('EMI calculator', 'Home loan')}
    <div class="scr-body">
      <div class="scr-h">₹50 L at 8.5% for <em>20 years</em></div>
      <div class="s-emi-grid">
        <div class="scr-card">
          <div class="scr-label">Monthly EMI</div><div class="scr-big">₹43,391</div>
          <div class="s-split"><i style="width:48%"></i><i style="width:52%;background:#b69cf0"></i></div>
          <div class="scr-row scr-label"><span>Principal ₹50,00,000</span><span>Interest ₹54,13,840</span></div>
        </div>
        <div class="scr-card">
          <div class="scr-label">Prepay ₹2 L every March</div>
          <div class="scr-row" style="margin-top:4px"><span>Loan closes</span><b class="lime">6 yrs 4 mo early</b></div>
          <div class="scr-row"><span>Interest saved</span><b class="pos">₹21,86,000</b></div>
        </div>
        <div class="scr-card s-wide s-rates"><div class="scr-label" style="margin-bottom:4px">Current home-loan rates</div>
          <div class="scr-row"><span>Public sector bank</span><b>8.10%</b></div>
          <div class="scr-row"><span>Private bank</span><b>8.50%</b></div>
          <div class="scr-row"><span>Housing finance co.</span><b>8.75%</b></div>
        </div>
        <div class="scr-card s-splitcard">
          <div class="scr-row"><b>Goa trip · 4 friends</b><span class="pos">you're owed ₹4,250</span></div>
          <div class="scr-row" style="margin-top:6px"><span class="mut">Ananya owes you ₹2,100</span><button class="scr-btn" tabindex="-1">Settle via UPI</button></div>
        </div>
      </div>
    </div>
  </div>`;

  S.family = `
  <div class="scr">${top('Family', 'Kapoor household')}
    <div class="scr-body">
      <div class="scr-label">Family net worth</div>
      <div class="scr-row"><div class="scr-big">₹3,12,40,600</div><span class="pos">XIRR 12.8%</span></div>
      <div class="scr-card">
        <div class="s-mem"><span class="s-av" style="background:#e2fe53;color:#111">AK</span><span>Arjun (you)</span><div class="bar"><i style="width:59%"></i></div><b>₹1.84 Cr</b></div>
        <div class="s-mem"><span class="s-av" style="background:#b69cf0">MK</span><span>Meera</span><div class="bar"><i style="width:22%;background:#b69cf0"></i></div><b>₹68.2 L</b></div>
        <div class="s-mem"><span class="s-av" style="background:#f08c4a">RK</span><span>Father · managed</span><div class="bar"><i style="width:17%;background:#f08c4a"></i></div><b>₹53.6 L</b></div>
        <div class="s-mem"><span class="s-av" style="background:#3fc6d1">IK</span><span>Ishaan</span><div class="bar"><i style="width:2%;background:#3fc6d1"></i></div><b>₹6.4 L</b></div>
      </div>
      <div class="scr-grid2">
        <div class="scr-card"><div class="scr-label">Goal · Ishaan's college</div><b>₹38 L of ₹60 L</b><div class="bar" style="margin-top:6px"><i style="width:63%"></i></div></div>
        <div class="scr-card"><div class="scr-label">CA access</div><b>Mehta &amp; Co.</b><div class="mut">Reports · read-only · 2FA on</div></div>
      </div>
    </div>
  </div>`;

  S.mobile = `
  <div class="scr s-mobile">
    <div class="scr-body" style="padding-top:40px">
      <div class="scr-row"><span class="scr-dot" style="width:22px;height:22px;border-radius:6px;background:url(assets/everypaisa-mark.png) center/cover"></span><span class="scr-chip">Family</span></div>
      <div class="scr-h">Your financial <em>portrait</em></div>
      <div class="scr-card"><div class="scr-label">Total net worth</div><div class="scr-big">₹1,84,62,310</div><div class="pos">+₹55,095 today</div></div>
      <div class="scr-card" style="display:flex;gap:10px;align-items:center"><div class="donut" style="width:64px;height:64px"></div><div class="legend"><span><i style="background:#e2fe53"></i>Equities</span><span><i style="background:#b69cf0"></i>Funds</span><span><i style="background:#f08c4a"></i>Property</span></div></div>
      <div class="scr-card"><div class="scr-row"><span>Pending review</span><span class="scr-chip on">4</span></div></div>
      <div class="scr-card"><div class="scr-row"><span>PUC expired</span><span class="scr-chip bad">Renew</span></div></div>
    </div>
  </div>`;

  window.EP_SCREENS = S;

  document.querySelectorAll('[data-screen]').forEach((slot) => {
    const html = S[slot.dataset.screen];
    if (html) slot.outerHTML = html;
  });

  const stack = document.getElementById('screen-stack');
  if (stack) {
    document.querySelectorAll('.chap').forEach((chap, i) => {
      const key = chap.dataset.chap;
      const holder = document.createElement('div');
      holder.innerHTML = S[key] || '';
      const el = holder.firstElementChild;
      if (!el) return;
      el.dataset.for = key;
      if (i === 0) el.classList.add('on');
      stack.appendChild(el);
    });
  }
})();
