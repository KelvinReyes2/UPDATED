import { useState, useEffect, useCallback } from "react";
import { Outlet, useLocation } from "react-router-dom";
import {
  collection,
  query,
  getDocs,
  orderBy,
  where,
} from "firebase/firestore";
import { db } from "../../firebase";
import { Fuel, Users, UserCheck, DollarSign } from "lucide-react";
import { Line, Bar} from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  TimeScale,
  Filler,
} from "chart.js";
import "chartjs-adapter-date-fns";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  TimeScale,
  Filler
);

const CashierDashboardAnalytics = () => {
  // Get today's date in YYYY-MM-DD format
  const getTodayDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const [fuelPrice, setFuelPrice] = useState(0);
  const [logs, setLogs] = useState([]);
  const [filteredLogs, setFilteredLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(getTodayDate()); // Default to today
  const [endDate, setEndDate] = useState("");
  const [stats, setStats] = useState({
    driversRelievers: 0,
    officersFueled: 0,
    totalFuelExpense: 0,
  });
  const [currentPage, setCurrentPage] = useState(1);
  const logsPerPage = 10;
  const [driverRelieverCount, setDriverRelieverCount] = useState(0);
  const [priceData, setPriceData] = useState([]);
  const [consumptionData, setConsumptionData] = useState({});
  const [expenseData, setExpenseData] = useState({});

  const primaryColor = "#364C6E";

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

  // Fetch Drivers & Relievers Count
  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const usersRef = collection(db, "users");
        const driversSnapshot = await getDocs(
          query(usersRef, where("role", "in", ["Driver", "Reliever"]))
        );
        setDriverRelieverCount(driversSnapshot.size);
      } catch (err) {
        console.error("Error fetching users:", err);
      }
    };
    fetchCounts();
  }, []);

  // Fetch Fuel Price & Logs
  const fetchFuelLog = useCallback(async () => {
    try {
      setLoading(true);

      // Fetch fuel logs
      const logsRef = collection(db, "fuelLogs");
      const logsSnapshot = await getDocs(
        query(logsRef, orderBy("timestamp", "desc"))
      );

      const logsData = logsSnapshot.docs.map((doc) => {
        const log = doc.data();
        return {
          id: doc.id,
          date: log.timestamp?.toDate
            ? log.timestamp.toDate().toLocaleDateString()
            : "N/A",
          driver: log.Driver || "N/A",
          officer: log.Officer || "N/A",
          amount: parseFloat(log.fuelAmount) || 0,
          unit: log.Vehicle || "N/A", // Changed from 'vehicle' to 'unit' to match the data structure
          status: log.status || "pending",
          timestamp: log.timestamp?.toDate
            ? log.timestamp.toDate()
            : new Date(),
        };
      });

      setLogs(logsData);

      // Apply date filtering immediately after fetching
      filterLogsByDate(logsData, startDate, endDate);

      // Fetch latest fuel price
      const priceRef = collection(db, "fuelPrice");
      const priceSnapshot = await getDocs(
        query(priceRef, orderBy("timestamp", "desc") /* limit(1) */)
      );
      const priceHistory = priceSnapshot.docs.map((doc) => {
        const d = doc.data();
        return {
          date: d.timestamp?.toDate().toLocaleDateString("en-US"),
          price: parseFloat(d.Price || 0),
        };
      });
      setPriceData(priceHistory.reverse());

      if (!priceSnapshot.empty) {
        const latestPrice = priceSnapshot.docs[0].data();
        setFuelPrice(parseFloat(latestPrice.Price || 0));
      } else {
        setFuelPrice(0);
      }
    } catch (err) {
      console.error("Error fetching fuel logs:", err);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  // Filter logs by date using ActivityLog's improved logic
  const filterLogsByDate = (logsToFilter, filterStartDate, filterEndDate) => {
    if (!filterStartDate && !filterEndDate) {
      setFilteredLogs(logsToFilter);
      return;
    }

    const filtered = logsToFilter.filter((log) => {
      const logDate = getDateFromTimestamp(log.timestamp);
      if (logDate) {
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
        // If only end date is provided
        else if (!filterStartDate && filterEndDate) {
          return logDateString <= filterEndDate;
        }
      }
      return false;
    });

    setFilteredLogs(filtered);
    setCurrentPage(1); // Reset to first page when filtering
  };

  useEffect(() => {
    if (!filteredLogs.length) {
      setConsumptionData({});
      setExpenseData({});
      setStats({
        driversRelievers: driverRelieverCount,
        officersFueled: 0,
        totalFuelExpense: 0,
      });
      return;
    }

    // Build Consumption (per Driver)
    const consumptionByDriver = {};
    filteredLogs.forEach((log) => {
      if (log.driver) {
        consumptionByDriver[log.driver] =
          (consumptionByDriver[log.driver] || 0) + log.amount;
      }
    });
    setConsumptionData(consumptionByDriver);

    const expenseByDriver = {};
    let totalFuel = 0;

    filteredLogs.forEach((log) => {
      if (log.driver) {
        expenseByDriver[log.driver] =
          (expenseByDriver[log.driver] || 0) + log.amount * fuelPrice;
      }
      totalFuel += log.amount * fuelPrice;
    });

    setExpenseData(expenseByDriver);

    const totalFuelExpense = filteredLogs.reduce(
      (sum, log) => sum + (parseFloat(log.amount) || 0),
      0
    );

    setStats({
      driversRelievers: driverRelieverCount,
      officersFueled: new Set(
        filteredLogs
          .filter((log) => log.status === "done" && log.driver)
          .map((log) => log.driver)
      ).size,
      totalFuelExpense,
    });
  }, [filteredLogs, fuelPrice, driverRelieverCount]);

  useEffect(() => {
    fetchFuelLog();
  }, [fetchFuelLog]);

  // Filter logs when dates change
  useEffect(() => {
    filterLogsByDate(logs, startDate, endDate);
  }, [startDate, endDate, logs]);

  useEffect(() => {
    const fetchPriceData = async () => {
      const priceRef = collection(db, "fuelPrice");
      const priceSnapshot = await getDocs(
        query(priceRef, orderBy("timestamp", "asc"))
      );
      const allPrices = priceSnapshot.docs.map((doc) => {
        const d = doc.data();
        return {
          date: d.timestamp?.toDate().toISOString().split("T")[0], // YYYY-MM-DD
          price: parseFloat(d.Price || 0),
        };
      });

      // Apply date filtering
      const filteredPrices = allPrices.filter((p) => {
        if (startDate && endDate)
          return p.date >= startDate && p.date <= endDate;
        if (startDate && !endDate) return p.date === startDate;
        if (!startDate && endDate) return p.date <= endDate;
        return true;
      });

      setPriceData(filteredPrices);
    };

    fetchPriceData();
  }, [startDate, endDate]);

  // Pagination
  const currentLogs = filteredLogs.slice(
    (currentPage - 1) * logsPerPage,
    currentPage * logsPerPage
  );

  const handleNextPage = () => {
    if (currentPage * logsPerPage < filteredLogs.length)
      setCurrentPage(currentPage + 1);
  };

  const handlePreviousPage = () => {
    if (currentPage > 1) setCurrentPage(currentPage - 1);
  };

  const handleResetDates = () => {
    setStartDate("");
    setEndDate("");
    setFilteredLogs(logs);
    setCurrentPage(1);
  };

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

  const lineData = {
    labels: priceData.map((d) => d.date),
    datasets: [
      {
        label: "Fuel Price (₱/L)",
        data: priceData.map((d) => d.price),
        borderColor: "#3b82f6",
        backgroundColor: "rgba(59,130,246,0.2)",
        tension: 0.4,
        fill: true,
      },
    ],
  };

  const barData = {
    labels: Object.keys(consumptionData),
    datasets: [
      {
        label: "Fuel Consumption (L)",
        data: Object.values(consumptionData),
        backgroundColor: "#10b981",
      },
    ],
  };

  return (
    <div className="space-y-8">
      {/* Header & Filters */}
      <div className="bg-white rounded-2xl shadow-md p-6 border border-gray-100">
        <h2 className="text-2xl font-semibold text-gray-800 mb-4">
          Cashier Dashboard
        </h2>
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex flex-col">
            <label className="text-sm font-medium text-gray-600 mb-1">
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-sm font-medium text-gray-600 mb-1">
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={handleResetDates}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
          >
            Reset
          </button>
          <button
            onClick={fetchFuelLog}
            className="px-4 py-2 text-white rounded-lg shadow-md hover:opacity-90 transition"
            style={{ backgroundColor: primaryColor }}
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-2xl shadow p-6 flex items-center gap-4">
          <div className="p-3 bg-blue-100 rounded-full">
            <Fuel className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Fuel Price</p>
            <p className="text-2xl font-semibold">₱{fuelPrice.toFixed(2)}</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow p-6 flex items-center gap-4">
          <div className="p-3 bg-green-100 rounded-full">
            <Users className="h-6 w-6 text-green-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Number of Drivers/Relievers</p>
            <p className="text-2xl font-semibold">{driverRelieverCount}</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow p-6 flex items-center gap-4">
          <div className="p-3 bg-yellow-100 rounded-full">
            <UserCheck className="h-6 w-6 text-yellow-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Fueled Drivers</p>
            <p className="text-2xl font-semibold">{stats.officersFueled}</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow p-6 flex items-center gap-4">
          <div className="p-3 bg-red-100 rounded-full">
            <DollarSign className="h-6 w-6 text-red-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Total Fuel Expenses</p>
            <p className="text-2xl font-semibold">
              ₱{stats.totalFuelExpense.toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 items-start">
        {/* Bar Chart Column */}
        <div className="bg-white rounded-lg shadow-md p-6 h-[900px] flex flex-col">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">
            Fuel Consumption by Driver
          </h3>
          <div className="flex-1">
            <Bar
              data={barData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  title: {
                    display: true,
                    text: "Driver Fuel Consumption Overview",
                    font: { size: 14 },
                  },
                },
              }}
              className="h-full w-full"
            />
          </div>
        </div>

        {/* Line Chart Column */}
        <div className="bg-white rounded-lg shadow-md p-6 h-[900px] flex flex-col">
          <h3 className="text-md font-semibold text-gray-800 mb-4">
            Fuel Price Trend (Monthly)
          </h3>
          <div className="flex-1">
            <Line
              data={lineData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  title: {
                    display: true,
                    text: "Monthly Fuel Price Trend",
                    font: { size: 12 },
                  },
                },
              }}
              className="h-full w-full"
            />
          </div>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-2xl shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Fuel Logs Overview</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left border border-gray-200 rounded-lg">
            <thead className="bg-gray-50">
              <tr>
                {["Date", "Driver", "Officer", "Fuel Amount", "Unit"].map(
                  (header) => (
                    <th
                      key={header}
                      className="px-6 py-3 text-xs font-medium text-gray-600 uppercase tracking-wider"
                    >
                      {header}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {currentLogs.map((log) => (
                <tr key={log.id} className="border-t hover:bg-gray-50">
                  <td className="px-6 py-3 text-sm">{log.date}</td>
                  <td className="px-6 py-3 text-sm">{log.driver}</td>
                  <td className="px-6 py-3 text-sm">{log.officer}</td>
                  <td className="px-6 py-3 text-sm font-medium">
                    ₱{log.amount.toFixed(2)}
                  </td>
                  <td className="px-6 py-3 text-sm">{log.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex justify-between items-center mt-4">
          <p className="text-sm text-gray-500">
            Showing {currentLogs.length} of {filteredLogs.length} logs
          </p>
          <div className="flex items-center space-x-2">
            <button
              onClick={handlePreviousPage}
              disabled={currentPage === 1}
              className="px-3 py-2 border rounded-lg text-gray-600 disabled:opacity-50 hover:bg-gray-100"
            >
              Prev
            </button>
            <button
              onClick={handleNextPage}
              disabled={currentPage * logsPerPage >= filteredLogs.length}
              className="px-3 py-2 border rounded-lg text-gray-600 disabled:opacity-50 hover:bg-gray-100"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function DashboardCashier() {
  const location = useLocation();
  const activeLink = location.pathname;

  const isMainDashboard = activeLink === "/dashboardCashier";

  return (
    <div className="flex bg-gray-100 min-h-screen">
      <main className="flex-1 p-8 overflow-y-auto">
        {isMainDashboard ? <CashierDashboardAnalytics /> : <Outlet />}
      </main>
    </div>
  );
}