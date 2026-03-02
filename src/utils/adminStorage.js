/*****************************************************************************************
  ADMIN STORAGE UTILITY
  ----------------------------------------------------------------------------------------
  Handles all read/write operations to Azure Blob Storage for:
    1. users.json         → user list with roles and division access
    2. audit.json         → append-only audit log of all actions
    3. config.json        → business types and divisions configuration

  All operations use the same SAS token pattern as the main app upload.

  Environment Variables Required (same .env file):
    VITE_STORAGE_URL   → base blob storage URL
    VITE_BLOB_SAS      → SAS token string (starts with ?)
    VITE_ADMIN_CONTAINER → container name for admin files (e.g. "admin")

  Usage:
    import { getUsers, saveUsers, appendAuditLog, getConfig } from "./adminStorage";
*****************************************************************************************/

const STORAGE_URL = import.meta.env.VITE_STORAGE_URL;
const SAS = import.meta.env.VITE_BLOB_SAS;
const ADMIN_CONTAINER = import.meta.env.VITE_ADMIN_CONTAINER || "admin";

/*****************************************************************************************
  HELPER — buildUrl
  ----------------------------------------------------------------------------------------
  Constructs the full blob URL for a given filename.
  Example: buildUrl("users.json") →
    https://yourstorage.blob.core.windows.net/admin/users.json?sv=...
*****************************************************************************************/
const buildUrl = (filename) => {
  // Extract base storage account URL (strip container path if present)
  // VITE_STORAGE_URL may look like:
  //   https://account.blob.core.windows.net/submissions
  // We need:
  //   https://account.blob.core.windows.net/admin/filename
  const baseUrl = STORAGE_URL.substring(0, STORAGE_URL.lastIndexOf("/"));
  return `${baseUrl}/${ADMIN_CONTAINER}/${filename}${SAS}`;
};

/*****************************************************************************************
  FUNCTION: getUsers
  ----------------------------------------------------------------------------------------
  Fetches the users.json file from blob storage.

  Returns:
    Array of user objects:
    [
      {
        id: "uuid",
        email: "user@stevemadden.com",
        firstName: "John",
        lastName: "Davis",
        role: "admin" | "editor" | "viewer",
        divisions: ["SAF", "F9A"],
        permissions: { businessInput: true, forecastEdit: true, planEdit: false, adminReports: false },
        loginMethod: "microsoft" | "guest",
        status: "active" | "inactive",
        lastActive: "ISO date string",
        createdAt: "ISO date string"
      }
    ]

  Returns empty array if file doesn't exist yet.
*****************************************************************************************/
export const getUsers = async () => {
  try {
    const res = await fetch(buildUrl("users.json"), {
      // Add cache-busting to always get fresh data
      headers: { "Cache-Control": "no-cache" }
    });

    // File doesn't exist yet — return empty array (first time setup)
    if (res.status === 404) return [];

    if (!res.ok) throw new Error(`Failed to fetch users: ${res.status}`);

    return await res.json();
  } catch (err) {
    console.error("getUsers error:", err);
    return [];
  }
};

/*****************************************************************************************
  FUNCTION: saveUsers
  ----------------------------------------------------------------------------------------
  Overwrites users.json in blob storage with the provided array.

  Parameters:
    users (Array) → full updated user array

  Returns:
    true  → save successful
    false → save failed
*****************************************************************************************/
export const saveUsers = async (users) => {
  try {
    const res = await fetch(buildUrl("users.json"), {
      method: "PUT",
      headers: {
        "x-ms-blob-type": "BlockBlob",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(users, null, 2)
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("saveUsers failed:", text);
      return false;
    }

    return true;
  } catch (err) {
    console.error("saveUsers error:", err);
    return false;
  }
};

/*****************************************************************************************
  FUNCTION: appendAuditLog
  ----------------------------------------------------------------------------------------
  Appends a new entry to audit.json in blob storage.

  Strategy:
    1. Fetch existing audit log
    2. Append new entry to array
    3. Overwrite file with updated array

  Parameters:
    entry (Object):
      {
        action:    "login" | "submit" | "user_added" | "user_removed" | "role_edited",
        performedBy: "email of admin",
        details:   "human readable description",
        division:  "division name or —",
        ip:        "not available in browser — omitted"
      }

  Note:
    Timestamp is added automatically here.
*****************************************************************************************/
export const appendAuditLog = async (entry) => {
  try {
    // Step 1 — fetch existing log
    let existing = [];
    const res = await fetch(buildUrl("audit.json"), {
      headers: { "Cache-Control": "no-cache" }
    });

    if (res.ok) {
      existing = await res.json();
    }
    // 404 is fine — first entry

    // Step 2 — build new entry with timestamp
    const newEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...entry
    };

    // Step 3 — prepend (newest first) and save
    const updated = [newEntry, ...existing];

    await fetch(buildUrl("audit.json"), {
      method: "PUT",
      headers: {
        "x-ms-blob-type": "BlockBlob",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(updated, null, 2)
    });

    return newEntry;
  } catch (err) {
    // Audit log failure should never crash the app
    console.error("appendAuditLog error:", err);
    return null;
  }
};

/*****************************************************************************************
  FUNCTION: getAuditLog
  ----------------------------------------------------------------------------------------
  Fetches the full audit log from blob storage.

  Returns:
    Array of audit entries (newest first)
    Empty array if no log exists yet
*****************************************************************************************/
export const getAuditLog = async () => {
  try {
    const res = await fetch(buildUrl("audit.json"), {
      headers: { "Cache-Control": "no-cache" }
    });

    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`Failed to fetch audit log: ${res.status}`);

    return await res.json();
  } catch (err) {
    console.error("getAuditLog error:", err);
    return [];
  }
};

/*****************************************************************************************
  FUNCTION: getConfig
  ----------------------------------------------------------------------------------------
  Fetches config.json from blob storage.
  Contains business types and divisions — admin-configurable.

  Returns:
    {
      businessTypes: ["SAF", "Retail"],
      divisions: ["F9A", "F9B", "NAF", "EMEA"]
    }

  Falls back to hardcoded defaults if file doesn't exist.
*****************************************************************************************/
export const getConfig = async () => {
  const DEFAULTS = {
    businessTypes: ["SAF", "Retail"],
    divisions: ["F9A", "F9B"]
  };

  try {
    const res = await fetch(buildUrl("config.json"), {
      headers: { "Cache-Control": "no-cache" }
    });

    if (res.status === 404) return DEFAULTS;
    if (!res.ok) return DEFAULTS;

    return await res.json();
  } catch (err) {
    console.error("getConfig error:", err);
    return DEFAULTS;
  }
};

/*****************************************************************************************
  FUNCTION: saveConfig
  ----------------------------------------------------------------------------------------
  Saves updated config.json to blob storage.

  Parameters:
    config (Object):
      {
        businessTypes: [...],
        divisions: [...]
      }

  Returns:
    true  → success
    false → failure
*****************************************************************************************/
export const saveConfig = async (config) => {
  try {
    const res = await fetch(buildUrl("config.json"), {
      method: "PUT",
      headers: {
        "x-ms-blob-type": "BlockBlob",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(config, null, 2)
    });

    return res.ok;
  } catch (err) {
    console.error("saveConfig error:", err);
    return false;
  }
};

/*****************************************************************************************
  FUNCTION: getUserRole
  ----------------------------------------------------------------------------------------
  Looks up a user's role by email from the users list.

  Parameters:
    email (string) → user's email from /.auth/me

  Returns:
    "admin"  → full access
    "editor" → can submit forms
    "viewer" → read only
    "guest"  → not in users list
*****************************************************************************************/
export const getUserRole = async (email) => {
  if (!email) return "guest";

  const users = await getUsers();
  const found = users.find(
    (u) => u.email.toLowerCase() === email.toLowerCase()
  );

  return found ? found.role : "guest";
};

/*****************************************************************************************
  FUNCTION: getUserByEmail
  ----------------------------------------------------------------------------------------
  Returns the full user object for a given email.

  Returns null if not found.
*****************************************************************************************/
export const getUserByEmail = async (email) => {
  if (!email) return null;

  const users = await getUsers();
  return users.find(
    (u) => u.email.toLowerCase() === email.toLowerCase()
  ) || null;
};