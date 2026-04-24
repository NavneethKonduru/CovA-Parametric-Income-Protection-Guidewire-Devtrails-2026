# 🚀 SUBMISSION PROTOCOL: PRIVATE R&D TO PUBLIC HACKATHON

To maximize security and score high, we use a **Two-Repo Strategy**. Use this guide when the Phase 1 or Phase 2 deadline is 1 hour away.

---

## 1. WHY TWO REPOS?
*   **Private Repo (Current):** For "Dirty" work. Contains brainstorming, failed ideas, detailed R&D, and team-specific notes (`/docs/team-research/`).
*   **Public Repo (Future):** For "Presentation" work. Contains ONLY the clean `README.md`, `ULTIMATE_SOLUTION.md`, and the finished production code. No internal research logs.

---

## 2. SETTING UP THE NEW PUBLIC REPO (Step-by-Step)

When you are ready to submit, follow these exact commands in a *new* folder:

```bash
# 1. Create a temporary folder for the clean version
mkdir ~/Desktop/cova-submission
cd ~/Desktop/cova-submission

# 2. Copy ONLY the transition-safe files from our current repo
# Replace PATH_TO_CURRENT_REPO with the actual path
cp /path/to/cova/README.md .
cp /path/to/cova/ULTIMATE_SOLUTION.md .
cp -r /path/to/cova/backend .
cp -r /path/to/cova/frontend .
# IMPORTANT: DO NOT copy /docs/internal_intel or /docs/team-research

# 3. Initialize the new Git repo
git init
git add .
git commit -m "🚀 Initial Submission: ClaimCrypt - Guidewire DEVTrails 2026"

# 4. Create the NEW repo on GitHub (Main Profile)
# (Go to GitHub -> New Repository -> Name: "claimcrypt-official" -> Public)

# 5. Link and Push
git remote add origin https://github.com/NavneethKonduru/claimcrypt-official.git
git branch -M main
git push -u origin main
```

---

## 3. FINAL CLEANLINESS CHECKLIST
Before pushing to the public repo, ensure:
1.  **No Secrets:** Run a search for `API_KEY`, `PASSWORD`, or `SESSION_ID` in your backend code.
2.  **No Internal Docs:** Ensure `/docs` folder only contains the `MASTER_SYNTHESIS.md` or high-level charts, not the individual team "homework" files.
3.  **Public README:** Ensure the `README.md` is the high-professional version we just wrote, not a messy list of tasks.

---

## 4. HOW TO SHARE WITH JUDGES
1.  Set the new repo to **Public**.
2.  Copy the URL: `https://github.com/NavneethKonduru/claimcrypt-official`
3.  Paste into the Devpost / Hackathon submission portal.
4.  Optionally: Create a "Release" on GitHub (Draft a new release -> Tag: `v1.0.0`) so the judges see a "Gold Version".
