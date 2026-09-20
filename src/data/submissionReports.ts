import type { FuelSubmissionEntry } from "./fuelSubmissionStore";
import type { ServiceEntryRecord } from "./serviceEntryStore";

export const submissionHeaders = ["Date", "Shift", "Record ID", "Entry Type", "Employee", "Asset", "Work Order", "Source / Work Area", "SMU", "Product", "Litres", "Status", "Comments"];
export function submissionReportRows(fuel: FuelSubmissionEntry[], services: ServiceEntryRecord[], date: string, shift = "All", area?: string): (string | number)[][] {
  const inPeriod = (row: { date?: string; shift?: string }) => row.date === date && (shift === "All" || row.shift === shift);
  const serviceById = new Map(services.map(entry => [entry.id, entry]));
  const serviceRows = [...new Map(services.map(entry => [entry.id, entry])).values()].filter(inPeriod).flatMap(entry => {
    const items = entry.oils.length ? entry.oils : [{ product: "Service record (fuel listed separately)", litres: 0, source: entry.workArea ?? entry.fuelSource, comments: "" }];
    return items.filter(oil => !area || oil.source === area || entry.workArea === area).map(oil => [entry.date, entry.shift ?? "Not recorded", entry.id, "Service", entry.employee, entry.assetNumber, entry.workOrder ?? "", "sourceLocation" in oil ? String(oil.sourceLocation ?? oil.source) : oil.source, entry.smu, oil.product, oil.litres, entry.submitted ? "Submitted" : "Not Submitted", [oil.comments, entry.comments].filter(Boolean).join("; ")]);
  });
  const fuelRows = [...new Map(fuel.map(entry => [entry.id, entry])).values()].filter(inPeriod).filter(entry => !area || entry.fuelSource === area).map(entry => {
    const service = entry.serviceEntryId ? serviceById.get(entry.serviceEntryId) : undefined;
    return [entry.date!, entry.shift ?? "Not recorded", entry.id, "Fuel", entry.employee, entry.asset, entry.workOrder ?? service?.workOrder ?? "", entry.fuelSource, entry.smu ?? "", "Diesel", entry.litres, entry.submitted ? "Submitted" : "Not Submitted", ""];
  });
  return [...fuelRows, ...serviceRows];
}

export function csvReport(headers: string[], rows: (string | number)[][]) {
  const cell = (value: string | number) => {
    const text = typeof value === "string" && /^[\s]*[=+@-]/.test(value) ? `'${value}` : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  };
  return [headers, ...rows].map(row => row.map(cell).join(",")).join("\n");
}

export function submissionWorkbook(rows: (string | number)[][], period: string) {
  const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const content = [[period], submissionHeaders, ...rows].map(row => `<Row>${row.map(value => `<Cell><Data ss:Type="${typeof value === "number" ? "Number" : "String"}">${escape(String(value))}</Data></Cell>`).join("")}</Row>`).join("");
  return `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Submissions"><Table>${submissionHeaders.map(() => '<Column ss:Width="150"/>').join("")}${content}</Table></Worksheet></Workbook>`;
}

export function markPeriodSubmitted<T extends { employee: string; date?: string; shift?: string; submitted: boolean }>(rows: T[], employee: string, date: string, shift: string): T[] {
  return rows.map(row => row.employee === employee && row.date === date && row.shift === shift ? { ...row, submitted: true } : row);
}
