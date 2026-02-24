/*****************************************************************************************
  calculateTotals
  ----------------------------------------------------------------------------------------
  Shared utility function to calculate:
    - Q1, Q2, Q3, Q4 totals
    - Full Year totals

  Used by:
    - Main Form Page
    - Submission Success Page

  Input:
    months (array of 12 month objects)

  Output:
    Array of total rows
*****************************************************************************************/

export const calculateTotals = (months) => {
  const quarters = [
    { name: "Q1 (Jan-Mar)", start: 0, end: 3 },
    { name: "Q2 (Apr-Jun)", start: 3, end: 6 },
    { name: "Q3 (Jul-Sep)", start: 6, end: 9 },
    { name: "Q4 (Oct-Dec)", start: 9, end: 12 }
    ];

  const results = quarters.map((q) => {
    let forecast = 0;
    let plan = 0;
    let gmTotal = 0;
    let gmCount = 0;

    months.slice(q.start, q.end).forEach((row) => {
      if (row.forecast) forecast += parseFloat(row.forecast);
      if (row.plan) plan += parseFloat(row.plan);
      if (row.gm) {
        gmTotal += parseFloat(row.gm);
        gmCount++;
      }
    });

    return {
      label: q.name,
      forecast: forecast.toFixed(2),
      plan: plan.toFixed(2),
      gm: gmCount ? (gmTotal / gmCount).toFixed(2) : "0.00"
    };
  });

  // Full Year
  let fyForecast = 0;
  let fyPlan = 0;
  let fyGM = 0;
  let fyCount = 0;

  months.forEach((row) => {
    if (row.forecast) fyForecast += parseFloat(row.forecast);
    if (row.plan) fyPlan += parseFloat(row.plan);
    if (row.gm) {
      fyGM += parseFloat(row.gm);
      fyCount++;
    }
  });

  results.push({
    label: "Full Year",
    forecast: fyForecast.toFixed(2),
    plan: fyPlan.toFixed(2),
    gm: fyCount ? (fyGM / fyCount).toFixed(2) : "0.00"
  });

  return results;
};