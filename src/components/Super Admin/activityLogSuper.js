import { useState, useEffect, useMemo } from "react";
import DataTable from "react-data-table-component";
import { FaEye, FaTimes, FaHistory } from "react-icons/fa";
import { formatDistanceToNow, format } from "date-fns";
import { exportToCSV, exportToPDF } from "../functions/exportFunctions";

import { db } from "../../firebase";
import {
  collection,
  onSnapshot,
  doc,
  getDoc,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";

export default function ActivityLogSuper() {
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState(null);
  const [search, setSearch] = useState("");

  // Helper function to get today's date in YYYY-MM-DD format
  const getTodayDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const [filterStartDate, setFilterStartDate] = useState(getTodayDate()); // Default to today's date
  const [filterEndDate, setFilterEndDate] = useState(""); // End date filter
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState("User");

  const auth = getAuth();
  const currentUser = auth.currentUser;

  const primaryColor = "#364C6E";

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Function to map user roles to display roles for logging
  const ROLE_MAPPING = {
    Admin: "System Admin",
    Super: "Super Admin",
  };

  const mapRoleForLogging = (role) => {
    return ROLE_MAPPING[role] || null;
  };

  // Function to log system activities with mapped role
  const logSystemActivity = async (activity, performedBy, role = null) => {
    try {
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

  const toggleDropdown = () => {
    setIsDropdownOpen((prev) => !prev);
  };

  const openViewModal = (log) => {
    setSelectedLog(log);
    setIsViewModalOpen(true);
  };

  const closeViewModal = () => {
    setIsViewModalOpen(false);
    setSelectedLog(null);
  };

  // Reset filters function
  const resetFilters = () => {
    setSearch("");
    setFilterStartDate(getTodayDate());
    setFilterEndDate("");
  };

  // Helper function to convert date to local YYYY-MM-DD format
  const toLocalDateString = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // Helper function to format timestamp with "Today", "Yesterday", etc.
  const formatTimestamp = (timestamp) => {
    try {
      let date;

      // Handle Firestore Timestamp
      if (timestamp && typeof timestamp.toDate === "function") {
        date = timestamp.toDate();
      }
      // Handle timestamp object with seconds property (Firestore)
      else if (timestamp && timestamp.seconds) {
        date = new Date(timestamp.seconds * 1000);
      }
      // Handle JavaScript Date
      else if (timestamp instanceof Date) {
        date = timestamp;
      } else if (
        typeof timestamp === "string" &&
        !isNaN(Date.parse(timestamp))
      ) {
        date = new Date(timestamp);
      } else {
        return { relativeTime: "N/A", fullDate: "N/A", localDate: null };
      }

      // Relative time like "Today", "Yesterday", or "2 weeks ago"
      let relativeTime = formatDistanceToNow(date, { addSuffix: true });

      // Capitalize "Less than a minute" and "About 1 hour"
      if (relativeTime === "less than a minute ago") {
        relativeTime = "Less than a minute ago";
      } else if (relativeTime === "about 1 hour ago") {
        relativeTime = "About 1 hour ago";
      } else {
        // Capitalize the first letter of all other time strings (optional)
        relativeTime =
          relativeTime.charAt(0).toUpperCase() + relativeTime.slice(1);
      }

      // Actual date and time in the desired format (e.g., September 17, 2025, 10:28 AM)
      const fullDate = format(date, "MMMM dd, yyyy, hh:mm a");

      // Local date in YYYY-MM-DD format for filtering
      const localDate = toLocalDateString(date);

      return { relativeTime, fullDate, localDate };
    } catch (error) {
      console.error("Error formatting timestamp:", error);
      return {
        relativeTime: "Invalid Date",
        fullDate: "Invalid Date",
        localDate: null,
      };
    }
  };

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "systemLogs"),
      (snap) => {
        const temp = [];
        snap.forEach((doc) => {
          const data = doc.data();
          const role = data.role || "Unknown Role";

          const logEntry = {
            id: doc.id,
            timestamp: data.timestamp || null,
            performedBy: data.performedBy || "Unknown User",
            activity: data.activity || "No activity description",
            role: data.role || "Unknown Role",
          };
          temp.push(logEntry);
        });

        temp.sort((a, b) => {
          const timeA = a.timestamp?.seconds || a.timestamp?.getTime?.() || 0;
          const timeB = b.timestamp?.seconds || b.timestamp?.getTime?.() || 0;
          return timeB - timeA;
        });

        setLogs(temp);
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching logs:", error);
        setLoading(false);
      }
    );

    return () => unsub();
  }, []); // Runs only once when component mounts

  useEffect(() => {
    const fetchCurrentUser = async () => {
      try {
        const user = auth.currentUser;

        if (user) {
          const docRef = doc(db, "users", user.uid);
          const docSnap = await getDoc(docRef);

          if (docSnap.exists()) {
            const userData = docSnap.data();
            setCurrentUser(userData);
            setUserRole(userData.role || "User");
          }
        }
      } catch (err) {
        console.error("Error fetching current user:", err);
      }
    };
    fetchCurrentUser();
  }, []);

  const filteredLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((log) => {
      const text =
        `${log.performedBy || ""} ${log.activity || ""}`.toLowerCase();
      const matchesSearch = !q || text.includes(q);

      let matchesDateFilter = true;

      // Only apply date filter if at least start date is provided
      if (filterStartDate) {
        const { localDate } = formatTimestamp(log.timestamp);

        if (localDate) {
          const logDate = localDate;

          // If both start and end dates are provided
          if (filterStartDate && filterEndDate) {
            matchesDateFilter =
              logDate >= filterStartDate && logDate <= filterEndDate;
          }
          // If only start date is provided
          else if (filterStartDate) {
            matchesDateFilter = logDate >= filterStartDate;
          }
          // If only end date is provided
          else if (filterEndDate) {
            matchesDateFilter = logDate <= filterEndDate;
          }
        } else {
          matchesDateFilter = false;
        }
      }

      return matchesSearch && matchesDateFilter;
    });
  }, [logs, search, filterStartDate, filterEndDate]);

  // Define the headers for export
  const headers = ["Timestamp", "User", "Role", "Activity"];

  // Map filtered logs to exportable rows
  const exportRows = filteredLogs.map((log) => [
    formatTimestamp(log.timestamp).fullDate,
    log.performedBy || "Unknown User",
    log.role || "Unknown Role",
    log.activity || "No activity description",
  ]);

  // CSV Export
  const handleExportToCSV = async () => {
    if (!filteredLogs || filteredLogs.length === 0) {
      alert("No data to export.");
      return;
    }

    exportToCSV(
      headers,
      exportRows,
      "Activity_Log.csv",
      currentUser?.email || "Unknown",
      "Activity Log"
    );

    if (user) {
      try {
        const userFullName = user.firstName && user.lastName 
          ? `${user.firstName} ${user.lastName}`.trim()
          : currentUser?.email || "Unknown User";

        await logSystemActivity(
          "Exported Activity Log Report to CSV",
          userFullName
        );
        console.log("Export log saved successfully.");
      } catch (err) {
        console.error("Failed to save export log:", err);
      }
    }
  };

  // PDF Export
  const handleExportToPDF = async () => {
    if (!filteredLogs || filteredLogs.length === 0) {
      alert("No data to export.");
      return;
    }
    exportToPDF(
      headers,
      exportRows,
      "Activity Log",
      "Activity_Log.pdf",
      currentUser?.email || "Unknown"
    );

    if (user) {
      try {
        const userFullName = user.firstName && user.lastName 
          ? `${user.firstName} ${user.lastName}`.trim()
          : currentUser?.email || "Unknown User";

        await logSystemActivity(
          "Exported Activity Log Report to PDF",
          userFullName
        );
        console.log("Export log saved successfully.");
      } catch (err) {
        console.error("Failed to save export log:", err);
      }
    }
  };

  const columns = [
    {
      name: "Timestamp",
      selector: (log) => formatTimestamp(log.timestamp).relativeTime,
      sortable: true,
      width: "500px",
      cell: (log) => (
        <div className="text-xl">
          <div style={{ fontWeight: "bold", fontSize: "14px" }}>
            {formatTimestamp(log.timestamp).relativeTime}
          </div>
          <div className="text-sm">
            {formatTimestamp(log.timestamp).fullDate}
          </div>
        </div>
      ),
    },
    {
      name: "User",
      selector: (log) => log.performedBy || "Unknown User",
      sortable: true,
      grow: 2,
      cell: (log) => (
        <div
          className="truncate"
          style={{ fontWeight: "bold", fontSize: "13px" }}
        >
          <div>{log.performedBy || "Unknown User"}</div>
          <div className="text-s" style={{ fontWeight: "normal" }}>
            {log.role || "Unknown Role"}
          </div>
        </div>
      ),
    },
    {
      name: "Activity",
      selector: (log) => log.activity || "No activity description",
      sortable: true,
      grow: 2,
      cell: (log) => (
        <div
          className="truncate"
          title={log.activity || "No activity description"}
          style={{ fontSize: "14px" }}
        >
          {log.activity || "No activity description"}
        </div>
      ),
    },
    {
      name: "Action",
      button: true,
      center: true,
      width: "120px",
      cell: (log) => (
        <button
          onClick={() => openViewModal(log)}
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

  return (
    <div className="flex bg-gray-100 min-h-screen">
      <main className="flex-1 p-10">
        <div className="mx-auto w-full max-w-[1900px]">
          <div
            className="bg-white border rounded-xl shadow-sm flex flex-col"
            style={{ minHeight: "calc(100vh - 112px)" }}
          >
            <div className="px-6 pt-6 pb-4 border-b flex items-center justify-between">
              <h1 className="text-2xl font-semibold text-gray-800">
                Activity Log
              </h1>
              <div className="flex items-center gap-4">
                <input
                  type="text"
                  placeholder="Search Log"
                  className="w-[420px] rounded-full border border-gray-200 pl-10 pr-3 py-2.5 text-sm shadow-sm focus:ring-4 focus:ring-blue-100 focus:border-blue-300 outline-none mt-7"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <div className="flex items-center gap-3">
                  <div className="flex flex-col">
                    <label className="text-sm font-medium text-gray-700 mb-1">
                      Start Date
                    </label>
                    <input
                      type="date"
                      className="w-[160px] rounded-lg border border-gray-200 px-3 py-2.5 text-sm shadow-sm focus:ring-4 focus:ring-blue-100 focus:border-blue-300 outline-none"
                      value={filterStartDate}
                      onChange={(e) => setFilterStartDate(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col">
                    <label className="text-sm font-medium text-gray-700 mb-1">
                      End Date
                    </label>
                    <input
                      type="date"
                      className="w-[160px] rounded-lg border border-gray-200 px-3 py-2.5 text-sm shadow-sm focus:ring-4 focus:ring-blue-100 focus:border-blue-300 outline-none"
                      value={filterEndDate}
                      onChange={(e) => setFilterEndDate(e.target.value)}
                    />
                  </div>

                  {/* Reset Filters Button */}
                  <div className="flex flex-col">
                    <label className="text-sm font-medium text-gray-700 mb-1 opacity-0">
                      Reset
                    </label>
                    <button
                      onClick={resetFilters}
                      className="px-4 py-2 bg-gray-500 text-white text-sm rounded-lg hover:bg-gray-600 transition duration-200 shadow-md"
                    >
                      Reset Filters
                    </button>
                  </div>
                </div>

                <div className="relative">
                  <button
                    onClick={toggleDropdown}
                    className="flex items-center gap-2 px-6 py-2 rounded-lg text-white shadow-md hover:shadow-lg transition mt-7"
                    style={{ backgroundColor: primaryColor }}
                  >
                    <span className="font-semibold">Export</span>
                  </button>

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
              </div>
            </div>

            <div className="px-6 py-4 flex-1">
              <DataTable
                columns={columns}
                data={filteredLogs}
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
      </main>

      {/* View Log Details Modal */}
      {isViewModalOpen && selectedLog && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50"
          onClick={closeViewModal}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <FaHistory size={20} className="text-gray-700" />
                <h2 className="text-xl font-semibold text-gray-800">
                  Log Details
                </h2>
              </div>
              <button
                onClick={closeViewModal}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                title="Close"
              >
                <FaTimes className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700">
                    Timestamp
                  </label>
                  <div className="p-4 bg-gray-50 rounded-lg border">
                    <div className="text-sm font-semibold">
                      {formatTimestamp(selectedLog.timestamp).relativeTime}
                    </div>
                    <div className="text-xs text-gray-600 mt-1">
                      {formatTimestamp(selectedLog.timestamp).fullDate}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700 mb-1">
                    User
                  </label>
                  <div className="p-4 bg-gray-50 rounded-lg border">
                    <div className="text-sm font-semibold">
                      {selectedLog.performedBy || "Unknown User"}
                    </div>
                    <div className="text-xs text-gray-600 mt-1">
                      {selectedLog.role || "Unknown Role"}
                    </div>
                  </div>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-semibold text-gray-700">
                    Activity
                  </label>
                  <div className="p-4 bg-gray-50 rounded-lg border min-h-[100px]">
                    <span className="text-sm whitespace-pre-wrap">
                      {selectedLog.activity || "No activity description"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end p-6 border-t border-gray-200">
              <button
                onClick={closeViewModal}
                className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}