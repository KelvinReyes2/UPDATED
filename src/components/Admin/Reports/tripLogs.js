import React, { useEffect, useState, useCallback } from "react";
import {
  collection,
  getDocs,
  query,
  where,
  addDoc,
  serverTimestamp,
  doc,
  getDoc,
} from "firebase/firestore";
import { db } from "../../../firebase";
import { FaWallet } from "react-icons/fa";
import "jspdf-autotable";
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

const TripLogs = () => {
  const [users, setUsers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [selectedRoute, setSelectedRoute] = useState("");
  const [driverSearch, setDriverSearch] = useState(""); // Driver search state
  // Set default start date to today using the helper function
  const [selectedStartDate, setSelectedStartDate] = useState(getTodayDate());
  const [selectedEndDate, setSelectedEndDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [userRole, setUserRole] = useState("User"); // Add state for user role

  const primaryColor = "#364C6E";

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

  // Fetch users with role Driver or Reliever, status Active
  const fetchUsers = async () => {
    setLoading(true);
    try {
      const usersRef = collection(db, "users");
      const q = query(
        usersRef,
        where("role", "in", ["Driver", "Reliever"]),
        where("status", "==", "Active")
      );
      const querySnapshot = await getDocs(q);
      const userData = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        userData.push({
          id: doc.id,
          displayName: `${data.firstName || ""} ${data.lastName || ""}`.trim(),
          role: data.role,
          status: data.status,
        });
      });
      setUsers(userData);
    } catch (error) {
      console.error("Error fetching users:", error);
      setErr("Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  // Fetch all non-voided transactions
  const fetchTransactions = async () => {
    try {
      const transactionsRef = collection(db, "transactions");
      const q = query(transactionsRef, where("isVoided", "==", false));
      const querySnapshot = await getDocs(q);
      const transactionData = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        transactionData.push({
          id: doc.id, // Add transaction ID for distinct counting
          driverUID: data.driverUID,
          farePrice: data.farePrice || 0,
          paymentMethod: data.paymentMethod || "",
          route: data.route || "",
          tripCount: data.tripCount || 0,
          timestamp: data.timestamp?.toDate() || null, // Changed from date to timestamp
        });
      });

      setTransactions(transactionData);
    } catch (error) {
      console.error("Error fetching transactions:", error);
      setErr("Failed to load transactions");
    }
  };

  // Fetch all routes
  const fetchRoutes = async () => {
    try {
      const routesRef = collection(db, "routes");
      const querySnapshot = await getDocs(routesRef);
      const routeData = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.Route) routeData.push(data.Route);
      });

      const uniqueRoutes = [...new Set(routeData)];
      setRoutes(uniqueRoutes);
    } catch (error) {
      console.error("Error fetching routes:", error);
      setErr("Failed to load routes");
    }
  };

  // Filter transactions by date range using the same logic as ActivityLogSuper
  const filterTransactionsByDate = (transactions) => {
    return transactions.filter((transaction) => {
      // Date filter
      let matchesDateFilter = true;
      if (selectedStartDate || selectedEndDate) {
        const logDate = getDateFromTimestamp(transaction.timestamp);
        if (logDate) {
          // Convert log date to local date string in YYYY-MM-DD format
          const year = logDate.getFullYear();
          const month = String(logDate.getMonth() + 1).padStart(2, "0");
          const day = String(logDate.getDate()).padStart(2, "0");
          const logDateString = `${year}-${month}-${day}`;

          // If only start date is provided, show logs from that specific date only
          if (selectedStartDate && !selectedEndDate) {
            matchesDateFilter = logDateString === selectedStartDate;
          }
          // If both dates are provided, show logs in the range
          else if (selectedStartDate && selectedEndDate) {
            matchesDateFilter =
              logDateString >= selectedStartDate &&
              logDateString <= selectedEndDate;
          }
          // If only end date is provided (unlikely but handle it)
          else if (!selectedStartDate && selectedEndDate) {
            matchesDateFilter = logDateString <= selectedEndDate;
          }
        } else {
          // If timestamp is invalid/null, exclude it when date filters are applied
          matchesDateFilter = false;
        }
      }

      return matchesDateFilter;
    });
  };

  // Get total fare collected by a driver for a payment method & filtered by route/date
  const getDriverFareByMethod = (driverUID, paymentMethod) => {
    return filterTransactionsByDate(transactions).reduce(
      (total, transaction) => {
        if (
          transaction.driverUID === driverUID &&
          transaction.paymentMethod === paymentMethod &&
          (selectedRoute ? transaction.route === selectedRoute : true)
        ) {
          return total + transaction.farePrice;
        }
        return total;
      },
      0
    );
  };

  // Get distinct trip count for a driver filtered by route/date
  const getDriverTripCount = (driverUID) => {
    const filteredTransactions = filterTransactionsByDate(transactions).filter(
      (transaction) =>
        transaction.driverUID === driverUID &&
        (selectedRoute ? transaction.route === selectedRoute : true)
    );

    // Get distinct tripCount values (not sum, not count of transactions)
    const distinctTripCounts = [
      ...new Set(filteredTransactions.map((t) => t.tripCount)),
    ];

    // If there are multiple distinct tripCount values, return the maximum
    return distinctTripCounts.length > 0 ? Math.max(...distinctTripCounts) : 0;
  };

  // Filter users who have transactions on selected route (if any) and by driver search
  const getFilteredUsers = () => {
    let filtered = selectedRoute
      ? users.filter((user) =>
          transactions.some(
            (transaction) =>
              transaction.driverUID === user.id &&
              transaction.route === selectedRoute
          )
        )
      : users;

    // Filter by driver search
    if (driverSearch.trim()) {
      const searchQuery = driverSearch.trim().toLowerCase();
      filtered = filtered.filter((user) => {
        const driverName = (user.displayName || "").toLowerCase();
        return driverName.includes(searchQuery);
      });
    }

    return filtered;
  };

  // Get total cash fare collected - ONLY from filtered users
  const getTotalCashFareCollected = () => {
    const filteredUsers = getFilteredUsers();
    const filteredUserIds = filteredUsers.map((user) => user.id);

    return filterTransactionsByDate(transactions).reduce(
      (total, transaction) => {
        if (
          filteredUserIds.includes(transaction.driverUID) &&
          transaction.paymentMethod === "Cash" &&
          (selectedRoute ? transaction.route === selectedRoute : true)
        ) {
          return total + transaction.farePrice;
        }
        return total;
      },
      0
    );
  };

  // Get total card fare collected - ONLY from filtered users
  const getTotalCardFareCollected = () => {
    const filteredUsers = getFilteredUsers();
    const filteredUserIds = filteredUsers.map((user) => user.id);

    return filterTransactionsByDate(transactions).reduce(
      (total, transaction) => {
        if (
          filteredUserIds.includes(transaction.driverUID) &&
          transaction.paymentMethod === "Card" &&
          (selectedRoute ? transaction.route === selectedRoute : true)
        ) {
          return total + transaction.farePrice;
        }
        return total;
      },
      0
    );
  };

  // Get total trip count by summing distinct trip counts from filtered drivers
  const getTotalTripCount = () => {
    const filteredUsers = getFilteredUsers();

    return filteredUsers.reduce((total, user) => {
      return total + getDriverTripCount(user.id);
    }, 0);
  };

  // Get total fare collected for dashboard card - ONLY from filtered users
  const getTotalFareCollected = () => {
    const filteredUsers = getFilteredUsers();
    const filteredUserIds = filteredUsers.map((user) => user.id);

    return filterTransactionsByDate(transactions).reduce(
      (total, transaction) => {
        if (
          filteredUserIds.includes(transaction.driverUID) &&
          (selectedRoute ? transaction.route === selectedRoute : true)
        ) {
          return total + transaction.farePrice;
        }
        return total;
      },
      0
    );
  };

  const filteredUsers = getFilteredUsers();

  // Enhanced export functions with role mapping
  const handleExportCSV = async () => {
    try {
      exportToCSV(
        headers,
        rows,
        "Trip-Logs-Report",
        "Trip-Logs-Report.csv",
        userName
      );

      // Log the export activity (role will be mapped in logSystemActivity)
      await logSystemActivity("Exported Trip Logs Report to CSV", userName);

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
        "Trip-Logs-Report",
        "Trip-Logs-Report.pdf",
        userName
      );

      // Log the export activity (role will be mapped in logSystemActivity)
      await logSystemActivity("Exported Trip Logs Report to PDF", userName);

      setIsDropdownOpen(false);
    } catch (error) {
      console.error("Error during PDF export:", error);
    }
  };

  useEffect(() => {
    fetchUserRole();
  }, [fetchUserRole]);

  useEffect(() => {
    fetchUsers();
    fetchTransactions();
    fetchRoutes();
  }, []);

  const toggleDropdown = () => setIsDropdownOpen(!isDropdownOpen);

  const headers = [
    "Driver Name",
    "Total Fare Collected",
    "Cash Fare Collected",
    "Card Fare Collected",
    "Trip Count",
  ];
  const rows = filteredUsers.map((user) => {
    const cashFare = getDriverFareByMethod(user.id, "Cash");
    const cardFare = getDriverFareByMethod(user.id, "Card");
    const totalFare = cashFare + cardFare;
    const tripCount = getDriverTripCount(user.id);

    return [
      user.displayName,
      totalFare.toFixed(2),
      cashFare.toFixed(2),
      cardFare.toFixed(2),
      tripCount,
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
            <h1 className="text-2xl font-semibold text-gray-800">Trip Logs</h1>

            <div className="flex items-center gap-3">
              {/* Route Filter */}
              <div className="flex flex-col">
                <label className="text-sm font-medium text-gray-700 mb-1">
                  Route
                </label>
                <div className="relative flex items-center gap-2 rounded-lg border border-gray-300 bg-white shadow-lg hover:shadow-xl focus-within:ring-1 focus-within:ring-blue-300 px-3 py-2">
                  <select
                    className="bg-transparent pr-6 text-sm outline-none"
                    value={selectedRoute}
                    onChange={(e) => setSelectedRoute(e.target.value)}
                  >
                    <option value="">All Routes</option>
                    {routes.map((route, index) => (
                      <option key={index} value={route}>
                        {route}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Start Date Filter */}
              <div className="flex flex-col">
                <label className="text-sm font-medium text-gray-700 mb-1">
                  Start Date
                </label>
                <div className="relative flex items-center gap-2 rounded-lg border border-gray-300 bg-white shadow-lg hover:shadow-xl focus-within:ring-1 focus-within:ring-blue-300 px-3 py-2">
                  <input
                    type="date"
                    className="bg-transparent text-sm outline-none"
                    value={selectedStartDate}
                    onChange={(e) => setSelectedStartDate(e.target.value)}
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
                    value={selectedEndDate}
                    onChange={(e) => setSelectedEndDate(e.target.value)}
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

          {/* Error */}
          {err && (
            <div className="mx-6 my-4 text-red-700 bg-red-50 border border-red-200 px-6 py-2 rounded">
              {err}
            </div>
          )}

          {/* Dashboard Cards */}
          <div className="px-6 py-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Total Fare Collection */}
            <div className="bg-white rounded-lg shadow-md p-6 flex items-center justify-between">
              <div
                className="p-3 rounded-full mr-4"
                style={{ backgroundColor: `${primaryColor}20` }}
              >
                <FaWallet className="w-6 h-6" style={{ color: primaryColor }} />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">
                  Total Fare Collection
                </p>
                <p className="text-2xl font-bold text-gray-900">
                  ₱ {getTotalFareCollected().toFixed(2)}
                </p>
              </div>
            </div>

            {/* Total Cash Fare */}
            <div className="bg-white rounded-lg shadow-md p-6 flex items-center justify-between">
              <div className="flex items-center justify-center w-12 h-12 rounded-full mr-4 bg-green-100">
                <span className="text-green-600 font-bold text-lg">₱</span>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">
                  Cash Fare Collected
                </p>
                <p className="text-2xl font-bold text-gray-900">
                  ₱ {getTotalCashFareCollected().toFixed(2)}
                </p>
              </div>
            </div>

            {/* Total Card Fare */}
            <div className="bg-white rounded-lg shadow-md p-6 flex items-center justify-between">
              <div className="flex items-center justify-center w-12 h-12 rounded-full mr-4 bg-blue-100">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-6 h-6 text-blue-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                  />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">
                  Card Fare Collected
                </p>
                <p className="text-2xl font-bold text-gray-900">
                  ₱ {getTotalCardFareCollected().toFixed(2)}
                </p>
              </div>
            </div>

            {/* Total Trip Count */}
            <div className="bg-white rounded-lg shadow-md p-6 flex items-center justify-between">
              <div className="flex items-center justify-center w-12 h-12 rounded-full mr-4 bg-purple-100">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-6 h-6 text-purple-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">
                  Total Trip Count
                </p>
                <p className="text-2xl font-bold text-gray-900">
                  {getTotalTripCount().toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="p-6 overflow-x-auto flex-1">
            <table className="min-w-full divide-y divide-gray-200">
              <thead style={{ backgroundColor: primaryColor }}>
                <tr>
                  <th className="px-6 py-3 text-left text-m font-medium text-white uppercase tracking-wider">
                    Driver Name
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-white uppercase tracking-wider">
                    Total Fare Collected
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-white uppercase tracking-wider">
                    Cash Fare Collected
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-white uppercase tracking-wider">
                    Card Fare Collected
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-white uppercase tracking-wider">
                    Trip Count
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-6 py-4 text-center text-sm text-gray-500"
                    >
                      No drivers found.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => {
                    const cashFare = getDriverFareByMethod(user.id, "Cash");
                    const cardFare = getDriverFareByMethod(user.id, "Card");
                    const totalFare = cashFare + cardFare;
                    const tripCount = getDriverTripCount(user.id);

                    return (
                      <tr key={user.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {user.displayName}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          ₱ {totalFare.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          ₱ {cashFare.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          ₱ {cardFare.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {tripCount}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
};

export default TripLogs;