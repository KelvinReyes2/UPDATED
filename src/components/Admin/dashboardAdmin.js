import { useState, useEffect, useCallback } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { collection, query, onSnapshot, orderBy } from "firebase/firestore";
import { db } from "../../firebase";
import { Pie, Bar, Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  LineElement,
  PointElement,
} from "chart.js";

// Register necessary elements for Chart.js
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  LineElement,
  PointElement
);

// Get today's date in YYYY-MM-DD format
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

// Helper function to format timestamp with time and date
const formatTimestamp = (timestamp) => {
  try {
    const date = getDateFromTimestamp(timestamp);
    if (!date) {
      return { time: "N/A", date: "N/A", fullDateTime: "N/A" };
    }

    // Format time (e.g., 10:28 AM)
    const time = date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    });

    // Format date (e.g., September 17, 2025)
    const dateStr = date.toLocaleDateString('en-US', { 
      month: 'long', 
      day: 'numeric', 
      year: 'numeric' 
    });

    // Full date time for export
    const fullDateTime = `${dateStr}, ${time}`;

    return { time, date: dateStr, fullDateTime };
  } catch (error) {
    console.error("Error formatting timestamp:", error);
    return { time: "Invalid", date: "Invalid", fullDateTime: "Invalid" };
  }
};

// Dashboard Analytics Component
const DashboardAnalytics = () => {
  const [transactions, setTransactions] = useState([]);
  const [filteredTransactions, setFilteredTransactions] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [selectedRoute, setSelectedRoute] = useState("");
  const [driverSearch, setDriverSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(getTodayDate());
  const [endDate, setEndDate] = useState("");
  const [stats, setStats] = useState({
    totalFare: 0,
    totalTickets: 0,
    cashPayments: 0,
    cardPayments: 0,
    cashAmount: 0,
    cardAmount: 0,
    voidedTickets: 0,
  });
  const [quotaStats, setQuotaStats] = useState({ quotaMet: 0, quotaNotMet: 0 });
  const [currentPage, setCurrentPage] = useState(1);
  const transactionsPerPage = 10;

  const primaryColor = "#364C6E";
  const secondaryColor = "#405a88";

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

      // Return unsubscribe function for cleanup
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

  // Real-time quota listener
  const setupQuotaListener = useCallback(() => {
    try {
      const quotaRef = collection(db, "quota");
      
      const unsubscribe = onSnapshot(quotaRef, (snapshot) => {
        let metCount = 0;
        let notMetCount = 0;

        snapshot.forEach((doc) => {
          const data = doc.data();
          const lastUpdated = getDateFromTimestamp(data.lastUpdated);

          let withinRange = true;
          if (startDate || endDate) {
            if (lastUpdated) {
              const year = lastUpdated.getFullYear();
              const month = String(lastUpdated.getMonth() + 1).padStart(2, "0");
              const day = String(lastUpdated.getDate()).padStart(2, "0");
              const lastUpdatedString = `${year}-${month}-${day}`;

              if (startDate && endDate) {
                withinRange =
                  lastUpdatedString >= startDate && lastUpdatedString <= endDate;
              } else if (startDate) {
                withinRange = lastUpdatedString === startDate;
              } else if (endDate) {
                withinRange = lastUpdatedString <= endDate;
              }
            } else {
              withinRange = false;
            }
          }

          if (withinRange) {
            if (data.isMet === true) metCount++;
            else if (data.isMet === false) notMetCount++;
          }
        });

        setQuotaStats({ quotaMet: metCount, quotaNotMet: notMetCount });
      }, (error) => {
        console.error("Error listening to quota:", error);
      });

      return unsubscribe;
    } catch (error) {
      console.error("Error setting up quota listener:", error);
    }
  }, [startDate, endDate]);

  // Filter transactions by date range, route, and driver search
  const filterTransactions = useCallback(() => {
    let filtered = transactions;

    if (startDate || endDate) {
      filtered = filtered.filter((transaction) => {
        const transactionDate = getDateFromTimestamp(transaction.timestamp);
        if (!transactionDate) return false;
        
        const year = transactionDate.getFullYear();
        const month = String(transactionDate.getMonth() + 1).padStart(2, "0");
        const day = String(transactionDate.getDate()).padStart(2, "0");
        const transactionDateString = `${year}-${month}-${day}`;

        if (startDate && !endDate) {
          return transactionDateString === startDate;
        } else if (startDate && endDate) {
          return transactionDateString >= startDate && transactionDateString <= endDate;
        } else if (!startDate && endDate) {
          return transactionDateString <= endDate;
        }
        
        return true;
      });
    }

    if (selectedRoute) {
      filtered = filtered.filter(
        (transaction) => transaction.route === selectedRoute
      );
    }

    if (driverSearch.trim()) {
      const searchTerm = driverSearch.trim().toLowerCase();
      filtered = filtered.filter(
        (transaction) =>
          transaction.driverName &&
          transaction.driverName.toLowerCase().includes(searchTerm)
      );
    }

    setFilteredTransactions(filtered);
  }, [startDate, endDate, transactions, selectedRoute, driverSearch]);

  // Calculate statistics
  const calculateStats = useCallback(() => {
    const newStats = {
      totalFare: 0,
      totalTickets: 0,
      cashPayments: 0,
      cardPayments: 0,
      cashAmount: 0,
      cardAmount: 0,
      voidedTickets: 0,
    };

    filteredTransactions.forEach((transaction) => {
      const fare = parseFloat(transaction.farePrice) || 0;
      
      if (transaction.isVoided) {
        newStats.voidedTickets += 1;
        return;
      }

      // Only count non-voided transactions for fare and payment stats
      newStats.totalTickets += 1;
      newStats.totalFare += fare;

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
    setDriverSearch("");
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

  // Setup real-time listeners
  useEffect(() => {
    const unsubscribeTransactions = setupTransactionsListener();
    const unsubscribeRoutes = setupRoutesListener();
    const unsubscribeQuota = setupQuotaListener();

    // Cleanup function to unsubscribe from listeners
    return () => {
      if (unsubscribeTransactions) unsubscribeTransactions();
      if (unsubscribeRoutes) unsubscribeRoutes();
      if (unsubscribeQuota) unsubscribeQuota();
    };
  }, [setupTransactionsListener, setupRoutesListener, setupQuotaListener]);

  useEffect(() => {
    filterTransactions();
  }, [
    startDate,
    endDate,
    selectedRoute,
    driverSearch,
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

  // Bar chart data for top 5 routes (excluding voided transactions)
  const topRoutesData = () => {
    const routeCount = {};
    filteredTransactions.forEach((transaction) => {
      // Skip voided transactions
      if (transaction.isVoided) return;
      
      const route = transaction.route;
      if (route) {
        routeCount[route] = routeCount[route] ? routeCount[route] + 1 : 1;
      }
    });
    const sortedRoutes = Object.entries(routeCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return {
      labels: sortedRoutes.map((entry) => entry[0]),
      datasets: [
        {
          label: "Top Routes",
          data: sortedRoutes.map((entry) => entry[1]),
          backgroundColor: "#3b92c4ff",
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
          backgroundColor: ["#1e55a8ff", "#30bdb1ff"],
        },
      ],
    };
  };

  // Pie chart data for passenger types
  const passengerTypeData = () => {
    const typeCount = {
      Student: 0,
      PWD: 0,
      Senior: 0,
      Regular: 0,
    };

    filteredTransactions.forEach((transaction) => {
      const type = transaction.passengerType || "Regular";
      if (typeCount[type] !== undefined) {
        typeCount[type] += 1;
      }
    });

    return {
      labels: Object.keys(typeCount),
      datasets: [
        {
          data: Object.values(typeCount),
          backgroundColor: ["#0ea063ff", "#104ec2ff", "#a50707ff", "#d64c4cff"],
        },
      ],
    };
  };

  // Top drivers data (excluding voided transactions)
  const topDriversData = () => {
    const driverCount = {};
    filteredTransactions.forEach((transaction) => {
      // Skip voided transactions
      if (transaction.isVoided) return;
      
      const driver = transaction.driverName;
      if (driver) {
        driverCount[driver] = driverCount[driver] ? driverCount[driver] + 1 : 1;
      }
    });

    const sortedDrivers = Object.entries(driverCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return {
      labels: sortedDrivers.map((entry) => entry[0]),
      datasets: [
        {
          label: "Top Drivers (by Tickets)",
          data: sortedDrivers.map((entry) => entry[1]),
          backgroundColor: "#6b9ac4",
        },
      ],
    };
  };

  const ticketsPerTripData = () => {
    const tripTickets = {};

    filteredTransactions.forEach((transaction) => {
      const trip = transaction.tripCount || 0;
      tripTickets[trip] = tripTickets[trip] ? tripTickets[trip] + 1 : 1;
    });

    const sortedTrips = Object.entries(tripTickets).sort(
      (a, b) => parseInt(a[0]) - parseInt(b[0])
    );

    return {
      labels: sortedTrips.map((entry) => `Trip ${entry[0]}`),
      datasets: [
        {
          label: "Tickets per Trip",
          data: sortedTrips.map((entry) => entry[1]),
          borderColor: "#405a88",
          backgroundColor: "rgba(64,90,136,0.2)",
          fill: true,
          tension: 0.3,
        },
      ],
    };
  };

  const reasonsForVoidData = () => {
    const reasonCount = {};

    filteredTransactions.forEach((t) => {
      if (t.isVoided && t.voidReason) {
        reasonCount[t.voidReason] = (reasonCount[t.voidReason] || 0) + 1;
      }
    });

    const sortedReasons = Object.entries(reasonCount).sort(
      (a, b) => b[1] - a[1]
    );

    return {
      labels: sortedReasons.map(([reason]) => reason),
      datasets: [
        {
          label: "Voided Tickets",
          data: sortedReasons.map(([_, count]) => count),
          backgroundColor: "#EF4444",
        },
      ],
    };
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">
          Dashboard Overview
        </h2>

        {/* Date Filter, Route Filter, and Driver Search */}
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
          <div className="flex flex-col">
            <label className="text-sm font-medium text-gray-700 mb-1">
              Search Driver
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Search driver name"
                value={driverSearch}
                onChange={(e) => setDriverSearch(e.target.value)}
                className="w-[250px] rounded-full border border-gray-300 pl-10 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow-md p-6 flex items-center justify-between">
          <div
            className="flex items-center justify-center w-12 h-12 rounded-full mr-4"
            style={{ backgroundColor: `${primaryColor}20` }}
          >
            <svg
              className="w-6 h-6"
              style={{ color: primaryColor }}
              fill="currentColor"
              viewBox="currentColor"
            >
              <path d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-600">
              Total Fare Collection
            </p>
            <p className="text-2xl font-bold text-gray-900">
              ₱{stats.totalFare.toFixed(2)}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 flex items-center justify-between">
          <div
            className="p-3 rounded-full mr-4"
            style={{ backgroundColor: `${secondaryColor}20` }}
          >
            <svg
              className="w-6 h-6"
              style={{ color: secondaryColor }}
              fill="currentColor"
              viewBox="currentColor"
            >
              <path d="M7 12l2 1 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-600">Total Tickets</p>
            <p className="text-2xl font-bold text-gray-900">
              {stats.totalTickets.toLocaleString()}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 flex items-center justify-between">
          <div className="p-3 rounded-full bg-green-100 mr-4">
            <svg
              className="w-6 h-6 text-green-600"
              fill="currentColor"
              viewBox="currentColor"
            >
              <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-600">Cash Payments</p>
            <p className="text-2xl font-bold text-gray-900">
              ₱{stats.cashAmount.toFixed(2)}
            </p>
            <p className="text-sm text-gray-500">
              ({stats.cashPayments} transactions)
            </p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 flex items-center justify-between">
          <div className="p-3 rounded-full bg-blue-100 mr-4">
            <svg
              className="w-6 h-6 text-blue-600"
              fill="currentColor"
              viewBox="currentColor"
            >
              <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-600">Card Payments</p>
            <p className="text-2xl font-bold text-gray-900">
              ₱{stats.cardAmount.toFixed(2)}
            </p>
            <p className="text-sm text-gray-500">
              ({stats.cardPayments} transactions)
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-10 gap-6 h-[480px] items-stretch">
        <div className="col-span-4 bg-white rounded-lg shadow-md p-4 flex flex-col h-full">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">
            Tickets per Trip
          </h3>
          <div className="flex-1">
            <Line
              data={ticketsPerTripData()}
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
            />
          </div>
        </div>

        <div className="col-span-3 bg-white rounded-lg shadow-md p-4 flex flex-col h-full">
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
            />
          </div>
        </div>

        <div className="col-span-3 bg-white rounded-lg shadow-md p-4 flex flex-col h-full">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">
            Payment by Passenger Type
          </h3>
          <div className="flex-1">
            <Pie
              data={passengerTypeData()}
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
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-10 gap-6 h-[500px] items-stretch mt-6">
        <div className="col-span-6 bg-white rounded-lg shadow-md p-4 flex flex-col h-full">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">
            Top Routes
          </h3>
          <div className="flex-1">
            <Bar
              data={topRoutesData()}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    display: false,
                  },
                },
              }}
            />
          </div>
        </div>

        <div className="col-span-4 bg-white rounded-lg shadow-md p-4 flex flex-col h-full">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">
            Top Drivers
          </h3>
          <div className="flex-1">
            <Bar
              data={topDriversData()}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    display: false,
                  },
                },
              }}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-10 gap-6 h-[400px] items-stretch mt-6">
        <div className="col-span-3 bg-white rounded-lg shadow-md p-4 flex flex-col h-full">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">
            Quota Status
          </h3>
          <div className="flex-1">
            <Pie
              data={{
                labels: ["Quota Met", "Quota Not Met"],
                datasets: [
                  {
                    data: [
                      quotaStats.quotaMet ?? 0,
                      quotaStats.quotaNotMet ?? 0,
                    ],
                    backgroundColor: ["#3E8E6A", "#A62639"],
                  },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: "bottom", align: "start" } },
              }}
            />
          </div>
        </div>

        <div className="col-span-7 bg-white rounded-lg shadow-md p-4 flex flex-col h-full">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">
            Reasons for Void
          </h3>
          <div className="flex-1">
            <Bar
              data={reasonsForVoidData()}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    display: false,
                  },
                },
              }}
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
                  Timestamp
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Fare Price
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Payment Method
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Pick-Up
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Drop-Off
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Driver Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Invoice Number
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {currentTransactions.map((transaction) => {
                const { time, date } = formatTimestamp(transaction.timestamp);
                return (
                  <tr key={transaction.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div className="text-sm">
                        <div>{time}</div>
                        <div className="text-gray-600">{date}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      ₱{parseFloat(transaction.farePrice).toFixed(2)}
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
                      {transaction.pickUp || "N/A"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {transaction.dropOff || "N/A"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {transaction.driverName || "N/A"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {transaction.invoiceNum || "N/A"}
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
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex justify-between items-center mt-4">
          <p className="text-sm text-gray-500">
            Showing {currentTransactions.length} of{" "}
            {filteredTransactions.length} transactions
          </p>
          <div className="flex items-center space-x-2">
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

export default function DashboardAdmin() {
  const location = useLocation();
  const activeLink = location.pathname;

  const isMainDashboard = activeLink === "/dashboardAdmin";

  return (
    <div className="flex bg-gray-100 min-h-screen">
      <main className="flex-1 p-6 bg-gray-50 overflow-y-auto">
        {isMainDashboard ? <DashboardAnalytics /> : <Outlet />}
      </main>
    </div>
  );
}