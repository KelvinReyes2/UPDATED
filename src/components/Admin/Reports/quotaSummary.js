import { useState, useEffect, useCallback } from "react";
import {
  collection,
  getDocs,
  query,
  orderBy,
  addDoc,
  serverTimestamp,
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

const QuotaSummary = () => {
  const [quotaData, setQuotaData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search] = useState("");
  const [driverSearch, setDriverSearch] = useState(""); // Driver search state
  const [filterStatus, setFilterStatus] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [userRole, setUserRole] = useState("User"); // Add state for user role

  const [filterStartDate, setFilterStartDate] = useState(getTodayDate()); // Use helper function for today's date
  const [filterEndDate, setFilterEndDate] = useState(""); // Add end date state
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

  // Helper function to convert timestamp to Date object
  const getDateFromTimestamp = (timestamp) => {
    try {
      // Handle Firestore Timestamp
      if (timestamp && typeof timestamp.toDate === "function") {
        return timestamp.toDate();
      }
      // Handle timestamp object with seconds property (Firestore)
      else if (timestamp && timestamp.seconds) {
        return new Date(timestamp.seconds * 1000);
      }
      // Handle JavaScript Date
      else if (timestamp instanceof Date) {
        return timestamp;
      } else if (
        typeof timestamp === "string" &&
        !isNaN(Date.parse(timestamp))
      ) {
        return new Date(timestamp);
      } else {
        return null;
      }
    } catch (error) {
      console.error("Error converting timestamp:", error);
      return null;
    }
  };

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
  const mapRoleForLogging = (role) => {
    // Map certain roles to "System Admin" for logging purposes
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

  const fetchQuotaData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch all quota targets
      const targetSnap = await getDocs(collection(db, "quotaTarget"));
      let generalTarget = 0;

      if (!targetSnap.empty) {
        // pick the latest by timestamp
        const latestDoc = targetSnap.docs.reduce((latest, doc) => {
          const data = doc.data();
          return !latest || data.timestamp.toDate() > latest.timestamp.toDate()
            ? data
            : latest;
        }, null);

        generalTarget = parseFloat(latestDoc.target) || 0;
      }

      // Fetch quota logs
      const quotaRef = collection(db, "quota");
      const q = query(quotaRef, orderBy("lastUpdated", "desc"));
      const snapshot = await getDocs(q);

      const data = await Promise.all(
        snapshot.docs.map(async (doc) => {
          const log = doc.data();
          const driverName = await fetchDriverName(log.personnelID);

          return {
            id: doc.id,
            target: generalTarget, // use the latest general quota
            currentTotal: parseFloat(log.currentTotal) || 0,
            isMet: log.isMet || false,
            personnelID: log.personnelID || "N/A",
            driverName, // Changed from officerName to driverName
            updatedAt: log.lastUpdated?.toDate
              ? log.lastUpdated.toDate()
              : new Date(),
            date: log.date?.toDate() || null, // Add date field from quota db
          };
        })
      );

      // Filter unique drivers
      const uniqueData = data.filter(
        (log, index, self) =>
          index === self.findIndex((l) => l.personnelID === log.personnelID)
      );

      setQuotaData(uniqueData);
      setFilteredData(uniqueData);
    } catch (err) {
      console.error("Error fetching quota data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDriverName = async (personnelID) => {
    if (!personnelID) return "N/A";
    try {
      const docRef = doc(db, "users", personnelID);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        return `${data.firstName} ${data.lastName}`;
      } else {
        return personnelID; // fallback if user not found
      }
    } catch (err) {
      console.error("Error fetching driver name:", err);
      return personnelID;
    }
  };

  // Calculate stats based on filtered data
  const calculateFilteredStats = useCallback(() => {
    const totalQuotaAssigned = quotaData.length > 0 ? quotaData[0].target : 0;
    const quotaMet = filteredData.filter((d) => d.isMet).length;
    const quotaNotMet = filteredData.length - quotaMet;

    setStats({
      totalOfficers: filteredData.length,
      totalQuotaAssigned,
      quotaMet,
      quotaNotMet,
    });
  }, [filteredData, quotaData]);

  // Pie chart data - based on filtered data
  const pieData = [
    { name: "Quota Met", value: stats.quotaMet },
    { name: "Quota Not Met", value: stats.quotaNotMet },
  ];

  // Bar chart data - based on filtered data
  const barData = filteredData.map((d) => ({
    driver: d.driverName,
    target: d.target,
    current: d.currentTotal,
  }));

  // Enhanced export functions with role mapping
  const handleExportCSV = async () => {
    try {
      exportToCSV(
        headers,
        rows,
        "Quota-Summary-Report",
        "Quota-Summary-Report.csv",
        userName
      );

      // Log the export activity (role will be mapped in logSystemActivity)
      await logSystemActivity("Printed Quota Summary Report ", userName);

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

      // Log the export activity (role will be mapped in logSystemActivity)
      await logSystemActivity("Printed Quota Summary Report", userName);

      setIsDropdownOpen(false);
    } catch (error) {
      console.error("Error during PDF export:", error);
    }
  };

  // Fetch user role on component mount
  useEffect(() => {
    fetchUserRole();
  }, [fetchUserRole]);

  useEffect(() => {
    fetchQuotaData();
  }, [fetchQuotaData]);

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
      filtered = filtered.filter((log) =>
        filterStatus === "Met" ? log.isMet : !log.isMet
      );
    }

    // Date range filtering using the date column from quota db
    if (filterStartDate || filterEndDate) {
      filtered = filtered.filter((log) => {
        // Use the date column instead of updatedAt
        const logDate = log.date ? getDateFromTimestamp(log.date) : null;
        if (!logDate) return false; // Skip records without date

        // Convert log date to local date string in YYYY-MM-DD format
        const year = logDate.getFullYear();
        const month = String(logDate.getMonth() + 1).padStart(2, "0");
        const day = String(logDate.getDate()).padStart(2, "0");
        const logDateString = `${year}-${month}-${day}`;

        // If only start date is provided, show logs from that specific date only
        if (filterStartDate && !filterEndDate) {
          return logDateString === filterStartDate;
        }
        // If both dates are provided, show logs in the range
        else if (filterStartDate && filterEndDate) {
          return (
            logDateString >= filterStartDate && logDateString <= filterEndDate
          );
        }
        // If only end date is provided (unlikely but handle it)
        else if (!filterStartDate && filterEndDate) {
          return logDateString <= filterEndDate;
        }

        return true;
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
  const rows = filteredData.map((d) => [
    d.driverName,
    `₱${d.target.toFixed(2)}`,
    `₱${d.currentTotal.toFixed(2)}`,
    d.isMet ? "Met" : "Not Met",
    new Date(d.updatedAt).toLocaleString(),
  ]);

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

          {/* Stats Cards - Now reflect filtered data */}
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

                  {/* Bar = current total with labels */}
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

                  {/* Broken line across chart for target quota */}
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
                    Driver
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500 uppercase tracking-wider">
                    Quota Target
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500 uppercase tracking-wider">
                    Current Total
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500 uppercase tracking-wider">
                    Updated At
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredData.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {log.driverName}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      ₱{log.target.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      ₱{log.currentTotal.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span
                        className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${
                          log.isMet
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {log.isMet ? "Met" : "Not Met"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(log.updatedAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
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
