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

  const upload = async () => {
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
                    <input type="number"
                      value={row.forecast}
                      onChange={(e) => handleRowChange(index, "forecast", e.target.value)} />
                  </td>
                  <td>
                    <input type="number"
                      value={row.plan}
                      onChange={(e) => handleRowChange(index, "plan", e.target.value)} />
                  </td>
                  <td>
                    <input type="number" min="0" max="100" step="0.01"
                      value={row.gm}
                      onChange={(e) => handleRowChange(index, "gm", e.target.value)} />
                  </td>
                  <td>
                    <input type="number"
                      value={row.exCost}
                      onChange={(e) => handleRowChange(index, "exCost", e.target.value)} />
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
