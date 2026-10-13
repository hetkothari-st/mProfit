/* App screens, drawn in the product's own dark theme. One set of components
   serves the hero ledger, the tour laptop, the phone and the features fan;
   container queries in screens.css adapt each to the space it gets. */
import type { CSSProperties, ReactNode } from 'react';

export type ScreenName = 'dashboard' | 'review' | 'tax' | 'mf' | 'insurance' | 'vehicle' | 'emi' | 'family' | 'mobile';

function Top({ title, pill }: { title: string; pill?: string }) {
  return (
    <div className="scr-top">
      <span className="scr-dot" />
      <b>{title}</b>
      {pill && <span className="scr-pill">{pill}</span>}
    </div>
  );
}

function Frame({ title, pill, className, children }: { title?: string; pill?: string; className?: string; children: ReactNode }) {
  return (
    <div className={`scr ${className ?? ''}`}>
      {title && <Top title={title} pill={pill} />}
      <div className="scr-body">{children}</div>
    </div>
  );
}

const dot = (background: string): CSSProperties => ({ background });

export function Legend({ short }: { short?: boolean }) {
  const items: [string, string][] = short
    ? [['#e2fe53', 'Equities'], ['#b69cf0', 'Funds'], ['#f08c4a', 'Property']]
    : [['#e2fe53', 'Equities 40%'], ['#b69cf0', 'Mutual funds 25%'], ['#f08c4a', 'Real estate 19%'], ['#b3b3b3', 'Other 16%']];
  return (
    <div className="legend">
      {items.map(([c, l]) => (
        <span key={l}><i style={dot(c)} />{l}</span>
      ))}
    </div>
  );
}

export function Spark({ fill = true, className = 'spark' }: { fill?: boolean; className?: string }) {
  const d = 'M0 46 L20 44 L40 40 L60 42 L80 33 L100 35 L120 26 L140 24 L160 18 L180 15 L200 8';
  return (
    <svg className={className} viewBox="0 0 200 54" preserveAspectRatio="none" aria-hidden="true">
      {fill && <path d={`${d} L200 54 L0 54Z`} fill="#e2fe53" fillOpacity={0.12} />}
      <path d={d} fill="none" stroke="#e2fe53" strokeWidth={1.6} />
    </svg>
  );
}

function Dashboard() {
  return (
    <Frame title="Dashboard" pill="Family · 4 members" className="s-dash">
      <div className="scr-h">Your financial <em>portrait</em></div>
      <div className="s-dash-grid">
        <div className="scr-card s-nw">
          <div className="scr-label">Total net worth</div>
          <div className="scr-big">₹1,84,62,310</div>
          <div className="pos">+₹22,48,905 unrealised · XIRR 14.2%</div>
          <Spark />
        </div>
        <div className="scr-card s-alloc">
          <div className="donut" />
          <Legend />
        </div>
        <div className="scr-card s-kpis">
          <div><div className="scr-label">Invested</div><b>₹1,38,40,500</b></div>
          <div><div className="scr-label">Today</div><b className="pos">+₹55,095</b></div>
          <div><div className="scr-label">Liabilities</div><b className="neg">₹31,20,000</b></div>
        </div>
        <div className="scr-card s-alerts">
          <div className="scr-row"><span>Car insurance renews</span><span className="scr-chip warn">12 days</span></div>
          <div className="scr-row"><span>SBI FD matures</span><span className="scr-chip">18 Mar</span></div>
          <div className="scr-row"><span>October rent, Flat 302</span><span className="scr-chip on">Received</span></div>
        </div>
      </div>
    </Frame>
  );
}

function Review() {
  const rows: [string, string, string, boolean?][] = [
    ['SIP installment · HDFC Bank', 'Parag Parikh Flexi Cap', '₹12,500.00'],
    ['Buy · Zerodha', 'INFY × 25 @ 1,536.50', '₹38,412.50'],
    ['Interest credit · SBI', 'Fixed deposit ••4417', '₹4,183.00', true],
    ['Premium paid · insurer', 'Term plan, annual', '₹18,400.00'],
  ];
  return (
    <Frame title="Inbox imports" pill="Pending review · 4">
      <div className="scr-row"><div className="scr-h">Pending <em>review</em></div><span className="scr-btn">Approve all</span></div>
      <div className="s-tabs"><span className="scr-chip on">Pending</span><span className="scr-chip">Auto-committed</span><span className="scr-chip">Rejected</span></div>
      <div className="scr-card s-list">
        {rows.map(([k, v, amt, pos]) => (
          <div className="s-ev" key={v}>
            <div><div className="scr-label">{k}</div>{v}</div>
            <b className={pos ? 'pos' : undefined}>{amt}</b>
          </div>
        ))}
      </div>
      <div className="scr-card s-banner">
        <b>HDFC Bank has filed 5 clean entries.</b>
        <span className="mut">Let future alerts from this sender go straight to the ledger?</span>
        <div className="scr-row s-banner-actions"><span className="scr-btn">Auto-commit</span><span className="scr-chip">Not yet</span></div>
      </div>
    </Frame>
  );
}

function Tax() {
  return (
    <Frame title="Tax" pill="FY 2025–26">
      <div className="scr-h">Capital <em>gains</em></div>
      <div className="scr-grid3 s-tax-kpi">
        <div className="scr-card"><div className="scr-label">STCG</div><b>₹1,12,340</b></div>
        <div className="scr-card"><div className="scr-label">LTCG</div><b>₹2,86,910</b></div>
        <div className="scr-card"><div className="scr-label">Exempt used</div><b className="lime">₹1,25,000</b></div>
      </div>
      <div className="scr-card">
        <div className="scr-row s-mb"><b>Schedule 112A</b><span className="scr-chip">FIFO</span></div>
        <table className="scr-table">
          <thead><tr><th>Scrip</th><th>Cost</th><th>Gain</th></tr></thead>
          <tbody>
            <tr><td>HDFCBANK <span className="scr-chip">GF</span></td><td>₹2,41,800</td><td className="pos">₹96,420</td></tr>
            <tr><td>ITC</td><td>₹88,150</td><td className="pos">₹41,075</td></tr>
            <tr><td>Axis Bluechip</td><td>₹1,50,000</td><td className="pos">₹62,310</td></tr>
            <tr className="s-hide-sm"><td>TATAMOTORS</td><td>₹64,900</td><td className="neg">−₹8,240</td></tr>
          </tbody>
        </table>
      </div>
      <div className="scr-card s-harvest"><span className="lime">Harvest</span> Book ₹31,600 of losses in 2 funds to cut STCG tax by about ₹6,300.</div>
    </Frame>
  );
}

const HIST = [8, 14, 22, 34, 48, 62, 55, 40, 26, 15, 8, 4];

function MutualFund() {
  const pillars: [string, number][] = [['Returns', 84], ['Risk', 78], ['Cost', 90], ['Consistency', 74]];
  return (
    <Frame title="Mutual funds" pill="Fund analysis">
      <div className="scr-row">
        <div><div className="scr-label">Flexi cap · Direct growth</div><div className="scr-h">Parag Parikh <em>Flexi Cap</em></div></div>
        <div className="s-score"><b>82</b><span>/100</span></div>
      </div>
      <div className="s-mf-grid">
        <div className="scr-card s-pillars">
          {pillars.map(([l, w]) => (
            <div className="s-pill" key={l}><span>{l}</span><div className="bar"><i style={{ width: `${w}%` }} /></div></div>
          ))}
        </div>
        <div className="scr-card">
          <div className="scr-label s-mb">3-year rolling returns</div>
          <div className="s-hist">{HIST.map((h, i) => <i key={i} style={{ height: h }} />)}</div>
          <div className="scr-row scr-label s-mt"><span>6%</span><span>median 17.8%</span><span>28%</span></div>
        </div>
        <div className="scr-card s-overlap">
          <div className="scr-label">Overlap with what you hold</div>
          <div className="scr-row"><span>vs Axis Bluechip</span><b className="lime">38%</b></div>
          <div className="scr-row"><span>vs Mirae Large Cap</span><b>24%</b></div>
        </div>
        <div className="scr-card s-wide s-find">
          <span className="lime">Why 82</span> Beat its category in 81% of rolling 3-year windows, with a shallower worst fall (−21% vs −29%) and one of the lowest costs in flexi cap.
        </div>
      </div>
    </Frame>
  );
}

function Insurance() {
  return (
    <Frame title="Insurance" pill="Coverage">
      <div className="scr-h">Is the family <em>covered?</em></div>
      <div className="scr-grid2">
        <div className="scr-card">
          <div className="scr-label">Life cover</div><b>₹2.0 Cr</b>
          <div className="bar s-barline"><i style={{ width: '77%', background: '#f2c14e' }} /></div>
          <span className="mut">Need ≈ ₹2.6 Cr · gap ₹60 L</span>
        </div>
        <div className="scr-card">
          <div className="scr-label">Health, family floater</div><b>₹10 L + ₹40 L top-up</b>
          <div className="bar s-barline"><i style={{ width: '100%' }} /></div>
          <span className="mut">Room rent: no cap</span>
        </div>
      </div>
      <div className="scr-card s-stack">
        <div className="scr-row"><span>Term plan · annual</span><span className="scr-chip warn">Due 4 Nov</span></div>
        <div className="scr-row"><span>Car · comprehensive</span><span className="scr-chip warn">12 days</span></div>
        <div className="scr-row"><span>Home · contents</span><span className="scr-chip">Mar 2027</span></div>
      </div>
      <div className="scr-card s-sheet">
        <b>Emergency sheet</b>
        <span className="mut">Policies, nominees, claim numbers and who to call, on one printable page.</span>
        <span className="scr-btn">Print for the family</span>
      </div>
    </Frame>
  );
}

function Vehicle() {
  return (
    <Frame title="Vehicles" pill="Refreshed today">
      <div className="s-veh-head">
        <img src="/assets/vehicle-generic-sedan.svg" alt="" />
        <div>
          <div className="s-plate">MH 01 XX 4821</div>
          <div className="scr-label">Sedan · Petrol · 2019 · Owner 1</div>
          <div className="scr-label">Est. value <b className="ivory">₹6,40,000</b></div>
        </div>
      </div>
      <div className="scr-grid2">
        <div className="scr-card"><div className="scr-label">PUC</div><b className="neg">Expired 12 Oct</b></div>
        <div className="scr-card"><div className="scr-label">Insurance</div><b className="amber">25 Oct 2026</b></div>
        <div className="scr-card"><div className="scr-label">Fitness</div><b>Jun 2034</b></div>
        <div className="scr-card"><div className="scr-label">Challans</div><b className="pos">None pending</b></div>
      </div>
      <div className="scr-card s-wide">
        <div className="scr-row"><span className="mut">Petrol today, Mumbai</span><b>₹103.50 / L</b></div>
        <div className="scr-row s-mt"><span className="mut">Road tax valid till</span><b>2034</b></div>
      </div>
      <div className="scr-card s-stack">
        <div className="scr-row"><span>Flat 302 · tenant R. Sharma</span><span className="scr-chip on">Oct rent received</span></div>
        <div className="scr-row"><span className="mut">Next due 5 Nov · ₹32,000</span><span className="mut">Lease ends Mar 2027</span></div>
      </div>
    </Frame>
  );
}

function Emi() {
  return (
    <Frame title="EMI calculator" pill="Home loan">
      <div className="scr-h">₹50 L at 8.5% for <em>20 years</em></div>
      <div className="s-emi-grid">
        <div className="scr-card">
          <div className="scr-label">Monthly EMI</div><div className="scr-big">₹43,391</div>
          <div className="s-split"><i style={{ width: '48%' }} /><i style={{ width: '52%', background: '#b69cf0' }} /></div>
          <div className="scr-row scr-label"><span>Principal ₹50,00,000</span><span>Interest ₹54,13,840</span></div>
        </div>
        <div className="scr-card">
          <div className="scr-label">Prepay ₹2 L every March</div>
          <div className="scr-row s-mt"><span>Loan closes</span><b className="lime">6 yrs 4 mo early</b></div>
          <div className="scr-row"><span>Interest saved</span><b className="pos">₹21,86,000</b></div>
        </div>
        <div className="scr-card s-wide s-rates">
          <div className="scr-label s-mb">Current home-loan rates</div>
          <div className="scr-row"><span>Public sector bank</span><b>8.10%</b></div>
          <div className="scr-row"><span>Private bank</span><b>8.50%</b></div>
          <div className="scr-row"><span>Housing finance co.</span><b>8.75%</b></div>
        </div>
        <div className="scr-card s-splitcard">
          <div className="scr-row"><b>Goa trip · 4 friends</b><span className="pos">you're owed ₹4,250</span></div>
          <div className="scr-row s-mt"><span className="mut">Ananya owes you ₹2,100</span><span className="scr-btn">Settle via UPI</span></div>
        </div>
      </div>
    </Frame>
  );
}

function Family() {
  const members: [string, string, string, number, string][] = [
    ['AK', 'Arjun (you)', '#e2fe53', 59, '₹1.84 Cr'],
    ['MK', 'Meera', '#b69cf0', 22, '₹68.2 L'],
    ['RK', 'Father · managed', '#f08c4a', 17, '₹53.6 L'],
    ['IK', 'Ishaan', '#3fc6d1', 2, '₹6.4 L'],
  ];
  return (
    <Frame title="Family" pill="Kapoor household">
      <div className="scr-label">Family net worth</div>
      <div className="scr-row"><div className="scr-big">₹3,12,40,600</div><span className="pos">XIRR 12.8%</span></div>
      <div className="scr-card">
        {members.map(([i, n, c, w, v]) => (
          <div className="s-mem" key={i}>
            <span className="s-av" style={{ background: c }}>{i}</span>
            <span>{n}</span>
            <div className="bar"><i style={{ width: `${w}%`, background: c }} /></div>
            <b>{v}</b>
          </div>
        ))}
      </div>
      <div className="scr-grid2">
        <div className="scr-card"><div className="scr-label">Goal · Ishaan's college</div><b>₹38 L of ₹60 L</b><div className="bar s-barline"><i style={{ width: '63%' }} /></div></div>
        <div className="scr-card"><div className="scr-label">CA access</div><b>Mehta &amp; Co.</b><div className="mut">Reports · read-only · 2FA on</div></div>
      </div>
    </Frame>
  );
}

function Mobile() {
  return (
    <Frame className="s-mobile">
      <div className="scr-row"><span className="scr-dot s-dot-lg" /><span className="scr-chip">Family</span></div>
      <div className="scr-h">Your financial <em>portrait</em></div>
      <div className="scr-card"><div className="scr-label">Total net worth</div><div className="scr-big">₹1,84,62,310</div><div className="pos">+₹55,095 today</div></div>
      <div className="scr-card s-row-donut"><div className="donut donut-sm" /><Legend short /></div>
      <div className="scr-card"><div className="scr-row"><span>Pending review</span><span className="scr-chip on">4</span></div></div>
      <div className="scr-card"><div className="scr-row"><span>PUC expired</span><span className="scr-chip bad">Renew</span></div></div>
    </Frame>
  );
}

const MAP: Record<ScreenName, () => JSX.Element> = {
  dashboard: Dashboard,
  review: Review,
  tax: Tax,
  mf: MutualFund,
  insurance: Insurance,
  vehicle: Vehicle,
  emi: Emi,
  family: Family,
  mobile: Mobile,
};

export function Screen({ name }: { name: ScreenName }) {
  const C = MAP[name];
  return <C />;
}
