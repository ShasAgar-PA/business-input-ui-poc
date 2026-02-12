import { useState } from "react";

function App() {
  const [loading, setLoading] = useState(false);

  const upload = async () => {
    try {
      setLoading(true);

      const payload = {
        businessType: "SAF",
        division: "F9A",
        year: 2026,
        rows: [
          { month: 1, forecast: 100, plan: 200, gmPercent: 20, exCost: 50 }
        ],
        submittedAt: new Date().toISOString()
      };

      const containerUrl = import.meta.env.VITE_STORAGE_URL;
      const sas = import.meta.env.VITE_BLOB_SAS;

      const fileName = `year=${payload.year}/${Date.now()}.json`;
      const url = `${containerUrl}/${fileName}${sas}`;

      const response = await fetch(url, {
        method: "PUT",
        headers: {
          "x-ms-blob-type": "BlockBlob",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      alert("Upload successful!");
    } catch (err) {
      alert("Error uploading file");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 40 }}>
      <h2>Business Forecast Upload (POC)</h2>
      <button onClick={upload} disabled={loading}>
        {loading ? "Uploading..." : "Submit"}
      </button>
    </div>
  );
}

export default App;
