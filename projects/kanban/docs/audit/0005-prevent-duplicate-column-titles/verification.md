# Verification (0005-prevent-duplicate-column-titles)

All checks are done **in the browser only**. No terminal, devtools, or console.

## Prerequisites
1. In the project folder, run: `npm install` then `npm run dev`.
2. Open the URL shown (e.g. http://localhost:5173/) in a browser.
3. Open the Debug panel (click **Debug** so it shows **Debug ON**) to verify Column count and Action Log.

---

## Step 1: Create first column "Todo"
- **Action:** Click **Add column**, enter **Todo**, click **Create**.
- **Check:** One column named "Todo" appears; form closes. Debug panel shows **Column count: 1** and Action Log has `Column added: "Todo"`.
- **Pass:** Column is created and count is 1.

---

## Step 2: Duplicate "Todo" — blocked, inline message
- **Action:** Click **Add column**, enter **Todo**, click **Create**.
- **Check:** No new column is created. An inline message appears (e.g. **"Column title must be unique."**). The form stays open and the input still shows "Todo". Debug panel **Column count** remains **1**; column list/order unchanged.
- **Pass:** Creation is blocked, message is visible, form stays open, count unchanged.

---

## Step 3: Trimmed/case duplicate "  todo  " — blocked
- **Action:** Clear the input (or cancel and re-open form). Enter **  todo  ** (spaces before and after, lowercase), click **Create**.
- **Check:** No new column is created. Inline message appears (e.g. "Column title must be unique."). **Column count** remains **1**.
- **Pass:** Case-insensitive + trimmed comparison blocks this as duplicate.

---

## Step 4: Action Log — blocked attempts
- **Action:** After the blocked attempts above, check the Action Log in the Debug panel.
- **Check:** There are clear entries for blocked attempts, e.g. `Column add blocked (duplicate): "todo"`.
- **Pass:** Each blocked attempt produced a readable log entry with the normalized title.

---

## Summary
- If all four steps pass, the deliverable is verified.
- If any step fails, note which step and what you saw (e.g. "Step 2: new column was added" or "Step 4: no blocked entry in Action Log").
