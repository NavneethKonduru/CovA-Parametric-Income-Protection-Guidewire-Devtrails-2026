# CovA 126 — IMPLEMENTATION PLAN (Part 3 of 3): COUNTERFACTUAL, MOBILE, PRODUCTION

---

## PHASE 3: COUNTERFACTUAL ANALYSIS PAGE

### Task 3.1 — Create Counterfactual Dashboard Page

**File**: Create NEW `01-app-frontend/src/pages/CounterfactualAnalysis.jsx`

This is a NEW page accessible from the Admin Panel (add a button/tab that navigates to it).

**Component structure:**
```
CounterfactualAnalysis
├── Header ("What if CovA existed for the past 5 years?")
├── Assumptions Panel (editable: workers/zone, premium, payout avg)
├── Yearly Historical Cards (one per year, showing: breach hours, claims, payouts, loss ratio)
├── Historical Trend Chart (AreaChart: claims + payouts per year)
├── Monthly Breakdown (BarChart: breach hours by zone for latest year)
├── Forward Projection Section ("Next 5 Years with 15% Growth")
│   ├── Projection Cards
│   └── Growth Chart (LineChart)
├── Key Insights Summary (auto-generated text)
└── Download Full Counterfactual Report (PDF)
```

**Data source**: Fetch from `GET /api/counterfactual/analysis` (created in Task 1.5)

**Key visual elements:**
1. **Hero stat strip**: Total claims prevented, Total ₹ paid to workers, Total ₹ premium collected, Net loss ratio
2. **Year-over-year AreaChart**: Shows `estimatedClaims` and `estimatedPayouts` per year
3. **Monthly heatmap-style BarChart**: Shows breach hours per zone per month
4. **Forward projection LineChart**: Shows growth trajectory for next 5 years
5. **PDF download** with full counterfactual report

```javascript
// Sample structure
import { useState, useEffect } from 'react';
import { AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { generatePDF } from '../utils/generatePDF';

export default function CounterfactualAnalysis({ token }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/counterfactual/analysis', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [token]);

  if (loading) return <div className="loading-skeleton">Loading counterfactual analysis...</div>;
  if (!data) return <div>No weather data available. Run weather ingestion first.</div>;

  const totals = {
    claims: data.historical.reduce((s, y) => s + y.estimatedClaims, 0),
    payouts: data.historical.reduce((s, y) => s + y.estimatedPayouts, 0),
    premium: data.historical.reduce((s, y) => s + y.estimatedPremiumCollected, 0),
    breachHours: data.historical.reduce((s, y) => s + y.breachHours, 0),
  };

  const downloadReport = () => {
    generatePDF('CovA Counterfactual Analysis — 5 Year Retrospective', [
      { heading: 'Summary', type: 'kpi', data: [
        { label: 'Analysis Period', value: `${data.historical[0]?.year} — ${data.historical[data.historical.length-1]?.year}` },
        { label: 'Total Weather Breach Hours', value: totals.breachHours.toLocaleString() },
        { label: 'Estimated Claims Triggered', value: totals.claims.toLocaleString() },
        { label: 'Estimated Worker Payouts', value: `₹${totals.payouts.toLocaleString()}` },
        { label: 'Estimated Premium Collected', value: `₹${totals.premium.toLocaleString()}` },
        { label: 'Avg Loss Ratio', value: `${(totals.payouts/totals.premium*100).toFixed(1)}%` },
      ]},
      { heading: 'Yearly Breakdown', type: 'table', data: {
        columns: ['Year', 'Breach Hrs', 'Claims', 'Payouts (₹)', 'Premium (₹)', 'Loss Ratio'],
        rows: data.historical.map(y => [
          y.year, y.breachHours, y.estimatedClaims,
          y.estimatedPayouts.toLocaleString(), y.estimatedPremiumCollected.toLocaleString(),
          y.lossRatio + '%'
        ])
      }},
      { heading: 'Forward Projection (Next 5 Years)', type: 'table', data: {
        columns: ['Year', 'Workers', 'Claims', 'Payouts (₹)', 'Premium (₹)'],
        rows: data.forwardProjection.map(y => [
          y.year, y.workersProtected, y.estimatedClaims,
          y.estimatedPayouts.toLocaleString(), y.estimatedPremiumCollected.toLocaleString()
        ])
      }},
      { heading: 'Assumptions', type: 'text', data: JSON.stringify(data.assumptions, null, 2) },
    ], 'CovA_Counterfactual_Report.pdf');
  };

  return (
    <div className="dashboard-container">
      {/* Build full UI with KPI strip, charts, tables, and download button */}
      {/* Use the same design patterns as AdminPanel.jsx (admin-grid, admin-panel classes) */}
      {/* Hero KPI strip at top */}
      {/* AreaChart for historical trends */}
      {/* BarChart for monthly breakdown */}
      {/* LineChart for forward projection */}
      {/* Download Report button */}
    </div>
  );
}
```

### Task 3.2 — Route Counterfactual Page in App.jsx

**File**: `01-app-frontend/src/App.jsx`

Add counterfactual as a sub-route accessible from Admin Panel. Two options:

**Option A** — Add as a tab/section WITHIN AdminPanel (preferred — no separate page):
- In AdminPanel.jsx, add a new tab called "Counterfactual Analysis"
- When selected, render the CounterfactualAnalysis component inline
- This keeps everything in the admin's dashboard

**Option B** — Add as separate route:
```javascript
import CounterfactualAnalysis from './pages/CounterfactualAnalysis';
// In the router, add: role === 'admin' && path === '/counterfactual' => <CounterfactualAnalysis>
```

**Recommended: Option A** — embed inside AdminPanel as a tab.

---

## PHASE 4: MOBILE APP (WEBVIEW WRAPPER)

### Task 4.1 — Create Android WebView Wrapper

**File**: Create files in `03-app-mobile/`

Since a full native Kotlin app would take weeks, create a **WebView wrapper** that loads the web app and adds native capabilities.

**Directory structure:**
```
03-app-mobile/
├── app/
│   └── src/main/
│       ├── java/com/cova/app/
│       │   └── MainActivity.kt
│       ├── res/
│       │   ├── layout/activity_main.xml
│       │   ├── values/strings.xml
│       │   ├── values/colors.xml
│       │   └── mipmap-xxxhdpi/ic_launcher.png
│       └── AndroidManifest.xml
├── build.gradle.kts
├── settings.gradle.kts
└── README.md
```

**MainActivity.kt:**
```kotlin
package com.cova.app

import android.os.Bundle
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebSettings
import android.webkit.WebChromeClient
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = true
            settings.databaseEnabled = true
            settings.setGeolocationEnabled(true)
            settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            webViewClient = WebViewClient()
            webChromeClient = WebChromeClient()
            loadUrl("https://your-deployed-cova-url.vercel.app")
        }
        setContentView(webView)
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack()
        else super.onBackPressed()
    }
}
```

**AndroidManifest.xml:**
```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.cova.app">
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
    <application
        android:allowBackup="true"
        android:label="CovA"
        android:icon="@mipmap/ic_launcher"
        android:theme="@style/Theme.AppCompat.NoActionBar"
        android:usesCleartextTraffic="true">
        <activity android:name=".MainActivity"
            android:exported="true"
            android:screenOrientation="portrait">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
```

**README.md** explaining this is a WebView wrapper with native capabilities planned for Phase 2.

---

## PHASE 5: PRODUCTION-READY CLEAN SLATE

### Task 5.1 — Verify Production Mode Works

**Steps:**
1. In `02-app-backend/.env`, temporarily set `COVA_MODE=real`
2. Restart the server
3. Verify that all API responses return empty arrays/zero counts (because `data_mode='real'` has no data)
4. This confirms the "0 workers, 0 claims" clean slate works
5. Switch back to `COVA_MODE=demo` for development

### Task 5.2 — Add Production Mode Toggle to Admin Panel

In AdminPanel.jsx, add a prominent toggle switch:

```jsx
<div className="admin-panel">
  <h3>🔄 Operational Mode</h3>
  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
    <button
      onClick={() => switchMode('demo')}
      style={{
        padding: '0.75rem 1.5rem', borderRadius: '8px', cursor: 'pointer',
        background: dataMode === 'demo' ? 'rgba(245,158,11,0.2)' : '#1E293B',
        border: dataMode === 'demo' ? '2px solid #F59E0B' : '1px solid rgba(255,255,255,0.1)',
        color: dataMode === 'demo' ? '#F59E0B' : '#9CA3AF', fontWeight: 600,
      }}
    >🧪 Demo Mode</button>
    <button
      onClick={() => switchMode('real')}
      style={{
        padding: '0.75rem 1.5rem', borderRadius: '8px', cursor: 'pointer',
        background: dataMode === 'real' ? 'rgba(16,185,129,0.2)' : '#1E293B',
        border: dataMode === 'real' ? '2px solid #10B981' : '1px solid rgba(255,255,255,0.1)',
        color: dataMode === 'real' ? '#10B981' : '#9CA3AF', fontWeight: 600,
      }}
    >🏭 Production Mode</button>
  </div>
  <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.5rem' }}>
    {dataMode === 'demo' ? 'Simulation data active — all engines running with synthetic events' : 'Production mode — 0 workers, 0 claims, ready for real deployment'}
  </p>
</div>
```

### Task 5.3 — Verify & Delete SQLite Remnants

After Task 0.1 is complete, run a final check:
```bash
grep -rn "better-sqlite3\|require.*db\.js\|sqlite" 02-app-backend/ --include="*.js" | grep -v node_modules | grep -v data/db.js
```
If zero results, `data/db.js` is safely dead code.

---

## PHASE 6: FINAL VERIFICATION CHECKLIST

### Task 6.1 — End-to-End Demo Flow Test

Run through this exact sequence:

1. Start backend: `cd 02-app-backend && node server.js`
2. Start frontend: `cd 01-app-frontend && npm run dev`
3. Open browser to `http://localhost:5173`

**Test each role:**

| Step | Role | Action | Expected Result |
|------|------|--------|-----------------|
| 1 | Worker | Login → Onboarding → Dashboard | See CDI gauge, claims, charts, download report |
| 2 | Insurer | Login → Dashboard | See KPIs, zone cards, claims table, charts, download report |
| 3 | Admin | Login → Panel | See controls, simulations, charts, counterfactual tab, download report |
| 4 | Q-Commerce | Login → Dashboard | See platform breakdown, cost-sharing models, charts, download report |
| 5 | Admin | Start Demo Sequence | Watch real-time claims flow through all dashboards |
| 6 | Admin | Open Counterfactual | See 5-year analysis with historical weather data |
| 7 | Any role | Click Download Report | Get branded CovA PDF with all data |

---

## EXECUTION ORDER SUMMARY

```
Phase 0: Foundation (Do FIRST)
  ├── 0.1  Kill SQLite references
  ├── 0.2  Ingest 5-year weather data
  └── 0.3  Install jspdf in frontend

Phase 1: Backend APIs (Do SECOND)
  ├── 1.1  Worker analytics endpoint
  ├── 1.2  Insurer analytics endpoint
  ├── 1.3  Admin analytics endpoint
  ├── 1.4  Q-Commerce analytics + cost-sharing endpoint
  ├── 1.5  Counterfactual analysis endpoint + route registration
  └── 1.6  PDF report data endpoints

Phase 2: Frontend Dashboards (Do THIRD)
  ├── 2.1  Create shared generatePDF utility
  ├── 2.2  Worker Dashboard + charts + report download
  ├── 2.3  Insurer Dashboard + charts + report download
  ├── 2.4  Admin Panel + charts + report download
  ├── 2.5  Q-Commerce Dashboard + cost-sharing + charts + report download
  └── 2.6  Merge/redirect analyst role to insurer

Phase 3: Counterfactual (Do FOURTH)
  ├── 3.1  Counterfactual Analysis component
  └── 3.2  Route/embed in Admin Panel

Phase 4: Mobile (Do FIFTH)
  └── 4.1  Android WebView wrapper

Phase 5: Production Ready (Do SIXTH)
  ├── 5.1  Verify production mode
  ├── 5.2  Mode toggle in Admin Panel
  └── 5.3  Final SQLite cleanup

Phase 6: Verification (Do LAST)
  └── 6.1  End-to-end demo test
```

---

## KEY FILE PATHS REFERENCE

| Purpose | Path |
|---------|------|
| Frontend root | `01-app-frontend/` |
| Frontend pages | `01-app-frontend/src/pages/` |
| Frontend components | `01-app-frontend/src/components/` |
| Frontend utilities | `01-app-frontend/src/utils/` (create this) |
| Backend root | `02-app-backend/` |
| Backend routes | `02-app-backend/routes/` |
| Backend engines | `02-app-backend/engines/` |
| Backend DB module | `02-app-backend/data/pg.js` |
| Backend legacy DB | `02-app-backend/data/db.js` (DO NOT USE) |
| Database migrations | `04-core-database/migrations/` |
| Weather ingestion | `04-core-database/ingest-weather.js` |
| Mobile app | `03-app-mobile/` (currently empty) |
| Environment vars | `02-app-backend/.env` |

## DESIGN SYSTEM REFERENCE

| Element | Value |
|---------|-------|
| Primary cyan | `#06B6D4` |
| Background dark | `#0F172A` |
| Card background | `#1E293B` |
| Text primary | `#E2E8F0` |
| Text secondary | `#9CA3AF` |
| Success green | `#10B981` |
| Warning amber | `#F59E0B` |
| Danger red | `#EF4444` |
| Purple accent | `#8B5CF6` |
| Blue accent | `#3B82F6` |
| Border subtle | `rgba(255,255,255,0.05)` |
| Glass effect | `background: rgba(6,182,212,0.03); border: 1px solid rgba(6,182,212,0.15)` |
| Panel class | `.admin-panel` (dark card with glow) |
| Grid class | `.admin-grid` (responsive CSS grid) |
| Chart tooltip bg | `#1f2937` with `#374151` border |
