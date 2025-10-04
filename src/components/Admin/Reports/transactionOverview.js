import { useState, useEffect, useCallback } from "react";
import { Pie, Line, Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
} from "chart.js";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../../../firebase";
import { FaMoneyBillWave, FaTicketAlt, FaBan } from "react-icons/fa";
import { exportToCSV, exportToPDF } from "../../functions/exportFunctions";
import { getAuth } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

// Register necessary elements for Chart.js
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement
);

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

// Helper function to format timestamp with time and date
const formatTimestamp = (timestamp) => {
  try {
    const date = getDateFromTimestamp(timestamp);
    if (!date) {
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

// Helper function to get date in YYYY-MM-DD format
const getDateString = (date) => {
  if (!date) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const TransactionOverview = () => {
  const [transactions, setTransactions] = useState([]);
  const [filteredTransactions, setFilteredTransactions] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [units, setUnits] = useState([]);
  const [unitLogs, setUnitLogs] = useState([]);
  const [selectedRoute, setSelectedRoute] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(getTodayDate());
  const [endDate, setEndDate] = useState("");
  const [stats, setStats] = useState({
    totalSales: 0,
    totalTickets: 0,
    voidedTickets: 0,
    cashPayments: 0,
    cardPayments: 0,
    cashAmount: 0,
    cardAmount: 0,
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [userRole, setUserRole] = useState("User");

  const transactionsPerPage = 10;
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

  // Real-time units listener
  const setupUnitsListener = useCallback(() => {
    try {
      const unitsRef = collection(db, "unit");
      
      const unsubscribe = onSnapshot(unitsRef, (querySnapshot) => {
        const unitsData = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          unitsData.push({
            id: doc.id,
            ...data,
          });
        });
        setUnits(unitsData);
      }, (error) => {
        console.error("Error listening to units:", error);
      });

      return unsubscribe;
    } catch (error) {
      console.error("Error setting up units listener:", error);
    }
  }, []);

  // Real-time unit logs listener
  const setupUnitLogsListener = useCallback(() => {
    try {
      const unitLogsRef = collection(db, "unitLogs");
      
      const unsubscribe = onSnapshot(unitLogsRef, (querySnapshot) => {
        const unitLogsData = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          unitLogsData.push({
            id: doc.id,
            ...data,
          });
        });
        setUnitLogs(unitLogsData);
      }, (error) => {
        console.error("Error listening to unit logs:", error);
      });

      return unsubscribe;
    } catch (error) {
      console.error("Error setting up unit logs listener:", error);
    }
  }, []);

  // Real-time transactions listener
  const setupTransactionsListener = useCallback(() => {
    setLoading(true);
    try {
      const transactionsRef = collection(db, "transactions");
      const q = query(transactionsRef, orderBy("timestamp", "desc"));
      
      const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const transactionData = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          transactionData.push({
            id: doc.id,
            ...data,
            timestamp: data.timestamp?.toDate
              ? data.timestamp.toDate()
              : new Date(data.timestamp),
          });
        });
        setTransactions(transactionData);
        setFilteredTransactions(transactionData);
        setLoading(false);
      }, (error) => {
        console.error("Error listening to transactions:", error);
        setLoading(false);
      });

      return unsubscribe;
    } catch (error) {
      console.error("Error setting up transactions listener:", error);
      setLoading(false);
    }
  }, []);

  // Real-time routes listener
  const setupRoutesListener = useCallback(() => {
    try {
      const routesRef = collection(db, "routes");
      
      const unsubscribe = onSnapshot(routesRef, (querySnapshot) => {
        const routesData = [];
        querySnapshot.forEach((doc) => {
          if (!routesData.includes(doc.data().Route)) {
            routesData.push(doc.data().Route);
          }
        });
        setRoutes(routesData);
      }, (error) => {
        console.error("Error listening to routes:", error);
      });

      return unsubscribe;
    } catch (error) {
      console.error("Error setting up routes listener:", error);
    }
  }, []);

  // Get unit for a specific transaction based on driverUID and transaction date
  const getUnitForTransaction = (driverUID, transactionTimestamp) => {
    if (!driverUID || !transactionTimestamp) return "No Unit Assigned";

    const transactionDate = getDateFromTimestamp(transactionTimestamp);
    if (!transactionDate) return "No Unit Assigned";

    const transactionDateString = getDateString(transactionDate);

    // Find matching unit log for this driver on this date
    // Check multiple possible field names for the unit assignment
    const matchingLog = unitLogs.find((log) => {
      // Check if the unitHolder matches the driverUID
      // Try multiple possible field names
      const logDriverUID = log.unitHolder || log.driverUID || log.driver;
      if (logDriverUID !== driverUID) {
        return false;
      }

      // Get the assigned date from the log - try multiple possible field names
      const assignedDate = getDateFromTimestamp(
        log.assignedAt || 
        log.assigned || 
        log.timestamp || 
        log.createdAt ||
        log.date
      );
      
      if (!assignedDate) {
        return false;
      }

      const assignedDateString = getDateString(assignedDate);

      // Check if the transaction date matches the assigned date
      return assignedDateString === transactionDateString;
    });

    // Return the unit if found - try multiple possible field names
    if (matchingLog) {
      const unitNumber = matchingLog.unit || matchingLog.unitNumber || matchingLog.unitId;
      if (unitNumber) {
        return unitNumber;
      }
    }

    // If no exact date match, try to find the most recent assignment before or on the transaction date
    const validLogs = unitLogs
      .filter((log) => {
        const logDriverUID = log.unitHolder || log.driverUID || log.driver;
        return logDriverUID === driverUID;
      })
      .map((log) => {
        const assignedDate = getDateFromTimestamp(
          log.assignedAt || 
          log.assigned || 
          log.timestamp || 
          log.createdAt ||
          log.date
        );
        return {
          ...log,
          parsedDate: assignedDate,
          dateString: getDateString(assignedDate)
        };
      })
      .filter((log) => log.parsedDate && log.dateString <= transactionDateString)
      .sort((a, b) => b.parsedDate - a.parsedDate);

    if (validLogs.length > 0) {
      const mostRecentLog = validLogs[0];
      const unitNumber = mostRecentLog.unit || mostRecentLog.unitNumber || mostRecentLog.unitId;
      if (unitNumber) {
        return unitNumber;
      }
    }

    return "No Unit Assigned";
  };

  // Filter transactions by date range, route, and search
  const filterTransactions = useCallback(() => {
    let filtered = transactions;

    // Filter by date range using the improved date filtering logic
    if (startDate || endDate) {
      filtered = filtered.filter((transaction) => {
        const transactionDate = getDateFromTimestamp(transaction.timestamp);
        if (!transactionDate) return false;

        // Convert transaction date to local date string in YYYY-MM-DD format
        const year = transactionDate.getFullYear();
        const month = String(transactionDate.getMonth() + 1).padStart(2, "0");
        const day = String(transactionDate.getDate()).padStart(2, "0");
        const transactionDateString = `${year}-${month}-${day}`;

        // If only start date is provided, show transactions from that specific date only
        if (startDate && !endDate) {
          return transactionDateString === startDate;
        }
        // If both dates are provided, show transactions in the range
        else if (startDate && endDate) {
          return (
            transactionDateString >= startDate &&
            transactionDateString <= endDate
          );
        }
        // If only end date is provided (unlikely but handle it)
        else if (!startDate && endDate) {
          return transactionDateString <= endDate;
        }

        return true;
      });
    }

    // Filter by route
    if (selectedRoute) {
      filtered = filtered.filter(
        (transaction) => transaction.route === selectedRoute
      );
    }

    // Filter by search (searches multiple fields)
    if (search.trim()) {
      const searchQuery = search.trim().toLowerCase();
      filtered = filtered.filter((transaction) => {
        const searchableText =
          `${transaction.id || ""} ${transaction.invoiceNum || ""} ${transaction.driverName || ""} ${transaction.route || ""} ${transaction.paymentMethod || ""} ${transaction.farePrice || ""}`.toLowerCase();
        return searchableText.includes(searchQuery);
      });
    }

    setFilteredTransactions(filtered);
  }, [startDate, endDate, transactions, selectedRoute, search]);

  // Calculate statistics - Exclude voided transactions from total tickets count
  const calculateStats = useCallback(() => {
    const newStats = {
      totalSales: 0,
      totalTickets: 0,
      voidedTickets: 0,
      cashPayments: 0,
      cardPayments: 0,
      cashAmount: 0,
      cardAmount: 0,
    };

    filteredTransactions.forEach((transaction) => {
      const fare = parseFloat(transaction.farePrice) || 0;

      if (transaction.isVoided) {
        newStats.voidedTickets += 1;
        return;
      }

      // Count only non-voided tickets
      newStats.totalTickets += 1;
      newStats.totalSales += fare;
      
      if (transaction.paymentMethod === "Cash") {
        newStats.cashPayments += 1;
        newStats.cashAmount += fare;
      } else if (transaction.paymentMethod === "Card") {
        newStats.cardPayments += 1;
        newStats.cardAmount += fare;
      }
    });
    setStats(newStats);
  }, [filteredTransactions]);

  // Reset filters
  const resetFilters = () => {
    setStartDate(getTodayDate());
    setEndDate("");
    setSelectedRoute("");
    setSearch("");
  };

  // Pagination functions
  const handleNextPage = () => {
    if (currentPage * transactionsPerPage < filteredTransactions.length) {
      setCurrentPage(currentPage + 1);
    }
  };

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  // Export functions
  const toggleDropdown = () => setIsDropdownOpen(!isDropdownOpen);

  const headers = [
    "Transaction ID",
    "Invoice Number",
    "Payment Method",
    "Driver Name",
    "Unit",
    "Total Price",
    "Route",
    "Status",
    "Timestamp",
  ];

  const rows = filteredTransactions.map((transaction) => {
    const unit = getUnitForTransaction(transaction.driverUID, transaction.timestamp);
    const { fullDateTime } = formatTimestamp(transaction.timestamp);
    return [
      transaction.id,
      transaction.invoiceNum,
      transaction.paymentMethod,
      transaction.driverName,
      unit,
      transaction.farePrice,
      transaction.route,
      transaction.isVoided ? "Voided" : "Successful",
      fullDateTime,
    ];
  });

  const handleExportCSV = async () => {
    try {
      exportToCSV(
        headers,
        rows,
        "Transaction-Overview-Report.csv",
        userName,
        "Transaction-Overview-Report",
        startDate,
        endDate
      );

      await logSystemActivity(
        "Exported Transaction Overview Report to CSV",
        userName
      );

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
        "Transaction-Overview-Report",
        "Transaction-Overview-Report.pdf",
        userName,
        startDate,
        endDate
      );

      await logSystemActivity(
        "Exported Transaction Overview Report to PDF",
        userName
      );

      setIsDropdownOpen(false);
    } catch (error) {
      console.error("Error during PDF export:", error);
    }
  };

  // Setup real-time listeners
  useEffect(() => {
    const initData = async () => {
      await fetchUserRole();
    };
    initData();

    const unsubscribeTransactions = setupTransactionsListener();
    const unsubscribeRoutes = setupRoutesListener();
    const unsubscribeUnits = setupUnitsListener();
    const unsubscribeUnitLogs = setupUnitLogsListener();

    return () => {
      if (unsubscribeTransactions) unsubscribeTransactions();
      if (unsubscribeRoutes) unsubscribeRoutes();
      if (unsubscribeUnits) unsubscribeUnits();
      if (unsubscribeUnitLogs) unsubscribeUnitLogs();
    };
  }, [
    setupTransactionsListener,
    setupRoutesListener,
    setupUnitsListener,
    setupUnitLogsListener,
    fetchUserRole,
  ]);

  useEffect(() => {
    filterTransactions();
  }, [
    startDate,
    endDate,
    selectedRoute,
    search,
    transactions,
    filterTransactions,
  ]);

  useEffect(() => {
    calculateStats();
  }, [filteredTransactions, calculateStats]);

  const currentTransactions = filteredTransactions.slice(
    (currentPage - 1) * transactionsPerPage,
    currentPage * transactionsPerPage
  );

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

  // Bar chart data for Cash and Card payment methods
  const paymentMethodData = () => {
    return {
      labels: ["Cash", "Card"],
      datasets: [
        {
          label: "Payment Method",
          data: [stats.cashAmount, stats.cardAmount],
          backgroundColor: ["#166962ff", "#103579ff"],
          borderColor: ["#166962ff", "#103579ff"],
          borderWidth: 1,
        },
      ],
    };
  };

  // Line chart data for total sales per day with day of week - MODIFIED TO SHOW PAST 6 DAYS
  const totalSalesPerDayData = () => {
    // Determine the end date for the chart (use endDate if set, otherwise use startDate)
    const chartEndDate = endDate ? new Date(endDate + "T00:00:00") : new Date(startDate + "T00:00:00");
    
    // Calculate the start date for the chart (6 days before the end date)
    const chartStartDate = new Date(chartEndDate);
    chartStartDate.setDate(chartStartDate.getDate() - 6);
    
    // Create an array of all 7 dates (past 6 days + the current/end date)
    const allDates = [];
    for (let i = 0; i <= 6; i++) {
      const date = new Date(chartStartDate);
      date.setDate(date.getDate() + i);
      allDates.push(getDateString(date));
    }
    
    // Initialize sales object with all dates set to 0
    const dailySales = {};
    allDates.forEach(dateString => {
      dailySales[dateString] = 0;
    });

    // Use ALL transactions (not filtered) for the chart, but still apply route filter if selected
    let chartTransactions = transactions;
    
    // Apply route filter if one is selected
    if (selectedRoute) {
      chartTransactions = chartTransactions.filter(
        (transaction) => transaction.route === selectedRoute
      );
    }

    // Only include transactions that are not voided and within the chart date range
    chartTransactions
      .filter((transaction) => !transaction.isVoided)
      .forEach((transaction) => {
        const date = new Date(transaction.timestamp);
        const dateString = getDateString(date);

        // Only include if the transaction falls within our 7-day chart range
        if (allDates.includes(dateString)) {
          const fare = parseFloat(transaction.farePrice) || 0;
          const roundedFare = Math.round(fare * 100) / 100;
          dailySales[dateString] += roundedFare;
        }
      });

    // Prepare the sales data with day of week labels for all 7 days
    const salesData = allDates.map((dateString) => {
      const [year, month, day] = dateString.split("-");
      const date = new Date(year, month - 1, day);
      
      // Get day of week (e.g., Monday)
      const dayOfWeek = date.toLocaleDateString("en-US", { weekday: "long" });
      
      // Format: "Monday, Oct 4"
      const monthShort = date.toLocaleDateString("en-US", { month: "short" });
      const dayNum = date.getDate();
      
      return {
        label: `${dayOfWeek}, ${monthShort} ${dayNum}`,
        sales: dailySales[dateString],
      };
    });

    const labels = salesData.map((item) => item.label);
    const data = salesData.map((item) => item.sales);

    return {
      labels: labels,
      datasets: [
        {
          label: "Total Sales per Day",
          data: data,
          borderColor: "#909b2eff",
          backgroundColor: "#cfbe27ff",
          fill: true,
          tension: 0.4,
        },
      ],
    };
  };

  // Pie chart data for voided and successful transactions
  const transactionStatusData = () => {
    const statusCount = { Successful: 0, Voided: 0 };
    filteredTransactions.forEach((transaction) => {
      statusCount[transaction.isVoided ? "Voided" : "Successful"] += 1;
    });
    return {
      labels: ["Successful", "Voided"],
      datasets: [
        {
          data: [statusCount.Successful, statusCount.Voided],
          backgroundColor: ["#105379ff", "#69ccfaff"],
        },
      ],
    };
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">
          Transaction Overview
        </h2>

        {/* Date Filters, Route Filter, Search, and Export */}
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex flex-col">
            <label className="text-sm font-medium text-gray-700 mb-1">
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-sm font-medium text-gray-700 mb-1">
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-sm font-medium text-gray-700 mb-1">
              Route
            </label>
            <select
              value={selectedRoute}
              onChange={(e) => setSelectedRoute(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Routes</option>
              {routes.map((route, index) => (
                <option key={index} value={route}>
                  {route}
                </option>
              ))}
            </select>
          </div>

          {/* Search Filter */}
          <div className="flex flex-col">
            <label className="text-sm font-medium text-gray-700 mb-1">
              Search
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Search driver name"
                className="w-[320px] rounded-full border border-gray-200 pl-10 pr-3 py-2.5 text-sm shadow-sm focus:ring-4 focus:ring-blue-100 focus:border-blue-300 outline-none"
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

          <button
            onClick={resetFilters}
            className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 transition duration-200"
          >
            Reset Filters
          </button>

          {/* Export Button */}
          <div className="relative flex flex-col">
            <label className="text-sm font-medium text-gray-700 mb-1 opacity-0">
              Export
            </label>
            <button
              onClick={toggleDropdown}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-white shadow-md hover:shadow-lg transition"
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
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow-md p-6 flex items-center justify-between">
          <div className="bg-blue-100 p-3 rounded-full mr-4">
            <FaMoneyBillWave size={30} className="text-blue-500" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-600">Total Sales</p>
            <p className="text-2xl font-bold text-gray-900">
              ₱{stats.totalSales.toFixed(2)}
            </p>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-md p-6 flex items-center justify-between">
          <div className="bg-yellow-100 p-3 rounded-full mr-4">
            <FaTicketAlt size={30} className="text-yellow-500" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-600">Total Tickets</p>
            <p className="text-2xl font-bold text-gray-900">
              {stats.totalTickets}
            </p>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-md p-6 flex items-center justify-between">
          <div className="bg-green-100 p-3 rounded-full mr-4">
            <FaBan size={30} className="text-green-500" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-600">
              Total Voided Transactions
            </p>
            <p className="text-2xl font-bold text-gray-900">
              {stats.voidedTickets}
            </p>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-6 mt-6">
        <div className="bg-white rounded-lg shadow-md p-4 h-[450px] flex flex-col items-stretch">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">
            Payment Method (Cash vs Card)
          </h3>
          <div className="flex-1">
            <Bar
              data={paymentMethodData()}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    position: "bottom",
                    align: "start",
                  },
                },
                scales: {
                  x: {
                    ticks: {
                      maxRotation: 45,
                      minRotation: 45,
                    },
                  },
                },
              }}
              className="h-full w-full"
            />
          </div>
        </div>
            
        <div className="bg-white rounded-lg shadow-md p-4 h-[450px] flex flex-col items-stretch">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">
            Total Sales per Day
          </h3>
          <div className="flex-1">
            <Line
              data={totalSalesPerDayData()}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    position: "bottom",
                    align: "start",
                  },
                },
              }}
              className="h-full w-full"
            />
          </div>
        </div> 
        <div className="bg-white rounded-lg shadow-md p-4 h-[450px] flex flex-col items-stretch">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">
            Transaction Status
          </h3>
          <div className="flex-1">
            <Pie
              data={transactionStatusData()}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    position: "bottom",
                    align: "start",
                  },
                },
              }}
              className="h-full w-full"
            />
          </div>
        </div>
      </div>

      {/* Recent Transactions Table */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">
          Recent Transactions
        </h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Transaction ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Invoice Number
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Payment Method
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Driver Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Unit
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total Price
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Route
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Timestamp
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {currentTransactions.map((transaction) => {
                const unit = getUnitForTransaction(transaction.driverUID, transaction.timestamp);
                const { time, date } = formatTimestamp(transaction.timestamp);
                return (
                  <tr key={transaction.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {transaction.id}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {transaction.invoiceNum}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <span
                        className={`ml-3 px-7 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          transaction.paymentMethod === "Cash"
                            ? "bg-green-100 text-green-800"
                            : "bg-blue-100 text-blue-800"
                        }`}
                      >
                        {transaction.paymentMethod}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {transaction.driverName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {unit}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      ₱{transaction.farePrice}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {transaction.route}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <span
                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          transaction.isVoided
                            ? "bg-red-100 text-red-800"
                            : "bg-green-100 text-green-800"
                        }`}
                      >
                        {transaction.isVoided ? "Voided" : "Successful"}
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
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex justify-between items-center mt-4">
          <p className="text-sm text-gray-500">
            Showing {currentTransactions.length} of{" "}
            {filteredTransactions.length} transactions
          </p>
          <div className="flex items-center space-x-2">
            {/* Previous Button */}
            <button
              onClick={handlePreviousPage}
              disabled={currentPage === 1}
              className="px-3 py-2 border border-gray-300 rounded-full text-gray-700 disabled:opacity-50 hover:bg-gray-200 transition"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>

            {/* Next Button */}
            <button
              onClick={handleNextPage}
              disabled={
                currentPage * transactionsPerPage >= filteredTransactions.length
              }
              className="px-3 py-2 border border-gray-300 rounded-full text-gray-700 disabled:opacity-50 hover:bg-gray-200 transition"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TransactionOverview;