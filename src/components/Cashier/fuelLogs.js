import { useState, useEffect, useMemo } from "react";
import { Fuel, Lock, AlertTriangle, Loader2 } from "lucide-react";
import {
  collection,
  getDocs,
  addDoc,
  serverTimestamp,
  getDoc,
  doc,
  orderBy,
  query,
  where,
  onSnapshot,
} from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { db } from "../../firebase";
import DataTable from "react-data-table-component";
import { FaEye } from "react-icons/fa";
import { exportToCSV, exportToPDF } from "../functions/exportFunctions";

const FuelLogsPage = () => {
  const auth = getAuth();
  const currentUser = auth.currentUser;
  const userName =
    currentUser?.displayName || currentUser?.email || "Unknown User";

  // Get today's date in YYYY-MM-DD format
  const getTodayDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const [fuelPrice, setFuelPrice] = useState(0.0);
  const [search, setSearch] = useState("");
  const [logs, setLogs] = useState([]);
  const [driversList, setDriversList] = useState([]);
  const [unitData, setUnitData] = useState([]);
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);
  const [isPriceModalOpen, setIsPriceModalOpen] = useState(false);
  const [newPriceInput, setNewPriceInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [form, setForm] = useState({ driver: "", amount: "" });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [showErrorToast, setShowErrorToast] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState("Unknown");
  const [selectedVehicle, setSelectedVehicle] = useState("N/A");
  const [dateFilter, setDateFilter] = useState(getTodayDate());

  const primaryColor = "#364C6E";

  // Helper function to format timestamp with time and date
  const formatTimestamp = (timestamp) => {
    try {
      let date;
      if (timestamp && typeof timestamp.toDate === "function") {
        date = timestamp.toDate();
      } else if (timestamp && timestamp.seconds) {
        date = new Date(timestamp.seconds * 1000);
      } else if (timestamp instanceof Date) {
        date = timestamp;
      } else {
        return { time: "N/A", date: "N/A", fullDateTime: "N/A" };
      }

      // Format time (e.g., 10:28 AM)
      const time = date.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });

      // Format date (e.g., September 17, 2025)
      const dateStr = date.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      });

      // Full date time for export
      const fullDateTime = `${dateStr}, ${time}`;

      return { time, date: dateStr, fullDateTime };
    } catch (error) {
      console.error("Error formatting timestamp:", error);
      return { time: "Invalid", date: "Invalid", fullDateTime: "Invalid" };
    }
  };

  // Fetch current user's role
  useEffect(() => {
    const fetchCurrentUserRole = async () => {
      if (currentUser) {
        try {
          const userDoc = await getDoc(doc(db, "users", currentUser.uid));
          if (userDoc.exists()) {
            setCurrentUserRole(userDoc.data().role || "Unknown");
          }
        } catch (error) {
          console.error("Error fetching user role:", error);
        }
      }
    };

    fetchCurrentUserRole();
  }, [currentUser]);

  // Function to log system activities
  const logSystemActivity = async (activity, performedBy, role) => {
    try {
      await addDoc(collection(db, "systemLogs"), {
        activity,
        performedBy,
        role: currentUserRole,
        timestamp: serverTimestamp(),
      });
      console.log("Fuel activity logged successfully");
    } catch (error) {
      console.error("Error logging fuel activity:", error);
    }
  };

  // Show success toast
  const showToast = (message) => {
    setToastMessage(message);
    setShowSuccessToast(true);
    setTimeout(() => setShowSuccessToast(false), 3000);
  };

  // Show error toast
  const showError = (message) => {
    setErrorMessage(message);
    setShowErrorToast(true);
    setTimeout(() => setShowErrorToast(false), 3000);
  };

  // Fetch Unit Data
  useEffect(() => {
    const unsubUnitData = onSnapshot(collection(db, "unit"), (snap) => {
      const temp = snap.docs.map((d) => ({
        id: d.id,
        unitHolder: d.data()?.unitHolder || null,
        vehicleID: d.data()?.vehicleID || "",
        serialNo: d.data()?.serialNo || "",
        status: d.data()?.status || "Available",
      }));
      setUnitData(temp);
    });

    return () => unsubUnitData();
  }, []);

  // Fetch Fuel Logs
  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const logsRef = collection(db, "fuelLogs");
        const q = query(logsRef, orderBy("timestamp", "desc"));
        const unsub = onSnapshot(
          q,
          (snapshot) => {
            const data = snapshot.docs.map((doc) => {
              const log = doc.data();
              return {
                id: doc.id,
                date: log.timestamp?.toDate
                  ? log.timestamp.toDate().toLocaleDateString()
                  : "N/A",
                driver: log.Driver || "N/A",
                officer: log.Officer || "N/A",
                driverId: log.driverId || "N/A",
                amount: parseFloat(log.fuelAmount) || 0,
                vehicle: log.Vehicle || "N/A",
                timestamp: log.timestamp,
              };
            });
            setLogs(data);
            setLoading(false);
          },
          (error) => {
            setErr(error.message || "Failed to load fuel logs");
            setLoading(false);
          }
        );

        return () => unsub();
      } catch (err) {
        console.error("Error fetching logs:", err);
        setErr(err.message);
        setLoading(false);
      }
    };

    fetchLogs();
  }, []);

  // Updated function to fetch unit for driver
  const fetchUnitForDriver = async (driverId) => {
    const dispatchedUnit = unitData.find(
      (unit) => unit.unitHolder === driverId && unit.status === "Dispatched"
    );

    if (dispatchedUnit) {
      return dispatchedUnit.id;
    }
    return null;
  };

  // Fetch Drivers List
  useEffect(() => {
    const fetchDrivers = async () => {
      try {
        const usersRef = collection(db, "users");
        const q = query(usersRef, where("role", "in", ["Driver", "Reliever"]));
        const snapshot = await getDocs(q);

        const today = getTodayDate();
        const drivers = [];

        for (const docSnap of snapshot.docs) {
          const d = { uid: docSnap.id, ...docSnap.data() };

          const unit = await fetchUnitForDriver(d.uid);
          if (!unit) continue;

          const fullName = `${d.firstName} ${d.lastName}`;

          const hasLogToday = logs.some((l) => {
            const logDate = l.timestamp?.toDate
              ? l.timestamp.toDate().toISOString().split("T")[0]
              : null;
            return (
              l.Driver?.trim().toLowerCase() ===
                fullName.trim().toLowerCase() && logDate === today
            );
          });
          if (hasLogToday) continue;

          drivers.push({
            uid: d.uid,
            fullName,
          });
        }

        drivers.sort((a, b) => a.fullName.localeCompare(b.fullName));
        setDriversList(drivers);
      } catch (err) {
        console.error("Error fetching drivers:", err);
      }
    };

    if (unitData.length > 0) {
      fetchDrivers();
    }
  }, [logs, unitData]);

  // Fetch Latest Fuel Price
  useEffect(() => {
    const fetchFuelPrice = async () => {
      try {
        const fuelPriceRef = collection(db, "fuelPrice");
        const q = query(fuelPriceRef, orderBy("timestamp", "desc"));
        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
          const latest = snapshot.docs[0].data();
          setFuelPrice(latest.Price || 0);
        }
      } catch (err) {
        console.error("Error fetching fuel price:", err);
      }
    };

    fetchFuelPrice();
  }, []);

  // Open Fuel Price Modal
  const openPriceModal = () => {
    const today = new Date();
    const day = today.getDay();

    if (day !== 2) {
      setShowWarningModal(true);
      return;
    }

    setNewPriceInput(fuelPrice.toString());
    setPasswordInput("");
    setIsPriceModalOpen(true);
  };

  const proceedWithPriceUpdate = () => {
    setShowWarningModal(false);
    setNewPriceInput(fuelPrice.toString());
    setPasswordInput("");
    setIsPriceModalOpen(true);
  };

  // Save Fuel Price
  const saveFuelPrice = async () => {
    if (!newPriceInput || isNaN(newPriceInput)) {
      showError("Enter a valid fuel price.");
      return;
    }

    if (!passwordInput) {
      showError("Password is required.");
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      showError("No user logged in.");
      return;
    }

    try {
      await signInWithEmailAndPassword(auth, user.email, passwordInput);

      const price = parseFloat(newPriceInput);
      setFuelPrice(price);

      await addDoc(collection(db, "fuelPrice"), {
        Price: price,
        timestamp: serverTimestamp(),
        updatedBy: user.email,
      });

      await logSystemActivity(
        `Updated fuel price to ₱${price.toFixed(2)}`,
        userName,
        currentUserRole
      );

      showToast("Fuel price updated successfully!");
      setIsPriceModalOpen(false);
    } catch (err) {
      console.error(err);
      showError("Failed to update fuel price. Check your password.");
    }
  };

  // Filtered Logs
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const matchesSearch = search
        ? log.driver.toLowerCase().includes(search.toLowerCase()) ||
          log.officer.toLowerCase().includes(search.toLowerCase()) ||
          log.vehicle.toLowerCase().includes(search.toLowerCase())
        : true;

      const matchesDate = dateFilter
        ? log.timestamp?.toDate &&
          log.timestamp.toDate().toISOString().split("T")[0] === dateFilter
        : true;

      return matchesSearch && matchesDate;
    });
  }, [logs, search, dateFilter]);

  // Add row numbers for display
  const filteredWithRowNumber = useMemo(
    () => filteredLogs.map((r, i) => ({ ...r, _row: i + 1 })),
    [filteredLogs]
  );

  const onFormChange = async (e) => {
    const { name, value } = e.target;
    setForm({ ...form, [name]: value });

    if (name === "driver" && value) {
      const driver = driversList.find(
        (d) => d.uid === value || d.fullName === value
      );

      if (driver) {
        const unit = await fetchUnitForDriver(driver.uid);
        setSelectedVehicle(unit || "N/A");
      } else {
        setSelectedVehicle("N/A");
      }
    }
  };

  const closeAddExpense = () => {
    setIsAddExpenseOpen(false);
    setForm({ driver: "", amount: "" });
  };

  // Save Fuel Expense (FIXED - removed fuelStatus update)
  const saveFuelExpense = async () => {
    try {
      setSaving(true);

      if (!form.driver || !form.amount) {
        showError("Please fill in all fields.");
        return;
      }

      const selectedDriver = driversList.find(
        (d) => d.uid === form.driver || d.fullName === form.driver
      );
      if (!selectedDriver) {
        showError("Driver not found.");
        return;
      }

      const unit = await fetchUnitForDriver(selectedDriver.uid);
      if (!unit) {
        showError("No unit dispatched to this driver.");
        return;
      }

      await addDoc(collection(db, "fuelLogs"), {
        Driver: selectedDriver.fullName,
        driverId: selectedDriver.uid,
        Officer: userName,
        Vehicle: unit,
        fuelAmount: parseFloat(form.amount),
        status: "done",
        timestamp: serverTimestamp(),
      });

      // REMOVED: The fuelStatus update to driver document
      // await updateDoc(driverRef, { fuelStatus: "done" });

      await logSystemActivity(
        `Added fuel expense: ₱${parseFloat(form.amount).toFixed(2)} for ${selectedDriver.fullName}`,
        userName
      );

      showToast("Fuel expense saved successfully!");
      setIsAddExpenseOpen(false);
      setForm({ driver: "", amount: "" });
    } catch (err) {
      console.error("Error saving fuel expense:", err);
      showError("Failed to save fuel expense.");
    } finally {
      setSaving(false);
    }
  };

  // Export functions
  const headers = [
    "ID",
    "Timestamp",
    "Driver Name",
    "Officer",
    "Amount Spent",
    "Unit",
  ];

  const rows = filteredLogs.map((log, index) => {
    const { fullDateTime } = formatTimestamp(log.timestamp);
    return [
      index + 1,
      fullDateTime,
      log.driver,
      log.officer,
      `₱${log.amount.toFixed(2)}`,
      log.vehicle,
    ];
  });

  const toggleDropdown = () => {
    setIsDropdownOpen((prev) => !prev);
  };

  const handleExportToCSV = async () => {
    try {
      await exportToCSV(
        headers,
        rows,
        "Fuel-Logs-Report.csv",
        currentUser?.email || "Unknown",
        "Fuel-Logs-Report"
      );

      await logSystemActivity("Exported Fuel Logs to CSV", userName);

      setIsDropdownOpen(false);
      showToast("Fuel logs exported to CSV successfully!");
    } catch (error) {
      console.error("Error exporting to CSV:", error);
      showError("Failed to export to CSV.");
    }
  };

  const handleExportToPDF = async () => {
    try {
      await exportToPDF(
        headers,
        rows,
        "Fuel-Logs-Report",
        "Fuel-Logs-Report.pdf",
        currentUser?.email || "Unknown"
      );

      await logSystemActivity("Exported Fuel Logs to PDF", userName);

      setIsDropdownOpen(false);
      showToast("Fuel logs exported to PDF successfully!");
    } catch (error) {
      console.error("Error exporting to PDF:", error);
      showError("Failed to export to PDF.");
    }
  };

  // Table Columns
  const columns = [
    {
      name: "ID",
      selector: (r) => r._row,
      sortable: false,
      width: "80px",
      right: true,
    },
    {
      name: "Timestamp",
      selector: (r) => r.timestamp,
      sortable: true,
      grow: 1,
      cell: (r) => {
        const { time, date } = formatTimestamp(r.timestamp);
        return (
          <div className="text-sm">
            <div className="font-medium">{time}</div>
            <div className="text-gray-600 text-xs">{date}</div>
          </div>
        );
      },
    },
    {
      name: "Driver Name",
      selector: (r) => r.driver,
      sortable: true,
      grow: 1,
      cell: (r) => (
        <div className="truncate" title={r.driver}>
          {r.driver}
        </div>
      ),
    },
    {
      name: "Officer",
      selector: (r) => r.officer,
      sortable: true,
      grow: 1,
      cell: (r) => (
        <div className="truncate" title={r.officer}>
          {r.officer}
        </div>
      ),
    },
    {
      name: "Amount Spent",
      selector: (r) => r.amount,
      sortable: true,
      center: true,
      grow: 1,
      cell: (r) => `₱${r.amount.toFixed(2)}`,
    },
    {
      name: "Unit",
      selector: (r) => r.vehicle,
      sortable: true,
      center: true,
      grow: 1,
    },
    {
      name: "Action",
      button: true,
      center: true,
      width: "120px",
      cell: (row) => (
        <button
          onClick={() => setViewing(row)}
          title="View Details"
          className="inline-flex items-center justify-center h-9 px-3 rounded-full border border-gray-200 bg-white text-gray-700 hover:shadow-md transition text-sm font-semibold"
        >
          <FaEye size={14} />
        </button>
      ),
      ignoreRowClick: true,
      allowOverflow: true,
    },
  ];

  // Table Styles
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
        padding: "14px 12px",
        fontSize: "14px",
        color: "#0f172a",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      },
    },
  };

  return (
    <main className="flex-1 p-8 mx-auto">
      <div className="mx-auto w-full max-w-[1900px]">
        <div
          className="bg-white border rounded-2xl shadow-md flex flex-col"
          style={{ minHeight: "calc(100vh - 112px)" }}
        >
          {/* Header */}
          <div className="px-6 pt-6 pb-4 border-b flex items-center justify-between">
            <h1 className="text-2xl font-semibold text-gray-800">Fuel Logs</h1>
            <div className="flex items-center gap-3">
              {/* Search */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search"
                  className="w-[420px] rounded-lg border border-gray-200 pl-10 pr-3 py-2.5 text-sm shadow-sm focus:ring-2 focus:ring-blue-500 outline-none"
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
                <input
                  type="date"
                  className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-500 shadow-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                />
              </div>

              {/* Export Button */}
              <div className="relative">
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

              {/* Add Expense Button */}
              <button
                onClick={() => setIsAddExpenseOpen(true)}
                className="flex items-center gap-2 px-9 py-2 rounded-lg text-white shadow-md hover:shadow-lg transition"
                style={{ backgroundColor: primaryColor }}
              >
                <Fuel className="h-5 w-5" />
                <span className="font-semibold">Add Expense</span>
              </button>
            </div>
          </div>

          {/* Content Area */}
          <div className="px-6 py-4 flex-1 space-y-6">
            {/* Fuel Price Card */}
            <div className="bg-white border rounded-2xl shadow p-6 w-72">
              <div className="flex items-center gap-4">
                <div
                  className="p-3 rounded-full"
                  style={{ backgroundColor: `${primaryColor}20` }}
                >
                  <Fuel className="h-6 w-6" style={{ color: primaryColor }} />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Fuel Price (₱/L)</p>
                  <p className="text-2xl font-semibold">
                    ₱{fuelPrice.toFixed(2)}
                  </p>
                </div>
              </div>
              <div className="flex justify-end mt-4">
                <button
                  onClick={openPriceModal}
                  className="px-3 py-1 text-sm text-white rounded-lg shadow hover:opacity-90"
                  style={{ backgroundColor: primaryColor }}
                >
                  Change Price
                </button>
              </div>
            </div>

            {/* Logs Table */}
            <div className="bg-white border rounded-2xl shadow overflow-hidden">
              {err && (
                <div className="mb-3 text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded mx-4 mt-4">
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

          {/* Add Expense Modal */}
          {isAddExpenseOpen && (
            <div
              className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm p-4"
              onClick={closeAddExpense}
            >
              <div
                className="relative bg-white rounded-2xl shadow-2xl w-[720px] max-w-[90%] overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div className="relative flex items-center justify-between px-6 py-4 border-b bg-white/70 backdrop-blur">
                  <div className="flex items-center gap-3">
                    <div
                      className="h-9 w-9 rounded-full grid place-items-center text-white shadow"
                      style={{ backgroundColor: primaryColor }}
                    >
                      <Fuel className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-gray-800">
                        Add Fuel Expense
                      </h2>
                      <p className="text-xs text-gray-500">
                        Record fuel expense for a driver.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={closeAddExpense}
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

                {/* Form */}
                <div className="p-8 space-y-6">
                  {/* Driver Field */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Driver <span className="text-red-500">*</span>
                    </label>
                    <select
                      name="driver"
                      value={form.driver}
                      onChange={onFormChange}
                      className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition shadow-sm"
                    >
                      <option value="">Select Driver</option>
                      {driversList.length > 0 ? (
                        driversList.map((d) => (
                          <option key={d.uid} value={d.fullName}>
                            {d.fullName}
                          </option>
                        ))
                      ) : (
                        <option value="" disabled>
                          No available drivers today
                        </option>
                      )}
                    </select>
                  </div>

                  {/* Amount and Unit Row */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Amount <span className="text-red-500">*</span>
                      </label>
                      <input
                        name="amount"
                        type="number"
                        step="0.01"
                        value={form.amount}
                        onChange={onFormChange}
                        placeholder="0.00"
                        className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition shadow-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Unit
                      </label>
                      <input
                        name="unit"
                        value={selectedVehicle}
                        disabled
                        className="w-full border border-gray-200 rounded-lg px-4 py-2.5 bg-gray-50 text-gray-600 cursor-not-allowed shadow-sm"
                      />
                    </div>
                  </div>

                  {/* Officer and Date Row */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Officer In-Charge
                      </label>
                      <input
                        name="officer"
                        value={userName}
                        disabled
                        className="w-full border border-gray-200 rounded-lg px-4 py-2.5 bg-gray-50 text-gray-600 cursor-not-allowed shadow-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Date
                      </label>
                      <input
                        name="date"
                        value={new Date().toLocaleDateString("en-US", {
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        })}
                        disabled
                        className="w-full border border-gray-200 rounded-lg px-4 py-2.5 bg-gray-50 text-gray-600 cursor-not-allowed shadow-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t bg-white/70 backdrop-blur flex justify-end gap-3">
                  <button
                    className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700"
                    onClick={closeAddExpense}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                  <button
                    className="px-4 py-2 rounded-lg text-white hover:opacity-95 disabled:opacity-60 inline-flex items-center gap-2"
                    style={{ backgroundColor: primaryColor }}
                    onClick={saveFuelExpense}
                    disabled={saving}
                  >
                    {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                    {saving ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Fuel Price Modal */}
          {isPriceModalOpen && (
            <div
              className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm p-4"
              onClick={() => setIsPriceModalOpen(false)}
            >
              <div
                className="relative bg-white rounded-2xl shadow-2xl w-[600px] max-w-[90%] overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div className="relative flex items-center justify-between px-8 py-6 border-b bg-white/70 backdrop-blur">
                  <div className="flex items-center gap-4">
                    <div
                      className="h-12 w-12 rounded-full grid place-items-center text-white shadow-lg"
                      style={{ backgroundColor: primaryColor }}
                    >
                      <Lock className="h-6 w-6" />
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold text-gray-800">
                        Update Fuel Price
                      </h2>
                      <p className="text-sm text-gray-500">
                        Enter your password to confirm the price update.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsPriceModalOpen(false)}
                    className="h-10 w-10 rounded-full grid place-items-center border border-gray-200 hover:bg-gray-50"
                    title="Close"
                  >
                    <svg
                      className="h-5 w-5"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4 17.6 5 12 10.6 6.4 5z" />
                    </svg>
                  </button>
                </div>

                {/* Form */}
                <div className="p-8 space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      New Fuel Price (₱/L)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={newPriceInput}
                      onChange={(e) => setNewPriceInput(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-4 py-3 text-lg font-semibold focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-300"
                      placeholder="Enter new price"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Confirm Password
                    </label>
                    <div className="relative">
                      <input
                        type="password"
                        value={passwordInput}
                        onChange={(e) => setPasswordInput(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg pl-12 pr-4 py-3 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-300"
                        placeholder="Enter your password"
                      />
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Lock className="h-5 w-5 text-gray-400" />
                      </div>
                    </div>
                  </div>

                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0">
                        <svg
                          className="h-5 w-5 text-yellow-600"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            fillRule="evenodd"
                            d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-yellow-800">
                          Security Verification Required
                        </h3>
                        <p className="text-sm text-yellow-700 mt-1">
                          Please enter your current password to confirm this
                          fuel price update.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="px-8 py-6 border-t bg-gray-50/50 backdrop-blur flex justify-end gap-4">
                  <button
                    onClick={() => setIsPriceModalOpen(false)}
                    className="px-6 py-3 rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveFuelPrice}
                    className="px-6 py-3 rounded-lg text-white font-medium hover:opacity-90 transition inline-flex items-center gap-2"
                    style={{ backgroundColor: primaryColor }}
                  >
                    <Lock className="h-4 w-4" />
                    Update Price
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* View Fuel Log Modal */}
          {viewing && (
            <div
              className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm p-4"
              onClick={() => setViewing(null)}
            >
              <div
                className="relative bg-white rounded-2xl shadow-2xl w-[850px] max-w-[94%] overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="relative flex items-center justify-between px-8 py-6 border-b bg-white/70 backdrop-blur">
                  <div className="flex items-center gap-4">
                    <div
                      className="h-12 w-12 rounded-full grid place-items-center text-white shadow-lg"
                      style={{ backgroundColor: primaryColor }}
                    >
                      <Fuel className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold text-gray-800">
                        Fuel Expense Details
                      </h3>
                      <p className="text-sm text-gray-500">
                        {formatTimestamp(viewing.timestamp).fullDateTime}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setViewing(null)}
                      className="h-10 w-10 rounded-full grid place-items-center border border-gray-200 hover:bg-gray-50"
                      title="Close"
                    >
                      <svg
                        className="h-5 w-5"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4 17.6 5 12 10.6 6.4 5z" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="p-12 grid grid-cols-2 gap-x-8 gap-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">
                      Driver Name
                    </label>
                    <p className="text-xl text-gray-800 font-semibold">
                      {viewing.driver}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">
                      Officer
                    </label>
                    <p className="text-xl text-gray-800 font-semibold">
                      {viewing.officer}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">
                      Amount Spent
                    </label>
                    <p className="text-xl text-gray-800 font-bold">
                      ₱{viewing.amount.toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">
                      Unit
                    </label>
                    <p className="text-xl text-gray-800 font-semibold">
                      {viewing.vehicle}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">
                      Timestamp
                    </label>
                    <p className="text-xl text-gray-800 font-semibold">
                      {formatTimestamp(viewing.timestamp).fullDateTime}
                    </p>
                  </div>
                </div>

                <div className="px-8 py-6 border-t bg-gray-50/50 backdrop-blur flex justify-end">
                  <button
                    className="px-6 py-3 rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium transition"
                    onClick={() => setViewing(null)}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Warning Modal */}
          {showWarningModal && (
            <div
              className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm p-4"
              onClick={() => setShowWarningModal(false)}
            >
              <div
                className="relative bg-white rounded-xl shadow-2xl w-[480px] max-w-[90%] overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full grid place-items-center text-white bg-yellow-500">
                      <AlertTriangle className="h-4 w-4" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-gray-800">
                        Schedule Warning
                      </h2>
                      <p className="text-xs text-gray-500">
                        Price update outside of regular schedule.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowWarningModal(false)}
                    className="h-8 w-8 rounded-full grid place-items-center border border-gray-200 hover:bg-gray-50"
                    title="Close"
                  >
                    <svg
                      className="h-4 w-4"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4 17.6 5 12 10.6 6.4 5z" />
                    </svg>
                  </button>
                </div>

                {/* Body */}
                <div className="p-6">
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <h3 className="font-semibold text-yellow-800 mb-1">
                          Today is not Tuesday
                        </h3>
                        <p className="text-sm text-yellow-700">
                          Fuel price is usually updated on Tuesday. Are you sure
                          you want to proceed with updating the fuel price
                          today?
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t flex justify-end gap-3">
                  <button
                    onClick={() => setShowWarningModal(false)}
                    className="px-4 py-2 rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={proceedWithPriceUpdate}
                    className="px-4 py-2 rounded-lg bg-yellow-500 text-white font-medium hover:bg-yellow-600 transition inline-flex items-center gap-2"
                  >
                    <AlertTriangle className="h-4 w-4" />
                    Proceed Anyway
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Success Toast */}
          {showSuccessToast && (
            <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[60] transform transition-all duration-300 opacity-100 translate-y-0">
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

          {/* Error Toast */}
          {showErrorToast && (
            <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[60] transform transition-all duration-300 opacity-100 translate-y-0">
              <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-5 py-3 text-red-800 shadow-md w-[520px] max-w-[90vw]">
                <div className="mt-0.5">
                  <svg viewBox="0 0 24 24" className="h-5 w-5 fill-red-500">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                  </svg>
                </div>
                <div className="text-sm">
                  <div className="font-semibold">{errorMessage}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
};

export default FuelLogsPage;