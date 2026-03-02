/*****************************************************************************************
  ADMIN STORAGE UTILITY
  ----------------------------------------------------------------------------------------
  Handles all read/write operations to Azure Blob Storage for:
    1. users.json          → user list with roles and division access
    2. audit.json          → append-only audit log
    3. config.json         → business types, divisions, years configuration
    4. latest/{key}.json   → latest full submission per businessType_division_year
    5. submissions-index.json → index of all submissions for Admin Console list view

  Delta calculation logic:
    - Compares new form values against latest.json pre-filled values
    - Only changed fields are written to timestamp.json
    - null = never set, value = set, null after value = cleared
*****************************************************************************************/

const STORAGE_URL   = import.meta.env.VITE_STORAGE_URL;
const SAS           = import.meta.env.VITE_BLOB_SAS;
const ADMIN_CONTAINER = import.meta.env.VITE_ADMIN_CONTAINER || "admin";

/*****************************************************************************************
  HELPER — buildAdminUrl
  Builds URL for files inside the admin container
  e.g. buildAdminUrl("users.json") →
    https://account.blob.core.windows.net/admin/users.json?sv=...
*****************************************************************************************/
const buildAdminUrl = (filename) => {
  const baseUrl = STORAGE_URL.substring(0, STORAGE_URL.lastIndexOf("/"));
  return `${baseUrl}/${ADMIN_CONTAINER}/${filename}${SAS}`;
};

/*****************************************************************************************
  HELPER — buildSubmissionsUrl
  Builds URL for files inside the main submissions container
  Uses VITE_STORAGE_URL directly (already points to submissions container)
*****************************************************************************************/
const buildSubmissionsUrl = (path) => {
  return `${STORAGE_URL}/${path}${SAS}`;
};

/*****************************************************************************************
  HELPER — safeFetch
  Wraps fetch with consistent error handling.
  Returns { data, error, status }
*****************************************************************************************/
const safeFetch = async (url, options = {}) => {
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        "Cache-Control": "no-cache",
        ...options.headers
      }
    });

    if (res.status === 404) {
      return { data: null, error: null, status: 404 };
    }

    if (!res.ok) {
      const text = await res.text();
      console.error(`[adminStorage] HTTP ${res.status}:`, text);
      return { data: null, error: `HTTP ${res.status}: ${text}`, status: res.status };
    }

    const data = await res.json();
    return { data, error: null, status: res.status };

  } catch (err) {
    console.error("[adminStorage] Network error:", err.message);
    return { data: null, error: err.message, status: 0 };
  }
};

/*****************************************************************************************
  HELPER — safePut
  Wraps blob PUT with consistent error handling.
  Returns { success, error }
*****************************************************************************************/
const safePut = async (url, body) => {
  try {
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        "x-ms-blob-type": "BlockBlob",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body, null, 2)
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[adminStorage] PUT failed:", text);
      return { success: false, error: `HTTP ${res.status}: ${text}` };
    }

    return { success: true, error: null };

  } catch (err) {
    console.error("[adminStorage] PUT network error:", err.message);
    return { success: false, error: err.message };
  }
};

/*****************************************************************************************
  SECTION 1 — USER MANAGEMENT
*****************************************************************************************/

export const getUsers = async () => {
  const { data, error, status } = await safeFetch(buildAdminUrl("users.json"));

  if (status === 404) return [];

  if (error) {
    console.error("[getUsers] Failed:", error);
    return [];
  }

  return data || [];
};

export const saveUsers = async (users) => {
  const { success, error } = await safePut(buildAdminUrl("users.json"), users);

  if (!success) {
    console.error("[saveUsers] Failed:", error);
  }

  return success;
};

export const getUserRole = async (email) => {
  if (!email) return "guest";

  const users = await getUsers();
  const found = users.find(
    (u) => u.email.toLowerCase() === email.toLowerCase()
  );

  return found ? found.role : "guest";
};

export const getUserByEmail = async (email) => {
  if (!email) return null;

  const users = await getUsers();
  return users.find(
    (u) => u.email.toLowerCase() === email.toLowerCase()
  ) || null;
};

/*****************************************************************************************
  SECTION 2 — AUDIT LOG
*****************************************************************************************/

export const appendAuditLog = async (entry) => {
  try {
    // Fetch existing log
    let existing = [];
    const { data, status } = await safeFetch(buildAdminUrl("audit.json"));

    if (status !== 404 && data) {
      existing = data;
    }

    const newEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...entry
    };

    // Prepend newest first, keep last 1000 entries to avoid unbounded growth
    const updated = [newEntry, ...existing].slice(0, 1000);

    await safePut(buildAdminUrl("audit.json"), updated);

    return newEntry;

  } catch (err) {
    // Audit failure must never crash the app
    console.error("[appendAuditLog] Error:", err.message);
    return null;
  }
};

export const getAuditLog = async () => {
  const { data, error, status } = await safeFetch(buildAdminUrl("audit.json"));

  if (status === 404) return [];

  if (error) {
    console.error("[getAuditLog] Failed:", error);
    return [];
  }

  return data || [];
};

/*****************************************************************************************
  SECTION 3 — CONFIG (Business Types, Divisions, Years)
  ----------------------------------------------------------------------------------------
  Stored in admin/config.json
  Falls back to hardcoded defaults if file doesn't exist yet.
*****************************************************************************************/

const CONFIG_DEFAULTS = {
  businessTypes: ["SAF", "Retail"],
  divisions:     ["F9A", "F9B"],
  years:         ["2026", "2027"]
};

export const getConfig = async () => {
  const { data, status, error } = await safeFetch(buildAdminUrl("config.json"));

  if (status === 404) {
    console.info("[getConfig] No config.json found, using defaults.");
    return CONFIG_DEFAULTS;
  }

  if (error) {
    console.error("[getConfig] Failed, using defaults:", error);
    return CONFIG_DEFAULTS;
  }

  // Merge with defaults so missing keys are always present
  return {
    businessTypes: data?.businessTypes || CONFIG_DEFAULTS.businessTypes,
    divisions:     data?.divisions     || CONFIG_DEFAULTS.divisions,
    years:         data?.years         || CONFIG_DEFAULTS.years
  };
};

export const saveConfig = async (config) => {
  const { success, error } = await safePut(buildAdminUrl("config.json"), config);

  if (!success) {
    console.error("[saveConfig] Failed:", error);
  }

  return success;
};

/*****************************************************************************************
  SECTION 4 — LATEST SUBMISSION
  ----------------------------------------------------------------------------------------
  Path: admin/latest/{businessType}_{division}_{year}.json

  Stores the full 12-month current state for a given combination.
  This is the gold layer equivalent at the frontend level.

  Structure:
  {
    businessType: "SAF",
    division: "F9A",
    year: "2026",
    updatedAt: "ISO string",
    updatedBy: "email",
    months: [
      { month: 1, forecast: "123", plan: "456", gm: "23" },
      { month: 2, forecast: null, plan: null, gm: null },
      ... x12
    ]
  }
*****************************************************************************************/

// Build the key for a given combination
const latestKey = (businessType, division, year) =>
  `latest/${businessType}_${division}_${year}.json`;

export const getLatestSubmission = async (businessType, division, year) => {
  const url = buildAdminUrl(latestKey(businessType, division, year));
  const { data, status, error } = await safeFetch(url);

  if (status === 404) {
    // No prior submission — return 12 nulled months
    return buildEmptyMonths();
  }

  if (error) {
    console.error("[getLatestSubmission] Failed:", error);
    return buildEmptyMonths();
  }

  return data?.months || buildEmptyMonths();
};

export const saveLatestSubmission = async ({
  businessType,
  division,
  year,
  months,
  updatedBy
}) => {
  const payload = {
    businessType,
    division,
    year,
    updatedAt: new Date().toISOString(),
    updatedBy: updatedBy || "unknown",
    months
  };

  const url = buildAdminUrl(latestKey(businessType, division, year));
  const { success, error } = await safePut(url, payload);

  if (!success) {
    console.error("[saveLatestSubmission] Failed:", error);
  }

  return success;
};

/*****************************************************************************************
  HELPER — buildEmptyMonths
  Returns an array of 12 months all set to null
  Used when no prior submission exists
*****************************************************************************************/
export const buildEmptyMonths = () =>
  Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    forecast: null,
    plan:     null,
    gm:       null
  }));

/*****************************************************************************************
  SECTION 5 — DELTA CALCULATION
  ----------------------------------------------------------------------------------------
  Compares current form rows against the pre-filled latest values.

  Rules:
    Case 1: was null, still null (or empty string)  → SKIP
    Case 2: was null, now has value                 → include { oldValue: null, newValue: "x" }
    Case 3: had value, now null/empty               → include { oldValue: "x", newValue: null }
    Case 4: had value, now different value          → include { oldValue: "x", newValue: "y" }
    Case 5: had value, user typed then deleted      → treated as Case 1 or 3 depending on original

  Input:
    currentRows  → array of 12 row objects from form state { month, forecast, plan, gm }
    latestMonths → array of 12 month objects from latest.json { month, forecast, plan, gm }

  Output:
    Array of changed field objects — empty array means no changes
*****************************************************************************************/
export const calculateDelta = (currentRows, latestMonths) => {
  const changedFields = [];
  const fields = ["forecast", "plan", "gm"];

  currentRows.forEach((row) => {
    const latestMonth = latestMonths.find((m) => m.month === row.month);

    fields.forEach((field) => {
      // Normalise: treat "" and undefined as null
      const currentVal = normaliseValue(row[field]);
      const latestVal  = normaliseValue(latestMonth?.[field]);

      // Case 1 + Case 5: both null → skip
      if (currentVal === null && latestVal === null) return;

      // Case 4: same non-null value → skip
      if (currentVal === latestVal) return;

      // Cases 2, 3, 4 — something changed
      changedFields.push({
        month:    row.month,
        field,
        oldValue: latestVal,    // null if never set (Case 2)
        newValue: currentVal    // null if cleared (Case 3)
      });
    });
  });

  return changedFields;
};

/*****************************************************************************************
  HELPER — normaliseValue
  Converts empty string / undefined / whitespace-only to null.
  Keeps "0" as "0" — zero is a valid financial value.
*****************************************************************************************/
const normaliseValue = (val) => {
  if (val === null || val === undefined) return null;
  if (typeof val === "string" && val.trim() === "") return null;
  return val;
};

/*****************************************************************************************
  HELPER — buildUpdatedMonths
  ----------------------------------------------------------------------------------------
  Merges current form rows into the latest months array.
  Used to produce the full updated state for latest.json.

  - If user entered a value → use it
  - If user left it empty → keep the latest value (don't overwrite with null)
  - If user explicitly cleared a previously set value → set to null

  This distinction is handled via the delta: if a field appears in changedFields
  with newValue: null, it was explicitly cleared.
*****************************************************************************************/
export const buildUpdatedMonths = (currentRows, latestMonths, changedFields) => {
  return latestMonths.map((latestMonth) => {
    const currentRow = currentRows.find((r) => r.month === latestMonth.month);
    const updatedMonth = { ...latestMonth };

    ["forecast", "plan", "gm"].forEach((field) => {
      const delta = changedFields.find(
        (c) => c.month === latestMonth.month && c.field === field
      );

      if (delta) {
        // This field was changed — use the new value (could be null if cleared)
        updatedMonth[field] = delta.newValue;
      }
      // If no delta — field unchanged, keep existing latest value
    });

    return updatedMonth;
  });
};

/*****************************************************************************************
  SECTION 6 — SUBMISSIONS INDEX
  ----------------------------------------------------------------------------------------
  Maintained in admin/submissions-index.json
  Appended on every successful submission.

  Used by Admin Console submissions tab to list all past submissions
  without needing to list blobs (avoids SAS list permission dependency).

  Each entry:
  {
    submissionId: "uuid",
    userEmail: "email",
    businessType: "SAF",
    division: "F9A",
    year: "2026",
    submittedAt: "ISO string",
    changedFieldsCount: 3,
    blobPath: "year=2026/timestamp.json"
  }
*****************************************************************************************/

export const getSubmissionsIndex = async () => {
  const { data, status, error } = await safeFetch(
    buildAdminUrl("submissions-index.json")
  );

  if (status === 404) return [];

  if (error) {
    console.error("[getSubmissionsIndex] Failed:", error);

    // Try blob list API as fallback
    return await tryBlobListFallback();
  }

  return data || [];
};

export const appendSubmissionsIndex = async (entry) => {
  try {
    let existing = [];
    const { data, status } = await safeFetch(
      buildAdminUrl("submissions-index.json")
    );

    if (status !== 404 && data) {
      existing = data;
    }

    // Prepend newest first
    const updated = [entry, ...existing];

    await safePut(buildAdminUrl("submissions-index.json"), updated);

    return true;
  } catch (err) {
    console.error("[appendSubmissionsIndex] Error:", err.message);
    return false;
  }
};

/*****************************************************************************************
  HELPER — tryBlobListFallback
  ----------------------------------------------------------------------------------------
  Attempts to list blobs using Azure Blob List API.
  Used as fallback if submissions-index.json read fails.

  Requires SAS token to have "list" permission on the submissions container.

  Returns simplified array or empty array if permission denied.
*****************************************************************************************/
const tryBlobListFallback = async () => {
  try {
    const listUrl = `${STORAGE_URL}?restype=container&comp=list&${SAS.replace("?", "")}`;

    const res = await fetch(listUrl);

    if (res.status === 403) {
      console.warn(
        "[tryBlobListFallback] SAS token does not have 'list' permission. " +
        "To fix: regenerate your SAS token with 'List' permission checked, " +
        "or ensure submissions-index.json exists in the admin container."
      );
      return [];
    }

    if (!res.ok) {
      console.error("[tryBlobListFallback] List failed:", res.status);
      return [];
    }

    // Parse XML response from blob list API
    const text = await res.text();
    const parser = new DOMParser();
    const xml = parser.parseFromString(text, "application/xml");
    const blobs = xml.querySelectorAll("Blob");

    const entries = [];
    blobs.forEach((blob) => {
      const name = blob.querySelector("Name")?.textContent || "";
      const lastModified = blob.querySelector("Last-Modified")?.textContent || "";

      // Only include JSON files, skip index/config files
      if (name.endsWith(".json") && name.includes("/")) {
        entries.push({
          submissionId: name,
          blobPath: name,
          submittedAt: lastModified,
          // These fields won't be available from list — show as unknown
          userEmail: "—",
          businessType: "—",
          division: "—",
          year: name.split("=")[1]?.split("/")[0] || "—"
        });
      }
    });

    return entries;

  } catch (err) {
    console.error("[tryBlobListFallback] Error:", err.message);
    return [];
  }
};

/*****************************************************************************************
  SECTION 7 — FULL SUBMISSION WRITER
  ----------------------------------------------------------------------------------------
  Called from App.jsx on confirm submit.
  Orchestrates all writes in the correct order:

  1. Calculate delta
  2. Write delta-only JSON to submissions container (timestamp.json)
  3. Build updated full months from delta
  4. Write updated full months to latest.json
  5. Append to submissions-index.json
  6. Append to audit.json

  Returns:
  {
    success: bool,
    submissionId: "uuid",
    changedFields: [...],
    updatedMonths: [...],
    error: string | null
  }
*****************************************************************************************/
export const writeFullSubmission = async ({
  header,
  currentRows,
  latestMonths,
  user,
  submissionId
}) => {
  const { businessType, division, year } = header;

  // Step 1 — Calculate delta
  const changedFields = calculateDelta(currentRows, latestMonths);

  if (changedFields.length === 0) {
    return {
      success: false,
      error: "no_changes",
      changedFields: [],
      updatedMonths: latestMonths
    };
  }

  // Step 2 — Build updated full months for latest.json
  const updatedMonths = buildUpdatedMonths(currentRows, latestMonths, changedFields);

  // Step 3 — Write delta-only submission JSON to submissions container
  const blobPath = `year=${year}/${Date.now()}.json`;

  const deltaPayload = {
    submissionId,
    userEmail:   user ? user.userDetails : "guest@anonymous",
    userId:      user ? user.userId      : `Guest_${Date.now()}`,
    businessType,
    division,
    year,
    submittedAt: new Date().toISOString(),
    changedFields  // Only the delta — not full year
  };

  const { success: uploadSuccess, error: uploadError } = await safePut(
    buildSubmissionsUrl(blobPath),
    deltaPayload
  );

  if (!uploadSuccess) {
    return {
      success: false,
      error: uploadError,
      changedFields,
      updatedMonths
    };
  }

  // Step 4 — Write updated latest.json
  await saveLatestSubmission({
    businessType,
    division,
    year,
    months:    updatedMonths,
    updatedBy: user?.userDetails || "guest@anonymous"
  });

  // Step 5 — Append to submissions index
  await appendSubmissionsIndex({
    submissionId,
    userEmail:          user?.userDetails || "guest@anonymous",
    businessType,
    division,
    year,
    submittedAt:        deltaPayload.submittedAt,
    changedFieldsCount: changedFields.length,
    blobPath
  });

  // Step 6 — Append to audit log
  await appendAuditLog({
    action:      "submit",
    performedBy: user?.userDetails || "guest@anonymous",
    details:     `Business Input – ${businessType} | ${division} | ${year} (${changedFields.length} field${changedFields.length !== 1 ? "s" : ""} changed)`,
    division
  });

  return {
    success:      true,
    error:        null,
    changedFields,
    updatedMonths
  };
};