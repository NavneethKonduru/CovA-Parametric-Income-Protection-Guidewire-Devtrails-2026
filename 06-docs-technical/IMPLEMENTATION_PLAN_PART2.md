# CovA 126 — IMPLEMENTATION PLAN (Part 2 of 3): FRONTEND DASHBOARD UPGRADES

> **Context**: All backend APIs from Part 1 must be done before starting Part 2.
> **Key rule**: EVERY dashboard gets its OWN charts + report download button. No separate analytics page.
> **Charts library**: `recharts` (already installed). Import: `import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';`

---

## PHASE 2: FRONTEND DASHBOARD UPGRADES

### Task 2.1 — Create Shared PDF Generator Utility

**File**: Create NEW `01-app-frontend/src/utils/generatePDF.js`

```javascript
import jsPDF from 'jspdf';
import 'jspdf-autotable';

/**
 * Generate a branded CovA PDF report
 * @param {string} title - Report title
 * @param {Array} sections - Array of { heading, type, data }
 *   type: 'kpi' | 'table' | 'text'
 *   For 'kpi': data = [{ label, value }]
 *   For 'table': data = { columns: [...], rows: [[...]] }
 *   For 'text': data = "paragraph text"
 */
export function generatePDF(title, sections, filename) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 20;

  // Header
  doc.setFillColor(15, 23, 42); // Dark navy
  doc.rect(0, 0, pageWidth, 35, 'F');
  doc.setTextColor(6, 182, 212); // Cyan
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('CovA', 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(200, 200, 200);
  doc.text('Coverage, Automated — Parametric Income Protection', 14, 26);
  doc.setFontSize(9);
  doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - 14, 26, { align: 'right' });
  
  y = 45;
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(title, 14, y);
  y += 12;

  for (const section of sections) {
    if (y > 270) { doc.addPage(); y = 20; }

    // Section heading
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(6, 182, 212);
    doc.text(section.heading, 14, y);
    y += 8;
    doc.setTextColor(30, 30, 30);

    if (section.type === 'kpi') {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      for (const kpi of section.data) {
        doc.text(`${kpi.label}: `, 14, y);
        doc.setFont('helvetica', 'bold');
        doc.text(String(kpi.value), 80, y);
        doc.setFont('helvetica', 'normal');
        y += 6;
      }
      y += 4;
    }

    if (section.type === 'table') {
      doc.autoTable({
        startY: y,
        head: [section.data.columns],
        body: section.data.rows,
        theme: 'grid',
        headStyles: { fillColor: [15, 23, 42], textColor: [6, 182, 212], fontSize: 8 },
        bodyStyles: { fontSize: 8 },
        margin: { left: 14, right: 14 },
      });
      y = doc.lastAutoTable.finalY + 10;
    }

    if (section.type === 'text') {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      const lines = doc.splitTextToSize(section.data, pageWidth - 28);
      doc.text(lines, 14, y);
      y += lines.length * 5 + 6;
    }
  }

  // Footer
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text(`CovA Report — Team ClaimCrypt — Page ${i}/${pageCount}`, pageWidth / 2, 290, { align: 'center' });
  }

  doc.save(filename || `CovA_Report_${Date.now()}.pdf`);
}
```

---

### Task 2.2 — Upgrade WorkerDashboard.jsx with Charts + Report Download

**File**: `01-app-frontend/src/pages/WorkerDashboard.jsx`

**What to add (insert these INSIDE the existing component, after the existing Claims History section around line 410)**:

1. **Import recharts** at the top of the file (add to line 1 area):
```javascript
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { generatePDF } from '../utils/generatePDF';
```

2. **Add analytics state and fetch** — inside the component, add new state after line 14:
```javascript
const [analytics, setAnalytics] = useState(null);
```

And inside `fetchData()` after the signal fetch (around line 50), add:
```javascript
// Fetch analytics
const aRes = await fetch(`/api/dashboard/worker/${id}/analytics`, { headers });
if (aRes.ok) setAnalytics(await aRes.json());
```

3. **Add download report function** inside the component:
```javascript
const downloadReport = () => {
  if (!worker || !analytics) return;
  generatePDF(`Worker Report — ${worker.name || worker.id}`, [
    { heading: 'Policy Summary', type: 'kpi', data: [
      { label: 'Worker ID', value: worker.id },
      { label: 'Zone', value: worker.zone },
      { label: 'Platform', value: worker.platform },
      { label: 'Weekly Premium', value: `₹${weeklyPremium}` },
      { label: 'Total Premium Paid', value: `₹${totalPremium}` },
      { label: 'Total Payouts Received', value: `₹${totalPayouts.toFixed(0)}` },
      { label: 'Net Position', value: `₹${netPosition.toFixed(0)}` },
    ]},
    { heading: 'Claims History', type: 'table', data: {
      columns: ['Date', 'Type', 'CDI', 'Amount', 'Status'],
      rows: claims.slice(0, 20).map(c => [
        new Date(c.timestamp || c.created_at).toLocaleDateString(),
        c.disruption_type || 'N/A',
        (parseFloat(c.cdi || 0) * 100).toFixed(1) + '%',
        '₹' + parseFloat(c.payout_amount || c.payoutAmount || 0).toFixed(0),
        c.status
      ])
    }},
  ], `CovA_Worker_${worker.id}_Report.pdf`);
};
```

4. **Add chart sections** before the closing `</div>` of `worker-content` (before line 412). Add these panels:

```jsx
{/* === ANALYTICS SECTION === */}
{analytics && (
  <>
    {/* Download Report Button */}
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '1.5rem 0 1rem' }}>
      <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#fff', margin: 0 }}>📊 My Analytics</h2>
      <button onClick={downloadReport} style={{
        padding: '0.5rem 1.2rem', borderRadius: '8px', border: 'none', cursor: 'pointer',
        background: 'linear-gradient(135deg, #06B6D4, #3B82F6)', color: '#fff', fontWeight: 600, fontSize: '0.85rem'
      }}>📄 Download Report</button>
    </div>

    <div className="admin-grid">
      {/* Weekly Payout Trend */}
      <div className="admin-panel" style={{ gridColumn: '1 / -1' }}>
        <h3>Weekly Payout Trend</h3>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={analytics.weeklyPayouts}>
            <defs>
              <linearGradient id="payGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="week" tickFormatter={v => new Date(v).toLocaleDateString('en-IN', {month:'short', day:'numeric'})} stroke="#6b7280" fontSize={10} />
            <YAxis stroke="#6b7280" fontSize={10} />
            <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: '#fff' }} />
            <Area type="monotone" dataKey="total_payout" stroke="#10B981" fill="url(#payGrad)" name="Payout (₹)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Claims by Disruption Type (Pie) */}
      <div className="admin-panel">
        <h3>Claims by Type</h3>
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie data={analytics.claimsByType} dataKey="count" nameKey="disruption_type" cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={4}>
              {analytics.claimsByType.map((_, i) => (
                <Cell key={i} fill={['#3B82F6','#F59E0B','#EF4444','#8B5CF6','#10B981'][i % 5]} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
          {analytics.claimsByType.map((ct, i) => (
            <span key={i} style={{ fontSize: '0.7rem', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: ['#3B82F6','#F59E0B','#EF4444','#8B5CF6','#10B981'][i % 5], display: 'inline-block' }} />
              {ct.disruption_type}: {ct.count}
            </span>
          ))}
        </div>
      </div>

      {/* Weather Risk Trend */}
      <div className="admin-panel">
        <h3>30-Day Weather Risk</h3>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={analytics.weatherTrend}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="day" tickFormatter={v => new Date(v).toLocaleDateString('en-IN', {day:'numeric'})} stroke="#6b7280" fontSize={9} />
            <YAxis stroke="#6b7280" fontSize={9} domain={[0, 1]} />
            <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: '#fff' }} />
            <Area type="monotone" dataKey="avg_score" stroke="#F59E0B" fill="rgba(245,158,11,0.1)" name="Avg Risk" />
            <Area type="monotone" dataKey="max_score" stroke="#EF4444" fill="rgba(239,68,68,0.05)" name="Peak Risk" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  </>
)}
```

---

### Task 2.3 — Upgrade InsurerDashboard.jsx with Charts + Report Download

**File**: `01-app-frontend/src/pages/InsurerDashboard.jsx`

**Changes needed:**

1. **Add imports** at top:
```javascript
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { generatePDF } from '../utils/generatePDF';
```

2. **Add state** after line 20:
```javascript
const [analytics, setAnalytics] = useState(null);
```

3. **Fetch analytics** — inside the `useEffect` Promise.all (line 34), add:
```javascript
fetch('/api/dashboard/insurer/analytics', { headers }).then(r => r.json()).then(d => setAnalytics(d)).catch(() => {}),
```

4. **Add download function** inside the component:
```javascript
const downloadReport = () => {
  generatePDF('Insurer Portfolio Report', [
    { heading: 'Portfolio KPIs', type: 'kpi', data: [
      { label: 'Loss Ratio', value: `${(lossRatio||0).toFixed(1)}%` },
      { label: 'Active Workers', value: workerCount },
      { label: 'Total Premium Pool', value: `₹${(totalPremium||0).toLocaleString()}` },
      { label: 'Total Claims Paid', value: `₹${(totalPayout||0).toLocaleString()}` },
      { label: 'Fraud Blocked', value: rejectedClaims.length },
      { label: 'LAE Saved', value: `₹${laeSaved.toLocaleString()}` },
    ]},
    { heading: 'Claims Detail', type: 'table', data: {
      columns: ['Claim ID', 'Worker', 'Zone', 'CDI', 'Amount', 'Status'],
      rows: claims.slice(0, 50).map(c => [
        String(c.id).slice(0,12), c.worker_name || c.worker_id, c.zone,
        (parseFloat(c.cdi||0)*100).toFixed(1)+'%',
        '₹'+parseFloat(c.payout_amount||c.payoutAmount||0).toFixed(0), c.status
      ])
    }},
  ], 'CovA_Insurer_Report.pdf');
};
```

5. **Add charts section** — Insert before the Guidewire Audit Trail section (before line 517). Add inside the `admin-grid`:

```jsx
{/* === INSURER ANALYTICS CHARTS === */}
{analytics && (
  <>
    {/* Download Report Button */}
    <div className="admin-panel" style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <h3 style={{ margin: 0 }}>📊 Portfolio Analytics</h3>
      <button onClick={downloadReport} style={{
        padding: '0.5rem 1.2rem', borderRadius: '8px', border: 'none', cursor: 'pointer',
        background: 'linear-gradient(135deg, #06B6D4, #3B82F6)', color: '#fff', fontWeight: 600
      }}>📄 Download Insurer Report</button>
    </div>

    {/* Daily Claims Trend */}
    <div className="admin-panel" style={{ gridColumn: '1 / -1' }}>
      <h3>Daily Claims Trend (30 Days)</h3>
      <ResponsiveContainer width="100%" height={250}>
        <AreaChart data={analytics.dailyClaims}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="date" stroke="#6b7280" fontSize={9} />
          <YAxis stroke="#6b7280" fontSize={9} />
          <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: '#fff' }} />
          <Area type="monotone" dataKey="paid" stroke="#10B981" fill="rgba(16,185,129,0.1)" name="Paid" />
          <Area type="monotone" dataKey="rejected" stroke="#EF4444" fill="rgba(239,68,68,0.1)" name="Rejected" />
        </AreaChart>
      </ResponsiveContainer>
    </div>

    {/* Disruption Type Distribution (Pie) + Zone Breakdown (Bar) */}
    <div className="admin-panel">
      <h3>Peril Distribution</h3>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie data={analytics.disruptionDistribution} dataKey="count" nameKey="disruption_type" cx="50%" cy="50%" innerRadius={40} outerRadius={70}>
            {(analytics.disruptionDistribution||[]).map((_, i) => (
              <Cell key={i} fill={['#3B82F6','#F59E0B','#EF4444','#8B5CF6','#10B981','#6B7280'][i % 6]} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    </div>

    <div className="admin-panel">
      <h3>Zone Performance</h3>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={analytics.zoneBreakdown}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="zone" stroke="#6b7280" fontSize={10} />
          <YAxis stroke="#6b7280" fontSize={10} />
          <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: '#fff' }} />
          <Bar dataKey="claims" fill="#3B82F6" radius={[4,4,0,0]} name="Claims" />
          <Bar dataKey="payouts" fill="#10B981" radius={[4,4,0,0]} name="Payouts (₹)" />
        </BarChart>
      </ResponsiveContainer>
    </div>

    {/* Monthly Financials */}
    <div className="admin-panel" style={{ gridColumn: '1 / -1' }}>
      <h3>Monthly Premium vs Claims</h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={analytics.monthlyFinancials}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="month" tickFormatter={v => new Date(v).toLocaleDateString('en-IN',{month:'short'})} stroke="#6b7280" fontSize={10} />
          <YAxis stroke="#6b7280" fontSize={10} />
          <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: '#fff' }} />
          <Bar dataKey="premium_est" fill="#3B82F6" radius={[4,4,0,0]} name="Premium (₹)" />
          <Bar dataKey="payouts" fill="#EF4444" radius={[4,4,0,0]} name="Claims (₹)" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  </>
)}
```

---

### Task 2.4 — Upgrade AdminPanel.jsx with System Charts + Report Download

**File**: `01-app-frontend/src/pages/AdminPanel.jsx`

**Add imports, state, fetch, download function, and chart section following the EXACT same pattern as Tasks 2.2/2.3:**

1. Import recharts + generatePDF
2. Add `const [analytics, setAnalytics] = useState(null);`
3. In useEffect, fetch `/api/admin/analytics` and `setAnalytics(data)`
4. Add download function generating PDF with system metrics
5. Add charts section with:
   - **Engine Performance** (claims processed per hour — AreaChart)
   - **CDI Trigger Distribution** (PieChart of trigger levels)
   - **Weather Data Coverage** (BarChart showing obs count per zone per day)
   - **Download Report button** generating `CovA_Admin_System_Report.pdf`

---

### Task 2.5 — Upgrade QCommerceDashboard.jsx with Cost-Sharing + Charts + Report

**File**: `01-app-frontend/src/pages/QCommerceDashboard.jsx`

**This needs the MOST new content. Transform it from 162 lines into a full employer dashboard.**

1. Import recharts + generatePDF
2. Add state: `const [analytics, setAnalytics] = useState(null);`
3. Fetch `/api/dashboard/qcommerce/analytics` on mount
4. Add these NEW sections:

**a) Workers by Platform (Bar Chart)**
**b) Claims Impact by Platform (Bar Chart)** 
**c) Cost-Sharing Strategy Comparison (Table + Visual)**
  - Show 4 models: 100% Worker, 50/50, 70/30, 100% Employer
  - Each row shows: worker weekly cost, employer weekly cost, employer monthly cost
  - Highlight recommended model (50/50)
**d) Zone Disruption Impact on Deliveries (AreaChart)**
**e) Download Report button** generating `CovA_Employer_Report.pdf`

The cost-sharing section should look like a comparison table with cards:
```jsx
{analytics?.costSharingModels && (
  <div className="admin-panel" style={{ gridColumn: '1 / -1' }}>
    <h3>💰 Premium Cost-Sharing Models</h3>
    <p style={{ fontSize: '0.8rem', color: '#9ca3af', marginBottom: '1rem' }}>
      Choose how insurance premium is split between employer and workers
    </p>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
      {analytics.costSharingModels.map((m, i) => (
        <div key={i} style={{
          padding: '1.25rem', borderRadius: '12px', textAlign: 'center',
          background: i === 1 ? 'rgba(6,182,212,0.1)' : '#1E293B',
          border: i === 1 ? '2px solid rgba(6,182,212,0.4)' : '1px solid rgba(255,255,255,0.05)',
        }}>
          {i === 1 && <div style={{ fontSize: '0.65rem', color: '#06B6D4', fontWeight: 700, marginBottom: '0.5rem' }}>⭐ RECOMMENDED</div>}
          <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff', marginBottom: '0.75rem' }}>{m.model}</div>
          <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Worker pays</div>
          <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#10B981' }}>₹{m.workerWeekly}/wk</div>
          <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.5rem' }}>Employer pays</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 600, color: '#3B82F6' }}>₹{Math.round(m.employerMonthly).toLocaleString()}/mo</div>
        </div>
      ))}
    </div>
  </div>
)}
```

---

### Task 2.6 — Delete ExecutiveReporting.jsx (Merge into Insurer Dashboard)

Since the user explicitly said NO separate analytics page — the ExecutiveReporting charts should be MERGED into InsurerDashboard (already done in Task 2.3). 

**Steps**:
1. In `App.jsx`, remove the `analyst` role routing (lines 98-104) OR redirect analyst to InsurerDashboard
2. In `Login.jsx`, either remove the analyst role card OR change it to map to insurer role
3. Keep ExecutiveReporting.jsx file but it's no longer routed to

**Alternative** (if keeping analyst login is preferred): Change App.jsx so `role === 'analyst'` renders `<InsurerDashboard>` instead of `<ExecutiveReporting>`.
