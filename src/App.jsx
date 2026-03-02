/*****************************************************************************************
  BUSINESS INPUT PORTAL — App.jsx
  ----------------------------------------------------------------------------------------
  Phase 1 complete version. Changes from previous version:
    - All colors use CSS variables (dark mode support)
    - Dropdowns populated from config.json via getConfig()
    - Table pre-filled from latest.json via getLatestSubmission()
    - Submit disabled if no changes detected (calculateDelta)
    - writeFullSubmission() handles all blob writes in one call
    - Success page shows full year picture (updatedMonths)
    - Cell highlighting: amber = pre-filled, green = changed by user
*****************************************************************************************/

import { useState, useEffect } from "react";
import { calculateTotals }      from "./utils/calculations";
import {
  getUserRole,
  getConfig,
  getLatestSubmission,
  calculateDelta,
  writeFullSubmission,
  buildEmptyMonths
} from "./utils/adminStorage";
import AdminConsole from "./components/AdminConsole";

/*****************************************************************************************
  MONTH NAMES
*****************************************************************************************/
const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

/*****************************************************************************************
  APP COMPONENT
*****************************************************************************************/
function App() {

  /***************************************************************************************
    STATE
  ***************************************************************************************/

  // Auth
  const [user,        setUser]        = useState(null);
  const [mode,        setMode]        = useState(() => localStorage.getItem("appMode"));
  const [userRole,    setUserRole]    = useState(null);
  const [roleLoading, setRoleLoading] = useState(false);

  // Config (loaded from blob)
  const [config, setConfig] = useState({
    businessTypes: ["SAF", "Retail"],
    divisions:     ["F9A", "F9B"],
    years:         ["2026", "2027"]
  });

  // Form header
  const [header, setHeader] = useState({
    businessType: "",
    division:     "",
    year:         ""
  });

  // Monthly rows — 12 months, all empty strings initially
  const [rows, setRows] = useState(
    Array.from({ length: 12 }, (_, i) => ({
      month:    i + 1,
      forecast: "",
      plan:     "",
      gm:       ""
    }))
  );

  // Latest submission pre-fill data (12 months from latest.json)
  // null = not loaded yet, [] = loaded but no prior data
  const [latestMonths, setLatestMonths] = useState(null);

  // Loading state for latest submission fetch
  const [loadingLatest, setLoadingLatest] = useState(false);

  // Submission state
  const [submitted,     setSubmitted]     = useState(false);
  const [submittedData, setSubmittedData] = useState(null);
  const [isUploading,   setIsUploading]   = useState(false);
  const [submissionId,  setSubmissionId]  = useState(null);
  const [uploadError,   setUploadError]   = useState("");

  // UI state
  const [showTable,       setShowTable]       = useState(false);
  const [showConfirmModal,setShowConfirmModal] = useState(false);
  const [fadeIn,          setFadeIn]          = useState(false);

  /***************************************************************************************
    EFFECTS
  ***************************************************************************************/

  // Fade in on page change
  useEffect(() => {
    setFadeIn(false);
    const t = setTimeout(() => setFadeIn(true), 50);
    return () => clearTimeout(t);
  }, [mode, submitted, userRole]);

  // Lock body scroll when modal open
  useEffect(() => {
    document.body.style.overflow = showConfirmModal ? "hidden" : "auto";
    return () => { document.body.style.overflow = "auto"; };
  }, [showConfirmModal]);

  // Check Azure SSO on mount
  useEffect(() => {
    fetch("/.auth/me")
      .then((res) => res.json())
      .then(async (data) => {
        if (data.clientPrincipal) {
          const loggedInUser = data.clientPrincipal;
          setUser(loggedInUser);
          setMode("aad");
          localStorage.setItem("appMode", "aad");

          setRoleLoading(true);
          const role = await getUserRole(loggedInUser.userDetails);
          setUserRole(role);
          setRoleLoading(false);
        }
      })
      .catch(() => {
        // localhost / no auth — stays as guest
      });
  }, []);

  // Load config from blob on mount
  useEffect(() => {
    getConfig().then(setConfig);
  }, []);

  // Load draft from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("businessInputDraft");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.header) setHeader(parsed.header);
        if (parsed.rows)   setRows(parsed.rows);
      } catch {
        // Corrupt draft — ignore
      }
    }
  }, []);

  /***************************************************************************************
    LOAD TABLE — fetch latest submission when header complete
  ***************************************************************************************/
  const handleLoadTable = async () => {
    if (!header.businessType || !header.division || !header.year) return;

    setLoadingLatest(true);
    setShowTable(false);

    const latest = await getLatestSubmission(
      header.businessType,
      header.division,
      header.year
    );

    setLatestMonths(latest);

    // Pre-fill rows: convert null → "" for input display
    const prefilled = Array.from({ length: 12 }, (_, i) => ({
      month:    i + 1,
      forecast: latest[i]?.forecast ?? "",
      plan:     latest[i]?.plan     ?? "",
      gm:       latest[i]?.gm       ?? ""
    }));

    setRows(prefilled);
    setLoadingLatest(false);
    setShowTable(true);
    setUploadError("");
  };

  /***************************************************************************************
    DELTA — compute on every render for submit button state
  ***************************************************************************************/
  const getDelta = () => {
    if (!latestMonths) return [];
    return calculateDelta(rows, latestMonths);
  };

  const hasChanges = getDelta().length > 0;

  /***************************************************************************************
    CELL STATE — determines CSS class for highlighting
    "prefilled"  → amber  — loaded from latest.json, user hasn't touched it
    "changed"    → green  — user changed it from the pre-filled value
    "empty"      → no class — was null and user left it empty
  ***************************************************************************************/
  const getCellState = (monthIndex, field) => {
    if (!latestMonths) return "empty";

    const latestVal  = latestMonths[monthIndex]?.[field];
    const currentVal = rows[monthIndex]?.[field];

    // Normalise
    const latest  = (latestVal  === null || latestVal  === undefined) ? "" : String(latestVal);
    const current = (currentVal === null || currentVal === undefined) ? "" : String(currentVal);

    if (latest === "" && current === "") return "empty";
    if (current !== latest)              return "changed";
    return "prefilled";
  };

  /***************************************************************************************
    ROW CHANGE HANDLER
  ***************************************************************************************/
  const handleRowChange = (index, field, value) => {
    const updated = [...rows];
    updated[index] = { ...updated[index], [field]: value };
    setRows(updated);
    localStorage.setItem(
      "businessInputDraft",
      JSON.stringify({ header, rows: updated })
    );
  };

  /***************************************************************************************
    HEADER CHANGE HANDLER
    Resets table when header changes so stale pre-fill is cleared
  ***************************************************************************************/
  const handleHeaderChange = (field, value) => {
    const updated = { ...header, [field]: value };
    setHeader(updated);
    setShowTable(false);
    setLatestMonths(null);
    setRows(Array.from({ length: 12 }, (_, i) => ({
      month: i + 1, forecast: "", plan: "", gm: ""
    })));
    localStorage.setItem(
      "businessInputDraft",
      JSON.stringify({ header: updated, rows: [] })
    );
  };

  /***************************************************************************************
    VALIDATION
  ***************************************************************************************/
  const allowOnlyValidNumber = (value, max = null) => {
    if (value === "") return true;
    const regex = /^\d*\.?\d{0,5}$/;
    if (!regex.test(value)) return false;
    const numeric = parseFloat(value);
    if (numeric < 0) return false;
    if (max !== null && numeric > max) return false;
    return true;
  };

  /***************************************************************************************
    SUBMIT
  ***************************************************************************************/
  const handleSubmit = async () => {
    setIsUploading(true);
    setUploadError("");

    if (!import.meta.env.VITE_STORAGE_URL || !import.meta.env.VITE_BLOB_SAS) {
      setUploadError("Environment variables missing. Check .env file.");
      setIsUploading(false);
      return;
    }

    const newSubmissionId = crypto.randomUUID();
    setSubmissionId(newSubmissionId);

    // Use buildEmptyMonths as fallback if latestMonths somehow null
    const baseMonths = latestMonths || buildEmptyMonths();

    const result = await writeFullSubmission({
      header,
      currentRows:  rows,
      latestMonths: baseMonths,
      user,
      submissionId: newSubmissionId
    });

    if (!result.success) {
      if (result.error === "no_changes") {
        setUploadError("No changes detected. Please update at least one value before submitting.");
      } else {
        setUploadError(`Upload failed: ${result.error}`);
        console.error("[handleSubmit] Upload failed:", result.error);
      }
      setIsUploading(false);
      return;
    }

    // Success — store full year picture for success page
    setSubmittedData({
      submissionId:   newSubmissionId,
      businessType:   header.businessType,
      division:       header.division,
      year:           header.year,
      months:         result.updatedMonths,    // Full year, not just delta
      changedFields:  result.changedFields,    // For display on success page
      submittedAt:    new Date().toISOString()
    });

    setSubmitted(true);
    localStorage.removeItem("businessInputDraft");
    setIsUploading(false);
  };

  /***************************************************************************************
    RESET
  ***************************************************************************************/
  const resetForm = () => {
    setHeader({ businessType: "", division: "", year: "" });
    setRows(Array.from({ length: 12 }, (_, i) => ({
      month: i + 1, forecast: "", plan: "", gm: ""
    })));
    setLatestMonths(null);
    setShowTable(false);
    setSubmitted(false);
    setSubmittedData(null);
    setSubmissionId(null);
    setIsUploading(false);
    setUploadError("");
  };

  /***************************************************************************************
    LOGOUT
  ***************************************************************************************/
  const handleLogout = () => {
    setUser(null);
    setMode(null);
    setUserRole(null);
    localStorage.removeItem("appMode");
    window.location.href = "/.auth/logout";
  };

  /***************************************************************************************
    DOWNLOAD JSON
  ***************************************************************************************/
  const downloadJSON = () => {
    if (!submittedData) return;
    const blob = new Blob(
      [JSON.stringify(submittedData, null, 2)],
      { type: "application/json" }
    );
    const url = URL.createObjectURL(blob);
    const a   = document.createElement("a");
    a.href     = url;
    a.download = `submission_${submittedData.year}_${submittedData.division}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /***************************************************************************************
    SHARED INLINE STYLE HELPERS
    All colors reference CSS variables — dark mode handled automatically
  ***************************************************************************************/

  const S = {
    // Page wrapper
    wrapper: (fade) => ({
      minHeight:        "100vh",
      width:            "100vw",
      display:          "flex",
      justifyContent:   "center",
      backgroundImage:  "url('/background.jpg')",
      backgroundSize:   "cover",
      backgroundRepeat: "no-repeat",
      backgroundPosition:"center",
      fontFamily:       "'Montserrat', sans-serif",
      padding:          "40px 20px",
      boxSizing:        "border-box",
      opacity:          fade ? 1 : 0,
      transition:       "opacity 0.4s ease, transform 0.4s ease",
      transform:        fade ? "translateY(0px)" : "translateY(10px)"
    }),

    // Main white/dark card
    card: {
      background:       "var(--bg-card)",
      backdropFilter:   "blur(8px)",
      padding:          "40px",
      borderRadius:     "20px",
      width:            "1000px",
      maxWidth:         "95vw",
      boxShadow:        "var(--shadow-card)",
      alignSelf:        "flex-start"
    },

    // Top right user info
    userInfo: {
      textAlign:    "right",
      marginBottom: "10px",
      fontSize:     "14px",
      color:        "var(--text-muted)"
    },

    // Section label above dropdown
    label: {
      display:      "block",
      fontSize:     "13px",
      fontWeight:   "600",
      color:        "var(--text-secondary)",
      marginBottom: "8px"
    },

    // Dropdown select
    select: {
      width:           "260px",
      padding:         "10px 14px",
      borderRadius:    "25px",
      border:          "1px solid var(--border-primary)",
      backgroundColor: "var(--input-bg)",
      color:           "var(--input-text)",
      fontSize:        "14px",
      outline:         "none",
      appearance:      "none",
      WebkitAppearance:"none",
      boxShadow:       "var(--shadow-btn)",
      cursor:          "pointer",
      fontFamily:      "inherit",
      transition:      "all 0.2s ease"
    },

    // Table header cell
    th: {
      padding:         "12px",
      backgroundColor: "var(--bg-table-header)",
      color:           "var(--text-table-header)",
      border:          "1px solid var(--bg-table-header)",
      position:        "sticky",
      top:             0,
      zIndex:          2,
      boxShadow:       "0 2px 5px rgba(0,0,0,0.1)",
      fontFamily:      "inherit"
    },

    // Table body cell
    td: (isTotal) => ({
      padding:    "10px",
      border:     "1px solid var(--border-table)",
      fontWeight: isTotal ? "600" : "400",
      color:      "var(--text-primary)",
      background: isTotal ? "var(--bg-table-total)" : "transparent"
    }),

    // Cell input
    cellInput: (state) => ({
      borderRadius: "20px",
      padding:      "6px 10px",
      border:       state === "changed"
        ? "1.5px solid var(--changed-border)"
        : state === "prefilled"
          ? "1.5px solid var(--prefilled-border)"
          : "1px solid var(--border-primary)",
      background:   state === "changed"
        ? "var(--changed-bg)"
        : state === "prefilled"
          ? "var(--prefilled-bg)"
          : "var(--input-bg)",
      color:        "var(--input-text)",
      width:        "80%",
      outline:      "none",
      fontSize:     "13px",
      textAlign:    "center",
      fontFamily:   "inherit",
      transition:   "all 0.2s ease"
    }),

    // Big action button
    btnLarge: (disabled) => ({
      padding:       "12px 28px",
      borderRadius:  "30px",
      border:        "none",
      background:    disabled ? "var(--border-primary)" : "var(--btn-primary-bg)",
      color:         disabled ? "var(--text-muted)"     : "var(--btn-primary-text)",
      fontWeight:    "500",
      letterSpacing: "0.5px",
      cursor:        disabled ? "not-allowed" : "pointer",
      fontFamily:    "inherit",
      transition:    "all 0.2s ease"
    }),

    // Logout button
    btnLogout: {
      padding:      "10px 25px",
      borderRadius: "25px",
      border:       "none",
      background:   "var(--btn-logout-bg)",
      color:        "var(--text-primary)",
      cursor:       "pointer",
      marginLeft:   "15px",
      fontFamily:   "inherit"
    },

    // Error message
    errorBox: {
      background:   "var(--error-bg)",
      border:       "1px solid var(--error-border)",
      color:        "var(--error-text)",
      padding:      "10px 14px",
      borderRadius: "8px",
      fontSize:     "13px",
      marginTop:    "12px"
    }
  };

  /***************************************************************************************
    PAGE: MODE SELECTION (LOGIN)
  ***************************************************************************************/
  if (mode === null) {
    return (
      <div style={{
        minHeight:         "100vh",
        width:             "100vw",
        display:           "flex",
        justifyContent:    "center",
        alignItems:        "center",
        backgroundImage:   "url('/background.jpg')",
        backgroundSize:    "cover",
        backgroundPosition:"center",
        fontFamily:        "'Montserrat', sans-serif",
        opacity:           fadeIn ? 1 : 0,
        transition:        "opacity 0.4s ease, transform 0.4s ease",
        transform:         fadeIn ? "translateY(0px)" : "translateY(10px)"
      }}>
        <div style={{
          background:     "var(--login-card-bg)",
          backdropFilter: "blur(8px)",
          padding:        "50px",
          borderRadius:   "20px",
          width:          "400px",
          textAlign:      "center",
          boxShadow:      "var(--shadow-card)"
        }}>
          <img
            src="/stevemadden-logo.png"
            alt="Steve Madden"
            style={{ height: "60px", marginBottom: "20px" }}
          />

          <h2 style={{
            color:        "var(--login-title-color)",
            fontSize:     "22px",
            marginBottom: "8px"
          }}>
            Business Input Portal
          </h2>

          <p style={{
            color:        "var(--text-muted)",
            fontSize:     "13px",
            marginBottom: "28px"
          }}>
            Sign in to continue
          </p>

          {/* Continue as Guest */}
          <button
            onClick={() => {
              setMode("guest");
              setUserRole("admin"); // ← TEMP for testing — revert to "guest" before deploy
              localStorage.setItem("appMode", "guest");
            }}
            style={{
              padding:         "11px 25px",
              borderRadius:    "25px",
              border:          "none",
              backgroundColor: "var(--btn-primary-bg)",
              color:           "var(--btn-primary-text)",
              cursor:          "pointer",
              width:           "100%",
              fontFamily:      "inherit",
              fontSize:        "14px",
              fontWeight:      "600",
              transition:      "all 0.2s ease"
            }}
          >
            Continue as Guest
          </button>

          {/* Login with Microsoft */}
          <button
            onClick={() => { window.location.href = "/.auth/login/aad"; }}
            style={{
              marginTop:       "12px",
              padding:         "11px 25px",
              borderRadius:    "25px",
              border:          "1px solid var(--login-btn-ms-border)",
              backgroundColor: "var(--login-btn-ms-bg)",
              color:           "var(--login-btn-ms-text)",
              cursor:          "pointer",
              width:           "100%",
              fontFamily:      "inherit",
              fontSize:        "14px",
              fontWeight:      "600",
              transition:      "all 0.2s ease"
            }}
          >
            Login with Microsoft
          </button>
        </div>
      </div>
    );
  }

  /***************************************************************************************
    PAGE: ROLE LOADING SPINNER
  ***************************************************************************************/
  if (mode === "aad" && roleLoading) {
    return (
      <div style={{
        minHeight:         "100vh",
        width:             "100vw",
        display:           "flex",
        justifyContent:    "center",
        alignItems:        "center",
        backgroundImage:   "url('/background.jpg')",
        backgroundSize:    "cover",
        backgroundPosition:"center",
        fontFamily:        "'Montserrat', sans-serif"
      }}>
        <div style={{
          background:     "var(--login-card-bg)",
          backdropFilter: "blur(8px)",
          padding:        "40px 50px",
          borderRadius:   "20px",
          textAlign:      "center",
          boxShadow:      "var(--shadow-card)"
        }}>
          <img
            src="/stevemadden-logo.png"
            alt="Steve Madden"
            style={{ height: "50px", marginBottom: "20px" }}
          />
          <p style={{ color: "var(--text-muted)", fontSize: "14px" }}>
            Checking permissions...
          </p>
        </div>
      </div>
    );
  }

  /***************************************************************************************
    PAGE: ADMIN CONSOLE
  ***************************************************************************************/
  if (userRole === "admin") {
    return <AdminConsole user={user} onLogout={handleLogout} />;
  }

  /***************************************************************************************
    PAGE: SUBMISSION SUCCESS
  ***************************************************************************************/
  if (submitted && submittedData) {
    return (
      <div style={S.wrapper(fadeIn)}>
        <div style={S.card}>

          <div style={S.userInfo}>
            {user ? `Logged in as: ${user.userDetails}` : "Guest User"}
          </div>

          <div style={{ textAlign: "center", marginBottom: "20px" }}>
            <img src="/stevemadden-logo.png" alt="Steve Madden" style={{ height: "60px" }} />
          </div>

          <h2 style={{ color: "var(--text-heading)", marginBottom: "8px" }}>
            Submission Successful ✓
          </h2>

          <p style={{ color: "var(--text-muted)", fontSize: "13px", marginBottom: "16px" }}>
            <strong style={{ color: "var(--text-primary)" }}>Submission ID:</strong> {submittedData.submissionId}
          </p>

          <p style={{ color: "var(--text-secondary)", marginBottom: "20px" }}>
            Data submitted for:{" "}
            <strong style={{ color: "var(--text-primary)" }}>
              {submittedData.businessType} | {submittedData.division} | {submittedData.year}
            </strong>
          </p>

          {/* Changed fields summary */}
          {submittedData.changedFields?.length > 0 && (
            <div style={{
              background:   "var(--success-bg)",
              color:        "var(--success-text)",
              padding:      "10px 16px",
              borderRadius: "8px",
              fontSize:     "13px",
              marginBottom: "20px"
            }}>
              {submittedData.changedFields.length} field{submittedData.changedFields.length !== 1 ? "s" : ""} updated in this submission
            </div>
          )}

          <h3 style={{ color: "var(--text-heading)", marginBottom: "12px" }}>
            Full Year — Current State
          </h3>

          {/* Full year table */}
          <div style={{ maxHeight: "420px", overflowY: "auto", borderRadius: "12px", border: "1px solid var(--border-table)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "center" }}>
              <thead>
                <tr>
                  {["Month", "Forecast", "Plan", "GM %"].map((h) => (
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {submittedData.months.map((row) => {
                  // Highlight changed months on success page
                  const wasChanged = submittedData.changedFields?.some(
                    (c) => c.month === row.month
                  );
                  return (
                    <tr key={row.month} style={{
                      background: wasChanged ? "var(--changed-bg)" : "var(--bg-card-solid)"
                    }}>
                      <td style={S.td(false)}>
                        {MONTH_NAMES[row.month - 1]}
                        {wasChanged && (
                          <span style={{ marginLeft: "6px", fontSize: "10px", color: "var(--success-text)", fontWeight: "700" }}>
                            ✓
                          </span>
                        )}
                      </td>
                      <td style={S.td(false)}>{row.forecast ?? "—"}</td>
                      <td style={S.td(false)}>{row.plan     ?? "—"}</td>
                      <td style={S.td(false)}>{row.gm       ?? "—"}</td>
                    </tr>
                  );
                })}

                {/* Quarterly + Full Year totals */}
                {calculateTotals(submittedData.months.map((m) => ({
                  month:    m.month,
                  forecast: m.forecast || "",
                  plan:     m.plan     || "",
                  gm:       m.gm       || ""
                }))).map((totalRow) => (
                  <tr key={totalRow.label}>
                    <td style={S.td(true)}>{totalRow.label}</td>
                    <td style={S.td(true)}>{totalRow.forecast}</td>
                    <td style={S.td(true)}>{totalRow.plan}</td>
                    <td style={S.td(true)}>{totalRow.gm}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Action buttons */}
          <div style={{ marginTop: "24px", display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <button onClick={downloadJSON} style={S.btnLarge(false)}>
              Download Submission
            </button>

            <button onClick={resetForm} style={S.btnLarge(false)}>
              Submit Another Response
            </button>

            <button onClick={handleLogout} style={S.btnLogout}>
              Logout
            </button>
          </div>
        </div>
      </div>
    );
  }

  /***************************************************************************************
    PAGE: MAIN FORM
  ***************************************************************************************/
  return (
    <div style={S.wrapper(fadeIn)}>
      <div style={S.card}>

        {/* User info */}
        <div style={S.userInfo}>
          {user ? `Logged in as: ${user.userDetails}` : "Guest User"}
        </div>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "20px" }}>
          <img src="/stevemadden-logo.png" alt="Steve Madden" style={{ height: "60px" }} />
        </div>

        <h2 style={{ fontSize: "2rem", fontWeight: "600", marginBottom: "25px", color: "var(--text-heading)" }}>
          Business Input
        </h2>

        {/* Business Type */}
        <div style={{ marginBottom: "20px" }}>
          <label style={S.label}>Business Type</label>
          <select
            style={S.select}
            value={header.businessType}
            onChange={(e) => handleHeaderChange("businessType", e.target.value)}
            onFocus={(e) => { e.target.style.borderColor = "var(--border-focus)"; e.target.style.boxShadow = "0 0 0 3px var(--input-shadow-focus)"; }}
            onBlur={(e)  => { e.target.style.borderColor = "var(--border-primary)"; e.target.style.boxShadow = "var(--shadow-btn)"; }}
          >
            <option value="">Select</option>
            {config.businessTypes.map((bt) => (
              <option key={bt} value={bt}>{bt}</option>
            ))}
          </select>
        </div>

        {/* Division */}
        <div style={{ marginBottom: "20px" }}>
          <label style={S.label}>Division</label>
          <select
            style={S.select}
            value={header.division}
            onChange={(e) => handleHeaderChange("division", e.target.value)}
            onFocus={(e) => { e.target.style.borderColor = "var(--border-focus)"; e.target.style.boxShadow = "0 0 0 3px var(--input-shadow-focus)"; }}
            onBlur={(e)  => { e.target.style.borderColor = "var(--border-primary)"; e.target.style.boxShadow = "var(--shadow-btn)"; }}
          >
            <option value="">Select</option>
            {config.divisions.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>

        {/* Year */}
        <div style={{ marginBottom: "24px" }}>
          <label style={S.label}>Year</label>
          <select
            style={S.select}
            value={header.year}
            onChange={(e) => handleHeaderChange("year", e.target.value)}
            onFocus={(e) => { e.target.style.borderColor = "var(--border-focus)"; e.target.style.boxShadow = "0 0 0 3px var(--input-shadow-focus)"; }}
            onBlur={(e)  => { e.target.style.borderColor = "var(--border-primary)"; e.target.style.boxShadow = "var(--shadow-btn)"; }}
          >
            <option value="">Select</option>
            {config.years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        {/* Load Table Button */}
        <button
          disabled={!header.businessType || !header.division || !header.year || loadingLatest}
          onClick={handleLoadTable}
          style={S.btnLarge(!header.businessType || !header.division || !header.year || loadingLatest)}
          onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.transform = "scale(1.05)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
        >
          {loadingLatest ? "Loading..." : "Load Table"}
        </button>

        {/* TABLE SECTION */}
        {showTable && (
          <>
            <h3 style={{ margin: "24px 0 8px", color: "var(--text-heading)" }}>
              {header.businessType} | {header.division} | {header.year}
            </h3>

            {/* Legend */}
            <div style={{ display: "flex", gap: "16px", marginBottom: "12px", fontSize: "11px", color: "var(--text-muted)" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                <span style={{ width: "12px", height: "12px", borderRadius: "3px", background: "var(--prefilled-bg)", border: "1px solid var(--prefilled-border)", display: "inline-block" }} />
                Pre-filled from last submission
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                <span style={{ width: "12px", height: "12px", borderRadius: "3px", background: "var(--changed-bg)", border: "1px solid var(--changed-border)", display: "inline-block" }} />
                Changed
              </span>
            </div>

            {/* Monthly table */}
            <div style={{ width: "100%", maxHeight: "400px", borderRadius: "12px", overflowY: "auto", border: "1px solid var(--border-table)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "center", tableLayout: "fixed" }}>
                <thead>
                  <tr>
                    {["Month", "Forecast", "Plan", "GM %"].map((h) => (
                      <th key={h} style={{ ...S.th, width: "25%" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr
                      key={row.month}
                      style={{ transition: "background 0.15s ease" }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--bg-hover)"}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                    >
                      <td style={{ padding: "10px", color: "var(--text-primary)", border: "1px solid var(--border-table)" }}>
                        {MONTH_NAMES[index]}
                      </td>

                      {["forecast", "plan"].map((field) => (
                        <td key={field} style={{ padding: "8px", border: "1px solid var(--border-table)" }}>
                          <input
                            type="text"
                            inputMode="decimal"
                            style={S.cellInput(getCellState(index, field))}
                            value={row[field]}
                            onChange={(e) => {
                              if (allowOnlyValidNumber(e.target.value))
                                handleRowChange(index, field, e.target.value);
                            }}
                            onKeyDown={(e) => {
                              if (["e","E","+","-"].includes(e.key)) e.preventDefault();
                            }}
                          />
                        </td>
                      ))}

                      <td style={{ padding: "8px", border: "1px solid var(--border-table)" }}>
                        <input
                          type="text"
                          inputMode="decimal"
                          style={S.cellInput(getCellState(index, "gm"))}
                          value={row.gm}
                          onChange={(e) => {
                            if (allowOnlyValidNumber(e.target.value, 100))
                              handleRowChange(index, "gm", e.target.value);
                          }}
                          onKeyDown={(e) => {
                            if (["e","E","+","-"].includes(e.key)) e.preventDefault();
                          }}
                        />
                      </td>
                    </tr>
                  ))}

                  {/* Quarterly + Full Year totals */}
                  {calculateTotals(rows).map((totalRow) => (
                    <tr key={totalRow.label} style={{
                      fontWeight:      "600",
                      backgroundColor: "var(--bg-table-total)",
                      borderTop:       "2px solid var(--border-table)"
                    }}>
                      <td style={{ padding: "10px", color: "var(--text-primary)" }}>{totalRow.label}</td>
                      <td style={{ color: "var(--text-primary)" }}>{totalRow.forecast}</td>
                      <td style={{ color: "var(--text-primary)" }}>{totalRow.plan}</td>
                      <td style={{ color: "var(--text-primary)" }}>{totalRow.gm}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Submit row */}
            <div style={{ marginTop: "20px", display: "flex", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
              <button
                onClick={() => {
                  if (!hasChanges) return;
                  setShowConfirmModal(true);
                }}
                disabled={!hasChanges || isUploading}
                style={S.btnLarge(!hasChanges || isUploading)}
                onMouseEnter={(e) => { if (hasChanges) e.currentTarget.style.transform = "scale(1.05)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
              >
                {isUploading ? "Uploading..." : "Submit"}
              </button>

              {/* No changes hint */}
              {!hasChanges && latestMonths && (
                <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                  No changes detected — update at least one value to submit
                </span>
              )}

              <button onClick={handleLogout} style={S.btnLogout}>
                Logout
              </button>
            </div>

            {/* Upload error */}
            {uploadError && (
              <div style={S.errorBox}>{uploadError}</div>
            )}
          </>
        )}

        {/* Confirm Modal */}
        {showConfirmModal && (
          <div style={{
            position:       "fixed",
            inset:          0,
            backgroundColor:"var(--modal-overlay-bg)",
            display:        "flex",
            justifyContent: "center",
            alignItems:     "center",
            zIndex:         9999,
            backdropFilter: "blur(4px)"
          }}>
            <div style={{
              width:        "90%",
              maxWidth:     "420px",
              background:   "var(--bg-modal)",
              padding:      "35px 30px",
              borderRadius: "20px",
              boxShadow:    "var(--shadow-modal)",
              textAlign:    "center"
            }}>
              <h3 style={{ marginBottom: "15px", color: "var(--text-heading)", fontFamily: "inherit" }}>
                Confirm Submission
              </h3>

              <p style={{ marginBottom: "8px", fontSize: "14px", color: "var(--text-secondary)" }}>
                Submit changes for:
              </p>
              <p style={{ marginBottom: "8px", fontWeight: "700", color: "var(--text-primary)" }}>
                {header.businessType} | {header.division} | {header.year}
              </p>
              <p style={{ marginBottom: "24px", fontSize: "13px", color: "var(--text-muted)" }}>
                {getDelta().length} field{getDelta().length !== 1 ? "s" : ""} will be updated
              </p>

              <div style={{ display: "flex", justifyContent: "center", gap: "15px" }}>
                <button
                  onClick={() => setShowConfirmModal(false)}
                  style={{
                    padding:      "8px 22px",
                    borderRadius: "25px",
                    border:       "1.5px solid var(--btn-outline-border)",
                    background:   "var(--btn-outline-bg)",
                    color:        "var(--btn-outline-text)",
                    cursor:       "pointer",
                    fontFamily:   "inherit"
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => { setShowConfirmModal(false); handleSubmit(); }}
                  style={{
                    padding:      "8px 22px",
                    borderRadius: "25px",
                    border:       "none",
                    background:   "var(--btn-primary-bg)",
                    color:        "var(--btn-primary-text)",
                    cursor:       "pointer",
                    fontFamily:   "inherit"
                  }}
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;