import { useState, useEffect } from "react";

const [user, setUser] = useState(null);

useEffect(() => {
  fetch("/.auth/me")
    .then(res => res.json())
    .then(data => {
      if (data.clientPrincipal) {
        setUser(data.clientPrincipal);
      }
    })
    .catch(err => console.error("Auth error:", err));
}, []);

function App() {
  const [submitted, setSubmitted] = useState(false);
  const [submittedData, setSubmittedData] = useState(null);

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

  const [showTable, setShowTable] = useState(false);

  const [header, setHeader] = useState({
    businessType: "",
    division: "",
    year: ""
  });

  const [rows, setRows] = useState(
    Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      forecast: "",
      plan: "",
      gm: ""
    }))
  );

  const handleRowChange = (index, field, value) => {
      const updated = [...rows];
      updated[index][field] = value;
      setRows(updated);
    };

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

  const validateRows = () => {
    for (let row of rows) {
      const fields = ["forecast", "plan", "gm"];

      for (let field of fields) {
        const value = row[field];

        if (value !== "") {
          const num = parseFloat(value);

          if (isNaN(num) || num < 0) {
            return false;
          }

          if (field === "gm" && num > 100) {
            return false;
          }
        }
      }
    }
    return true;
  };


  const upload = async () => {
    if (!validateRows()) {
      alert("Invalid values detected. Please correct inputs.");
      return;
    }

    if (!import.meta.env.VITE_STORAGE_URL || !import.meta.env.VITE_BLOB_SAS) {
      alert("Environment variables missing. Check .env file.");
      return;
    }

    try {
      const payload = {
        userEmail: user?.userDetails,
        userId: user?.userId,
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

    } catch (error) {
      console.error("Upload error:", error);
      alert("Upload crashed. Check console.");
    }
  };


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
  };

  if (!user) {
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
            padding: "50px",
            borderRadius: "20px",
            width: "400px",
            textAlign: "center",
            boxShadow: "0 10px 30px rgba(0,0,0,0.2)"
          }}
        >
          <img
            src="/stevemadden-logo.png"
            alt="Steve Madden"
            style={{ height: "60px", marginBottom: "20px" }}
          />

          <h2>Business Input Portal</h2>

          <button
            onClick={() => (window.location.href = "/.auth/login/aad")}
            style={{
              marginTop: "20px",
              padding: "10px 25px",
              borderRadius: "25px",
              border: "none",
              backgroundColor: "black",
              color: "white",
              cursor: "pointer"
            }}
          >
            Login with Microsoft
          </button>
        </div>
      </div>
    );
  }


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
          boxSizing: "border-box"
          }}
      >
        <div
          style={{
            background: "rgba(255,255,255,0.88)",
            padding: "40px",
            borderRadius: "20px",
            width: "1000px",
            boxShadow: "0 10px 30px rgba(0,0,0,0.2)"
          }}
        >
          {user && (
            <div style={{ textAlign: "right", marginBottom: "10px", fontSize: "14px" }}>
              Logged in as: <strong>{user.userDetails}</strong>
            </div>
          )}
        <div style={{ textAlign: "center", marginBottom: "20px" }}>
          <img
            src="/stevemadden-logo.png"
            alt="Steve Madden"
            style={{ height: "60px" }}
          />
        </div>
        <h2>Submission Successful</h2>

        <p>
          Thank you for submitting data for:
          <br />
          <strong>
            {submittedData.businessType} | {submittedData.division} | {submittedData.year}
          </strong>
        </p>

        <h3>Submitted Values</h3>
      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            textAlign: "center",
            border: "1px solid #000"
          }}
        >
          <thead>
            <tr>
              <th
                style={{
                  padding: "12px",
                  backgroundColor: "#000",
                  color: "#fff",
                  border: "1px solid #000"
                }}
              >Month</th>
              <th
                style={{
                  padding: "12px",
                  backgroundColor: "#000",
                  color: "#fff",
                  border: "1px solid #000"
                }}
              >Forecast</th>
              <th
                style={{
                  padding: "12px",
                  backgroundColor: "#000",
                  color: "#fff",
                  border: "1px solid #000"
                }}
              >Plan</th>
              <th
                style={{
                  padding: "12px",
                  backgroundColor: "#000",
                  color: "#fff",
                  border: "1px solid #000"
                }}
              >GM %</th>
            </tr>
          </thead>
          <tbody>
            {submittedData.months
              .filter(
                (row) =>
                  row.forecast || row.plan || row.gm
              )
              .map((row) => (
                <tr key={row.month}>
                  <td style={{ padding: "10px",border: "1px solid #000" }}>{row.month}</td>
                  <td style={{ padding: "10px",border: "1px solid #000" }}>{row.forecast}</td>
                  <td style={{ padding: "10px",border: "1px solid #000" }}>{row.plan}</td>
                  <td style={{ padding: "10px",border: "1px solid #000" }}>{row.gm}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
        <br />
          <div style={{ marginTop: "20px", textAlign: "center" }}>
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

            <button
              onClick={() => (window.location.href = "/.auth/logout")}
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
        </div>
      </div>
    );
  }

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
        boxSizing: "border-box"
      }}
    >
      <div
        style={{
          background: "rgba(255,255,255,0.88)",
          padding: "40px",
          borderRadius: "20px",
          width: "1000px",
          boxShadow: "0 10px 30px rgba(0,0,0,0.2)"
        }}
      >
        {user && (
            <div style={{ textAlign: "right", marginBottom: "10px", fontSize: "14px" }}>
              Logged in as: <strong>{user.userDetails}</strong>
            </div>
          )}
      <div style={{ textAlign: "center", marginBottom: "20px" }}>
        <img
          src="/stevemadden-logo.png"
          alt="Steve Madden"
          style={{ height: "60px" }}
        />
      </div>

      <h2>Business Input</h2>

      {/* HEADER SECTION */}
      <div style={{ marginBottom: "20px" }}>
        <label>Business Type:</label><br />
        <select
          value={header.businessType}
          onChange={(e) =>
            setHeader({ ...header, businessType: e.target.value })
          }
        >
          <option value="">Select</option>
          <option value="SAF">SAF</option>
          <option value="Retail">Retail</option>
        </select>

        <br /><br />

        <label>Division:</label><br />
        <select
          value={header.division}
          onChange={(e) =>
            setHeader({ ...header, division: e.target.value })
          }
        >
          <option value="">Select</option>
          <option value="F9A">F9A</option>
          <option value="F9B">F9B</option>
        </select>

        <br /><br />

        <label>Year:</label><br />
        <select
          value={header.year}
          onChange={(e) =>
            setHeader({ ...header, year: e.target.value })
          }
        >
          <option value="">Select</option>
          <option value="2026">2026</option>
          <option value="2027">2027</option>
        </select>

        <br /><br />

        <button
          disabled={
            !header.businessType || !header.division || !header.year
          }
          onClick={() => setShowTable(true)}
          style={{
            padding: "10px 25px",
            borderRadius: "25px",
            border: "none",
            backgroundColor: "black",
            color: "white",
            cursor: "pointer"
          }}
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
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              textAlign: "center"
            }}
          >
            <thead>
              <tr>
                <th
                  style={{
                    padding: "12px",
                    backgroundColor: "#000",
                    color: "#fff"
                  }}
                >Month</th>
                <th
                  style={{
                    padding: "12px",
                    backgroundColor: "#000",
                    color: "#fff"
                  }}
                >Forecast</th>
                <th
                  style={{
                    padding: "12px",
                    backgroundColor: "#000",
                    color: "#fff"
                  }}
                >Plan</th>
                <th
                  style={{
                    padding: "12px",
                    backgroundColor: "#000",
                    color: "#fff"
                  }}
                >GM %</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.month}>
                  <td style={{ padding: "10px" }}>{row.month}</td>

                  <td style={{ padding: "10px" }}>
                    <input
                      type="text"
                      style={{
                        borderRadius: "8px",
                        padding: "6px",
                        border: "1px solid #ccc"
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

                  <td style={{ padding: "10px" }}>
                    <input
                      type="text"
                      style={{
                        borderRadius: "8px",
                        padding: "6px",
                        border: "1px solid #ccc"
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

                  <td style={{ padding: "10px" }}>
                    <input
                      type="text"
                      style={{
                        borderRadius: "8px",
                        padding: "6px",
                        border: "1px solid #ccc"
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
            </tbody>
          </table>
        </div>
          <br />

          <button
            onClick={upload}
            style={{
              padding: "10px 25px",
              borderRadius: "25px",
              border: "none",
              backgroundColor: "black",
              color: "white",
              cursor: "pointer"
            }}
          >
            Submit
          </button>

          <button
            onClick={() => (window.location.href = "/.auth/logout")}
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
        </>
      )}
      </div>
    </div>
  );
}

export default App;
