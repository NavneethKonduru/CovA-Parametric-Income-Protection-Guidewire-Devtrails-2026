# ⚡ CovA: Coverage . Automated .

## About the Project
**CovA** is a zero-touch, fully automated parametric income protection platform engineered for India's Q-Commerce workforce. Delivery partners for platforms like Zepto, Blinkit, and Swiggy Instamart operate under arguably the most extreme SLAs in the gig economy—10-minute delivery windows. They have no financial safety nets, no fixed salaries, and no employer-backed benefits.

CovA solves their biggest localized risk: sudden income loss caused by external disruptions. We mathematically prove when a worker cannot earn due to floods, heatwaves, traffic gridlocks, civic curfews, or platform outages, and we initiate an instant payout to their digital wallet. No forms, no waiting, no human adjusters. 

To make this enterprise-grade and secure, CovA is natively designed as a middleware pipeline that feeds verified "Master Claim Payloads" directly into **Guidewire ClaimCenter** while deploying advanced hardware-level anti-spoofing techniques to ensure zero fraud.

## Built With
Node.js, Express, React, Vite, Tailwind CSS, SQLite, PostGIS, Python, Scikit-learn, OpenWeatherMap API, TomTom Traffic Index API, Razorpay API, Guidewire ClaimCenter, Guidewire PolicyCenter, Guidewire BillingCenter, Groq AI, WebSockets, Uber H3 Hex-Grid, Android SDK (GnssStatus API)

The modern gig economy is a paradox: it runs on cutting-edge logistics optimization but relies on archaic, paper-based risk protection. 

During the Bangalore floods and recent summer heatwaves, delivery riders were stranded without work for days. While platforms occasionally suspend operations for safety—which is the right thing to do—the resulting opportunity cost is entirely absorbed by the riders, pushing them into debt. 

We realized that traditional micro-insurance fails here because human claims processing (Loss Adjustment Expense) costs around ₹2,000 for a ₹200 claim—making the unit economics structurally unprofitable. 
We asked ourselves: *What if we could remove human judgment entirely? What if physics, data oracles, and software could trigger payouts faster than a human could even open a claim form?* That question led to CovA.

## How We Built CovA

CovA's system relies on several cohesive components acting as an end-to-end pipeline:
1.  **Multi-Peril CDI Engine**: A Node.js and Express backend that continually ingests localized data (OpenWeatherMap, TomTom Traffic APIs) to compute a Composite Disruption Index (CDI) per geographic H3 Hex-Grid.
2.  **TCHC Integrity Layer**: A multi-layered fraud defense module verifying GPS validity using physical and temporal indicators to halt GPS-spoofing syndicate rings.
3.  **Guidewire Payload Interconnect**: CovA batches hundreds of identical grid disruptions into a singular verified Master Payload submitted to Guidewire via simulated APIs.
4.  **AI Premium Engine**: A machine-learning script (simulated via Scikit-learn Random Forests) that calculates weekly premiums dynamically based on geographic risk exposure.
5.  **Razorpay Simulation & Webhooks**: An asynchronous payout module using mock Razorpay webhooks to disburse funds to UPI wallets with real-world latency and failure modes.
6.  **Enterprise UI**: A React/Vite dashboard populated with real-time WebSockets to give risk adjusters live maps of verified claims, sensor metrics, and network health.

### Mathematical Modeling
To eliminate the need for manual claims adjusting, payouts are derived strictly through our mathematical models.

**1. Composite Disruption Index (CDI)**
The decision to flip an area into a "Disrupted State" is driven by a continuous function evaluating three orthogonal vectors:

$$ CDI(t)_{grid} = \alpha \cdot \omega(t) + \beta \cdot \delta(t) + \gamma \cdot \rho(t) $$

Where:
- $\omega(t)$ = Weather Hazard Score (e.g., Rainfall rate or Temperature threshold)
- $\delta(t)$ = Demand/Mobility Collapse (e.g., Gridlock velocity tracking)
- $\rho(t)$ = Peer Offline Ratio (e.g., Platform outage signal)
- $\alpha, \beta, \gamma$ are peril-specific weights matrix. When $CDI(t) \geq 0.60$ for two consecutive polling cycles, a payout event is verified.

**2. Dynamic Weekly Premium**
Instead of flat fees, the ML engine prices workers dynamically:

$$ P_{weekly} = P_{base} \times \left(1 + \sum_{i=1}^5 \lambda_i R_{grid, i}\right) \times A_{user} $$

Where $P_{base}$ is the baseline minimum (e.g., ₹20), $R_{grid, i}$ represents the normalized historical frequency of peril $i$ in their specific H3 hexagon, and $A_{user}$ is an archetype modifier (part-time vs peak-hour active).

## The Challenges We Faced
1. **Adversarial Spoofing Threats**: In our initial designs, pure API trigger logic was too risky. GPS spoofers could quickly drain an insurer's liquidity pool. Designing the Tri-Modal Cryptographic Hex-Grid Consensus (TCHC) to thwart fake location clustering mathematically required simulating multi-variate fake traffic patterns and building temporal entropy functions to filter out fake devices.
2. **Connecting WebSockets across Complex State Loops**: Managing state between our simulated Guidewire pipeline, Razorpay payout queue, and the frontend React application required a complex but robust WebSocket management protocol to prevent UI ghosting or connection timeouts (EPIPE errors).
3. **Simulating Real-World Systems**: Guidewire environments and Enterprise APIs are highly structured. Re-creating a simulated Master Payload structure and bridging it faithfully in a hackathon sandbox meant we had to construct fully mock-compliant JSON payloads that mirrored enterprise schemas stringently.

## What We Learned
- **Parametric Mechanics in Reality**: We discovered that relying on a singular data source (like just rain gauges) is insufficient. We learned how to build composite oracles where multiple signals corroborate each other for high-confidence risk assertions.
- **Enterprise Middleware Design**: We gained extensive functional knowledge on bridging fast, volatile consumer edge data (worker telemetry points) into deeply regulated, slow-moving core insurance software (ClaimCenter).
- **Graceful Degradation**: By incorporating Groq LLM fallback logic and ML-fallback mathematical formulas, we realized that robust insurtech must always possess offline redundancy layers. We learned how to architect zero-downtime mechanisms.

## What's Next for CovA
We plan to refine the **TCHC baseband hardware SDK** validation layer to ensure our physics-checks are natively impossible to bypass on Android kernels. Next, we intend to integrate deeper actual integrations with live payment gateways (bypassing mock sandboxes) to turn CovA into a deployable sandbox for Tier-1 General Insurers to explore gig-economy micro-policies natively within their existing tech stacks.
