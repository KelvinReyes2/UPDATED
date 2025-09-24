import { useState, useEffect, useMemo } from "react";
import { Fuel, Lock, AlertTriangle } from "lucide-react";
import {
  collection,
  getDocs,
  getDoc,
  addDoc,
  serverTimestamp,
  updateDoc,
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

  const [fuelPrice, setFuelPrice] = useState(0.0);
  const [search, setSearch] = useState("");
  const [logs, setLogs] = useState([]);
  const [driversList, setDriversList] = useState([]);
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
  const [userRole, setUserRole] = useState("");
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [selectedDriverUnit, setSelectedDriverUnit] = useState("N/A");
  const [dateFilter, setDateFilter] = useState(
    new Date().toISOString().split("T")[0]
  );

  const primaryColor = "#364C6E";

  useEffect(() => {
  const fetchUserRole = async () => {
    if (currentUser?.uid) {
      try {
        const userRef = doc(db, "users", currentUser.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          setUserRole(userSnap.data().role || "User");
        }
      } catch (error) {
        console.error("Error fetching user role:", error);
        setUserRole("User");
      }
    }
  };

  fetchUserRole();
}, [currentUser]);

  // Function to log system activities
  const logSystemActivity = async (activity, performedBy) => {
  try {
    await addDoc(collection(db, "systemLogs"), {
      activity,
      performedBy,
      role: userRole, // Use the actual user role from database
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

  // Fetch Fuel Logs
  useEffect(() => {
  const fetchLogs = async () => {
    try {
      const logsRef = collection(db, "fuelLogs");
      const q = query(logsRef, orderBy("timestamp", "desc"));
      const unsub = onSnapshot(
        q,
        async (snapshot) => {
          const logsData = [];
          
          for (const logDoc of snapshot.docs) {
            const log = logDoc.data();
            
            // Fetch unit ID for this driver
            const unitId = await fetchUnitForDriver(log.Driver || "");
            
            logsData.push({
              id: logDoc.id,
              date: log.timestamp?.toDate
                ? log.timestamp.toDate().toLocaleDateString()
                : "N/A",
              driver: log.Driver || "N/A",
              officer: log.Officer || "N/A",
              amount: parseFloat(log.fuelAmount) || 0,
              vehicle: unitId, // This will now show the actual unit ID
              timestamp: log.timestamp,
            });
          }
          
          setLogs(logsData);
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

  // Fetch Drivers List
  useEffect(() => {
    const fetchDrivers = async () => {
      try {
        const usersRef = collection(db, "users");
        const q = query(usersRef, where("role", "in", ["Driver", "Reliever"]));
        const snapshot = await getDocs(q);

        const today = new Date().toDateString();

        const drivers = snapshot.docs
          .map((doc) => ({ uid: doc.id, ...doc.data() }))
          .filter((d) => {
            const fullName = `${d.firstName} ${d.lastName}`;
            return !logs.some(
              (l) =>
                l.driver === fullName &&
                new Date(l.date).toDateString() === today
            );
          })
          .map((d) => ({
            uid: d.uid,
            fullName: `${d.firstName} ${d.lastName}`,
          }));

        setDriversList(drivers);
      } catch (err) {
        console.error("Error fetching drivers:", err);
      }
    };

    fetchDrivers();
  }, [logs]);

  const fetchUnitForDriver = async (driverName) => {
  try {
    // Find user by full name
    const usersRef = collection(db, "users");
    const userQuery = query(usersRef, where("role", "in", ["Driver", "Reliever"]));
    const userSnapshot = await getDocs(userQuery);
    
    const matchingUser = userSnapshot.docs.find(userDoc => {
      const userData = userDoc.data();
      const fullName = `${userData.firstName} ${userData.lastName}`;
      return fullName === driverName;
    });
    
    if (!matchingUser) {
      console.log("No matching user found for:", driverName);
      return "N/A";
    }
    
    const userId = matchingUser.id;
    console.log("Found user ID:", userId);
    
    // Find unit where unitHolder equals this user's ID
    const unitRef = collection(db, "unit"); // Fixed: "unit" not "units"
    const unitQuery = query(unitRef, where("unitHolder", "==", userId));
    const unitSnapshot = await getDocs(unitQuery);
    
    if (!unitSnapshot.empty) {
      const unitDoc = unitSnapshot.docs[0];
      console.log("Found unit:", unitDoc.id);
      return unitDoc.id; // This returns "AC1A2B", "AC3C4D", etc.
    }
    
    console.log("No unit found for user:", userId);
    return "N/A";
  } catch (error) {
    console.error("Error fetching unit for driver:", driverName, error);
    return "N/A";
  }
};
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

      // Log the activity
      await logSystemActivity(
        `Updated fuel price to ₱${price.toFixed(2)}`,
        userName
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
  
  // If driver is changed, fetch their unit
  if (name === "driver" && value) {
    const unitId = await fetchUnitForDriver(value);
    setSelectedDriverUnit(unitId);
  } else if (name === "driver" && !value) {
    setSelectedDriverUnit("N/A");
  }
};

// Update your closeAddExpense function to reset the unit
const closeAddExpense = () => {
  setIsAddExpenseOpen(false);
  setForm({ driver: "", amount: "" });
  setSelectedDriverUnit("N/A"); // Reset unit when closing
};

  // Save Fuel Expense
  const saveFuelExpense = async () => {
  if (!form.driver || !form.amount) {
    showError("Driver and Amount are required.");
    return;
  }
    setSaving(true);
    try {
      const unitId = await fetchUnitForDriver(form.driver);
      const logRef = await addDoc(collection(db, "fuelLogs"), {
        Driver: form.driver,
        status: "done",
        Officer: currentUser?.displayName || currentUser?.email,
        fuelAmount: parseFloat(form.amount),
        Vehicle: unitId,
        timestamp: serverTimestamp(),
      });

      const driverDoc = driversList.find((d) => d.fullName === form.driver);
      if (driverDoc) {
        const docRef = doc(db, "users", driverDoc.uid);
        await updateDoc(docRef, { fuelStatus: "done" });
      }

      // Log the activity
      await logSystemActivity(
        `Added fuel expense for ${form.driver} - ₱${parseFloat(form.amount).toFixed(2)}`,
        userName
      );

      showToast("Fuel expense added successfully!");
      closeAddExpense();

      setLogs((prev) => [
        ...prev,
        {
          id: logRef.id,
          driver: form.driver,
          officer: currentUser?.displayName || currentUser?.email,
          amount: parseFloat(form.amount),
          status: "done",
          vehicle: unitId,
          date: new Date().toLocaleDateString(),
          timestamp: serverTimestamp(),
        },
      ]);
    } catch (err) {
      console.error(err);
      showError("Failed to save fuel expense.");
    } finally {
      setSaving(false);
    }
  };

  // Export functions
  const headers = [
    "ID",
    "Date",
    "Driver Name",
    "Officer",
    "Amount Spent",
    "Unit",
  ];

  const rows = filteredLogs.map((log, index) => [
    index + 1,
    log.date,
    log.driver,
    log.officer,
    `₱${log.amount.toFixed(2)}`,
    log.vehicle,
  ]);

  const toggleDropdown = () => {
    setIsDropdownOpen((prev) => !prev);
  };

  const handleExportToCSV = async () => {
    try {
      await exportToCSV(
        headers,
        rows,
        "Fuel-Logs-Report",
        "Fuel-Logs-Report.csv",
        currentUser?.email || "Unknown"
      );

      // Log the export activity
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

      // Log the export activity
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
      name: "Date",
      selector: (r) => r.date,
      sortable: true,
      grow: 1,
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
          className="bg-white border rounded-xl shadow-sm flex flex-col"
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
                <input
                  type="date"
                  className="rounded-full border border-gray-200 px-4 py-2.5 text-sm text-gray-500 shadow-sm focus:ring-4 focus:ring-blue-100 focus:border-blue-300 outline-none"
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
            <div className="bg-white border rounded-xl shadow-sm p-6 w-72">
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
            <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
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
                <div className="p-12 grid grid-cols-3 gap-x-5 gap-y-4">
                  <div className="col-span-3">
                    <label className="block text-sm text-gray-600 mb-1">
                      Driver
                    </label>
                    <select
                      name="driver"
                      value={form.driver}
                      onChange={onFormChange}
                      className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-300"
                    >
                      <option value="">Select Driver</option>
                      {driversList.map((d) => (
                        <option key={d.uid} value={d.fullName}>
                          {d.fullName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-3">
                    <label className="block text-sm text-gray-600 mb-1">
                      Amount
                    </label>
                    <input
                      name="amount"
                      type="number"
                      value={form.amount}
                      onChange={onFormChange}
                      className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-300"
                    />
                  </div>
                  <div className="col-span-1">
                    <label className="block text-sm text-gray-600 mb-1">
                      Officer
                    </label>
                    <input
                      name="officer"
                      value={currentUser?.displayName || currentUser?.email}
                      disabled
                      className="w-full border rounded-md px-3 py-2 bg-gray-100 cursor-not-allowed"
                    />
                  </div>
                  <div className="col-span-1">
                    <label className="block text-sm text-gray-600 mb-1">
                      Date
                    </label>
                    <input
                      name="date"
                      value={new Date().toLocaleDateString()}
                      disabled
                      className="w-full border rounded-md px-3 py-2 bg-gray-100 cursor-not-allowed"
                    />
                  </div>
                  <div className="col-span-1">
                    <label className="block text-sm text-gray-600 mb-1">
                     Unit
                    </label>
                    <input
                      name="unit"
                      value={selectedDriverUnit}
                      disabled
                      className="w-full border rounded-md px-3 py-2 bg-gray-100 cursor-not-allowed"
                    />
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
                      <p className="text-sm text-gray-500">{viewing.date}</p>
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
                      Date
                    </label>
                    <p className="text-xl text-gray-800 font-semibold">
                      {viewing.date}
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
