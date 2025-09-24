import { useEffect, useMemo, useState } from "react";
import DataTable from "react-data-table-component";
import { db } from "../../firebase";
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { exportToCSV, exportToPDF } from "../functions/exportFunctions";
import { getAuth } from "firebase/auth";

export default function RouteManagementSuper() {
  const auth = getAuth();
  const currentUser = auth.currentUser;

  const primaryColor = "#364C6E";

  // -------------------- ROUTES DATA --------------------
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  // UI state
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [routeFilter, setRouteFilter] = useState("");
  const [barangayFilter, setBarangayFilter] = useState("");
  const [particularFilter, setParticularFilter] = useState("");

  // Add route modal
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [maxRouteId, setMaxRouteId] = useState(0);
  const [form, setForm] = useState({
    Route: "",
    Barangay: "",
    Particular: "",
    KM: "",
    Status: "Active",
  });

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const toggleDropdown = () => {
    setIsDropdownOpen((prev) => !prev);
  };

  // Field-level errors (Add Route)
  const [errors, setErrors] = useState({});

  const [showAddToast, setShowAddToast] = useState(false);
  const [showEditToast, setShowEditToast] = useState(false);

  // View/Edit modal
  const [viewing, setViewing] = useState(null);
  const [edit, setEdit] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "routes"),
      (snap) => {
        const items = [];
        let maxId = 0;
        snap.forEach((d) => {
          const x = d.data() || {};
          const routeId = Number(x.routeId ?? d.id ?? 0) || 0;
          if (routeId > maxId) maxId = routeId;
          items.push({
            id: d.id,
            routeId,
            Route: x.Route ?? "",
            Barangay: x.Barangay ?? "",
            Particular: x.Particular ?? "",
            KM: Number(x.KM ?? 0),
            Status: x.Status ?? x.isActive ?? "Active",
          });
        });
        items.sort((a, b) => a.routeId - b.routeId);
        setRows(items);
        setMaxRouteId(maxId);
        setLoading(false);
      },
      (e) => {
        setErr(e.message || "Failed to load routes");
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  // Filter dropdown options
  const routeOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.Route).filter(Boolean))).sort(),
    [rows]
  );
  const barangayOptions = useMemo(() => {
    // Filter the rows to get barangays that match the selected route
    return Array.from(
      new Set(
        rows
          .filter((r) => !routeFilter || r.Route === routeFilter) // Filter rows by selected route
          .map((r) => r.Barangay) // Get the Barangay from filtered rows
          .filter(Boolean) // Remove any empty or undefined barangays
      )
    ).sort(); // Sort the barangays alphabetically
  }, [rows, routeFilter]);
  const particularOptions = useMemo(() => {
    // Filter rows to get particulars that match both the selected route and barangay
    return Array.from(
      new Set(
        rows
          .filter(
            (r) =>
              (!routeFilter || r.Route === routeFilter) && // Filter by selected route
              (!barangayFilter || r.Barangay === barangayFilter) // Filter by selected barangay
          )
          .map((r) => r.Particular) // Get the Particular from filtered rows
          .filter(Boolean) // Remove any empty or undefined particulars
      )
    ).sort(); // Sort the particulars alphabetically
  }, [rows, routeFilter, barangayFilter]); // Recalculate when rows, routeFilter, or barangayFilter changes

  // Apply filters + search
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase(); // Normalize the search string
    return rows.filter((r) => {
      const text =
        `${r.routeId} ${r.Route} ${r.Barangay} ${r.Particular} ${r.KM} ${r.Status}`.toLowerCase();

      // Check if the search term matches any text in the row
      const matchesSearch = !s || text.includes(s);

      // Apply each filter condition dynamically
      const matchesStatus = !statusFilter || r.Status === statusFilter;
      const matchesRoute = !routeFilter || r.Route === routeFilter;
      const matchesBarangay = !barangayFilter || r.Barangay === barangayFilter;
      const matchesParticular =
        !particularFilter || r.Particular === particularFilter;

      // Final check for all filters
      return (
        matchesSearch &&
        matchesStatus &&
        matchesRoute &&
        matchesBarangay &&
        matchesParticular
      );
    });
  }, [
    rows,
    search,
    statusFilter,
    routeFilter,
    barangayFilter,
    particularFilter,
  ]);

  // ---- formatting helpers ----
  const nfInt = useMemo(() => new Intl.NumberFormat("en-PH"), []);

  const Numeric = ({ children }) => (
    <span
      style={{ fontVariantNumeric: "tabular-nums" }}
      className="inline-flex w-full justify-end"
    >
      {children}
    </span>
  );

  const StatusBadge = ({ value }) => {
    const isActive = (value || "").toLowerCase() === "active";
    return (
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
          isActive
            ? "bg-green-100 text-green-700 border border-green-200"
            : "bg-gray-100 text-gray-700 border border-gray-200"
        }`}
      >
        <span
          className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${
            isActive ? "bg-green-500" : "bg-gray-400"
          }`}
        />
        {isActive ? "Active" : "Inactive"}
      </span>
    );
  };

  const headers = [
    "Route ID",
    "Route",
    "Barangay",
    "Particular",
    "KM",
    "Status",
  ];
  const exportRows = filtered.map((r) => [
    r.routeId,
    r.Route,
    r.Barangay,
    r.Particular,
    r.KM,
    r.Status,
  ]);
  const handleExportToCSV = () => {
    if (!filtered || filtered.length === 0) {
      alert("No data to export.");
      return;
    }
    exportToCSV(
      columns,
      exportRows,
      "Route_Management.csv",
      currentUser.email || "Unknown"
    );
  };

  const handleExportToPDF = () => {
    if (!filtered || filtered.length === 0) {
      alert("No data to export.");
      return;
    }
    exportToPDF(
      headers,
      exportRows,
      "Route Management",
      "Route_Management.pdf",
      currentUser.email || "Unknown"
    );
  };

  // -------------------- TABLE COLUMNS --------------------
  const columns = [
    {
      name: "Route ID",
      selector: (r) => r.routeId,
      sortable: true,
      right: true,
      width: "130px",
      cell: (r) => <Numeric>{nfInt.format(r.routeId)}</Numeric>,
    },
    {
      name: "Route",
      selector: (r) => r.Route,
      sortable: true,
      width: "160px",
      grow: 0,
      style: { justifyContent: "flex-end", marginLeft: "3rem" },
      cell: (r) => (
        <div className="truncate" style={{ maxWidth: 200 }} title={r.Route}>
          {r.Route}
        </div>
      ),
    },
    {
      name: "Barangay",
      selector: (r) => r.Barangay,
      sortable: true,
      width: "170px",
      grow: 1,
      style: { justifyContent: "flex-start", marginLeft: "6rem" },
      cell: (r) => (
        <div className="truncate" style={{ maxWidth: 200 }} title={r.Barangay}>
          {r.Barangay}
        </div>
      ),
    },
    {
      name: "Particular",
      selector: (r) => r.Particular,
      sortable: true,
      width: "150px",
      grow: 2,
      style: { justifyContent: "flex-start", marginLeft: "20px" },
      cell: (r) => (
        <div
          className="truncate"
          style={{ maxWidth: 260 }}
          title={r.Particular}
        >
          {r.Particular}
        </div>
      ),
    },
    {
      name: "KM",
      selector: (r) => r.KM,
      sortable: true,
      right: true,
      width: "80px",
      grow: 2,
      style: { justifyContent: "flex-end", marginLeft: "1.5rem" },
      cell: (r) => <Numeric>{nfInt.format(r.KM)}</Numeric>,
    },
    {
      name: "Status",
      selector: (r) => r.Status,
      sortable: true,
      center: true,
      width: "150px",
      style: { marginLeft: "3rem" },
      cell: (r) => (
        <div className="w-full flex justify-center">
          <StatusBadge value={r.Status} />
        </div>
      ),
    },
    {
      name: "Action",
      button: true,
      center: true,
      width: "4rem",
      grow: 2,
      style: { marginLeft: "3rem" },
      cell: (row) => (
        <button
          onClick={() => {
            setViewing(row);
            setEdit({
              Route: row.Route,
              Barangay: row.Barangay,
              Particular: row.Particular,
              KM: row.KM,
              Status: row.Status,
            });
          }}
          className="group inline-flex items-center justify-center h-9 w-9 rounded-full border border-gray-200 bg-white text-gray-600 hover:shadow-md transition hover:-translate-y-0.5"
          style={{ backgroundColor: "#fff" }}
          title="View"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4 transition group-hover:scale-105"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M12 5c-5 0-9 3.5-10 7 1 3.5 5 7 10 7s9-3.5 10-7c-1-3.5-5-7-10-7Zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10Zm0-2.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
          </svg>
        </button>
      ),
      ignoreRowClick: true,
      allowOverflow: true,
    },
  ];

  // ---------- TABLE STYLES ----------
  const tableStyles = {
    table: {
      style: {
        borderRadius: "1rem",
        width: "88%",
        tableLayout: "fixed",
        marginLeft: "3rem",
      },
    },
    headRow: {
      style: {
        minHeight: "40px",
        backgroundColor: "#364C6E",
        borderTopLeftRadius: "0.75rem",
        borderTopRightRadius: "0.75rem",
        borderBottom: "1px solid #e5e7eb",
        position: "sticky",
        top: 0,
        zIndex: 1,
      },
    },
    headCells: {
      style: {
        fontWeight: 700,
        color: "#ffffffff",
        fontSize: "14px",
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        padding: "12px 18px",
        textAlign: "center",
        marginLeft: "2.6rem",
      },
    },
    rows: {
      style: {
        minHeight: "42px",
        borderBottom: "1px solid #f1f5f9",
      },
      highlightOnHoverStyle: {
        backgroundColor: "#e2e2e2ff",
        transition: "background 120ms ease",
      },
      stripedStyle: {
        backgroundColor: "#f8f8f8ff",
      },
    },
    cells: {
      style: {
        padding: "10px 10px",
        alignItems: "center",
        fontSize: "14px",
        color: "#0f172a",
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      },
    },
    pagination: {
      style: { borderTop: "1px solid #e5e7eb" },
    },
  };

  // -------------- Add Route --------------
  const openAdd = () => {
    setIsAddOpen(true);
    setErrors({});
  };

  const closeAdd = () => {
    setIsAddOpen(false);
    setForm({
      Route: "",
      Barangay: "",
      Particular: "",
      KM: "",
      Status: "Active",
    });
    setErrors({});
  };

  const onForm = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => {
        const n = { ...prev };
        delete n[name];
        return n;
      });
    }
  };

  const saveRoute = async () => {
    const newErrors = {};
    if (!form.Route.trim()) newErrors.Route = "Please fill out this field";
    if (!form.Barangay.trim())
      newErrors.Barangay = "Please fill out this field";
    if (!form.Particular.trim())
      newErrors.Particular = "Please fill out this field";
    if (form.KM === "" || isNaN(Number(form.KM)))
      newErrors.KM = "Please enter a valid number";

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    setSaving(true);
    try {
      const q = query(
        collection(db, "routes"),
        where("Route", "==", form.Route.trim()),
        where("Particular", "==", form.Particular.trim()),
        where("Barangay", "==", form.Barangay.trim()),
        where("KM", "==", Number(form.KM))
      );

      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        setSaving(false);
        alert("This exact route already exists.");
        return;
      }

      const nextId = maxRouteId + 1;
      await setDoc(doc(db, "routes", String(nextId)), {
        routeId: nextId,
        Route: form.Route.trim(),
        Particular: form.Particular.trim(),
        Barangay: form.Barangay.trim(),
        KM: Number(form.KM),
        Status: form.Status || "Active",
      });

      closeAdd();
      setShowAddToast(true);
      setTimeout(() => setShowAddToast(false), 3000);
    } catch (e) {
      alert(e.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  // -------------- Save Edits from View Modal --------------
  const saveEdits = async () => {
    if (!viewing || !edit) return;

    setSavingEdit(true);
    try {
      await setDoc(
        doc(db, "routes", String(viewing.id)),
        {
          Status: edit.Status || "Active",
        },
        { merge: true }
      );

      setViewing(null);
      setEdit(null);

      setShowEditToast(true);
      setTimeout(() => setShowEditToast(false), 3000);
    } catch (e) {
      alert(e.message || String(e));
    } finally {
      setSavingEdit(false);
    }
  };

  useEffect(() => {
    // Cleanup timeout when component unmounts
    return () => {
      if (showEditToast) {
        clearTimeout();
      }
    };
  }, [showEditToast]);

  return (
    <div className="flex bg-gray-100 min-h-screen">
      {/* Sidebar */}

      {/* Main Content */}
      <main className="flex-1 p-10 mx-auto">
        <div className="mx-auto max-w-[1800px]">
          <div
            className={`bg-white border rounded-xl shadow-sm relative ${
              isAddOpen || (viewing && edit) ? "overflow-hidden" : ""
            }`}
            style={{
              height: "54rem", // Fixed height for the entire frame
            }}
          >
            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b flex items-center justify-between">
              <h1 className="text-2xl font-semibold text-gray-800">
                Route Management
              </h1>

              <div className="flex items-center gap-4">
                {/* Export Button */}
                <div className="relative">
                  <button
                    onClick={toggleDropdown}
                    className="flex items-center gap-2 px-6 py-2 rounded-lg text-white shadow-md hover:shadow-lg transition"
                    style={{ backgroundColor: primaryColor }}
                  >
                    <span className="font-semibold">Export</span>
                  </button>

                  {isDropdownOpen && (
                    <div className="absolute right-0 w-40 mt-2 bg-white shadow-lg rounded-lg z-10">
                      <ul className="text-sm">
                        <li>
                          <button
                            onClick={handleExportToCSV}
                            className="block px-4 py-2 text-gray-800 hover:bg-gray-100 w-full text-left"
                          >
                            Export to Excel
                          </button>
                        </li>
                        <li>
                          <button
                            onClick={handleExportToPDF}
                            className="block px-4 py-2 text-gray-800 hover:bg-gray-100 w-full text-left"
                          >
                            Export to PDF
                          </button>
                        </li>
                      </ul>
                    </div>
                  )}
                </div>

                {/* Add Route Button */}
                <button
                  onClick={openAdd}
                  className="flex items-center gap-1 px-6 py-2 rounded-lg text-white shadow-md hover:shadow-lg transition"
                  style={{ backgroundColor: primaryColor }}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  <span className="font-semibold">Add Route</span>
                </button>
              </div>
            </div>

            {/* Filters */}
            <div className="px-6 py-4 flex flex-wrap items-center gap-3">
              <div className="relative flex items-center gap-2 rounded-lg border border-gray-300 bg-white shadow-lg hover:shadow-xl focus-within:ring-1 focus-within:ring-blue-300 px-3 py-2">
                <span className="text-gray-400">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="currentColor"
                  >
                    <path d="M12 2a10 10 0 100 20 10 10 0 000-20Zm-1 5h2v6h-2V7Zm1 10a1.5 1.5 0 110-3 1.5 1.5 0 010 3Z" />
                  </svg>
                </span>
                <select
                  className="bg-transparent pr-6 text-sm outline-none"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="">All Status</option>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>

              <div className="relative flex items-center gap-2 rounded-lg border border-gray-300 bg-white shadow-lg hover:shadow-xl focus-within:ring-1 focus-within:ring-blue-300 px-3 py-2">
                <span className="text-gray-400">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="currentColor"
                  >
                    <path d="M3 12l7-9 7 9-7 9-7-9Zm7 5.5L7.5 12 10 8.5 12.5 12 10 17.5Z" />
                  </svg>
                </span>
                <select
                  className="bg-transparent pr-6 text-sm outline-none"
                  value={routeFilter}
                  onChange={(e) => {
                    setRouteFilter(e.target.value);
                    setBarangayFilter(""); // Clear barangay filter
                    setParticularFilter(""); // Clear particular filter
                  }}
                >
                  <option value="">All Routes</option>
                  {routeOptions.map((route) => (
                    <option key={route} value={route}>
                      {route}
                    </option>
                  ))}
                </select>
              </div>

              <div className="relative flex items-center gap-2 rounded-lg border border-gray-300 bg-white shadow-lg hover:shadow-xl focus-within:ring-1 focus-within:ring-blue-300 px-3 py-2">
                <span className="text-gray-400">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="currentColor"
                  >
                    <path d="M4 10l8-6 8 6v8a2 2 0 0 1-2 2h-3v-6H9v6H6a2 2 0 0 1-2-2v-8Z" />
                  </svg>
                </span>
                <select
                  className="bg-transparent pr-6 text-sm outline-none"
                  value={barangayFilter}
                  onChange={(e) => setBarangayFilter(e.target.value)}
                >
                  <option value="">All Barangays</option>
                  {barangayOptions.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>

              <div className="relative flex items-center gap-2 rounded-lg border border-gray-300 bg-white shadow-lg hover:shadow-xl focus-within:ring-1 focus-within:ring-blue-300 px-3 py-2">
                <span className="text-gray-400">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="currentColor"
                  >
                    <path d="M5 5h14v4H5V5Zm0 6h9v4H5v-4Zm0 6h14v2H5v-2Z" />
                  </svg>
                </span>
                <select
                  className="bg-transparent pr-6 text-sm outline-none"
                  value={particularFilter}
                  onChange={(e) => setParticularFilter(e.target.value)}
                >
                  <option value="">All Particulars</option>
                  {particularOptions.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>

              <div className="ml-auto flex items-center">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search"
                    className="w-[380px] rounded-full border border-gray-200 pl-10 pr-4 py-2.5 text-sm text-gray-600 shadow-sm focus:ring-4 focus:ring-blue-100 focus:border-blue-300 outline-none transition"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M15.5 14h-.8l-.3-.3A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16a6.471 6.471 0 0 0 4.2-1.6l.3.3v.8l5 5 1.5-1.5-5-5Zm-6 0C7 14 5 12 5 9.5S7 5 9.5 5 14 7 14 9.5 12 14 9.5 14Z" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="px-6 pb-6">
              {err && (
                <div className="mb-3 text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded">
                  {err}
                </div>
              )}

              <DataTable
                columns={columns}
                data={filtered}
                progressPending={loading}
                customStyles={tableStyles}
                highlightOnHover
                striped
                dense
                persistTableHead
                defaultSortFieldId={1}
                responsive
                pagination
                paginationComponentOptions={{ noRowsPerPage: true }}
                paginationPerPage={14}
                style={{ width: "100%" }}
              />
            </div>

            {/* ---------- ADD ROUTE MODAL (two-column horizontal form) ---------- */}
            {isAddOpen && (
              <div
                className="absolute inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm p-4"
                onClick={closeAdd}
              >
                <div
                  className="relative bg-white rounded-2xl shadow-2xl w-[100px] max-w-[100%] overflow-hidden"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-br from-blue-100/70 via-indigo-100/50 to-sky-50/60" />

                  {/* Header */}
                  <div className="relative flex items-center justify-between px-6 py-6 border-b bg-white/70 backdrop-blur">
                    <div className="flex items-center gap-3">
                      <div
                        className="h-10 w-10 rounded-full grid place-items-center text-white shadow"
                        style={{ backgroundColor: primaryColor }}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-5 w-5"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-gray-800">
                          Add New Route
                        </h2>
                        <p className="text-xs text-gray-500">
                          Provide details for the new route.
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={closeAdd}
                      className="h-10 w-10 rounded-full grid place-items-center border border-gray-200 hover:bg-gray-50"
                      title="Close"
                    >
                      <svg
                        className="h-4.5 w-4.5"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4 17.6 5 12 10.6 6.4 5z" />
                      </svg>
                    </button>
                  </div>

                  {/* Body: two-column grid */}
                  <div className="relative p-12 overflow-y-auto max-h-[calc(88vh-56px-64px)]">
                    <div className="grid grid-cols-3 gap-x-8 gap-y-9">
                      {/* Route – full width */}
                      <div className="col-span-2">
                        <label className="block text-sm text-gray-600 mb-1">
                          Route
                        </label>
                        <input
                          name="Route"
                          className={`w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-300 ${
                            errors.Route ? "border-red-500" : "border-gray-200"
                          }`}
                          value={form.Route}
                          onChange={onForm}
                        />
                        {errors.Route && (
                          <p className="text-red-500 text-xs mt-1">
                            {errors.Route}
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="block text-sm text-gray-600 mb-1">
                          Barangay
                        </label>
                        <input
                          name="Barangay"
                          className={`w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-300 ${
                            errors.Barangay
                              ? "border-red-500"
                              : "border-gray-200"
                          }`}
                          value={form.Barangay}
                          onChange={onForm}
                        />
                        {errors.Barangay && (
                          <p className="text-red-500 text-xs mt-1">
                            {errors.Barangay}
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="block text-sm text-gray-600 mb-1">
                          Particular
                        </label>
                        <input
                          name="Particular"
                          className={`w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-300 ${
                            errors.Particular
                              ? "border-red-500"
                              : "border-gray-200"
                          }`}
                          value={form.Particular}
                          onChange={onForm}
                        />
                        {errors.Particular && (
                          <p className="text-red-500 text-xs mt-1">
                            {errors.Particular}
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="block text-sm text-gray-600 mb-1">
                          KM
                        </label>
                        <input
                          name="KM"
                          type="number"
                          min="0"
                          className={`w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-300 ${
                            errors.KM ? "border-red-500" : "border-gray-200"
                          }`}
                          value={form.KM}
                          onChange={onForm}
                        />
                        {errors.KM && (
                          <p className="text-red-500 text-xs mt-1">
                            {errors.KM}
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="block text-sm text-gray-600 mb-1">
                          Status
                        </label>
                        <select
                          name="Status"
                          className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-300 border-gray-200"
                          value={form.Status}
                          onChange={onForm}
                        >
                          <option value="Active">Active</option>
                          <option value="Inactive">Inactive</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="relative px-6 py-4 border-t bg-white/70 backdrop-blur flex justify-end gap-3">
                    <button
                      className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700"
                      onClick={closeAdd}
                      disabled={saving}
                    >
                      Cancel
                    </button>
                    <button
                      className="px-4 py-2 rounded-lg text-white hover:opacity-95 disabled:opacity-60 inline-flex items-center gap-2"
                      style={{ backgroundColor: primaryColor }}
                      onClick={saveRoute}
                      disabled={saving}
                    >
                      {saving && (
                        <svg
                          className="h-4 w-4 animate-spin"
                          viewBox="0 0 24 24"
                          fill="none"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8v4A4 4 0 004 12z"
                          />
                        </svg>
                      )}
                      {saving ? "Saving..." : "Save"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ---------- VIEW / EDIT MODAL (two-column horizontal form) ---------- */}
            {viewing && edit && (
              <div
                className="absolute inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm p-4"
                onClick={() => {
                  setViewing(null);
                  setEdit(null);
                }}
              >
                <div
                  className="relative bg-white rounded-2xl shadow-2xl w-[960px] max-w-[100%] overflow-hidden"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-br from-indigo-100/60 via-blue-100/50 to-sky-50/50" />

                  {/* Header */}
                  <div className="relative flex items-center justify-between px-6 py-6 border-b bg-white/70 backdrop-blur">
                    <div className="flex items-center gap-3">
                      <div
                        className="h-10 w-10 rounded-full grid place-items-center text-white shadow"
                        style={{ backgroundColor: primaryColor }}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-5 w-5"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M3 7h18M3 12h18M3 17h18" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-800">
                          Route Details
                        </h3>
                        <p className="text-xs text-gray-500">
                          Route ID: {viewing.routeId}
                        </p>
                      </div>
                    </div>

                    <StatusBadge value={edit.Status} />
                  </div>

                  {/* Body */}
                  <div className="relative p-12 overflow-y-auto max-h-[calc(88vh-50px-64px)]">
                    <div className="grid grid-cols-3 gap-x-8 gap-y-9 text-sm">
                      {/* Route – full width */}
                      <div className="col-span-2">
                        <label className="block text-gray-600 mb-1">
                          Route
                        </label>
                        <input
                          className="w-full border rounded-md px-3 py-2 border-gray-200 bg-gray-100 text-gray-500 cursor-not-allowed"
                          value={edit.Route}
                          disabled
                        />
                      </div>

                      <div>
                        <label className="block text-gray-600 mb-1">
                          Barangay
                        </label>
                        <input
                          className="w-full border rounded-md px-3 py-2 border-gray-200 bg-gray-100 text-gray-500 cursor-not-allowed"
                          value={edit.Barangay}
                          disabled
                        />
                      </div>

                      <div>
                        <label className="block text-gray-600 mb-1">
                          Particular
                        </label>
                        <input
                          className="w-full border rounded-md px-3 py-2 border-gray-200 bg-gray-100 text-gray-500 cursor-not-allowed"
                          value={edit.Particular}
                          disabled
                        />
                      </div>

                      <div>
                        <label className="block text-gray-600 mb-1">KM</label>
                        <input
                          type="number"
                          min="0"
                          className="w-full border rounded-md px-3 py-2 border-gray-200 bg-gray-100 text-gray-500 cursor-not-allowed"
                          value={edit.KM}
                          disabled
                        />
                      </div>

                      <div>
                        <label className="block text-gray-600 mb-1">
                          Status
                        </label>
                        <select
                          className="w-full border rounded-md px-3 py-2 border-gray-200 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-300"
                          value={edit.Status}
                          onChange={(e) =>
                            setEdit({ ...edit, Status: e.target.value })
                          }
                        >
                          <option value="Active">Active</option>
                          <option value="Inactive">Inactive</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="relative px-6 py-4 border-t bg-white/70 backdrop-blur flex justify-end gap-3">
                    <button
                      className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700"
                      onClick={() => {
                        setViewing(null);
                        setEdit(null);
                      }}
                      disabled={savingEdit}
                    >
                      Cancel
                    </button>
                    <button
                      className="px-4 py-2 rounded-lg text-white hover:opacity-95 disabled:opacity-60 inline-flex items-center gap-2"
                      style={{ backgroundColor: primaryColor }}
                      onClick={saveEdits}
                      disabled={savingEdit}
                    >
                      {savingEdit && (
                        <svg
                          className="h-4 w-4 animate-spin"
                          viewBox="0 0 24 24"
                          fill="none"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8v4A4 4 0 004 12z"
                          />
                        </svg>
                      )}
                      {savingEdit ? "Saving..." : "Save"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Toast: Route Updated Successfully (top-center) */}
      <div
        aria-live="polite"
        className={`fixed top-5 left-1/2 -translate-x-1/2 z-[60] transform transition-all duration-300 ${
          showEditToast
            ? "opacity-100 translate-y-0"
            : "opacity-0 -translate-y-3 pointer-events-none"
        }`}
      >
        <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 px-5 py-3 text-green-800 shadow-md w-[520px] max-w-[90vw]">
          <div className="mt-0.5">
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-green-500">
              <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
            </svg>
          </div>
          <div className="text-sm">
            <div className="font-semibold">Route updated successfully</div>
            <div className="text-green-700/80">
              Your route details have been updated.
            </div>
          </div>
        </div>
      </div>

      {/* Success Toast for Added Route */}
      <div
        aria-live="polite"
        className={`fixed top-5 left-1/2 -translate-x-1/2 z-[60] transform transition-all duration-300 ${
          showAddToast
            ? "opacity-100 translate-y-0"
            : "opacity-0 -translate-y-3 pointer-events-none"
        }`}
      >
        <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 px-5 py-3 text-green-800 shadow-md w-[520px] max-w-[90vw]">
          <div className="mt-0.5">
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-green-500">
              <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
            </svg>
          </div>
          <div className="text-sm">
            <div className="font-semibold">Route added successfully</div>
            <div className="text-green-700/80">
              Your new route has been added.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}