import { useState, useEffect, useCallback } from "react";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  addDoc,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { db } from "../../../firebase";
import { CheckCircle, XCircle } from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  ReferenceLine,
  LabelList,
} from "recharts";
import { exportToCSV, exportToPDF } from "../../functions/exportFunctions";
import { getAuth } from "firebase/auth";

// Helper function to get today's date in YYYY-MM-DD format in local timezone
const getTodayDate = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// Helper function to convert timestamp to Date object
const getDateFromTimestamp = (timestamp) => {
  try {
    if (timestamp && typeof timestamp.toDate === "function") {
      return timestamp.toDate();
    } else if (timestamp && timestamp.seconds) {
      return new Date(timestamp.seconds * 1000);
    } else if (timestamp instanceof Date) {
      return timestamp;
    } else if (typeof timestamp === "string" && !isNaN(Date.parse(timestamp))) {
      return new Date(timestamp);
    } else {
      return null;
    }
  } catch (error) {
    console.error("Error converting timestamp:", error);
    return null;
  }
};

// Helper function to format timestamp with time and date
const formatTimestamp = (timestamp) => {
  try {
    const date = getDateFromTimestamp(timestamp);
    if (!date) {
      return { time: "N/A", date: "N/A", fullDateTime: "N/A" };
    }

    const time = date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    const dateStr = date.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    const fullDateTime = `${dateStr}, ${time}`;

    return { time, date: dateStr, fullDateTime };
  } catch (error) {
    console.error("Error formatting timestamp:", error);
    return { time: "Invalid", date: "Invalid", fullDateTime: "Invalid" };
  }
};

const QuotaSummary = () => {
  const [quotaData, setQuotaData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [unitData, setUnitData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search] = useState("");
  const [driverSearch, setDriverSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [userRole, setUserRole] = useState("User");
  const [generalTarget, setGeneralTarget] = useState(0);
  const [users, setUsers] = useState({});

  const [filterStartDate, setFilterStartDate] = useState(getTodayDate());
  const [filterEndDate, setFilterEndDate] = useState("");
  const [stats, setStats] = useState({
    totalOfficers: 0,
    totalQuotaAssigned: 0,
    quotaMet: 0,
    quotaNotMet: 0,
  });

  const auth = getAuth();
  const currentUser = auth.currentUser;
  const userName =
    currentUser?.displayName || currentUser?.email || "Unknown User";

  const primaryColor = "#364C6E";
  const secondaryColor = "#405a88";

  const toggleDropdown = () => setIsDropdownOpen(!isDropdownOpen);

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
        setUserRole(userData.role || "User");
      } else {
        setUserRole("User");
      }
    } catch (error) {
      console.error("Error fetching user role:", error);
      setUserRole("User");
    }
  }, [currentUser?.uid]);

  // Function to map user roles to display roles for logging
  const mapRoleForLogging = (role) => {
    const adminRoles = ["Admin"];
    return adminRoles.includes(role) ? "System Admin" : role;
  };

  // Function to log system activities with mapped role
  const logSystemActivity = async (activity, performedBy, role = null) => {
    try {
      const displayRole = role
        ? mapRoleForLogging(role)
        : mapRoleForLogging(userRole);

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

  // Real-time listener for quota targets
  const setupQuotaTargetListener = useCallback(() => {
    try {
      const targetRef = collection(db, "quotaTarget");

      const unsubscribe = onSnapshot(targetRef, (querySnapshot) => {
        if (!querySnapshot.empty) {
          const latestDoc = querySnapshot.docs.reduce((latest, doc) => {
            const data = doc.data();
            return !latest || data.timestamp.toDate() > latest.timestamp.toDate()
              ? data
              : latest;
          }, null);

          setGeneralTarget(parseFloat(latestDoc.target) || 0);
        } else {
          setGeneralTarget(0);
        }
      }, (error) => {
        console.error("Error listening to quota targets:", error);
      });

      return unsubscribe;
    } catch (error) {
      console.error("Error setting up quota target listener:", error);
    }
  }, []);

  // Real-time listener for users collection
  const setupUsersListener = useCallback(() => {
    try {
      const usersRef = collection(db, "users");

      const unsubscribe = onSnapshot(usersRef, (querySnapshot) => {
        const usersMap = {};
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          usersMap[doc.id] = `${data.firstName} ${data.lastName}`;
        });
        setUsers(usersMap);
      }, (error) => {
        console.error("Error listening to users:", error);
      });

      return unsubscribe;
    } catch (error) {
      console.error("Error setting up users listener:", error);
    }
  }, []);

  // Real-time listener for unit data to get dispatched drivers
  const setupUnitDataListener = useCallback(() => {
    try {
      const unitRef = collection(db, "unit");
      const q = query(unitRef, where("status", "==", "Dispatched"));

      const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const dispatchedDrivers = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          if (data.unitHolder) {
            dispatchedDrivers.push(data.unitHolder);
          }
        });
        setUnitData(dispatchedDrivers);
      }, (error) => {
        console.error("Error listening to unit data:", error);
      });

      return unsubscribe;
    } catch (error) {
      console.error("Error setting up unit data listener:", error);
    }
  }, []);

  // Real-time listener for transactions
  const setupTransactionsListener = useCallback(() => {
    try {
      const transactionsRef = collection(db, "transactions");
      const q = query(transactionsRef, where("isVoided", "==", false));

      const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const transactionData = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          transactionData.push({
            id: doc.id,
            driverUID: data.driverUID,
            farePrice: data.farePrice || 0,
            timestamp: data.timestamp?.toDate
              ? data.timestamp.toDate()
              : data.timestamp || null,
          });
        });
        setTransactions(transactionData);
      }, (error) => {
        console.error("Error listening to transactions:", error);
      });

      return unsubscribe;
    } catch (error) {
      console.error("Error setting up transactions listener:", error);
    }
  }, []);

  // Function to calculate total fare for a driver within date range
  const calculateDriverTotalFare = (personnelID) => {
    return transactions.reduce((total, transaction) => {
      if (transaction.driverUID !== personnelID) return total;

      const transactionDate = getDateFromTimestamp(transaction.timestamp);
      if (!transactionDate) return total;

      const year = transactionDate.getFullYear();
      const month = String(transactionDate.getMonth() + 1).padStart(2, "0");
      const day = String(transactionDate.getDate()).padStart(2, "0");
      const transactionDateString = `${year}-${month}-${day}`;

      // Apply date filtering
      if (filterStartDate && !filterEndDate) {
        if (transactionDateString === filterStartDate) {
          return total + transaction.farePrice;
        }
      } else if (filterStartDate && filterEndDate) {
        if (transactionDateString >= filterStartDate && transactionDateString <= filterEndDate) {
          return total + transaction.farePrice;
        }
      } else if (!filterStartDate && filterEndDate) {
        if (transactionDateString <= filterEndDate) {
          return total + transaction.farePrice;
        }
      } else {
        return total + transaction.farePrice;
      }

      return total;
    }, 0);
  };

  // Real-time listener for quota data
  const setupQuotaListener = useCallback(() => {
    setLoading(true);
    try {
      const quotaRef = collection(db, "quota");
      const q = query(quotaRef, orderBy("lastUpdated", "desc"));

      const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const data = [];
        querySnapshot.forEach((doc) => {
          const log = doc.data();
          const driverName = users[log.personnelID] || log.personnelID || "N/A";

          // Only include dispatched drivers
          if (unitData.includes(log.personnelID)) {
            data.push({
              id: doc.id,
              target: generalTarget,
              personnelID: log.personnelID || "N/A",
              driverName,
              updatedAt: log.lastUpdated?.toDate
                ? log.lastUpdated.toDate()
                : new Date(),
              date: log.date?.toDate() || null,
            });
          }
        });

        // Filter unique drivers
        const uniqueData = data.filter(
          (log, index, self) =>
            index === self.findIndex((l) => l.personnelID === log.personnelID)
        );

        setQuotaData(uniqueData);
        setFilteredData(uniqueData);
        setLoading(false);
      }, (error) => {
        console.error("Error listening to quota data:", error);
        setLoading(false);
      });

      return unsubscribe;
    } catch (error) {
      console.error("Error setting up quota listener:", error);
      setLoading(false);
    }
  }, [generalTarget, users, unitData]);

  // Calculate stats based on filtered data with actual fare totals
  const calculateFilteredStats = useCallback(() => {
    const totalQuotaAssigned = generalTarget;
    const quotaMet = filteredData.filter((d) => {
      const currentTotal = calculateDriverTotalFare(d.personnelID);
      return currentTotal >= d.target;
    }).length;
    const quotaNotMet = filteredData.length - quotaMet;

    setStats({
      totalOfficers: filteredData.length,
      totalQuotaAssigned,
      quotaMet,
      quotaNotMet,
    });
  }, [filteredData, generalTarget, transactions, filterStartDate, filterEndDate]);

  // Pie chart data - based on filtered data
  const pieData = [
    { name: "Quota Met", value: stats.quotaMet },
    { name: "Quota Not Met", value: stats.quotaNotMet },
  ];

  // Bar chart data - based on filtered data with actual totals
  const barData = filteredData.map((d) => ({
    driver: d.driverName,
    target: d.target,
    current: calculateDriverTotalFare(d.personnelID),
  }));

  // Reset filters function
  const resetFilters = () => {
    setFilterStartDate("");
    setFilterEndDate("");
    setDriverSearch("");
    setFilterStatus("");
  };

  // Enhanced export functions
  const handleExportCSV = async () => {
    try {
      exportToCSV(
        headers,
        rows,
        "Quota-Summary-Report.csv",
        userName,
        "Quota-Summary-Report"
      );

      await logSystemActivity("Exported Quota Summary Report to CSV", userName);

      setIsDropdownOpen(false);
    } catch (error) {
      console.error("Error during CSV export:", error);
    }
  };

  const handleExportPDF = async () => {
    try {
      exportToPDF(
        headers,
        rows,
        "Quota-Summary-Report",
        "Quota-Summary-Report.pdf",
        userName
      );

      await logSystemActivity("Exported Quota Summary Report to PDF", userName);

      setIsDropdownOpen(false);
    } catch (error) {
      console.error("Error during PDF export:", error);
    }
  };

  // Setup all real-time listeners
  useEffect(() => {
    const initData = async () => {
      await fetchUserRole();
    };
    initData();

    const unsubscribeTarget = setupQuotaTargetListener();
    const unsubscribeUsers = setupUsersListener();
    const unsubscribeTransactions = setupTransactionsListener();
    const unsubscribeUnitData = setupUnitDataListener();

    return () => {
      if (unsubscribeTarget) unsubscribeTarget();
      if (unsubscribeUsers) unsubscribeUsers();
      if (unsubscribeTransactions) unsubscribeTransactions();
      if (unsubscribeUnitData) unsubscribeUnitData();
    };
  }, [setupQuotaTargetListener, setupUsersListener, setupTransactionsListener, setupUnitDataListener, fetchUserRole]);

  // Setup quota listener after target, users, and unitData are loaded
  useEffect(() => {
    if (generalTarget !== null && Object.keys(users).length > 0 && unitData.length >= 0) {
      const unsubscribeQuota = setupQuotaListener();
      return () => {
        if (unsubscribeQuota) unsubscribeQuota();
      };
    }
  }, [generalTarget, users, unitData, setupQuotaListener]);

  // Filter data whenever dependencies change
  useEffect(() => {
    let filtered = quotaData.filter((log) =>
      log.driverName.toLowerCase().includes(search.toLowerCase())
    );

    // Driver search filter
    if (driverSearch.trim()) {
      const searchQuery = driverSearch.trim().toLowerCase();
      filtered = filtered.filter((log) => {
        const driverName = (log.driverName || "").toLowerCase();
        return driverName.includes(searchQuery);
      });
    }

    if (filterStatus) {
      filtered = filtered.filter((log) => {
        const currentTotal = calculateDriverTotalFare(log.personnelID);
        const isMet = currentTotal >= log.target;
        return filterStatus === "Met" ? isMet : !isMet;
      });
    }

    setFilteredData(filtered);
  }, [
    search,
    driverSearch,
    filterStatus,
    filterStartDate,
    filterEndDate,
    quotaData,
    transactions,
  ]);

  // Update stats whenever filtered data changes
  useEffect(() => {
    calculateFilteredStats();
  }, [calculateFilteredStats]);

  const headers = [
    "Driver",
    "Quota Target",
    "Current Total",
    "Status",
    "Updated At",
  ];
  const rows = filteredData.map((d) => {
    const { fullDateTime } = formatTimestamp(d.updatedAt);
    const currentTotal = calculateDriverTotalFare(d.personnelID);
    const isMet = currentTotal >= d.target;
    return [
      d.driverName,
      `₱${d.target.toFixed(2)}`,
      `₱${currentTotal.toFixed(2)}`,
      isMet ? "Met" : "Not Met",
      fullDateTime,
    ];
  });

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div
          className="animate-spin rounded-full h-32 w-32 border-b-2"
          style={{ borderColor: primaryColor }}
        ></div>
      </div>
    );
  }

  return (
    <main className="flex-1 p-8 mx-auto">
      <div className="mx-auto w-full max-w-[1900px]">
        <div
          className="bg-white border rounded-xl shadow-sm flex flex-col"
          style={{ minHeight: "calc(100vh - 112px)" }}
        >
          {/* Header + Filters */}
          <div className="px-6 pt-6 pb-4 border-b flex items-center justify-between">
            <h1 className="text-2xl font-semibold text-gray-800">
              Quota Summary
            </h1>

            <div className="flex items-center gap-3">
              {/* Filter Date */}
              <div className="flex flex-col">
                <label className="text-sm font-medium text-gray-700 mb-1">
                  Start Date
                </label>
                <div className="relative flex items-center gap-2 rounded-lg border border-gray-300 bg-white shadow-lg hover:shadow-xl focus-within:ring-1 focus-within:ring-blue-300 px-3 py-2">
                  <input
                    type="date"
                    className="bg-transparent text-sm outline-none"
                    value={filterStartDate}
                    onChange={(e) => setFilterStartDate(e.target.value)}
                  />
                </div>
              </div>

              {/* End Date Filter */}
              <div className="flex flex-col">
                <label className="text-sm font-medium text-gray-700 mb-1">
                  End Date
                </label>
                <div className="relative flex items-center gap-2 rounded-lg border border-gray-300 bg-white shadow-lg hover:shadow-xl focus-within:ring-1 focus-within:ring-blue-300 px-3 py-2">
                  <input
                    type="date"
                    className="bg-transparent text-sm outline-none"
                    value={filterEndDate}
                    onChange={(e) => setFilterEndDate(e.target.value)}
                  />
                </div>
              </div>

              {/* Driver Search Filter */}
              <div className="flex flex-col">
                <label className="text-sm font-medium text-gray-700 mb-1">
                  Search Driver
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search driver name"
                    className="w-[280px] rounded-full border border-gray-200 pl-10 pr-3 py-2.5 text-sm shadow-sm focus:ring-4 focus:ring-blue-100 focus:border-blue-300 outline-none"
                    value={driverSearch}
                    onChange={(e) => setDriverSearch(e.target.value)}
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

              {/* Filter Status */}
              <div className="flex flex-col">
                <label className="text-sm font-medium text-gray-700 mb-1">
                  Status
                </label>
                <div className="relative flex items-center gap-2 rounded-lg border border-gray-300 bg-white shadow-lg hover:shadow-xl focus-within:ring-1 focus-within:ring-blue-300 px-3 py-2">
                  <select
                    className="bg-transparent pr-6 text-sm outline-none"
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                  >
                    <option value="">Filter By Status</option>
                    <option value="Met">Met</option>
                    <option value="NotMet">Not Met</option>
                  </select>
                </div>
              </div>

              {/* Reset Button */}
              <div className="flex flex-col">
                <label className="text-sm font-medium text-gray-700 mb-1 opacity-0">
                  Reset
                </label>
                <button
                  onClick={resetFilters}
                  className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 transition duration-200"
                >
                  Reset Filters
                </button>
              </div>

              {/* Export */}
              <div className="relative flex flex-col">
                <label className="text-sm font-medium text-gray-700 mb-1 opacity-0">
                  Export
                </label>
                <button
                  onClick={toggleDropdown}
                  className="flex items-center gap-2 px-9 py-2 rounded-lg text-white shadow-md hover:shadow-lg transition"
                  style={{ backgroundColor: primaryColor }}
                >
                  <span className="font-semibold">Export</span>
                </button>

                {isDropdownOpen && (
                  <div className="absolute right-0 top-full w-40 mt-2 bg-white shadow-lg rounded-lg z-10">
                    <ul className="text-sm">
                      <li>
                        <button
                          onClick={handleExportCSV}
                          className="block px-4 py-2 text-gray-800 hover:bg-gray-100 w-full text-left"
                        >
                          Export to Excel
                        </button>
                      </li>
                      <li>
                        <button
                          onClick={handleExportPDF}
                          className="block px-4 py-2 text-gray-800 hover:bg-gray-100 w-full text-left"
                        >
                          Export to PDF
                        </button>
                      </li>
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="px-6 py-6 mt-5.5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white rounded-lg shadow-md p-6 flex items-center justify-between">
              <div
                className="p-3 rounded-full mr-4"
                style={{ backgroundColor: `${secondaryColor}20` }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-6 h-6"
                  viewBox="0 0 24 24"
                  fill={secondaryColor}
                >
                  <path d="M12 2a3 3 0 100 6 3 3 0 000-6zm0 8c-2.67 0-8 1.34-8 4v3h16v-3c0-2.66-5.33-4-8-4z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">
                  Total Drivers
                </p>
                <p className="text-2xl font-bold text-gray-900">
                  {stats.totalOfficers.toLocaleString()}
                </p>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-md p-6 flex items-center justify-between">
              <div className="flex items-center justify-center w-12 h-12 rounded-full mr-4 bg-yellow-100">
                <span className="text-yellow-600 font-bold text-lg">₱</span>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">
                  Quota Target
                </p>
                <p className="text-2xl font-bold text-gray-900">
                  ₱{stats.totalQuotaAssigned.toFixed(2)}
                </p>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-md p-6 flex items-center justify-between">
              <div className="flex items-center justify-center w-12 h-12 rounded-full mr-4 bg-green-100">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Quota Met</p>
                <p className="text-2xl font-bold text-gray-900">
                  {stats.quotaMet}
                </p>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-md p-6 flex items-center justify-between">
              <div className="flex items-center justify-center w-12 h-12 rounded-full mr-4 bg-red-100">
                <XCircle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">
                  Quota Not Met
                </p>
                <p className="text-2xl font-bold text-gray-900">
                  {stats.quotaNotMet}
                </p>
              </div>
            </div>
          </div>

          <div className="px-6 py-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Pie Chart */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-lg font-semibold mb-4 text-gray-700">
                Quota Met vs Not Met
              </h2>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    fill="#8884d8"
                    label
                  >
                    <Cell key="met" fill="#3E8E6A" />
                    <Cell key="notMet" fill="#A62639" />
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Quota Performance Chart */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-lg font-semibold mb-4 text-gray-700">
                Quota Performance
              </h2>
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={barData}>
                  <XAxis dataKey="driver" tick={{ fontSize: 12 }} />
                  <YAxis />
                  <Tooltip />
                  <Legend />

                  <Bar
                    dataKey="current"
                    fill="#406DAF"
                    name="Current Total"
                    barSize={40}
                  >
                    <LabelList
                      dataKey="current"
                      position="top"
                      fill="#406DAF"
                      fontSize={12}
                      formatter={(value) => value.toLocaleString()}
                    />
                  </Bar>

                  <ReferenceLine
                    y={
                      barData.length > 0
                        ? Math.max(...barData.map((d) => d.target))
                        : 0
                    }
                    stroke="#2848a7ff"
                    strokeDasharray="6 6"
                    strokeWidth={2}
                    ifOverflow="extendDomain"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Table */}
          <div className="p-6 overflow-x-auto flex-1">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500 uppercase tracking-wider">
                    Current Total
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500 uppercase tracking-wider">
                    Result
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500 uppercase tracking-wider">
                    Updated At
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredData.map((log) => {
                  const { time, date } = formatTimestamp(log.updatedAt);
                  const currentTotal = calculateDriverTotalFare(log.personnelID);
                  const isMet = currentTotal >= log.target;
                  
                  return (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {log.driverName}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ₱{log.target.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ₱{currentTotal.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span
                          className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${
                            isMet
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {isMet ? "Met" : "Not Met"}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <div className="text-sm">
                          <div>{time}</div>
                          <div className="text-gray-600">{date}</div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredData.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-6 py-4 text-center text-sm text-gray-500"
                    >
                      No records found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
};

export default QuotaSummary;
