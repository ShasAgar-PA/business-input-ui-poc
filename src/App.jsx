/*****************************************************************************************
  BUSINESS INPUT PORTAL
  ----------------------------------------------------------------------------------------
  This is a React Single Page Application (SPA) that:

  1. Allows user login (Guest or Microsoft AAD)
  2. Checks user role from blob storage after login
  3. Redirects Admin users to Admin Console
  4. Lets editors/guests enter monthly forecast / plan / GM data
  5. Automatically calculates quarterly + full year totals
  6. Saves draft locally (LocalStorage)
  7. Uploads final JSON to Azure Blob Storage
  8. Shows submission success page with download option

  The UI has 4 major states:
    - Mode Selection Page   (mode === null)
    - Admin Console Page    (mode === "aad" && userRole === "admin")
    - Main Form Page        (mode === "guest" || mode === "aad")
    - Submission Success Page

  CHANGES FROM ORIGINAL:
    - Imported AdminConsole component
    - Imported getUserRole from adminStorage
    - Added userRole state
    - Added role fetch after AAD login
    - Added Admin Console render condition
    - Added handleLogout shared function
*****************************************************************************************/

import { useState, useEffect } from "react";
import { calculateTotals } from "./utils/calculations";
import { getUserRole, appendAuditLog } from "./utils/adminStorage";
import AdminConsole from "./components/AdminConsole";

function App() {
  /*****************************************************************************************
    SECTION 1 — GLOBAL STATE VARIABLES
  *****************************************************************************************/

  // Stores logged-in Microsoft user (if exists)
  const [user, setUser] = useState(null);

  // Determines which page to show:
  // null   → mode selection screen
  // guest  → main app without login
  // aad    → main app with Microsoft login
  const [mode, setMode] = useState(() => {
    return localStorage.getItem("appMode");
  });

  // NEW — stores the role of the logged-in user
  // "admin"  → redirected to Admin Console
  // "editor" → normal form access
  // "viewer" → normal form access (read only in future)
  // "guest"  → normal form access
  const [userRole, setUserRole] = useState(null);

  // NEW — true while we are fetching the user's role after login
  // Prevents flickering of form before role is known
  const [roleLoading, setRoleLoading] = useState(false);

  // True when submission completed
  const [submitted, setSubmitted] = useState(false);

  // Stores final submitted payload for success page
  const [submittedData, setSubmittedData] = useState(null);

  // Shows loading state during upload
  const [isUploading, setIsUploading] = useState(false);

  // Controls confirmation popup visibility
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Stores unique submission ID
  const [submissionId, setSubmissionId] = useState(null);

  // Controls page fade animation
  const [fadeIn, setFadeIn] = useState(false);

  // Controls whether table is visible
  const [showTable, setShowTable] = useState(false);

  // Reusable Drop Down Style
  const modernSelectStyle = {
    width: "260px",
    padding: "10px 14px",
    borderRadius: "25px",
    border: "1px solid #ddd",
    backgroundColor: "white",
    fontSize: "14px",
    outline: "none",
    appearance: "none",
    WebkitAppearance: "none",
    MozAppearance: "none",
    boxShadow: "0 2px 6px rgba(0,0,0,0.05)",
    transition: "all 0.2s ease",
    cursor: "pointer"
  };

  // Reusable Cell Style
  const cellStyle = {
    padding: "10px",
    border: "1px solid #000"
  };

  /*****************************************************************************************
    SECTION 2 — HEADER STATE (TOP FORM DATA)
  *****************************************************************************************/

  const [header, setHeader] = useState({
    businessType: "",
    division: "",
    year: ""
  });

  /*****************************************************************************************
    SECTION 3 — MONTHLY ROW DATA (12 MONTHS)
  *****************************************************************************************/

  const [rows, setRows] = useState(
    Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      forecast: "",
      plan: "",
      gm: ""
    }))
  );

  /*****************************************************************************************
    SECTION 4 — AUTHENTICATION CHECK
    ----------------------------------------------------------------------------------------
    On first load:
    - Calls Azure Static Web App auth endpoint
    - If logged in → fetch role → set mode to "aad"

    CHANGE FROM ORIGINAL:
    - After confirming AAD login, we now call getUserRole()
    - If role is "admin" → userRole state is set to "admin"
    - This triggers Admin Console render instead of form
  *****************************************************************************************/

  useEffect(() => {
    fetch("/.auth/me")
      .then((res) => res.json())
      .then(async (data) => {
        if (data.clientPrincipal) {
          const loggedInUser = data.clientPrincipal;
          setUser(loggedInUser);
          setMode("aad");
          localStorage.setItem("appMode", "aad");

          // NEW — fetch role from blob storage
          setRoleLoading(true);
          const role = await getUserRole(loggedInUser.userDetails);
          setUserRole(role);
          setRoleLoading(false);

          // NEW — log login event to audit log
          await appendAuditLog({
            action:      "login",
            performedBy: loggedInUser.userDetails,
            details:     `Logged in via Microsoft SSO`,
            division:    "—"
          });
        }
      })
      .catch(() => {
        // localhost or no auth — stays as guest
      });
  }, []);

  /*****************************************************************************************
    SECTION 5 — LOAD SAVED DRAFT FROM LOCAL STORAGE
  *****************************************************************************************/

  useEffect(() => {
    const savedDraft = localStorage.getItem("businessInputDraft");
    if (savedDraft) {
      const parsed = JSON.parse(savedDraft);
      if (parsed.header) setHeader(parsed.header);
      if (parsed.rows)   setRows(parsed.rows);
    }
  }, []);

  /*****************************************************************************************
    SECTION 6 — PAGE FADE ANIMATION
  *****************************************************************************************/

  useEffect(() => {
    setFadeIn(false);
    const timer = setTimeout(() => setFadeIn(true), 50);
    return () => clearTimeout(timer);
  }, [mode, submitted, userRole]);

  // Prevent background scroll when modal open
  useEffect(() => {
    document.body.style.overflow = showConfirmModal ? "hidden" : "auto";
  }, [showConfirmModal]);

  /*****************************************************************************************
    SECTION 7 — ROW INPUT HANDLER
  *****************************************************************************************/

  const handleRowChange = (index, field, value) => {
    const updated = [...rows];
    updated[index][field] = value;
    setRows(updated);
    localStorage.setItem(
      "businessInputDraft",
      JSON.stringify({ header, rows: updated })
    );
  };

  /*****************************************************************************************
    SECTION 8 — VALIDATION FUNCTION
  *****************************************************************************************/

  const allowOnlyValidNumber = (value, max = null) => {
    if (value === "") return true;
    const regex = /^\d*\.?\d{0,5}$/;
    if (!regex.test(value)) return false;
    const numeric = parseFloat(value);
    if (numeric < 0) return false;
    if (max !== null && numeric > max) return false;
    return true;
  };

  /*****************************************************************************************
    SECTION 9 — UPLOAD TO AZURE BLOB STORAGE
  *****************************************************************************************/

  const upload = async () => {
    setIsUploading(true);

    if (!validateRows()) {
      alert("Invalid values detected. Please correct inputs.");
      setIsUploading(false);
      return;
    }

    if (!import.meta.env.VITE_STORAGE_URL || !import.meta.env.VITE_BLOB_SAS) {
      alert("Environment variables missing. Check .env file.");
      setIsUploading(false);
      return;
    }

    const newSubmissionId = crypto.randomUUID();
    setSubmissionId(newSubmissionId);

    try {
      const payload = {
        submissionId: newSubmissionId,
        userEmail: user ? user.userDetails : "guest@anonymous",
        userId:    user ? user.userId : `Guest_${Date.now()}`,
        ...header,
        months:      rows,
        submittedAt: new Date().toISOString()
      };

      const fileName = `year=${header.year}/${Date.now()}.json`;

      const response = await fetch(
        `${import.meta.env.VITE_STORAGE_URL}/${fileName}${import.meta.env.VITE_BLOB_SAS}`,
        {
          method: "PUT",
          headers: {
            "x-ms-blob-type": "BlockBlob",
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        }
      );

      if (!response.ok) {
        const text = await response.text();
        alert("Upload failed: " + text);
        setIsUploading(false);
        return;
      }

      // NEW — log submission to audit log
      await appendAuditLog({
        action:      "submit",
        performedBy: user?.userDetails || "guest@anonymous",
        details:     `Business Input – ${header.businessType} | ${header.division} | ${header.year}`,
        division:    header.division
      });

      setSubmittedData(payload);
      setSubmitted(true);
      localStorage.removeItem("businessInputDraft");
      setIsUploading(false);

    } catch (error) {
      setIsUploading(false);
      console.error("Upload error:", error);
      alert("Upload crashed. Check console.");
    }
  };

  /*****************************************************************************************
    SECTION 10 — RESET FORM
  *****************************************************************************************/

  const resetForm = () => {
    setHeader({ businessType: "", division: "", year: "" });
    setRows(
      Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        forecast: "",
        plan: "",
        gm: ""
      }))
    );
    setShowTable(false);
    setSubmitted(false);
    setSubmittedData(null);
    setSubmissionId(null);
    setIsUploading(false);
  };

  /*****************************************************************************************
    SECTION 11 — NEW: SHARED LOGOUT HANDLER
    ----------------------------------------------------------------------------------------
    Extracted into a shared function so both the main form AND the Admin Console
    can call the same logout logic.
  *****************************************************************************************/

  const handleLogout = () => {
    setUser(null);
    setMode(null);
    setUserRole(null);
    localStorage.removeItem("appMode");
    window.location.href = "/.auth/logout";
  };

  /*****************************************************************************************
    SECTION 12 — DOWNLOAD JSON
  *****************************************************************************************/

  const downloadJSON = () => {
    if (!submittedData) return;
    const blob = new Blob(
      [JSON.stringify(submittedData, null, 2)],
      { type: "application/json" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `submission_${submittedData.year}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /*****************************************************************************************
    SECTION 13 — VALIDATE ROWS
  *****************************************************************************************/

  const validateRows = () => {
    for (let row of rows) {
      for (let field of ["forecast", "plan", "gm"]) {
        const value = row[field];
        if (value !== "") {
          const num = parseFloat(value);
          if (isNaN(num) || num < 0) return false;
          if (field === "gm" && num > 100) return false;
        }
      }
    }
    return true;
  };

  /*****************************************************************************************
    SECTION 14 — HAS ANY DATA
  *****************************************************************************************/

  const hasAnyData = () => {
    return rows.some((row) => row.forecast || row.plan || row.gm);
  };

  // Month name helper
  const getMonthName = (monthNumber) => {
    const months = [
      "January", "February", "March",
      "April",   "May",      "June",
      "July",    "August",   "September",
      "October", "November", "December"
    ];
    return months[monthNumber - 1];
  };

  /*****************************************************************************************
    SECTION 15 — PAGE RENDERING LOGIC
    ----------------------------------------------------------------------------------------
    Order of checks:
      1. mode === null           → Mode Selection Page
      2. roleLoading             → Loading spinner (prevents flicker)
      3. userRole === "admin"    → Admin Console         ← NEW
      4. submitted               → Success Page
      5. default                 → Main Form Page
  *****************************************************************************************/

  /*****************************************************************************************
    MODE SELECTION PAGE
  *****************************************************************************************/
  if (mode === null) {
    return (
      <div
        style={{
          minHeight: "100vh",
          width: "100vw",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          backgroundImage: "url('/background.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          fontFamily: "'Montserrat', sans-serif",
          opacity: fadeIn ? 1 : 0,
          transition: "opacity 0.4s ease, transform 0.4s ease",
          transform: fadeIn ? "translateY(0px)" : "translateY(10px)"
        }}
      >
        <div
          style={{
            background: "rgba(255,255,255,0.95)",
            padding: "50px",
            borderRadius: "20px",
            width: "400px",
            textAlign: "center",
            boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
            backdropFilter: "blur(8px)"
          }}
        >
          <img
            src="/stevemadden-logo.png"
            alt="Steve Madden"
            style={{ height: "60px", marginBottom: "20px" }}
          />
          <h2>Business Input Portal</h2>

          <button
            onClick={() => {
              setMode("guest");
              setUserRole("guest");
              localStorage.setItem("appMode", "guest");
            }}
            style={{
              marginTop: "20px",
              padding: "10px 25px",
              borderRadius: "25px",
              border: "none",
              backgroundColor: "black",
              color: "white",
              cursor: "pointer",
              width: "100%",
              fontFamily: "inherit"
            }}
          >
            Continue as Guest
          </button>

          <button
            onClick={() => {
              window.location.href = "/.auth/login/aad";
            }}
            style={{
              marginTop: "15px",
              padding: "10px 25px",
              borderRadius: "25px",
              border: "1px solid black",
              backgroundColor: "white",
              cursor: "pointer",
              width: "100%",
              fontFamily: "inherit"
            }}
          >
            Login with Microsoft
          </button>
        </div>
      </div>
    );
  }

  /*****************************************************************************************
    NEW — ROLE LOADING SPINNER
    ----------------------------------------------------------------------------------------
    Shown briefly after AAD login while we fetch the user's role from blob.
    Prevents the form from flashing before we know if user is admin or not.
  *****************************************************************************************/
  if (mode === "aad" && roleLoading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          width: "100vw",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          backgroundImage: "url('/background.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          fontFamily: "'Montserrat', sans-serif"
        }}
      >
        <div
          style={{
            background: "rgba(255,255,255,0.95)",
            padding: "40px 50px",
            borderRadius: "20px",
            textAlign: "center",
            boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
            backdropFilter: "blur(8px)"
          }}
        >
          <img
            src="/stevemadden-logo.png"
            alt="Steve Madden"
            style={{ height: "50px", marginBottom: "20px" }}
          />
          <p style={{ color: "#555", fontSize: "14px" }}>Checking permissions...</p>
        </div>
      </div>
    );
  }

  /*****************************************************************************************
    NEW — ADMIN CONSOLE PAGE
    ----------------------------------------------------------------------------------------
    Rendered when:
      - User is logged in via AAD
      - Their email maps to role "admin" in users.json in blob

    Passes:
      - user object (for display + audit logging)
      - onLogout handler (shared logout function)
  *****************************************************************************************/
  if (mode === "aad" && userRole === "admin") {
    return <AdminConsole user={user} onLogout={handleLogout} />;
  }

  /*****************************************************************************************
    SUBMISSION SUCCESS PAGE
  *****************************************************************************************/
  if (submitted && submittedData) {
    return (
      <div
        style={{
          minHeight: "100vh",
          width: "100vw",
          display: "flex",
          justifyContent: "center",
          backgroundImage: "url('/background.jpg')",
          backgroundSize: "cover",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center",
          fontFamily: "'Montserrat', sans-serif",
          padding: "40px 20px",
          boxSizing: "border-box",
          opacity: fadeIn ? 1 : 0,
          transition: "opacity 0.4s ease, transform 0.4s ease",
          transform: fadeIn ? "translateY(0px)" : "translateY(10px)"
        }}
      >
        <div
          style={{
            background: "rgba(255,255,255,0.88)",
            padding: "40px",
            borderRadius: "20px",
            width: "1000px",
            boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
            backdropFilter: "blur(8px)"
          }}
        >
          <div style={{ textAlign: "right", marginBottom: "10px", fontSize: "14px" }}>
            {user ? `Logged in as: ${user.userDetails}` : "Guest User"}
          </div>

          <div style={{ textAlign: "center", marginBottom: "20px" }}>
            <img src="/stevemadden-logo.png" alt="Steve Madden" style={{ height: "60px" }} />
          </div>

          <h2>Submission Successful</h2>
          <p><strong>Submission ID:</strong> {submissionId}</p>
          <p>
            Thank you for submitting data for:<br />
            <strong>
              {submittedData.businessType} | {submittedData.division} | {submittedData.year}
            </strong>
          </p>

          <h3>Submitted Values</h3>

          <div style={{ maxHeight: "400px", overflowY: "auto", borderRadius: "12px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "center", border: "1px solid #000" }}>
              <thead>
                <tr>
                  {["Month", "Forecast", "Plan", "GM %"].map((h) => (
                    <th key={h} style={{ padding: "12px", backgroundColor: "#000", color: "#fff", border: "1px solid #000", position: "sticky", top: 0, zIndex: 2, boxShadow: "0 2px 5px rgba(0,0,0,0.1)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {submittedData.months
                  .filter((row) => row.forecast || row.plan || row.gm)
                  .map((row) => (
                    <tr key={row.month}>
                      <td style={{ padding: "10px", border: "1px solid #000" }}>{getMonthName(row.month)}</td>
                      <td style={{ padding: "10px", border: "1px solid #000" }}>{row.forecast}</td>
                      <td style={{ padding: "10px", border: "1px solid #000" }}>{row.plan}</td>
                      <td style={{ padding: "10px", border: "1px solid #000" }}>{row.gm}</td>
                    </tr>
                  ))}

                {calculateTotals(submittedData.months).map((totalRow) => (
                  <tr key={totalRow.label} style={{ fontWeight: "bold" }}>
                    <td style={cellStyle}>{totalRow.label}</td>
                    <td style={cellStyle}>{totalRow.forecast}</td>
                    <td style={cellStyle}>{totalRow.plan}</td>
                    <td style={cellStyle}>{totalRow.gm}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <br />

          <div style={{ marginTop: "20px", textAlign: "center" }}>
            <button
              onClick={downloadJSON}
              style={{ padding: "10px 25px", borderRadius: "25px", border: "none", backgroundColor: "black", color: "white", cursor: "pointer", marginRight: "15px", fontFamily: "inherit" }}
            >
              Download Submission
            </button>

            <button
              onClick={resetForm}
              style={{ padding: "10px 25px", borderRadius: "25px", border: "none", backgroundColor: "black", color: "white", cursor: "pointer", fontFamily: "inherit" }}
            >
              Submit Another Response
            </button>

            <button
              onClick={handleLogout}
              style={{ padding: "10px 25px", borderRadius: "25px", border: "none", backgroundColor: "#999", color: "white", cursor: "pointer", marginLeft: "15px", fontFamily: "inherit" }}
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    );
  }

  /*****************************************************************************************
    MAIN FORM PAGE
  *****************************************************************************************/
  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100vw",
        display: "flex",
        justifyContent: "center",
        backgroundImage: "url('/background.jpg')",
        backgroundSize: "cover",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",
        fontFamily: "'Montserrat', sans-serif",
        padding: "40px 20px",
        boxSizing: "border-box",
        opacity: fadeIn ? 1 : 0,
        transition: "opacity 0.4s ease, transform 0.4s ease",
        transform: fadeIn ? "translateY(0px)" : "translateY(10px)"
      }}
    >
      <div
        style={{
          background: "rgba(255,255,255,0.88)",
          padding: "40px",
          borderRadius: "20px",
          width: "1000px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
          backdropFilter: "blur(8px)"
        }}
      >
        <div style={{ textAlign: "right", marginBottom: "10px", fontSize: "14px" }}>
          {user ? `Logged in as: ${user.userDetails}` : "Guest User"}
        </div>

        <div style={{ textAlign: "center", marginBottom: "20px" }}>
          <img src="/stevemadden-logo.png" alt="Steve Madden" style={{ height: "60px" }} />
        </div>

        <h2 style={{ fontSize: "2rem", fontWeight: "600", marginBottom: "25px", letterSpacing: "0.5px" }}>
          Business Input
        </h2>

        {/* BUSINESS TYPE DROPDOWN */}
        <div style={{ marginBottom: "20px" }}>
          <label>Business Type:</label><br />
          <div style={{ position: "relative", display: "inline-block" }}></div>
          <select
            style={modernSelectStyle}
            onFocus={(e) => { e.target.style.border = "1px solid black"; e.target.style.boxShadow = "0 0 0 3px rgba(0,0,0,0.1)"; }}
            onBlur={(e)  => { e.target.style.border = "1px solid #ddd";  e.target.style.boxShadow = "0 2px 6px rgba(0,0,0,0.05)"; }}
            value={header.businessType}
            onChange={(e) => {
              const updatedHeader = { ...header, businessType: e.target.value };
              setHeader(updatedHeader);
              localStorage.setItem("businessInputDraft", JSON.stringify({ header: updatedHeader, rows }));
            }}
          >
            <option value="">Select</option>
            <option value="SAF">SAF</option>
            <option value="Retail">Retail</option>
          </select>
        </div>

        <div style={{ marginBottom: "18px" }}>
          {/* DIVISION DROPDOWN */}
          <label>Division:</label><br />
          <div style={{ position: "relative", display: "inline-block" }}></div>
          <select
            style={modernSelectStyle}
            onFocus={(e) => { e.target.style.border = "1px solid black"; e.target.style.boxShadow = "0 0 0 3px rgba(0,0,0,0.1)"; }}
            onBlur={(e)  => { e.target.style.border = "1px solid #ddd";  e.target.style.boxShadow = "0 2px 6px rgba(0,0,0,0.05)"; }}
            value={header.division}
            onChange={(e) => {
              const updatedHeader = { ...header, division: e.target.value };
              setHeader(updatedHeader);
              localStorage.setItem("businessInputDraft", JSON.stringify({ header: updatedHeader, rows }));
            }}
          >
            <option value="">Select</option>
            <option value="F9A">F9A</option>
            <option value="F9B">F9B</option>
          </select>

          {/* YEAR DROPDOWN */}
          <div style={{ marginBottom: "18px" }}>
            <label>Year:</label><br />
            <div style={{ position: "relative", display: "inline-block" }}></div>
            <select
              style={modernSelectStyle}
              onFocus={(e) => { e.target.style.border = "1px solid black"; e.target.style.boxShadow = "0 0 0 3px rgba(0,0,0,0.1)"; }}
              onBlur={(e)  => { e.target.style.border = "1px solid #ddd";  e.target.style.boxShadow = "0 2px 6px rgba(0,0,0,0.05)"; }}
              value={header.year}
              onChange={(e) => {
                const updatedHeader = { ...header, year: e.target.value };
                setHeader(updatedHeader);
                localStorage.setItem("businessInputDraft", JSON.stringify({ header: updatedHeader, rows }));
              }}
            >
              <option value="">Select</option>
              <option value="2026">2026</option>
              <option value="2027">2027</option>
            </select>
          </div>

          <br /><br />

          {/* LOAD TABLE BUTTON */}
          <button
            disabled={!header.businessType || !header.division || !header.year}
            onClick={() => setShowTable(true)}
            style={{
              padding: "12px 28px",
              borderRadius: "30px",
              border: "none",
              background: "linear-gradient(135deg, #000, #222)",
              color: "white",
              fontWeight: "500",
              letterSpacing: "0.5px",
              cursor: "pointer",
              transition: "all 0.2s ease",
              fontFamily: "inherit"
            }}
            onMouseEnter={(e) => e.target.style.transform = "scale(1.05)"}
            onMouseLeave={(e) => e.target.style.transform = "scale(1)"}
          >
            Load Table
          </button>
        </div>

        {/* TABLE SECTION */}
        {showTable && (
          <>
            <h3>
              Entering data for: {header.businessType} | {header.division} | {header.year}
            </h3>

            <div style={{ width: "100%", maxHeight: "400px", borderRadius: "12px", overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "center", tableLayout: "fixed" }}>
                <thead>
                  <tr>
                    {["Month", "Forecast", "Plan", "GM %"].map((h) => (
                      <th key={h} style={{ width: "25%", padding: "12px", backgroundColor: "#000", color: "#fff", position: "sticky", top: 0, zIndex: 2, boxShadow: "0 2px 5px rgba(0,0,0,0.1)" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr
                      key={row.month}
                      style={{ transition: "background 0.2s ease" }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "rgba(0,0,0,0.04)"}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                    >
                      <td style={{ padding: "10px" }}>{getMonthName(row.month)}</td>

                      {/* FORECAST INPUT */}
                      <td style={{ padding: "10px" }}>
                        <input
                          type="text"
                          style={{ borderRadius: "20px", padding: "6px 10px", border: "1px solid #ddd", width: "80%", transition: "all 0.2s ease", outline: "none", fontSize: "13px", textAlign: "center" }}
                          onFocus={(e) => { e.target.style.border = "1px solid black"; e.target.style.boxShadow = "0 0 0 2px rgba(0,0,0,0.1)"; }}
                          onBlur={(e)  => { e.target.style.border = "1px solid #ddd";  e.target.style.boxShadow = "none"; }}
                          inputMode="decimal"
                          value={row.forecast}
                          onChange={(e) => { if (allowOnlyValidNumber(e.target.value)) handleRowChange(index, "forecast", e.target.value); }}
                          onKeyDown={(e) => { if (["e","E","+","-"].includes(e.key)) e.preventDefault(); }}
                        />
                      </td>

                      {/* PLAN INPUT */}
                      <td style={{ padding: "10px" }}>
                        <input
                          type="text"
                          style={{ borderRadius: "20px", padding: "6px 10px", border: "1px solid #ddd", width: "80%", transition: "all 0.2s ease", outline: "none", fontSize: "13px", textAlign: "center" }}
                          onFocus={(e) => { e.target.style.border = "1px solid black"; e.target.style.boxShadow = "0 0 0 2px rgba(0,0,0,0.1)"; }}
                          onBlur={(e)  => { e.target.style.border = "1px solid #ddd";  e.target.style.boxShadow = "none"; }}
                          inputMode="decimal"
                          value={row.plan}
                          onChange={(e) => { if (allowOnlyValidNumber(e.target.value)) handleRowChange(index, "plan", e.target.value); }}
                          onKeyDown={(e) => { if (["e","E","+","-"].includes(e.key)) e.preventDefault(); }}
                        />
                      </td>

                      {/* GM INPUT */}
                      <td style={{ padding: "10px" }}>
                        <input
                          type="text"
                          style={{ borderRadius: "20px", padding: "6px 10px", border: "1px solid #ddd", width: "80%", transition: "all 0.2s ease", outline: "none", fontSize: "13px", textAlign: "center" }}
                          onFocus={(e) => { e.target.style.border = "1px solid black"; e.target.style.boxShadow = "0 0 0 2px rgba(0,0,0,0.1)"; }}
                          onBlur={(e)  => { e.target.style.border = "1px solid #ddd";  e.target.style.boxShadow = "none"; }}
                          inputMode="decimal"
                          value={row.gm}
                          onChange={(e) => { if (allowOnlyValidNumber(e.target.value, 100)) handleRowChange(index, "gm", e.target.value); }}
                          onKeyDown={(e) => { if (["e","E","+","-"].includes(e.key)) e.preventDefault(); }}
                        />
                      </td>
                    </tr>
                  ))}

                  {/* TOTAL ROWS */}
                  {calculateTotals(rows).map((totalRow) => (
                    <tr key={totalRow.label} style={{ fontWeight: "600", backgroundColor: "rgba(0,0,0,0.05)", borderTop: "2px solid #000" }}>
                      <td style={{ padding: "10px" }}>{totalRow.label}</td>
                      <td>{totalRow.forecast}</td>
                      <td>{totalRow.plan}</td>
                      <td>{totalRow.gm}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <br />

            {/* SUBMIT BUTTON */}
            <button
              onClick={() => {
                if (!hasAnyData()) {
                  alert("Please enter at least one value before submitting.");
                  return;
                }
                setShowConfirmModal(true);
              }}
              style={{
                padding: "12px 28px",
                borderRadius: "30px",
                border: "none",
                background: "linear-gradient(135deg, #000, #222)",
                color: "white",
                fontWeight: "500",
                letterSpacing: "0.5px",
                cursor: "pointer",
                transition: "all 0.2s ease",
                fontFamily: "inherit"
              }}
              onMouseEnter={(e) => e.target.style.transform = "scale(1.05)"}
              onMouseLeave={(e) => e.target.style.transform = "scale(1)"}
              disabled={isUploading}
            >
              {isUploading ? "Uploading..." : "Submit"}
            </button>

            {/* LOGOUT BUTTON */}
            <button
              onClick={handleLogout}
              style={{
                padding: "10px 25px",
                borderRadius: "25px",
                border: "none",
                background: "linear-gradient(135deg, #777, #999)",
                color: "white",
                cursor: "pointer",
                marginLeft: "15px",
                fontFamily: "inherit"
              }}
            >
              Logout
            </button>

            {/* CONFIRMATION MODAL */}
            {showConfirmModal && (
              <div
                style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 9999, backdropFilter: "blur(4px)" }}
              >
                <div
                  style={{ width: "90%", maxWidth: "420px", background: "white", padding: "35px 30px", borderRadius: "20px", boxShadow: "0 25px 70px rgba(0,0,0,0.25)", textAlign: "center" }}
                >
                  <h3 style={{ marginBottom: "15px", fontFamily: "inherit" }}>Confirm Submission</h3>
                  <p style={{ marginBottom: "25px", fontSize: "14px", color: "#555" }}>
                    Are you sure you want to submit this data?
                  </p>
                  <div style={{ display: "flex", justifyContent: "center", gap: "15px" }}>
                    <button
                      onClick={() => setShowConfirmModal(false)}
                      style={{ padding: "8px 22px", borderRadius: "25px", border: "1px solid black", background: "white", cursor: "pointer", fontFamily: "inherit" }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => { setShowConfirmModal(false); upload(); }}
                      style={{ padding: "8px 22px", borderRadius: "25px", border: "none", background: "black", color: "white", cursor: "pointer", fontFamily: "inherit" }}
                    >
                      Confirm
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default App;
