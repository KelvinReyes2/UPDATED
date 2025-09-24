import { useEffect, useMemo, useState, useCallback } from "react";
import { Outlet, useLocation } from "react-router-dom";
import DataTable from "react-data-table-component";
import { FaEdit } from "react-icons/fa";
import "jspdf-autotable";
import { db } from "../../firebase";
import { getAuth } from "firebase/auth";
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  addDoc,
  serverTimestamp,
  getDoc,
} from "firebase/firestore";
import { exportToCSV, exportToPDF } from "../functions/exportFunctions";

export default function VehicleManagement() {
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const location = useLocation();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [units, setUnits] = useState([]);
  const [userRole, setUserRole] = useState("User"); // Add state for user role

  const toggleDropdown = () => {
    setIsDropdownOpen((prev) => !prev);
  };

  const auth = getAuth();
  const currentUser = auth.currentUser;
  const userName =
    currentUser?.displayName || currentUser?.email || "Unknown User";

  // Function to fetch user role
  const fetchUserRole = useCallback(async () => {
    if (!currentUser?.uid) {
      setUserRole("Guest");
      return;
    }

    try {
      const userDocRef = doc(db, "users", currentUser.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (userDocSnap.exists()) {
        const userData = userDocSnap.data();
        setUserRole(userData.role || "User"); // Default to "User" if role not found
      } else {
        setUserRole("User"); // Default role if user document doesn't exist
      }
    } catch (error) {
      console.error("Error fetching user role:", error);
      setUserRole("User"); // Fallback to default role
    }
  }, [currentUser?.uid]);

  // Function to map user roles to display roles for logging
  // Function to map user roles to display roles for logging
  const mapRoleForLogging = (role) => {
    return ROLE_MAPPING[role] || null;
  };

  // Function to log system activities with mapped role
  const logSystemActivity = async (activity, performedBy, role = null) => {
    try {
      // Use provided role or fall back to userRole from state
      const actualRole = role || userRole;
      const displayRole = mapRoleForLogging(actualRole);

      await addDoc(collection(db, "systemLogs"), {
        activity,
        performedBy,
        role: displayRole,
        timestamp: serverTimestamp(),
      });
      console.log("System activity logged successfully");
    } catch (error) {
      console.error("Error logging system activity:", error);
    }
  };

  useEffect(() => {
    const unsubUnits = onSnapshot(
      collection(db, "unit"),
      (snap) => {
        const temp = [];
        snap.forEach((d) => {
          const data = d.data();
          if (data) {
            temp.push({
              id: d.id,
              vehicleID: data.vehicleID || "",
              status: data.status || "Available",
              serialNo: data.serialNo || "", // keep serialNo for dropdown
            });
          }
        });

        if (edit) {
          setUnits(temp.filter((u) => !u.vehicleID || u.id === edit.unit));
        } else {
          setUnits(temp.filter((u) => !u.vehicleID));
        }
      },
      (error) => {
        console.error("Error loading units:", error);
      }
    );

    return () => unsubUnits();
  }, []);

  // Add this near the top of your component, after imports
  const ROLE_MAPPING = {
    Admin: "System Admin",
  };

  const primaryColor = "#364C6E";
  const isVehiclePage = location.pathname === "/vehicleManagement";

  const [vehicles, setVehicles] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err] = useState(null);

  const [search, setSearch] = useState("");
  const [routeFilter, setRouteFilter] = useState("");

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    vehicleID: "",
    unit: "",
    fuel: "",
    routeId: "",
    status: "Active",
  });
  const [errors, setErrors] = useState({});

  const [viewing, setViewing] = useState(null);
  const [edit, setEdit] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const toMillis = (v) => {
    if (!v) return 0;
    if (typeof v === "string") {
      const t = Date.parse(v);
      return Number.isNaN(t) ? 0 : t;
    }
    if (v?.seconds)
      return v.seconds * 1000 + Math.floor((v.nanoseconds || 0) / 1e6);
    return 0;
  };

  // Fetch user role on component mount
  useEffect(() => {
    fetchUserRole();
  }, [fetchUserRole]);

  useEffect(() => {
    if (!isVehiclePage) return;

    const unsub = onSnapshot(
      collection(db, "vehicle"),
      (snap) => {
        try {
          const temp = [];
          snap.forEach((d) => {
            const data = d.data();
            if (data) {
              temp.push({
                id: d.id,
                vehicleID: data.vehicleID || "",
                unit: data.unit || "",
                fuel: data.fuel || "",
                routeId: data.routeId || "",
                status: data.status || "Active",
                createdAt: toMillis(data.createdAt),
              });
            }
          });
          temp.sort((a, b) => a.createdAt - b.createdAt);
          setVehicles(temp);
          setLoading(false);
        } catch (error) {
          console.error("Error processing vehicles:", error);
          setLoading(false);
        }
      },
      (error) => {
        console.error("Error loading vehicles:", error);
        setLoading(false);
      }
    );

    const routeUnsub = onSnapshot(
      collection(db, "routes"),
      (snap) => {
        try {
          const temp = [];
          snap.forEach((d) => {
            const data = d.data();
            if (data && data.Route) {
              // Note: "Route" with capital R
              temp.push({
                id: d.id,
                route: data.Route, // Using "route" field name and "Route" field from database
              });
            }
          });
          // Remove duplicate routes
          const uniqueRoutes = Array.from(
            new Set(temp.map((route) => route.route))
          ).map((routeName) => temp.find((route) => route.route === routeName));
          setRoutes(uniqueRoutes);
        } catch (error) {
          console.error("Error processing routes:", error);
        }
      },
      (error) => {
        console.error("Error loading routes:", error);
      }
    );

    return () => {
      unsub();
      routeUnsub();
    };
  }, [isVehiclePage]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vehicles.filter((vehicle) => {
      const route = routes.find((r) => r.id === vehicle.routeId);
      const routeName = route ? route.route : "";
      const searchText =
        `${vehicle.vehicleID} ${vehicle.unit} ${vehicle.fuel} ${routeName} ${vehicle.status}`.toLowerCase();
      const matchesSearch = !q || searchText.includes(q);
      const matchesRouteFilter = !routeFilter || routeName === routeFilter;

      return matchesSearch && matchesRouteFilter;
    });
  }, [vehicles, routes, search, routeFilter]);

  const filteredWithRowNumber = useMemo(() => {
    return filtered.map((r, i) => {
      const route = routes.find((route) => route.id === r.routeId);
      return {
        ...r,
        _row: i + 1,
        routeName: route ? route.route : "No Route",
      };
    });
  }, [filtered, routes]);

  const headers = ["Vehicle ID", "Unit", "Fuel", "Route", "Status"];
  const rows = filteredWithRowNumber.map((item) => [
    item.id,
    item.unit,
    item.fuel,
    item.routeName,
    item.status,
  ]);

  // Enhanced export functions with role mapping and system logging
  const handleExportToCSV = async () => {
    try {
      await exportToCSV(
        headers,
        rows,
        "Vehicle-Management-Report",
        "Vehicle-Management-Report.csv",
        userName
      );

      // Log the export activity (role will be mapped in logSystemActivity)
      await logSystemActivity("Printed Vehicle Report", userName);

      setIsDropdownOpen(false);
    } catch (error) {
      console.error("Error exporting to CSV:", error);
    }
  };

  const handleExportToPDF = async () => {
    try {
      await exportToPDF(
        headers,
        rows,
        "Vehicle-Management-Report",
        "Vehicle-Management-Report.pdf",
        userName
      );

      // Log the export activity (role will be mapped in logSystemActivity)
      await logSystemActivity("Printed Vehicle Report", userName);

      setIsDropdownOpen(false);
    } catch (error) {
      console.error("Error exporting to PDF:", error);
    }
  };

  const StatusBadge = ({ value }) => {
    const isActive = (value || "").toLowerCase() === "active";
    return (
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${isActive ? "bg-green-100 text-green-700 border border-green-200" : "bg-gray-100 text-gray-700 border border-gray-200"}`}
      >
        <span
          className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${isActive ? "bg-green-500" : "bg-gray-400"}`}
        />
        {isActive ? "Active" : value || "Inactive"}
      </span>
    );
  };

  const columns = [
    {
      name: "Vehicle ID",
      selector: (r) => r.id,
      sortable: true,
      cell: (r) => (
        <div className="truncate" title={r.id}>
          {r.id}
        </div>
      ),
    },
    {
      name: "Unit",
      selector: (r) => r.unit,
      sortable: true,
      cell: (r) => (
        <div className="truncate" title={r.unit}>
          {r.unit}
        </div>
      ),
    },
    {
      name: "Fuel",
      selector: (r) => r.fuel,
      sortable: true,
      cell: (r) => (
        <div className="truncate" title={r.fuel}>
          {r.fuel}
        </div>
      ),
    },
    {
      name: "Route",
      selector: (r) => {
        const route = routes.find((route) => route.id === r.routeId);
        return route ? route.route : "";
      },
      sortable: true,
      cell: (r) => {
        const route = routes.find((route) => route.id === r.routeId);
        const routeName = route ? route.route : "No Route";
        return (
          <div className="truncate" title={routeName}>
            {routeName}
          </div>
        );
      },
    },
    {
      name: "Status",
      selector: (r) => r.status,
      sortable: true,
      cell: (r) => <StatusBadge value={r.status} />,
    },
    {
      name: "Action",
      button: true,
      center: true,
      width: "120px",
      cell: (row) => (
        <button
          onClick={() => {
            setViewing(row);
            setEdit({ ...row });
          }}
          title="Edit"
          className="inline-flex items-center justify-center h-9 px-3 rounded-full border border-gray-200 bg-white text-gray-700 hover:shadow-md transition text-sm font-semibold"
        >
          <FaEdit size={14} />
        </button>
      ),
      ignoreRowClick: true,
      allowOverflow: true,
    },
  ];

  const tableStyles = {
    table: {
      style: { borderRadius: "1rem", width: "100%", tableLayout: "auto" },
    },
    headRow: {
      style: {
        minHeight: "40px",
        backgroundColor: primaryColor,
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
        color: "#ffffff",
        fontSize: "14px",
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        padding: "10px 12px",
        alignItems: "center",
        whiteSpace: "nowrap",
      },
    },
    rows: { style: { minHeight: "44px", borderBottom: "1px solid #f1f5f9" } },
    cells: {
      style: {
        padding: "10px 12px",
        fontSize: "14px",
        color: "#0f172a",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      },
    },
  };

  const openAdd = () => {
    setIsAddOpen(true);
    setForm({
      vehicleID: "",
      unit: "",
      fuel: "",
      routeId: "",
      status: "Active",
    });
    setErrors({});
  };

  const closeAdd = () => {
    setIsAddOpen(false);
    setErrors({});
  };

  const onForm = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
    if (errors[name]) {
      const newErrors = { ...errors };
      delete newErrors[name];
      setErrors(newErrors);
    }
  };

  const saveVehicle = async () => {
    const validationErrors = {};
    if (!form.vehicleID.trim())
      validationErrors.vehicleID = "Vehicle ID is required";
    if (!form.unit) validationErrors.unit = "Unit is required";

    setErrors(validationErrors);
    if (Object.keys(validationErrors).length) return;

    setSaving(true);
    try {
      const vehicleRef = doc(db, "vehicle", form.vehicleID.trim());
      const vehicleSnap = await getDoc(vehicleRef);

      if (vehicleSnap.exists()) {
        setErrors({ vehicleID: "This Vehicle ID already exists." });
        setSaving(false);
        return;
      }

      // Save vehicle
      await setDoc(vehicleRef, {
        unit: form.unit,
        fuel: form.fuel.trim(),
        routeId: form.routeId,
        status: form.status,
        createdAt: new Date().toISOString(),
      });

      // Update the selected unit with vehicleID
      await setDoc(
        doc(db, "unit", form.unit),
        {
          vehicleID: form.vehicleID.trim(),
          status: "Available",
        },
        { merge: true }
      );

      await logSystemActivity(
        `Added new vehicle: ${form.vehicleID.trim()}`,
        userName
      );

      setToastMessage("New vehicle added successfully!");
      setShowSuccessToast(true);
      setTimeout(() => setShowSuccessToast(false), 3000);
      closeAdd();
    } catch (error) {
      console.error("Error saving vehicle:", error);
      if (error.code === "permission-denied") {
        alert("Access denied. You don't have permission to add vehicles.");
      } else {
        alert("Failed to save vehicle. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  };

  const saveEdits = async () => {
    if (!viewing || !edit) return;

    setSavingEdit(true);
    try {
      const prevUnit = viewing.unit;
      const newUnit = edit.unit;

      // Update vehicle document
      await setDoc(doc(db, "vehicle", viewing.id), {
        unit: newUnit,
        fuel: edit.fuel,
        routeId: edit.routeId,
        status: edit.status,
      });

      // Remove vehicleID from previous unit if it changed
      if (prevUnit && prevUnit !== newUnit) {
        await setDoc(
          doc(db, "unit", prevUnit),
          { vehicleID: "" },
          { merge: true }
        );
      }

      // Assign vehicleID to new unit
      if (newUnit) {
        await setDoc(
          doc(db, "unit", newUnit),
          { vehicleID: viewing.id },
          { merge: true }
        );
      }

      const changes = [];

      if (prevUnit !== newUnit) changes.push(`Unit: ${prevUnit} → ${newUnit}`);
      if (viewing.fuel !== edit.fuel)
        changes.push(`Fuel: ${viewing.fuel} → ${edit.fuel}`);
      if (viewing.status !== edit.status)
        changes.push(`Status: ${viewing.status} → ${edit.status}`);

      const changesText = changes.length > 0 ? ` (${changes.join(", ")})` : "";

      // Log system activity with role mapping
      await logSystemActivity(
        `Updated vehicle: ${viewing.id}${changesText}`,
        userName
      );

      setViewing(null);
      setEdit(null);

      setToastMessage("Vehicle details updated successfully!");
      setShowSuccessToast(true);
      setTimeout(() => setShowSuccessToast(false), 3000);
    } catch (error) {
      alert(error.message || String(error));
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div className="flex bg-gray-100 min-h-screen">
      {/* Sidebar */}

      {/* Main Content */}
      <main className="flex-1 p-8 mx-auto">
        {!isVehiclePage ? (
          <Outlet />
        ) : (
          <div className="mx-auto w-full max-w-[1900px]">
            <div
              className="bg-white border rounded-xl shadow-sm flex flex-col"
              style={{ minHeight: "calc(100vh - 112px)" }}
            >
              <div className="px-6 pt-6 pb-4 border-b flex items-center justify-between">
                <h1 className="text-2xl font-semibold text-gray-800">
                  Vehicle Management
                </h1>
                <div className="flex items-center gap-3">
                  <div className="relative flex items-center gap-2 rounded-lg border border-gray-300 bg-white shadow-lg hover:shadow-xl focus-within:ring-1 focus-within:ring-blue-300 px-3 py-2">
                    <select
                      className="bg-transparent pr-6 text-sm outline-none"
                      value={routeFilter}
                      onChange={(e) => setRouteFilter(e.target.value)}
                    >
                      <option value="">Filter by Route</option>
                      {routes.map((route) => (
                        <option key={route.id} value={route.route}>
                          {route.route}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search"
                      className="w-[420px] rounded-full border border-gray-200 pl-10 pr-3 py-2.5 text-sm shadow-sm focus:ring-4 focus:ring-blue-100 focus:border-blue-300 outline-none"
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

                  <div className="relative">
                    {/* Export Button */}
                    <button
                      onClick={toggleDropdown}
                      className="flex items-center gap-2 px-9 py-2 rounded-lg text-white shadow-md hover:shadow-lg transition"
                      style={{ backgroundColor: primaryColor }}
                    >
                      <span className="font-semibold">Export</span>
                    </button>

                    {/* Dropdown Menu */}
                    {isDropdownOpen && (
                      <div className="absolute right-0 w-40 mt-2 bg-white shadow-lg rounded-lg z-10">
                        <ul className="text-sm">
                          <li>
                            <button
                              className="block px-4 py-2 text-gray-800 hover:bg-gray-100 w-full text-left"
                              onClick={handleExportToCSV}
                            >
                              Export to Excel
                            </button>
                          </li>
                          <li>
                            <button
                              className="block px-4 py-2 text-gray-800 hover:bg-gray-100 w-full text-left"
                              onClick={handleExportToPDF}
                            >
                              Export to PDF
                            </button>
                          </li>
                        </ul>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={openAdd}
                    className="flex items-center gap-2 px-9 py-2 rounded-lg text-white shadow-md hover:shadow-lg transition"
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
                    <span className="font-semibold">Add Vehicle</span>
                  </button>
                </div>
              </div>

              <div className="px-6 py-4 flex-1">
                {err && (
                  <div className="mb-3 text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded">
                    {err}
                  </div>
                )}
                <DataTable
                  columns={columns}
                  data={filteredWithRowNumber}
                  progressPending={loading}
                  customStyles={tableStyles}
                  highlightOnHover
                  striped
                  dense
                  persistTableHead
                  responsive
                  pagination
                  paginationComponentOptions={{ noRowsPerPage: true }}
                  fixedHeader
                  fixedHeaderScrollHeight="70vh"
                />
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Success Toast */}
      {showSuccessToast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[90] transform transition-all duration-300 opacity-100 translate-y-0">
          <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 px-5 py-3 text-green-800 shadow-md w-[520px] max-w-[90vw]">
            <div className="mt-0.5">
              <svg viewBox="0 0 24 24" className="h-5 w-5 fill-green-500">
                <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
              </svg>
            </div>
            <div className="text-sm">
              <div className="font-semibold">{toastMessage}</div>
            </div>
          </div>
        </div>
      )}

      {/* Add Vehicle Modal */}
      {isAddOpen && (
        <div
          className="fixed inset-0 z-[80] grid place-items-center bg-black/40 backdrop-blur-sm p-4"
          onClick={closeAdd}
        >
          <div
            className="relative bg-white rounded-2xl shadow-2xl w-[720px] max-w-[90%] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative flex items-center justify-between px-6 py-4 border-b bg-white/70 backdrop-blur">
              <div className="flex items-center gap-3">
                <div
                  className="h-9 w-9 rounded-full grid place-items-center text-white shadow"
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
                    Add Vehicle
                  </h2>
                  <p className="text-xs text-gray-500">
                    Create a new vehicle record.
                  </p>
                </div>
              </div>
              <button
                onClick={closeAdd}
                className="h-8 w-8 rounded-full grid place-items-center border border-gray-200 hover:bg-gray-50"
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

            <div className="p-12 grid ml-6 grid-cols-3 gap-x-5 gap-y-4">
              <div className="col-span-1">
                <label className="block text-sm text-gray-600 mb-1">
                  Vehicle ID
                </label>
                <input
                  name="vehicleID"
                  className={`w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-300 ${
                    errors.vehicleID ? "border-red-500" : "border-gray-200"
                  }`}
                  value={form.vehicleID}
                  onChange={onForm}
                />
                {errors.vehicleID && (
                  <p className="text-red-500 text-xs mt-1">
                    {errors.vehicleID}
                  </p>
                )}
              </div>

              <div className="col-span-1">
                <label className="block text-sm text-gray-600 mb-1">Unit</label>
                <select
                  name="unit"
                  className={`w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-300 ${
                    errors.unit ? "border-red-500" : "border-gray-200"
                  }`}
                  value={form.unit}
                  onChange={onForm}
                >
                  <option value="">Select Unit</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.id}
                    </option>
                  ))}
                </select>
                {errors.unit && (
                  <p className="text-red-500 text-xs mt-1">{errors.unit}</p>
                )}
              </div>

              <div className="col-span-1">
                <label className="block text-sm text-gray-600 mb-1">Fuel</label>
                <input
                  name="fuel"
                  className={`w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-300 ${
                    errors.fuel ? "border-red-500" : "border-gray-200"
                  }`}
                  value={form.fuel}
                  onChange={onForm}
                />
                {errors.fuel && (
                  <p className="text-red-500 text-xs mt-1">{errors.fuel}</p>
                )}
              </div>

              <div className="col-span-1">
                <label className="block text-sm text-gray-600 mb-1">
                  Route
                </label>
                <select
                  name="routeId"
                  className={`w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-300 ${
                    errors.routeId ? "border-red-500" : "border-gray-200"
                  }`}
                  value={form.routeId}
                  onChange={onForm}
                >
                  <option value="">Select Route</option>
                  {routes.map((route) => (
                    <option key={route.id} value={route.id}>
                      {route.route}
                    </option>
                  ))}
                </select>
                {errors.routeId && (
                  <p className="text-red-500 text-xs mt-1">{errors.routeId}</p>
                )}
              </div>

              <div className="col-span-1">
                <label className="block text-sm text-gray-600 mb-1">
                  Status
                </label>
                <select
                  name="status"
                  className={`w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-300 ${
                    errors.status ? "border-red-500" : "border-gray-200"
                  }`}
                  value={form.status}
                  onChange={onForm}
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
            </div>

            <div className="px-6 py-4 border-t bg-white/70 backdrop-blur flex justify-end gap-3">
              <button
                onClick={closeAdd}
                className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                onClick={saveVehicle}
                className="px-4 py-2 rounded-lg text-white hover:opacity-95 disabled:opacity-60 inline-flex items-center gap-2"
                style={{ backgroundColor: primaryColor }}
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
                {saving ? "Saving..." : "Save Vehicle"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Vehicle Modal */}
      {viewing && edit && (
        <div
          className="fixed inset-0 z-[80] grid place-items-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => {
            setViewing(null);
            setEdit(null);
          }}
        >
          <div
            className="relative bg-white rounded-2xl shadow-2xl w-[720px] max-w-[90%] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative flex items-center justify-between px-6 py-4 border-b bg-white/70 backdrop-blur">
              <div className="flex items-center gap-3">
                <div
                  className="h-9 w-9 rounded-full grid place-items-center text-white shadow"
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
                  <h3 className="text-base font-semibold text-gray-800">
                    Edit Vehicle
                  </h3>
                  <p className="text-xs text-gray-500">{viewing.id}</p>
                </div>
              </div>
              <StatusBadge value={edit.status} />
            </div>

            <div className="p-10 grid ml-6 grid-cols-3 gap-x-5 gap-y-4">
              <div className="col-span-1">
                <label className="block text-gray-600 mb-1">Vehicle ID</label>
                <input
                  className="w-full border rounded-md px-3 py-2 border-gray-200 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-300"
                  value={edit.id} // Use document ID
                  readOnly
                />
              </div>
              <div className="col-span-1">
                <label className="block text-gray-600 mb-1">Unit</label>
                <select
                  value={edit.unit}
                  onChange={(e) => setEdit({ ...edit, unit: e.target.value })}
                  className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-300"
                >
                  <option value="">Select Unit</option>
                  {units
                    .filter((u) => !u.vehicleID || u.id === viewing.unit)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.id}
                      </option>
                    ))}
                </select>
              </div>

              <div className="col-span-1">
                <label className="block text-gray-600 mb-1">Fuel</label>
                <input
                  className="w-full border rounded-md px-3 py-2 border-gray-200 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-300"
                  value={edit.fuel}
                  onChange={(e) => setEdit({ ...edit, fuel: e.target.value })}
                />
              </div>

              <div className="col-span-1">
                <label className="block text-gray-600 mb-1">Route</label>
                <select
                  value={edit.routeId}
                  onChange={(e) =>
                    setEdit({ ...edit, routeId: e.target.value })
                  }
                  className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-300"
                >
                  <option value="">Select Route</option>
                  {routes.map((route) => (
                    <option key={route.id} value={route.id}>
                      {route.route}
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-span-1">
                <label className="block text-gray-600 mb-1">Status</label>
                <select
                  value={edit.status}
                  onChange={(e) => setEdit({ ...edit, status: e.target.value })}
                  className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-300"
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
            </div>

            <div className="px-6 py-4 border-t bg-white/70 backdrop-blur flex justify-end gap-3">
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
                {savingEdit ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
