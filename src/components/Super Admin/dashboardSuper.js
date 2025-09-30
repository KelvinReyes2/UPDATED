import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import DataTable from "react-data-table-component";
import {
  FaUsersCog,
  FaLaptop,
  FaHistory,
  FaSearch,
  FaCalendarAlt,
} from "react-icons/fa";
import { formatDistanceToNow, format } from "date-fns";

import { db } from "../../firebase";
import { collection, onSnapshot, query, where } from "firebase/firestore";

export default function DashboardSuper() {
  // Get today's date in YYYY-MM-DD format
  const getTodayDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [logs, setLogs] = useState([]);
  const [passwordRequests, setPasswordRequests] = useState([]);
  const [activeUsers, setActiveUsers] = useState(0);
  const [pendingRequests, setPendingRequests] = useState(0);
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState(getTodayDate());
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(true);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const primaryColor = "#364C6E";

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

  const formatTimestamp = (timestamp) => {
    try {
      const date = getDateFromTimestamp(timestamp);
      if (!date) {
        return { relativeTime: "N/A", fullDate: "N/A" };
      }

      let relativeTime = formatDistanceToNow(date, { addSuffix: true });

      if (relativeTime === "less than a minute ago") {
        relativeTime = "Less than a minute ago";
      } else if (relativeTime === "about 1 hour ago") {
        relativeTime = "About 1 hour ago";
      } else {
        relativeTime =
          relativeTime.charAt(0).toUpperCase() + relativeTime.slice(1);
      }

      const fullDate = format(date, "MMMM dd, yyyy, hh:mm a");
      return { relativeTime, fullDate };
    } catch (error) {
      console.error("Error formatting timestamp:", error);
      return { relativeTime: "Invalid Date", fullDate: "Invalid Date" };
    }
  };

  useEffect(() => {
    setLoading(true);

    const unsubLogs = onSnapshot(collection(db, "systemLogs"), (snap) => {
      const temp = [];
      snap.forEach((doc) => {
        const data = doc.data();
        
        const logEntry = {
          id: doc.id,
          timestamp: data.timestamp || null,
          performedBy: data.performedBy || "Unknown User",
          activity: data.activity || "No activity description",
          role: data.role || "Unknown Role",
        };
        temp.push(logEntry);
      });
      
      // Sort logs by timestamp in descending order (most recent first)
      temp.sort((a, b) => {
        const timeA = a.timestamp?.seconds || a.timestamp?.getTime?.() || 0;
        const timeB = b.timestamp?.seconds || b.timestamp?.getTime?.() || 0;
        return timeB - timeA;
      });
      
      setLogs(temp);
      setLogsLoading(false);
    });

    const unsubPasswordRequests = onSnapshot(
      query(
        collection(db, "passwordRequestReset"),
        where("status", "==", "pending"),
      ),
      (snap) => {
        const tempRequests = [];
        snap.forEach((doc) => {
          const data = doc.data();
          const request = {
            id: doc.id,
            user: data.user,
            status: data.status,
            requestedAt: data.requestedAt,
          };
          tempRequests.push(request);
        });
        
        // Sort requests by timestamp in descending order (most recent first)
        tempRequests.sort((a, b) => {
          const timeA = a.requestedAt?.seconds || a.requestedAt?.getTime?.() || 0;
          const timeB = b.requestedAt?.seconds || b.requestedAt?.getTime?.() || 0;
          return timeB - timeA;
        });

        setPasswordRequests(tempRequests);
        setPendingRequests(tempRequests.length);
        setRequestsLoading(false);
      },
    );

    const unsubActiveUsers = onSnapshot(collection(db, "users"), (snap) => {
      const activeUsersCount = snap.docs.filter(
        (doc) => doc.data().role !== "Super",
      ).length;
      setActiveUsers(activeUsersCount);
      setLoading(false);
    });

    return () => {
      unsubLogs();
      unsubPasswordRequests();
      unsubActiveUsers();
    };
  }, []);

  // Enhanced filtering logic similar to ActivityLogSuper
  const filteredLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((log) => {
      // Search filter
      const text = `${log.performedBy || ""} ${log.activity || ""}`.toLowerCase();
      const matchesSearch = !q || text.includes(q);

      // Date filter - same logic as ActivityLogSuper
      let matchesDateFilter = true;
      if (startDate || endDate) {
        const logDate = getDateFromTimestamp(log.timestamp);
        if (logDate) {
          // Convert log date to local date string in YYYY-MM-DD format
          const year = logDate.getFullYear();
          const month = String(logDate.getMonth() + 1).padStart(2, '0');
          const day = String(logDate.getDate()).padStart(2, '0');
          const logDateString = `${year}-${month}-${day}`;
          
          // If only start date is provided, show logs from that specific date only
          if (startDate && !endDate) {
            matchesDateFilter = logDateString === startDate;
          } 
          // If both dates are provided, show logs in the range
          else if (startDate && endDate) {
            matchesDateFilter = logDateString >= startDate && logDateString <= endDate;
          }
          // If only end date is provided (unlikely but handle it)
          else if (!startDate && endDate) {
            matchesDateFilter = logDateString <= endDate;
          }
        } else {
          // If timestamp is invalid/null, exclude it when date filters are applied
          matchesDateFilter = false;
        }
      }

      return matchesSearch && matchesDateFilter;
    });
  }, [logs, search, startDate, endDate]);

  // Enhanced custom styles for DataTable with visible pagination
  const customStyles = {
    header: {
      style: {
        backgroundColor: "#ffffff",
        borderBottom: "1px solid #e5e7eb",
        minHeight: "50px",
        paddingLeft: "16px",
        paddingRight: "16px",
      },
    },
    headRow: {
      style: {
        backgroundColor: "#f8fafc",
        borderBottom: "2px solid #e5e7eb",
        minHeight: "50px",
        fontWeight: "600",
        fontSize: "14px",
        color: "#374151",
        textTransform: "uppercase",
        letterSpacing: "0.05em",
      },
    },
    headCells: {
      style: {
        backgroundColor: "transparent",
        color: "#374151",
        fontSize: "14px",
        fontWeight: "600",
        padding: "12px 16px",
        textTransform: "uppercase",
        letterSpacing: "0.05em",
      },
    },
    rows: {
      style: {
        backgroundColor: "#ffffff",
        borderBottom: "1px solid #f3f4f6",
        minHeight: "56px",
        cursor: "default",
        "&:hover": {
          backgroundColor: "#f9fafb",
          transition: "background-color 0.15s ease",
        },
      },
    },
    cells: {
      style: {
        padding: "12px 16px",
        fontSize: "14px",
        color: "#111827",
        lineHeight: "1.4",
      },
    },
    pagination: {
      style: {
        backgroundColor: "#ffffff",
        borderTop: "1px solid #e5e7eb",
        minHeight: "60px",
        fontSize: "14px",
        color: "#6b7280",
        padding: "8px 16px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      },
      pageButtonsStyle: {
        backgroundColor: "transparent",
        border: "1px solid #d1d5db",
        borderRadius: "6px",
        color: "#6b7280",
        fontSize: "14px",
        fontWeight: "500",
        height: "36px",
        margin: "0 2px",
        padding: "0 12px",
        minWidth: "36px",
        "&:hover:not(:disabled)": {
          backgroundColor: primaryColor,
          borderColor: primaryColor,
          color: "#ffffff",
        },
        "&:focus": {
          outline: "none",
          boxShadow: `0 0 0 3px ${primaryColor}20`,
          borderColor: primaryColor,
        },
        "&:disabled": {
          backgroundColor: "transparent",
          borderColor: "#e5e7eb",
          color: "#d1d5db",
          cursor: "not-allowed",
        },
      },
    },
    table: {
      style: {
        backgroundColor: "#ffffff",
        borderRadius: "8px",
        overflow: "hidden",
        border: "1px solid #e5e7eb",
      },
    },
    noData: {
      style: {
        backgroundColor: "#ffffff",
        color: "#6b7280",
        fontSize: "16px",
        fontWeight: "500",
        padding: "32px 16px",
      },
    },
  };

  const columns = [
    {
      name: "Timestamp",
      selector: (log) => log.timestamp?.seconds || 0,
      sortable: true,
      width: "240px",
      cell: (log) => {
        const { relativeTime, fullDate } = formatTimestamp(log.timestamp);
        return (
          <div className="py-1">
            <div className="font-semibold text-gray-900 text-sm leading-tight">
              {relativeTime}
            </div>
            <div className="text-xs text-gray-500 mt-0.5" title={fullDate}>
              {fullDate}
            </div>
          </div>
        );
      },
    },
    {
      name: "User",
      selector: (log) => log.performedBy || "Unknown User",
      sortable: true,
      width: "200px",
      cell: (log) => (
        <div className="py-1">
          <div className="font-semibold text-gray-900 text-sm flex items-center">
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mr-3">
              <span className="text-blue-600 font-semibold text-xs">
                {(log.performedBy || "U").charAt(0).toUpperCase()}
              </span>
            </div>
            {log.performedBy || "Unknown User"}
          </div>
        </div>
      ),
    },
    {
      name: "Activity",
      selector: (log) => log.activity || "No activity description",
      sortable: true,
      cell: (log) => (
        <div className="py-1 pr-2">
          <div
            className="text-gray-700 text-sm leading-relaxed"
            title={log.activity}
            style={{
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {log.activity}
          </div>
        </div>
      ),
    },
  ];

  const requestColumns = [
    {
      name: "User",
      selector: (row) => row.user,
      sortable: true,
      width: "300px",
      cell: (row) => (
        <div className="py-1">
          <div className="font-semibold text-gray-900 text-sm flex items-center">
            <div 
              className="w-8 h-8 rounded-full flex items-center justify-center mr-3"
              style={{ backgroundColor: '#b4ffe2ff' }}
            >
              <span 
                className="font-semibold text-xs"
                style={{ color: '#348b47ff' }}
              >
                {(row.user || "U").charAt(0).toUpperCase()}
              </span>
            </div>
            {row.user}
          </div>
        </div>
      ),
    },
    {
      name: "Requested At",
      selector: (row) => row.requestedAt?.seconds || 0,
      sortable: true,
      sortFunction: (rowA, rowB) => {
        const timeA = rowA.requestedAt?.seconds || 0;
        const timeB = rowB.requestedAt?.seconds || 0;
        return timeB - timeA; // Descending order (most recent first)
      },
      width: "250px",
      cell: (row) => {
        const { relativeTime, fullDate } = formatTimestamp(row.requestedAt);
        return (
          <div className="py-1">
            <div className="text-gray-900 text-sm font-medium">
              {relativeTime}
            </div>
            <div className="text-xs text-gray-500 mt-0.5" title={fullDate}>
              {fullDate}
            </div>
          </div>
        );
      },
    },
    {
      name: "Status",
      selector: (row) => row.status,
      width: "140px",
      cell: (row) => (
        <div className="py-1">
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800 border border-yellow-200">
            <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full mr-1.5"></span>
            Pending
          </span>
        </div>
      ),
    },
  ];

  return (
    <div className="flex bg-gray-50 min-h-screen w-full">
      {/* Main Content */}
      <main className="flex-1 p-6 w-full max-w-none">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Dashboard Overview
          </h1>
          <p className="text-gray-600">
            Monitor system activity and manage user requests
          </p>
        </div>

        {/* Enhanced Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* System Status Card */}
          <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="p-3 bg-green-50 rounded-lg">
                  <FaLaptop className="text-green-600 text-xl" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600 uppercase tracking-wide">
                    System Status
                  </p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    Operational
                  </p>
                </div>
              </div>
              <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
            </div>
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-sm text-gray-500">
                All systems running smoothly
              </p>
            </div>
          </div>

          {/* Active Users Card */}
          <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="p-3 bg-blue-50 rounded-lg">
                  <FaUsersCog className="text-blue-600 text-xl" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600 uppercase tracking-wide">
                    Active Users
                  </p>
                  <div className="text-2xl font-bold text-gray-900 mt-1">
                    {loading ? (
                      <div className="animate-pulse bg-gray-200 h-8 w-12 rounded"></div>
                    ) : (
                      <span className="flex items-center">
                        {activeUsers}
                        <span className="text-sm font-normal text-gray-500 ml-2">
                          total
                        </span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-sm text-gray-500">
                Currently registered users
              </p>
            </div>
          </div>

          {/* Pending Requests Card */}
          <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="p-3 bg-yellow-50 rounded-lg">
                  <FaHistory className="text-yellow-600 text-xl" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600 uppercase tracking-wide">
                    Pending Requests
                  </p>
                  <div className="text-2xl font-bold text-gray-900 mt-1">
                    {loading ? (
                      <div className="animate-pulse bg-gray-200 h-8 w-12 rounded"></div>
                    ) : (
                      <span className="flex items-center">
                        {pendingRequests}
                        {pendingRequests > 0 && (
                          <span className="ml-2 w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></span>
                        )}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-sm text-gray-500">Password reset requests</p>
            </div>
          </div>
        </div>

        {/* Data Tables Section */}
        <div className="grid grid-cols-1 2xl:grid-cols-2 gap-6">
          {/* Activity Log */}
          <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden flex flex-col" style={{ height: "600px" }}>
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex-shrink-0">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">
                    Activity Log
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Recent system activities
                  </p>
                </div>
                <Link
                  to="/activityLogSuper"
                  className="inline-flex items-center px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors duration-200 hover:opacity-90"
                  style={{ backgroundColor: primaryColor }}
                >
                  View All
                </Link>
              </div>

              {/* Enhanced Filter Controls */}
              <div className="flex flex-wrap gap-3">
                <div className="flex items-center space-x-2">
                  <FaCalendarAlt className="text-gray-400 text-sm" />
                  <input
                    type="date"
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    placeholder="Start date"
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-gray-400 text-sm">to</span>
                  <input
                    type="date"
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    placeholder="End date"
                  />
                </div>
                <div className="flex items-center flex-1 min-w-0">
                  <div className="relative flex-1 max-w-sm">
                    <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-sm" />
                    <input
                      type="text"
                      className="w-full rounded-md border border-gray-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Search activities and users..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Table Container */}
            <div className="flex-1 overflow-hidden">
              {logsLoading ? (
                <div className="flex justify-center items-center h-full">
                  <div className="flex flex-col items-center">
                    <div
                      className="animate-spin rounded-full h-8 w-8 border-b-2 mb-4"
                      style={{ borderColor: primaryColor }}
                    ></div>
                    <p className="text-gray-500 text-sm font-medium">
                      Loading activity logs...
                    </p>
                  </div>
                </div>
              ) : (
                <DataTable
                  columns={columns}
                  data={filteredLogs}
                  customStyles={customStyles}
                  highlightOnHover
                  pagination
                  paginationPerPage={5}
                  paginationRowsPerPageOptions={[5, 10, 15]}
                  fixedHeader
                  fixedHeaderScrollHeight="350px"
                  noDataComponent={
                    <div className="py-12 text-center">
                      <div className="text-gray-400 text-lg mb-2">
                        No activity logs found
                      </div>
                      <div className="text-gray-500 text-sm">
                        Try adjusting your search criteria
                      </div>
                    </div>
                  }
                />
              )}
            </div>
          </div>

          {/* Password Reset Requests */}
          <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden flex flex-col" style={{ height: "600px" }}>
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex-shrink-0">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">
                    Password Reset Requests
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Pending user requests
                  </p>
                </div>
                <Link
                  to="/PasswordSuper"
                  className="inline-flex items-center px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors duration-200 hover:opacity-90"
                  style={{ backgroundColor: primaryColor }}
                >
                  Manage All
                </Link>
              </div>
            </div>

            {/* Table Container */}
            <div className="flex-1 overflow-hidden">
              {requestsLoading ? (
                <div className="flex justify-center items-center h-full">
                  <div className="flex flex-col items-center">
                    <div
                      className="animate-spin rounded-full h-8 w-8 border-b-2 mb-4"
                      style={{ borderColor: primaryColor }}
                    ></div>
                    <p className="text-gray-500 text-sm font-medium">
                      Loading password requests...
                    </p>
                  </div>
                </div>
              ) : (
                <DataTable
                  columns={requestColumns}
                  data={passwordRequests}
                  customStyles={customStyles}
                  highlightOnHover
                  pagination
                  paginationPerPage={5}
                  paginationRowsPerPageOptions={[5, 10, 15]}
                  fixedHeader
                  fixedHeaderScrollHeight="420px"
                  defaultSortFieldId={2}
                  defaultSortAsc={false}
                  noDataComponent={
                    <div className="py-12 text-center">
                      <div className="text-gray-400 text-lg mb-2">
                        No pending requests
                      </div>
                      <div className="text-gray-500 text-sm">
                        All password reset requests have been processed
                      </div>
                    </div>
                  }
                />
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}