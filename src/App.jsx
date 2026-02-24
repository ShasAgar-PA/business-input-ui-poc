/*****************************************************************************************
  BUSINESS INPUT PORTAL
  ----------------------------------------------------------------------------------------
  This is a React Single Page Application (SPA) that:

  1. Allows user login (Guest or Microsoft AAD)
  2. Lets users enter monthly forecast / plan / GM data
  3. Automatically calculates quarterly + full year totals
  4. Saves draft locally (LocalStorage)
  5. Uploads final JSON to Azure Blob Storage
  6. Shows submission success page with download option

  The UI has 3 major states:
    - Mode Selection Page
    - Main Form Page
    - Submission Success Page

*****************************************************************************************/
import { useState, useEffect } from "react";
import { calculateTotals } from "./utils/calculations";

function App() {
  /*****************************************************************************************
    SECTION 1 — GLOBAL STATE VARIABLES
    ----------------------------------------------------------------------------------------
    These control application behavior and UI state.
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
    appearance: "none",        // Removes default OS styling
    WebkitAppearance: "none",
    MozAppearance: "none",
    boxShadow: "0 2px 6px rgba(0,0,0,0.05)",
    transition: "all 0.2s ease",
    cursor: "pointer"
  };

  // Resuable Cell Style
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
    - If logged in → auto set mode to "aad"
  *****************************************************************************************/

  useEffect(() => {
    fetch("/.auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.clientPrincipal) {
          setUser(data.clientPrincipal);
          setMode("aad"); // automatically go to app if logged in
          localStorage.setItem("appMode", "aad");
        }
      })
      .catch(() => {
        // localhost or no auth
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
      if (parsed.rows) setRows(parsed.rows);
    }
  }, []);

  /*****************************************************************************************
    SECTION 6 — PAGE FADE ANIMATION
  *****************************************************************************************/

  useEffect(() => {
    setFadeIn(false);

    const timer = setTimeout(() => {
      setFadeIn(true);
    }, 50);

    return () => clearTimeout(timer);
  }, [mode, submitted]);

  //prevents background scrolling when modal is open.
  useEffect(() => {
    if (showConfirmModal) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "auto";
    }
  }, [showConfirmModal]);

  /*****************************************************************************************
    SECTION 7 — ROW INPUT HANDLER
    ----------------------------------------------------------------------------------------
    Updates row value and saves draft to localStorage
  *****************************************************************************************/

  const handleRowChange = (index, field, value) => {
      const updated = [...rows];
      updated[index][field] = value;
      setRows(updated);
      localStorage.setItem(
        "businessInputDraft",
        JSON.stringify({
          header,
          rows: updated
        })
      );
    };
  
  /*****************************************************************************************
    SECTION 8 — VALIDATION FUNCTION
    ----------------------------------------------------------------------------------------
    Ensures:
    - Only numbers
    - No negatives
    - GM ≤ 100
  *****************************************************************************************/

  const allowOnlyValidNumber = (value, max = null) => {
    // Allow empty
    if (value === "") return true;

    // Only digits + optional decimal up to 5 places
    const regex = /^\d*\.?\d{0,5}$/;
    if (!regex.test(value)) return false;

    const numeric = parseFloat(value);
    if (numeric < 0) return false;

    if (max !== null && numeric > max) return false;

    return true;
  };  

  /*****************************************************************************************
    SECTION 9 — UPLOAD TO AZURE BLOB STORAGE
    ----------------------------------------------------------------------------------------
    Converts form into JSON and uploads using SAS token.
  *****************************************************************************************/

  const upload = async () => {
    setIsUploading(true);
    if (!validateRows()) {
      alert("Invalid values detected. Please correct inputs.");
      return;
    }

    if (!import.meta.env.VITE_STORAGE_URL || !import.meta.env.VITE_BLOB_SAS) {
      alert("Environment variables missing. Check .env file.");
      return;
    }

    const newSubmissionId = crypto.randomUUID();
    setSubmissionId(newSubmissionId);

    try {
      const payload = {
        submissionId: newSubmissionId,
        userEmail: user ? user.userDetails : "guest@anonymous",
        userId: user ? user.userId : `Guest_${Date.now()}`,
        ...header,
        months: rows,
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
        return;
      }

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
    ----------------------------------------------------------------------------------------
    Clears everything and returns to initial form state.
  *****************************************************************************************/

  const resetForm = () => {
    setHeader({
      businessType: "",
      division: "",
      year: ""
    });

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
    SECTION 11 FUNCTION: downloadJSON
    ----------------------------------------------------------------------------------------
    Purpose:
      Allows the user to download the submitted payload as a formatted JSON file.

    Why this exists:
      - Gives user a local backup of what was submitted
      - Useful for audit, sharing, or offline record keeping
      - Avoids requiring backend re-fetch

    How it works:
      1. Converts JS object → JSON string
      2. Creates a Blob object
      3. Generates temporary browser URL
      4. Programmatically triggers file download
      5. Cleans up memory

    Safety:
      - Does nothing if submittedData is null
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
    SECTION 12 FUNCTION: validateRows
    ----------------------------------------------------------------------------------------
    Purpose:
      Performs full validation on all monthly row inputs before submission.

    What it validates:
      - Only numeric values allowed
      - No negative numbers
      - GM % must not exceed 100
      - Empty fields are allowed

    Why this exists:
      - Prevents corrupt or invalid financial data
      - Ensures backend receives clean data
      - Protects business logic integrity

    Returns:
      true  → all rows valid
      false → at least one invalid value detected
  *****************************************************************************************/

  const validateRows = () => {

    // Iterate through each month row
    for (let row of rows) {
      const fields = ["forecast", "plan", "gm"];

      // Validate each numeric field in the row
      for (let field of fields) {
        const value = row[field];

        // Only validate if user entered something
        if (value !== "") {
          const num = parseFloat(value);

          // Reject if not a number or negative
          if (isNaN(num) || num < 0) {
            return false;
          }

          // Additional validation rule for GM %
          if (field === "gm" && num > 100) {
            return false;
          }
        }
      }
    }
    // If no validation errors found
    return true;
  };

  /*****************************************************************************************
    SECTION 13 FUNCTION: hasAnyData
    ----------------------------------------------------------------------------------------
    Purpose:
      Checks whether user has entered at least one value in the table.

    Why this exists:
      - Prevents empty submissions
      - Avoids unnecessary uploads
      - Improves UX (alerts user before submission)

    Logic:
      Returns true if ANY row contains at least one filled field.
  *****************************************************************************************/

  const hasAnyData = () => {
    return rows.some(
      (row) => row.forecast || row.plan || row.gm
    );
  };

  // Get month name instead of number for Better UI 
  const getMonthName = (monthNumber) => {
    const months = [
      "January", "February", "March",
      "April", "May", "June",
      "July", "August", "September",
      "October", "November", "December"
    ];
    return months[monthNumber - 1];
  };

  /*****************************************************************************************
    SECTION 14 — PAGE RENDERING LOGIC
    ----------------------------------------------------------------------------------------
    React conditionally renders 3 main UI states:
      1. Mode Selection Page
      2. Main Form Page
      3. Submission Success Page
  *****************************************************************************************/

  /*****************************************************************************************
    MODE SELECTION PAGE
    ----------------------------------------------------------------------------------------
    This page is shown ONLY when:
        mode === null

    Meaning:
        - User has not selected Guest
        - User has not logged in via Microsoft
        - App just loaded OR localStorage has no saved mode

    This is the "Entry Screen" of the application.
  *****************************************************************************************/
  if (mode === null) {

    /***************************************************************************************
      OUTER FULL-SCREEN CONTAINER
      --------------------------------------------------------------------------------------
      This div:
        - Covers entire viewport (100vw x 100vh)
        - Displays background image
        - Centers the white card in middle of screen
        - Applies fade-in animation
    ***************************************************************************************/
    return (
      <div
        style={{
          minHeight: "100vh", /* Makes container at least full viewport height */
          width: "100vw", /* Makes container full viewport width */
          display: "flex", /* Enables flexbox layout */
          justifyContent: "center", /* Horizontally centers inner white card */
          alignItems: "center", /* Vertically centers inner white card */
          backgroundImage: "url('/background.jpg')", /* Background image of application */
          backgroundSize: "cover", /* Ensures image covers entire screen */
          backgroundPosition: "center", /* Ensures image covers entire screen */
          fontFamily: "'Montserrat', sans-serif",  /* Global font family */
          opacity: fadeIn ? 1 : 0, /* Fade-in opacity animation */
          transition: "opacity 0.4s ease, transform 0.4s ease", /* Smooth fade + slide transition */
          transform: fadeIn ? "translateY(0px)" : "translateY(10px)" /* Slight upward slide effect during appearance */
        }}
      >
        {/***********************************************************************************
          WHITE CARD CONTAINER
          ----------------------------------------------------------------------------------
          This is the centered login box.
          It sits inside the full-screen background container.
        ***********************************************************************************/}
        <div
          style={{
            background: "rgba(255,255,255,0.95)", /* Slightly transparent white background */
            padding: "50px",/* Internal spacing around content */
            borderRadius: "20px", /* Rounded corners */
            width: "400px",/* Fixed width for login card */
            textAlign: "center", /* Center-align text inside card */
            boxShadow: "0 20px 60px rgba(0,0,0,0.15)", /* Soft shadow for floating card effect */
            backdropFilter: "blur(8px)", /* Glass blur effect on background behind card */
          }}
        >
          {/*********************************************************************************
            LOGO SECTION
            --------------------------------------------------------------------------------
            Displays company branding at top of card.
          *********************************************************************************/}
          <img
            src="/stevemadden-logo.png"
            alt="Steve Madden"
            style={{ height: "60px", marginBottom: "20px" }}
          />
          {/* TITLE SECTION*/}
          <h2>Business Input Portal</h2>
          
          {/*********************************************************************************
            BUTTON 1 — CONTINUE AS GUEST
            --------------------------------------------------------------------------------
            Action:
              - Sets mode to "guest"
              - Saves selection in localStorage
              - Triggers re-render
              - App moves to main form page
          *********************************************************************************/}
          <button
            onClick={() => {
              setMode("guest"); // Update state
              localStorage.setItem("appMode", "guest"); // Persist selection so refresh keeps user in guest mode
            }}
            style={{
              marginTop: "20px", // Space above button
              padding: "10px 25px", // Space above button
              borderRadius: "25px", // Internal spacing
              border: "none", // No border
              backgroundColor: "black", // Black background
              color: "white", // White text
              cursor: "pointer", // White text
              width: "100%" // Full width inside card
            }}
          >
            Continue as Guest
          </button>

          {/*********************************************************************************
            BUTTON 2 — LOGIN WITH MICROSOFT
            --------------------------------------------------------------------------------
            Action:
              - Redirects to Azure Static Web App authentication endpoint
              - After login, Azure returns to app with authenticated user
              - Mode automatically becomes "aad" via useEffect
          *********************************************************************************/}
          <button
            onClick={() => {
              window.location.href = "/.auth/login/aad"; // Redirect to Microsoft AAD login
            }}
            style={{
              marginTop: "15px", // Space between buttons
              padding: "10px 25px", // Internal spacing
              borderRadius: "25px", // Pill shape
              border: "1px solid black", // Outline style
              backgroundColor: "white", // Outline style
              cursor: "pointer", // Pointer cursor
              width: "100%" // Full width inside card
            }}
          >
            Login with Microsoft
          </button>

          {/* END WHITE CARD CONTAINER */}
        </div>

        {/* END FULL SCREEN CONTAINER */}
      </div>
    );
  }

  /*****************************************************************************************
    SUBMISSION SUCCESS PAGE
    ----------------------------------------------------------------------------------------
    This page renders ONLY when:

        submitted === true
        AND
        submittedData exists

    Meaning:
        - Upload to Azure was successful
        - Payload has been saved
        - We now show confirmation + summary

    This acts as:
        - Confirmation screen
        - Audit preview
        - Download screen
  *****************************************************************************************/
  if (submitted && submittedData) {

    /***************************************************************************************
      OUTER FULL-SCREEN CONTAINER
      --------------------------------------------------------------------------------------
      Responsibilities:
        - Covers entire viewport
        - Displays background image
        - Adds padding around centered card
        - Handles fade-in animation
    ***************************************************************************************/
    return (
      <div
        style={{
          minHeight: "100vh", // Full viewport height
          width: "100vw", // Full viewport width
          display: "flex", // Flexbox for centering
          justifyContent: "center", // Horizontal center
          backgroundImage: "url('/background.jpg')", // Background image
          backgroundSize: "cover", // Background image
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center",
          fontFamily: "'Montserrat', sans-serif",
          padding: "40px 20px", // Space around white card
          boxSizing: "border-box",
          /* Fade animation */
          opacity: fadeIn ? 1 : 0,
          transition: "opacity 0.4s ease, transform 0.4s ease",
          transform: fadeIn ? "translateY(0px)" : "translateY(10px)"
          }}
      >
        {/***********************************************************************************
          MAIN WHITE CARD CONTAINER
          ----------------------------------------------------------------------------------
          This is the central confirmation card.
          Contains:
            - User info
            - Submission ID
            - Summary
            - Table
            - Action buttons
        ***********************************************************************************/}
        <div
          style={{
            background: "rgba(255,255,255,0.88)", // Semi-transparent white
            padding: "40px", // Internal spacing
            borderRadius: "20px",  // Rounded corners
            width: "1000px", // Rounded corners
            boxShadow: "0 20px 60px rgba(0,0,0,0.15)",  // Soft shadow
            backdropFilter: "blur(8px)", // Glass blur effect
          }}
        >
          {/*********************************************************************************
            USER INFO (TOP RIGHT)
            --------------------------------------------------------------------------------
            Displays logged in email OR Guest User.
          *********************************************************************************/}
          <div style={{ textAlign: "right", marginBottom: "10px", fontSize: "14px" }}>
            {user
              ? `Logged in as: ${user.userDetails}`
              : "Guest User"}
          </div>
          {/*********************************************************************************
            LOGO CENTERED
          *********************************************************************************/}
          <div style={{ textAlign: "center", marginBottom: "20px" }}>
            <img
              src="/stevemadden-logo.png"
              alt="Steve Madden"
              style={{ height: "60px" }}
            />
          </div>
          {/*********************************************************************************
            SUCCESS MESSAGE SECTION
          *********************************************************************************/}
          <h2>Submission Successful</h2>
        
          {/* Unique submission ID */}
          <p>
            <strong>Submission ID:</strong> {submissionId}
          </p>

          {/* Summary of what was submitted */}
          <p>
            Thank you for submitting data for:
            <br />
            <strong>
              {submittedData.businessType} | {submittedData.division} | {submittedData.year}
            </strong>
          </p>

          <h3>Submitted Values</h3>

          {/*********************************************************************************
            TABLE WRAPPER (Horizontal Scroll Enabled)
            --------------------------------------------------------------------------------
            Ensures table scrolls horizontally on small screens.
          *********************************************************************************/}
          <div style={{
              maxHeight: "400px",
              overflowY: "auto",
              borderRadius: "12px"
            }}>
            {/*******************************************************************************
              DATA TABLE
              ------------------------------------------------------------------------------
              Displays:
                - Only months where data exists
                - Quarter totals
                - Full Year total
            *******************************************************************************/}
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                textAlign: "center",
                border: "1px solid #000"
              }}
            >
              {/* TABLE HEADER */}
              <thead>
                <tr>
                  <th
                    style={{
                      padding: "12px",
                      backgroundColor: "#000",
                      color: "#fff",
                      border: "1px solid #000",
                      position: "sticky",
                      top: 0,
                      zIndex: 2,
                      boxShadow: "0 2px 5px rgba(0,0,0,0.1)"
                    }}
                  >Month</th>
                  <th
                    style={{
                      padding: "12px",
                      backgroundColor: "#000",
                      color: "#fff",
                      border: "1px solid #000",
                      position: "sticky",
                      top: 0,
                      zIndex: 2,
                      boxShadow: "0 2px 5px rgba(0,0,0,0.1)"
                    }}
                  >Forecast</th>
                  <th
                    style={{
                      padding: "12px",
                      backgroundColor: "#000",
                      color: "#fff",
                      border: "1px solid #000",
                      position: "sticky",
                      top: 0,
                      zIndex: 2,
                      boxShadow: "0 2px 5px rgba(0,0,0,0.1)"
                    }}
                  >Plan</th>
                  <th
                    style={{
                      padding: "12px",
                      backgroundColor: "#000",
                      color: "#fff",
                      border: "1px solid #000",
                      position: "sticky",
                      top: 0,
                      zIndex: 2,
                      boxShadow: "0 2px 5px rgba(0,0,0,0.1)"
                    }}
                  >GM %</th>
                </tr>
              </thead>
              {/* TABLE BODY */}
              <tbody>
                {/***************************************************************************
                  DISPLAY ONLY ROWS WITH DATA
                  --------------------------------------------------------------------------
                  Filters out completely empty months.
                ***************************************************************************/}
                {submittedData.months
                  .filter(
                    (row) =>
                      row.forecast || row.plan || row.gm
                  )
                  .map((row) => (
                    <tr key={row.month}>
                      <td style={{ padding: "10px",border: "1px solid #000" }}>{getMonthName(row.month)}</td>
                      <td style={{ padding: "10px",border: "1px solid #000" }}>{row.forecast}</td>
                      <td style={{ padding: "10px",border: "1px solid #000" }}>{row.plan}</td>
                      <td style={{ padding: "10px",border: "1px solid #000" }}>{row.gm}</td>
                    </tr>
                ))}

                {/***************************************************************************
                  CALCULATE AND DISPLAY TOTALS (INLINE FUNCTION)
                  --------------------------------------------------------------------------
                  Computes:
                    - Q1, Q2, Q3, Q4
                    - Full Year

                  NOTE:
                    This logic duplicates earlier calculation logic.
                    In production, should be extracted to shared utility.
                ***************************************************************************/}
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
          {/*********************************************************************************
            ACTION BUTTONS SECTION
            --------------------------------------------------------------------------------
            Provides:
              - Download JSON
              - Submit another
              - Logout
          *********************************************************************************/}
          <div style={{ marginTop: "20px", textAlign: "center" }}>
            {/* Download Submitted JSON */}
            <button
              onClick={downloadJSON}
              style={{
                padding: "10px 25px",
                borderRadius: "25px",
                border: "none",
                backgroundColor: "black",
                color: "white",
                cursor: "pointer",
                marginRight: "15px"
              }}
            >
              Download Submission
            </button>
            
            {/* Reset form and go back */}
            <button
              onClick={resetForm}
              style={{
                padding: "10px 25px",
                borderRadius: "25px",
                border: "none",
                backgroundColor: "black",
                color: "white",
                cursor: "pointer"
              }}
            >
              Submit Another Response
            </button>
            
            {/* Logout from Microsoft */}
            <button
              onClick={() => {
                setUser(null);
                setMode(null);
                localStorage.removeItem("appMode");
                window.location.href = "/.auth/logout";
              }}
              style={{
                padding: "10px 25px",
                borderRadius: "25px",
                border: "none",
                backgroundColor: "#999",
                color: "white",
                cursor: "pointer",
                marginLeft: "15px"
              }}
            >
              Logout
            </button>
          </div>
        {/* END WHITE CARD */}
        </div>
      {/* END FULL SCREEN CONTAINER */}
      </div>
    );
  }

  /*****************************************************************************************
    MAIN FORM PAGE
    ----------------------------------------------------------------------------------------
    This is the primary data-entry screen.

    Responsibilities:
      - Capture header selection (Business Type, Division, Year)
      - Display monthly input table
      - Calculate and show quarterly + full year totals
      - Validate before submission
      - Handle logout
      - Display confirmation modal before upload
  *****************************************************************************************/
  return (

    /***************************************************************************************
      OUTER FULL-SCREEN CONTAINER
      --------------------------------------------------------------------------------------
      - Covers entire viewport
      - Displays background image
      - Centers main card
      - Handles fade-in animation
    ***************************************************************************************/
    <div
      style={{
        minHeight: "100vh", // Full viewport height
        width: "100vw", // Full viewport width
        display: "flex",
        justifyContent: "center",

        backgroundImage: "url('/background.jpg')",
        backgroundSize: "cover",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",

        fontFamily: "'Montserrat', sans-serif",
        padding: "40px 20px",
        boxSizing: "border-box",

        // Fade animation on mount
        opacity: fadeIn ? 1 : 0,
        transition: "opacity 0.4s ease, transform 0.4s ease",
        transform: fadeIn ? "translateY(0px)" : "translateY(10px)"
      }}
    >
      {/*************************************************************************************
        MAIN WHITE CARD CONTAINER
        ------------------------------------------------------------------------------------
        Contains entire form UI.
      **************************************************************************************/}
      <div
        style={{
          background: "rgba(255,255,255,0.88)",
          padding: "40px",
          borderRadius: "20px",
          width: "1000px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
          backdropFilter: "blur(8px)",
        }}
      >
        {/***********************************************************************************
          USER DISPLAY (TOP RIGHT)
          ----------------------------------------------------------------------------------
          Shows logged-in user or guest.
        ***********************************************************************************/}
        <div style={{ textAlign: "right", marginBottom: "10px", fontSize: "14px" }}>
          {user
            ? `Logged in as: ${user.userDetails}`
            : "Guest User"}
        </div>

        {/***********************************************************************************
          LOGO SECTION
        ***********************************************************************************/}
        <div style={{ textAlign: "center", marginBottom: "20px" }}>
          <img
            src="/stevemadden-logo.png"
            alt="Steve Madden"
            style={{ height: "60px" }}
          />
        </div>

        {/***********************************************************************************
          PAGE TITLE
        ***********************************************************************************/}
        <h2
          style={{
            fontSize: "2rem",
            fontWeight: "600",
            marginBottom: "25px",
            letterSpacing: "0.5px"
          }}
        >
          Business Input
        </h2>

        {/************************************************************************************
          HEADER SELECTION SECTION
          ----------------------------------------------------------------------------------
          Allows user to select:
            - Business Type
            - Division
            - Year

          These are required before table loads.
        ************************************************************************************/}
        <div style={{ marginBottom: "20px" }}>
          {/* BUSINESS TYPE DROPDOWN */}
          <label>Business Type:</label><br />
          <div style={{ position: "relative", display: "inline-block" }}></div>
            <select
              style={modernSelectStyle}
              onFocus={(e) => {
                e.target.style.border = "1px solid black";
                e.target.style.boxShadow = "0 0 0 3px rgba(0,0,0,0.1)";
              }}
              onBlur={(e) => {
                e.target.style.border = "1px solid #ddd";
                e.target.style.boxShadow = "0 2px 6px rgba(0,0,0,0.05)";
              }}
              value={header.businessType}
              onChange={(e) => {
                const updatedHeader = {
                  ...header,
                  businessType: e.target.value
                };

                setHeader(updatedHeader);

                // Persist draft in localStorage
                localStorage.setItem(
                  "businessInputDraft",
                  JSON.stringify({
                    header: updatedHeader,
                    rows
                  })
                );
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
              onFocus={(e) => {
                e.target.style.border = "1px solid black";
                e.target.style.boxShadow = "0 0 0 3px rgba(0,0,0,0.1)";
              }}
              onBlur={(e) => {
                e.target.style.border = "1px solid #ddd";
                e.target.style.boxShadow = "0 2px 6px rgba(0,0,0,0.05)";
              }}
              value={header.division}
              onChange={(e) => {
                const updatedHeader = {
                  ...header,
                  division: e.target.value
                };

                setHeader(updatedHeader);

                // Persist draft in localStorage
                localStorage.setItem(
                  "businessInputDraft",
                  JSON.stringify({
                    header: updatedHeader,
                    rows
                  })
                );
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
                onFocus={(e) => {
                  e.target.style.border = "1px solid black";
                  e.target.style.boxShadow = "0 0 0 3px rgba(0,0,0,0.1)";
                }}
                onBlur={(e) => {
                  e.target.style.border = "1px solid #ddd";
                  e.target.style.boxShadow = "0 2px 6px rgba(0,0,0,0.05)";
                }}
                value={header.year}
                onChange={(e) => {
                  const updatedHeader = {
                    ...header,
                    year: e.target.value
                  };

                  setHeader(updatedHeader);

                  // Persist draft in localStorage
                  localStorage.setItem(
                    "businessInputDraft",
                    JSON.stringify({
                      header: updatedHeader,
                      rows
                    })
                  );
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
            disabled={
              !header.businessType || !header.division || !header.year
            }
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
              transition: "all 0.2s ease"
            }}
            onMouseEnter={(e) => e.target.style.transform = "scale(1.05)"}
            onMouseLeave={(e) => e.target.style.transform = "scale(1)"}
          >
            Load Table
          </button>
        </div>

      {/************************************************************************************
          TABLE SECTION (ONLY RENDERS AFTER HEADER COMPLETE)
        ************************************************************************************/}
      {showTable && (
        <>
          <h3>
            Entering data for: {header.businessType} | {header.division} | {header.year}
          </h3>

          <div style={{ width: "100%", 
                        maxHeight: "400px",
                        borderRadius: "12px",
                        overflowY: "auto",  }}>

            {/******************************************************************************
              DATA ENTRY TABLE
              ----------------------------------------------------------------------------
              Displays:
                - 12 months
                - Forecast input
                - Plan input
                - GM input
                - Auto-calculated totals
            ******************************************************************************/}
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                textAlign: "center",
                tableLayout: "fixed" 
              }}
            >
              <thead>
                <tr>
                  <th
                    style={{
                      width: "25%",
                      padding: "12px",
                      backgroundColor: "#000",
                      color: "#fff",
                      position: "sticky",
                      top: 0,
                      zIndex: 2,
                      boxShadow: "0 2px 5px rgba(0,0,0,0.1)"
                    }}
                  >Month</th>
                  <th
                    style={{
                      width: "25%",
                      padding: "12px",
                      backgroundColor: "#000",
                      color: "#fff",
                      position: "sticky",
                      top: 0,
                      zIndex: 2,
                      boxShadow: "0 2px 5px rgba(0,0,0,0.1)"
                    }}
                  >Forecast</th>
                  <th
                    style={{
                      width: "25%",
                      padding: "12px",
                      backgroundColor: "#000",
                      color: "#fff",
                      position: "sticky",
                      top: 0,
                      zIndex: 2,
                      boxShadow: "0 2px 5px rgba(0,0,0,0.1)"
                    }}
                  >Plan</th>
                  <th
                    style={{
                      width: "25%",
                      padding: "12px",
                      backgroundColor: "#000",
                      color: "#fff",
                      position: "sticky",
                      top: 0,
                      zIndex: 2,
                      boxShadow: "0 2px 5px rgba(0,0,0,0.1)"
                    }}
                  >GM %</th>
                </tr>
              </thead>
            <tbody>
              
              {/**************************************************************************
                  MONTHLY ROWS
                  ------------------------------------------------------------------------
                  Each row:
                    - Displays month name
                    - Allows numeric input
                    - Restricts invalid characters
                    - Calls handleRowChange on update
                ***************************************************************************/}
              {rows.map((row, index) => (
                <tr
                  key={row.month}
                  style={{ transition: "background 0.2s ease" }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor = "rgba(0,0,0,0.04)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor = "transparent")
                  }
                >
                  <td style={{ padding: "10px" }}>{getMonthName(row.month)}</td>

                  {/* FORECAST INPUT */}
                  <td style={{ padding: "10px" }}>
                    <input
                      type="text"
                      style={{
                        borderRadius: "20px",
                        padding: "6px 10px",
                        border: "1px solid #ddd",
                        width: "80%",
                        transition: "all 0.2s ease",
                        outline: "none",
                        fontSize: "13px",
                        textAlign: "center",
                      }}
                      onFocus={(e) => {
                        e.target.style.border = "1px solid black";
                        e.target.style.boxShadow = "0 0 0 2px rgba(0,0,0,0.1)";
                      }}
                      onBlur={(e) => {
                        e.target.style.border = "1px solid #ddd";
                        e.target.style.boxShadow = "none";
                      }}
                      inputMode="decimal"
                      value={row.forecast}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (allowOnlyValidNumber(val)) {
                          handleRowChange(index, "forecast", val);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (["e", "E", "+", "-"].includes(e.key)) {
                          e.preventDefault();
                        }
                      }}
                    />
                  </td>

                  {/* PLAN INPUT */}
                  <td style={{ padding: "10px" }}>
                    <input
                      type="text"
                      style={{
                        borderRadius: "20px",
                        padding: "6px 10px",
                        border: "1px solid #ddd",
                        width: "80%",
                        transition: "all 0.2s ease",
                        outline: "none",
                        fontSize: "13px",
                        textAlign: "center",
                      }}
                      onFocus={(e) => {
                        e.target.style.border = "1px solid black";
                        e.target.style.boxShadow = "0 0 0 2px rgba(0,0,0,0.1)";
                      }}
                      onBlur={(e) => {
                        e.target.style.border = "1px solid #ddd";
                        e.target.style.boxShadow = "none";
                      }}
                      inputMode="decimal"
                      value={row.plan}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (allowOnlyValidNumber(val)) {
                          handleRowChange(index, "plan", val);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (["e", "E", "+", "-"].includes(e.key)) {
                          e.preventDefault();
                        }
                      }}
                    />
                  </td>

                  {/* GM INPUT (MAX 100%) */}
                  <td style={{ padding: "10px" }}>
                    <input
                      type="text"
                      style={{
                        borderRadius: "20px",
                        padding: "6px 10px",
                        border: "1px solid #ddd",
                        width: "80%",
                        transition: "all 0.2s ease",
                        outline: "none",
                        fontSize: "13px",
                        textAlign: "center",
                      }}
                      onFocus={(e) => {
                        e.target.style.border = "1px solid black";
                        e.target.style.boxShadow = "0 0 0 2px rgba(0,0,0,0.1)";
                      }}
                      onBlur={(e) => {
                        e.target.style.border = "1px solid #ddd";
                        e.target.style.boxShadow = "none";
                      }}
                      inputMode="decimal"
                      value={row.gm}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (allowOnlyValidNumber(val, 100)) {
                          handleRowChange(index, "gm", val);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (["e", "E", "+", "-"].includes(e.key)) {
                          e.preventDefault();
                        }
                      }}
                    />
                  </td>
                </tr>
              ))}

              {/**************************************************************************
                  TOTAL ROWS
                  ------------------------------------------------------------------------
                  Uses shared utility:
                      calculateTotals(rows)

                  Displays:
                      - Q1
                      - Q2
                      - Q3
                      - Q4
                      - Full Year
                ***************************************************************************/}
              {calculateTotals(rows).map((totalRow) => (
                <tr
                  key={totalRow.label}
                  style={{
                    fontWeight: "600",
                    backgroundColor: "rgba(0,0,0,0.05)",
                    borderTop: "2px solid #000"
                  }}
                >
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

          {/**************************************************************************
              SUBMIT BUTTON
              ------------------------------------------------------------------------
              Validates:
                - At least one value entered
              Then:
                - Opens confirmation modal
            ***************************************************************************/}
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
              transition: "all 0.2s ease"
            }}
            onMouseEnter={(e) => e.target.style.transform = "scale(1.05)"}
            onMouseLeave={(e) => e.target.style.transform = "scale(1)"}
            disabled={isUploading}
          >
            {isUploading ? "Uploading..." : "Submit"}
          </button>

          {/* LOGOUT BUTTON */}
          <button
            onClick={() => {
              setUser(null);
              setMode(null);
              localStorage.removeItem("appMode");
              window.location.href = "/.auth/logout";
            }}
            style={{
              padding: "10px 25px",
              borderRadius: "25px",
              border: "none",
              background: "linear-gradient(135deg, #777, #999)",
              color: "white",
              cursor: "pointer",
              marginLeft: "15px"
            }}
          >
            Logout
          </button>
        
          {/**************************************************************************
            CONFIRMATION MODAL
            ------------------------------------------------------------------------
            Displays before actual upload.

            User must confirm submission.
          ***************************************************************************/}
          {showConfirmModal && (
            <div
              style={{
                position: "fixed",
                inset: 0, // shorthand for top:0, left:0, right:0, bottom:0
                backgroundColor: "rgba(0,0,0,0.5)",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                zIndex: 9999,
                backdropFilter: "blur(4px)"
              }}
            >
              <div
                style={{
                  width: "90%",
                  maxWidth: "420px",
                  background: "white",
                  padding: "35px 30px",
                  borderRadius: "20px",
                  boxShadow: "0 25px 70px rgba(0,0,0,0.25)",
                  textAlign: "center",
                  animation: "fadeScaleIn 0.2s ease"
                }}
              >
                <h3 style={{ marginBottom: "15px" }}>
                  Confirm Submission
                </h3>

                <p style={{ marginBottom: "25px", fontSize: "14px", color: "#555" }}>
                  Are you sure you want to submit this data?
                </p>

                <div style={{ display: "flex", justifyContent: "center", gap: "15px" }}>
                  <button
                    onClick={() => setShowConfirmModal(false)}
                    style={{
                      padding: "8px 22px",
                      borderRadius: "25px",
                      border: "1px solid black",
                      background: "white",
                      cursor: "pointer"
                    }}
                  >
                    Cancel
                  </button>

                  <button
                    onClick={() => {
                      setShowConfirmModal(false);
                      upload();
                    }}
                    style={{
                      padding: "8px 22px",
                      borderRadius: "25px",
                      border: "none",
                      background: "black",
                      color: "white",
                      cursor: "pointer"
                    }}
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
