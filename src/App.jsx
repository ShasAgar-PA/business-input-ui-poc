import { useState } from "react";

function App() {
  const [page, setPage] = useState(1);

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
      gm: "",
      exCost: ""
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
      const fields = ["forecast", "plan", "gm", "exCost"];

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

    const payload = {
      ...header,
      months: rows
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
      alert("Upload failed");
    } else {
      alert("Upload successful");
    }
  };

  return (
    <div style={{ padding: "30px", fontFamily: "Arial" }}>
      {page === 1 && (
        <>
          <h2>Business Input - Header</h2>

          <label>Business Type:</label><br/>
          <select onChange={(e) => setHeader({ ...header, businessType: e.target.value })}>
            <option value="">Select</option>
            <option value="SAF">SAF</option>
            <option value="Retail">Retail</option>
          </select>

          <br/><br/>

          <label>Division:</label><br/>
          <select onChange={(e) => setHeader({ ...header, division: e.target.value })}>
            <option value="">Select</option>
            <option value="F9A">F9A</option>
            <option value="F9B">F9B</option>
          </select>

          <br/><br/>

          <label>Year:</label><br/>
          <select onChange={(e) => setHeader({ ...header, year: e.target.value })}>
            <option value="">Select</option>
            <option value="2026">2026</option>
            <option value="2027">2027</option>
          </select>

          <br/><br/>

          <button disabled={!header.businessType || !header.division || !header.year}
                  onClick={() => setPage(2)}>
            Next
          </button>
        </>
      )}

      {page === 2 && (
        <>
          <h2>Monthly Input</h2>

          <table border="1" cellPadding="8">
            <thead>
              <tr>
                <th>Month</th>
                <th>Forecast</th>
                <th>Plan</th>
                <th>GM %</th>
                <th>Ex Cost</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.month}>
                  <td>{row.month}</td>
                  <td>
                    <input
                    type="text"
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
                  <td>
                    <input
                      type="text"
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
                  <td>
                    <input
                      type="text"
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
                  <td>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={row.exCost}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (allowOnlyValidNumber(val)) {
                          handleRowChange(index, "exCost", val);
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

          <br/>

          <button onClick={() => setPage(1)}>Back</button>
          <button onClick={upload}>Submit</button>
        </>
      )}
    </div>
  );
}

export default App;
