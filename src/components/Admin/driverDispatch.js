import { useEffect, useMemo, useState, useCallback } from "react";
import DataTable from "react-data-table-component";
import { db } from "../../firebase";
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  getDoc,
  query,
  where,
  getDocs,
  orderBy,
} from "firebase/firestore";
import {
  getAuth,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from "firebase/auth";
import { exportToCSV, exportToPDF } from "../functions/exportFunctions";

export default function DriverDispatch() {
  // ----- STATE -----
  const [drivers, setDrivers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [unitData, setUnitData] = useState([]);
  const [driverLogs, setDriverLogs] = useState([]);
  const [driverSelections, setDriverSelections] = useState({});
  const [loading, setLoading] = useState(true);
  const [err] = useState(null);
  const [userRole, setUserRole] = useState("User");

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");

  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [showErrorToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  // Password confirmation modal state
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [password, setPassword] = useState("");
  const [pendingUndispatch, setPendingUndispatch] = useState(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // Export modal state
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportStartDate, setExportStartDate] = useState("");
  const [exportEndDate, setExportEndDate] = useState("");
  const [isExportingCSV, setIsExportingCSV] = useState(false);
  const [isExportingPDF, setIsExportingPDF] = useState(false);

  const primaryColor = "#364C6E";

  // Get current user info for logging
  const auth = getAuth();
  const currentUser = auth.currentUser;
  const userName =
    currentUser?.displayName || currentUser?.email || "Unknown User";

  // Role mapping for system logging
  const ROLE_MAPPING = {
    Admin: "System Admin",
  };

  // Helper function to get today's date in YYYY-MM-DD format
  const getTodayDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // Function to map user roles to display roles for logging
  const mapRoleForLogging = (role) => {
    return ROLE_MAPPING[role] || null;
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
        setUserRole(userData.role || "User");
      } else {
        setUserRole("User");
      }
    } catch (error) {
      console.error("Error fetching user role:", error);
      setUserRole("User");
    }
  }, [currentUser?.uid]);

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

  // Fetch user role on component mount
  useEffect(() => {
    fetchUserRole();
  }, [fetchUserRole]);

  // ----- FIRESTORE SUBSCRIPTIONS -----
  useEffect(() => {
    const unsubLogs = onSnapshot(collection(db, "driverLogs"), (snap) => {
      const temp = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setDriverLogs(temp);
    });
    return () => unsubLogs();
  }, []);

  useEffect(() => {
    const unsubDrivers = onSnapshot(collection(db, "users"), (snap) => {
      const temp = [];
      snap.forEach((d) => {
        const data = d.data();
        if (
          data &&
          (data.role === "Driver" || data.role === "Reliever") &&
          data.status !== "Inactive"
        ) {
          temp.push({
            id: d.id,
            firstName: data.firstName || "",
            middleName: data.middleName || "",
            lastName: data.lastName || "",
            role: data.role || "",
            status: data.status || "Active",
            fullName:
              `${data.firstName || ""} ${data.middleName || ""} ${data.lastName || ""}`.trim(),
            email: data.email || "",
            personnelID: d.id,
            vehicleID: data.vehicleID || null,
          });
        }
      });
      setDrivers(temp);
      setLoading(false);
    });

    const unsubVehicles = onSnapshot(collection(db, "vehicle"), (snap) => {
      const temp = snap.docs.map((d) => ({
        id: d.id,
        vehicleID: d.data()?.vehicleID || "",
        fuel: d.data()?.fuel || "",
        routeId: d.data()?.routeId || "",
        status: d.data()?.status || "Active",
      }));
      setVehicles(temp);
    });

    const unsubRoutes = onSnapshot(collection(db, "routes"), (snap) => {
      const temp = snap.docs.map((d) => ({
        id: d.id,
        route: d.data()?.Route || "",
        particular: d.data()?.Particular || "",
      }));
      setRoutes(temp);
    });

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

    return () => {
      unsubDrivers();
      unsubVehicles();
      unsubRoutes();
      unsubUnitData();
    };
  }, []);

  // ----- FILTERING -----
  const filteredDrivers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return drivers.filter((driver) => {
      const searchText =
        `${driver.firstName} ${driver.middleName} ${driver.lastName} ${driver.role}`.toLowerCase();
      const matchesSearch = !q || searchText.includes(q);
      const matchesRole = !roleFilter || driver.role === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [drivers, search, roleFilter]);

  // ----- DATA TABLE ROWS -----
  const filteredWithRowNumber = useMemo(() => {
    return filteredDrivers.map((driver, i) => {
      const selections = driverSelections[driver.id] || {};
      let vehicleID = "";
      let unit = "Not yet selected";
      let serialNo = "Not yet selected";
      let routeName = "Not yet selected";
      let routeId = "";
      let particular = "Not yet selected";
      let status = "No vehicles selected";
      let isDispatched = false;

      const latestLog = driverLogs
        .filter((log) => log.personnelID === driver.id)
        .sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp))[0];

      particular = latestLog?.Particular || "Not yet selected";

      const dispatchedUnit = unitData.find(
        (u) => u.unitHolder === driver.id && u.status === "Dispatched"
      );

      if (dispatchedUnit) {
        isDispatched = true;
        status = "Dispatched";
        unit = dispatchedUnit.id;
        serialNo = dispatchedUnit.serialNo || "N/A";

        const dispatchedVehicle = vehicles.find(
          (v) => v.vehicleID === dispatchedUnit.vehicleID
        );
        if (dispatchedVehicle) {
          vehicleID = dispatchedVehicle.vehicleID;
          routeId = dispatchedVehicle.routeId;
          const dispatchedRoute = routes.find((r) => r.id === routeId);
          if (dispatchedRoute) routeName = dispatchedRoute.route;
        }
      } else if (selections.vehicleID) {
        const selectedVehicle = vehicles.find(
          (v) => v.vehicleID === selections.vehicleID
        );
        if (selectedVehicle) {
          vehicleID = selectedVehicle.vehicleID;
          routeId = selectedVehicle.routeId;

          const availableUnit = unitData.find(
            (u) =>
              u.vehicleID === selectedVehicle.vehicleID &&
              u.status === "Available"
          );

          if (availableUnit) {
            unit = availableUnit.id;
            serialNo = availableUnit.serialNo || "N/A";
          }

          const selectedRoute = routes.find((r) => r.id === routeId);
          if (selectedRoute) routeName = selectedRoute.route;
          status = "Available";
          particular = selections.particular || particular;
        }
      }

      return {
        _row: i + 1,
        id: driver.id,
        driverName: driver.fullName,
        driverId: driver.id,
        role: driver.role,
        vehicleID,
        unit,
        serialNo,
        routeName,
        routeId,
        particular,
        status,
        isDispatched,
      };
    });
  }, [
    filteredDrivers,
    driverSelections,
    vehicles,
    routes,
    unitData,
    driverLogs,
  ]);

  // ----- HELPER FUNCTIONS -----
  const StatusBadge = ({ value }) => {
    const isDispatched = value === "Dispatched";
    const isNoVehicleSelected = value === "No vehicles selected";
    return (
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
          isDispatched
            ? "bg-red-100 text-red-700 border border-red-200"
            : isNoVehicleSelected
              ? "bg-gray-100 text-gray-700 border border-gray-200"
              : "bg-green-100 text-green-700 border border-green-200"
        }`}
      >
        <span
          className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${
            isDispatched
              ? "bg-red-500"
              : isNoVehicleSelected
                ? "bg-gray-500"
                : "bg-green-500"
          }`}
        />
        {value || "Available"}
      </span>
    );
  };

  const getAllParticularsForRoute = (routeName) => {
    if (!routeName || routeName === "Not yet selected") return [];
    const matchingRoutes = routes.filter((route) => route.route === routeName);
    const allParticulars = [];
    matchingRoutes.forEach((route) => {
      if (route.particular) {
        const particulars = route.particular
          .split(/[,;|\n]/)
          .map((p) => p.trim())
          .filter((p) => p.length);
        allParticulars.push(...particulars);
      }
    });
    return [...new Set(allParticulars)];
  };

  const isParticularDispatchedForVehicle = (vehicleID, particular) => {
    return unitData.some(
      (unit) =>
        unit.vehicleID === vehicleID &&
        unit.particular === particular &&
        unit.status === "Dispatched"
    );
  };

  const handleDropdownChange = (e, row, column) => {
    const value = e.target.value;

    if (column === "vehicleID") {
      if (!value) {
        setDriverSelections((prev) => {
          const newSel = { ...prev };
          delete newSel[row.driverId];
          return newSel;
        });
        return;
      }

      const selectedVehicle = vehicles.find((v) => v.vehicleID === value);
      if (!selectedVehicle) return;

      const availableUnit = unitData.find(
        (u) =>
          u.vehicleID === selectedVehicle.vehicleID && u.status === "Available"
      );

      setDriverSelections((prev) => ({
        ...prev,
        [row.driverId]: {
          vehicleID: value,
          unitId: availableUnit?.id || null,
          serialNo: availableUnit?.serialNo || "N/A",
          particular: row.particular,
        },
      }));
    }

    if (column === "particular") {
      setDriverSelections((prev) => ({
        ...prev,
        [row.driverId]: {
          ...prev[row.driverId],
          particular: value,
        },
      }));
    }
  };

  const handleDispatch = async (row) => {
    try {
      const selections = driverSelections[row.driverId] || {
        vehicleID: row.vehicleID,
        particular:
          row.particular !== "Not yet selected" ? row.particular : null,
      };
      if (!selections.vehicleID || !selections.particular)
        return alert("Please select a vehicle and particular.");

      const selectedVehicle = vehicles.find(
        (v) => v.vehicleID === selections.vehicleID
      );
      if (!selectedVehicle) return alert("Selected vehicle not found.");

      const availableUnit = unitData.find(
        (u) =>
          u.vehicleID === selectedVehicle.vehicleID && u.status === "Available"
      );
      if (!availableUnit)
        return alert("No available unit found for this vehicle.");

      // Update the unit to be dispatched
      const unitRef = doc(db, "unit", availableUnit.id);
      await updateDoc(unitRef, {
        unitHolder: row.driverId,
        status: "Dispatched",
      });

      // Add entry to unitLogs collection
      await addDoc(collection(db, "unitLogs"), {
        unitHolder: row.driverId,
        driverName: row.driverName,
        unit: availableUnit.id,
        assignedAt: serverTimestamp(),
      });

      // Update local state
      setUnitData((prev) =>
        prev.map((u) =>
          u.id === availableUnit.id
            ? { ...u, unitHolder: row.driverId, status: "Dispatched" }
            : u
        )
      );

      // Add driver log
      await addDoc(collection(db, "driverLogs"), {
        Particular: selections.particular,
        Route:
          routes.find((r) => r.id === selectedVehicle.routeId)?.route || "N/A",
        Timestamp: new Date(),
        driverName: row.driverName,
        personnelID: row.driverId,
        email: drivers.find((d) => d.id === row.driverId)?.email,
      });

      // Log system activity for driver dispatch
      await logSystemActivity(`Dispatched ${row.driverName}`, userName);

      // Clear driver selections
      setDriverSelections((prev) => {
        const newSel = { ...prev };
        delete newSel[row.driverId];
        return newSel;
      });

      setToastMessage("Driver dispatched successfully!");
      setShowSuccessToast(true);
      setTimeout(() => setShowSuccessToast(false), 3000);
    } catch (error) {
      console.error("Error dispatching:", error);
      alert("Error dispatching: " + error.message);
    }
  };

  const handleUndispatchClick = (row) => {
    setPendingUndispatch(row);
    setShowPasswordModal(true);
  };

  const closePasswordModal = () => {
    setShowPasswordModal(false);
    setPassword("");
    setPendingUndispatch(null);
    setIsAuthenticating(false);
  };

  const handlePasswordSubmit = async () => {
    if (!password.trim()) return;
    if (!pendingUndispatch) return;

    setIsAuthenticating(true);
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) {
        alert("No user is logged in.");
        return;
      }

      await reauthenticateWithCredential(
        user,
        EmailAuthProvider.credential(user.email, password)
      );

      const unitDoc = unitData.find(
        (u) =>
          u.unitHolder === pendingUndispatch.driverId &&
          u.status === "Dispatched"
      );
      if (!unitDoc) {
        alert("No dispatched unit found for this driver.");
        return;
      }

      const unitRef = doc(db, "unit", unitDoc.id);
      await updateDoc(unitRef, { unitHolder: "", status: "Available" });

      setUnitData((prev) =>
        prev.map((u) =>
          u.id === unitDoc.id
            ? { ...u, unitHolder: "", status: "Available" }
            : u
        )
      );

      // Log system activity for driver undispatch
      await logSystemActivity(
        `Undispatched ${pendingUndispatch.driverName}`,
        userName
      );

      setDriverSelections((prev) => {
        const newSelections = { ...prev };
        delete newSelections[pendingUndispatch.driverId];
        return newSelections;
      });

      setToastMessage("Driver undispatched successfully!");
      setShowSuccessToast(true);
      setTimeout(() => setShowSuccessToast(false), 3000);

      closePasswordModal();
    } catch (error) {
      console.error("Error undispatching:", error);
      if (error.code === "auth/wrong-password") {
        alert("Incorrect password. Please try again.");
      } else {
        alert("Error undispatching: " + error.message);
      }
    } finally {
      setIsAuthenticating(false);
    }
  };

  // Export functions
  const openExportModal = () => {
    setExportStartDate(getTodayDate());
    setExportEndDate("");
    setShowExportModal(true);
  };

  const closeExportModal = () => {
    setShowExportModal(false);
    setExportStartDate("");
    setExportEndDate("");
  };

  const fetchUnitLogsForExport = async () => {
    try {
      let q;

      if (exportStartDate && exportEndDate) {
        // Date range: start date to end date
        const startDate = new Date(exportStartDate);
        startDate.setHours(0, 0, 0, 0);

        const endDate = new Date(exportEndDate);
        endDate.setHours(23, 59, 59, 999);

        q = query(
          collection(db, "unitLogs"),
          where("assignedAt", ">=", startDate),
          where("assignedAt", "<=", endDate),
          orderBy("assignedAt", "desc")
        );
      } else if (exportStartDate && !exportEndDate) {
        // Single day: only the start date
        const startDate = new Date(exportStartDate);
        startDate.setHours(0, 0, 0, 0);

        const endDate = new Date(exportStartDate);
        endDate.setHours(23, 59, 59, 999);

        q = query(
          collection(db, "unitLogs"),
          where("assignedAt", ">=", startDate),
          where("assignedAt", "<=", endDate),
          orderBy("assignedAt", "desc")
        );
      } else {
        // No dates selected: all logs
        q = query(collection(db, "unitLogs"), orderBy("assignedAt", "desc"));
      }

      const snapshot = await getDocs(q);
      const logs = [];

      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();

        // Fetch full driver name if not already in the log
        let driverFullName = data.driverName || "N/A";
        if (data.unitHolder && !data.driverName) {
          try {
            const userDoc = await getDoc(doc(db, "users", data.unitHolder));
            if (userDoc.exists()) {
              const userData = userDoc.data();
              driverFullName =
                `${userData.firstName || ""} ${userData.middleName || ""} ${userData.lastName || ""}`.trim();
            }
          } catch (err) {
            console.error("Error fetching driver name:", err);
          }
        }

        logs.push({
          driverName: driverFullName,
          unit: data.unit || "N/A",
          assignedAt: data.assignedAt?.toDate
            ? data.assignedAt.toDate()
            : new Date(),
        });
      }

      return logs;
    } catch (error) {
      console.error("Error fetching unit logs:", error);
      return [];
    }
  };

  const handleExportCSV = async () => {
    setIsExportingCSV(true);
    try {
      const logs = await fetchUnitLogsForExport();

      const headers = ["Driver Name", "Unit", "Date"];
      const rows = logs.map((log) => [
        log.driverName,
        log.unit,
        new Date(log.assignedAt).toLocaleString(),
      ]);

      exportToCSV(
        headers,
        rows,
        "Unit-History-Report.csv",
        userName,
        "Unit-History-Report"
      );

      await logSystemActivity("Exported Unit History Report to CSV", userName);

      setToastMessage("Unit history exported to CSV successfully!");
      setShowSuccessToast(true);
      setTimeout(() => setShowSuccessToast(false), 3000);

      closeExportModal();
    } catch (error) {
      console.error("Error exporting to CSV:", error);
      alert("Error exporting to CSV: " + error.message);
    } finally {
      setIsExportingCSV(false);
    }
  };

  const handleExportPDF = async () => {
    setIsExportingPDF(true);
    try {
      const logs = await fetchUnitLogsForExport();

      const headers = ["Driver Name", "Unit", "Date"];
      const rows = logs.map((log) => [
        log.driverName,
        log.unit,
        new Date(log.assignedAt).toLocaleString(),
      ]);

      exportToPDF(
        headers,
        rows,
        "Unit-History-Report",
        "Unit-History-Report.pdf",
        userName
      );

      await logSystemActivity("Exported Unit History Report to PDF", userName);

      setToastMessage("Unit history exported to PDF successfully!");
      setShowSuccessToast(true);
      setTimeout(() => setShowSuccessToast(false), 3000);

      closeExportModal();
    } catch (error) {
      console.error("Error exporting to PDF:", error);
      alert("Error exporting to PDF: " + error.message);
    } finally {
      setIsExportingPDF(false);
    }
  };

  // Helper function to get dynamic export description
  const getExportDescription = () => {
    if (exportStartDate && exportEndDate) {
      return `The report will include all unit assignments from ${new Date(exportStartDate).toLocaleDateString()} to ${new Date(exportEndDate).toLocaleDateString()}.`;
    } else if (exportStartDate && !exportEndDate) {
      return `The report will include all unit assignments for ${new Date(exportStartDate).toLocaleDateString()} only.`;
    } else {
      return "The report will include all unit assignments from all dates.";
    }
  };

  // ----- DATA TABLE COLUMNS -----
  const columns = [
    {
      name: "Driver Name",
      selector: (r) => r.driverName,
      sortable: true,
      grow: 0.5,
      cell: (r) => (
        <div className="font-medium text-gray-900">{r.driverName}</div>
      ),
    },
    {
      name: "Vehicle",
      selector: (r) => r.vehicleID,
      sortable: true,
      grow: 0.5,
      cell: (r) => {
        if (r.isDispatched)
          return (
            <div className="px-2 py-1 text-sm font-medium text-gray-700 bg-gray-100 rounded-md border">
              {r.vehicleID || "N/A"}
            </div>
          );

        const availableVehicles = vehicles.filter((vehicle) => {
          if (vehicle.status === "Inactive") {
            return false;
          }

          return unitData.some(
            (unit) =>
              unit.vehicleID === vehicle.vehicleID &&
              unit.status === "Available" &&
              unit.unitHolder !== r.driverId
          );
        });

        return (
          <select
            value={r.vehicleID || ""}
            onChange={(e) => handleDropdownChange(e, r, "vehicleID")}
            className="bg-white border border-gray-300 rounded-md px-2 py-1 text-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">Select Vehicle</option>
            {availableVehicles.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.vehicleID}>
                {vehicle.vehicleID}
              </option>
            ))}
          </select>
        );
      },
    },
    {
      name: "Starting Point",
      selector: (r) => r.particular,
      sortable: true,
      grow: 0.5,
      cell: (r) => {
        if (r.isDispatched)
          return (
            <div className="px-2 py-1 text-sm font-medium text-gray-700 bg-gray-100 rounded-md border">
              {r.particular || "N/A"}
            </div>
          );
        const particulars = getAllParticularsForRoute(r.routeName);
        return (
          <select
            value={r.particular === "Not yet selected" ? "" : r.particular}
            onChange={(e) => handleDropdownChange(e, r, "particular")}
            disabled={!r.routeId}
            className="bg-transparent border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">Select Particular</option>
            {particulars.map((particular, idx) => (
              <option
                key={idx}
                value={particular}
                disabled={isParticularDispatchedForVehicle(
                  r.vehicleID,
                  particular
                )}
              >
                {particular}{" "}
                {isParticularDispatchedForVehicle(r.vehicleID, particular)
                  ? "(Dispatched)"
                  : ""}
              </option>
            ))}
          </select>
        );
      },
    },
    {
      name: "Unit",
      selector: (r) => r.unit,
      sortable: true,
      grow: 0.5,
      cell: (r) => (
        <div className="px-2 py-1 text-sm">
          {r.unit === "Not yet selected" ? (
            <span className="text-gray-400 italic">{r.unit}</span>
          ) : (
            r.unit
          )}
        </div>
      ),
    },
    {
      name: "Serial No",
      selector: (r) => r.serialNo,
      sortable: true,
      grow: 0.5,
      cell: (r) => (
        <div className="px-2 py-1 text-sm">
          {r.serialNo === "Not yet selected" ? (
            <span className="text-gray-400 italic">{r.serialNo}</span>
          ) : (
            r.serialNo
          )}
        </div>
      ),
    },
    {
      name: "Route",
      selector: (r) => r.routeName,
      sortable: true,
      grow: 0.5,
      cell: (r) => (
        <div className="px-2 py-1 text-sm">
          {r.routeName === "Not yet selected" ? (
            <span className="text-gray-400 italic">{r.routeName}</span>
          ) : (
            r.routeName
          )}
        </div>
      ),
    },
    {
      name: "Status",
      selector: (r) => r.status,
      sortable: true,
      grow: 0.4,
      cell: (r) => <StatusBadge value={r.status} />,
    },
    {
      name: "Action",
      button: true,
      center: true,
      width: "160px",
      cell: (r) =>
        r.isDispatched ? (
          <button
            onClick={() => handleUndispatchClick(r)}
            className="inline-flex items-center justify-center h-9 px-3 rounded-full border bg-yellow-50 border-yellow-200 text-yellow-700 hover:bg-yellow-100 hover:shadow-md text-sm font-semibold"
          >
            Undispatch
          </button>
        ) : (
          <button
            onClick={() => handleDispatch(r)}
            disabled={
              !r.vehicleID ||
              !r.routeId ||
              !r.particular ||
              r.particular === "Not yet selected"
            }
            className={`inline-flex items-center justify-center h-9 px-3 rounded-full border text-sm font-semibold transition ${!r.vehicleID || !r.routeId || !r.particular || r.particular === "Not yet selected" ? "border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed" : "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:shadow-md"}`}
          >
            Dispatch
          </button>
        ),
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
        padding: "12px 12px",
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
      <main className="flex-1 p-8 mx-auto">
        <div className="mx-auto w-full max-w-[1900px]">
          <div
            className="bg-white border rounded-xl shadow-sm flex flex-col"
            style={{ minHeight: "calc(100vh - 112px)" }}
          >
            <div className="px-6 pt-6 pb-4 border-b flex items-center justify-between">
              <h1 className="text-2xl font-semibold text-gray-800">
                Driver Dispatch
              </h1>
              <div className="flex gap-4">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search drivers name"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="border border-gray-300 rounded-full pl-10 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">All Roles</option>
                  <option value="Driver">Driver</option>
                  <option value="Reliever">Reliever</option>
                </select>

                {/* Export Button */}
                <button
                  onClick={openExportModal}
                  className="flex items-center gap-2 px-6 py-2 rounded-lg text-white shadow-md hover:shadow-lg transition"
                  style={{ backgroundColor: primaryColor }}
                >
                  <span className="font-semibold">Export</span>
                </button>
              </div>
            </div>
            <div className="px-6 py-4 flex-1">
              {err && (
                <div className="mb-3 text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded">
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
        </div>
      </main>

      {/* Export Modal */}
      {showExportModal && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm p-4"
          onClick={closeExportModal}
        >
          <div
            className="relative bg-white rounded-2xl shadow-2xl w-[520px] max-w-[90%] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative flex items-center justify-between px-6 py-4 border-b bg-white/70 backdrop-blur">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full grid place-items-center text-blue-600 shadow-sm bg-blue-50 border border-blue-200">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-800">
                    Unit History | Export
                  </h3>
                  <p className="text-sm text-gray-500">
                    Select date range and export format
                  </p>
                </div>
              </div>
              <button
                onClick={closeExportModal}
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

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={exportStartDate}
                    onChange={(e) => setExportStartDate(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    End Date{" "}
                    <span className="text-gray-400 font-normal">
                      (Optional)
                    </span>
                  </label>
                  <input
                    type="date"
                    value={exportEndDate}
                    onChange={(e) => setExportEndDate(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-800">
                  <span className="font-semibold">Note:</span>{" "}
                  {getExportDescription()}
                </p>
              </div>
            </div>

            <div className="px-6 py-4 border-t bg-white/70 backdrop-blur flex justify-end gap-3">
              <button
                onClick={closeExportModal}
                className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700"
                disabled={isExportingCSV || isExportingPDF}
              >
                Cancel
              </button>
              <button
                onClick={handleExportCSV}
                className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white disabled:opacity-60 inline-flex items-center gap-2"
                disabled={isExportingCSV || isExportingPDF || !exportStartDate}
              >
                {isExportingCSV && (
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
                {isExportingCSV ? "Exporting..." : "Export to Excel"}
              </button>
              <button
                onClick={handleExportPDF}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white disabled:opacity-60 inline-flex items-center gap-2"
                disabled={isExportingCSV || isExportingPDF || !exportStartDate}
              >
                {isExportingPDF && (
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
                {isExportingPDF ? "Exporting..." : "Export to PDF"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Password Confirmation Modal */}
      {showPasswordModal && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm p-4"
          onClick={closePasswordModal}
        >
          <div
            className="relative bg-white rounded-2xl shadow-2xl w-[480px] max-w-[90%] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative flex items-center justify-between px-6 py-4 border-b bg-white/70 backdrop-blur">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full grid place-items-center text-yellow-600 shadow-sm bg-yellow-50 border border-yellow-200">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <circle cx="12" cy="16" r="1" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-800">
                    Confirm Undispatch
                  </h3>
                  <p className="text-sm text-gray-500">
                    Enter your password to undispatch{" "}
                    {pendingUndispatch?.driverName}
                  </p>
                </div>
              </div>
              <button
                onClick={closePasswordModal}
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

            <div className="p-6">
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyPress={(e) =>
                    e.key === "Enter" && handlePasswordSubmit()
                  }
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter your password"
                  autoFocus
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t bg-white/70 backdrop-blur flex justify-end gap-3">
              <button
                onClick={closePasswordModal}
                className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700"
                disabled={isAuthenticating}
              >
                Cancel
              </button>
              <button
                onClick={handlePasswordSubmit}
                className="px-4 py-2 rounded-lg bg-yellow-500 hover:bg-yellow-600 text-white disabled:opacity-60 inline-flex items-center gap-2"
                disabled={!password.trim() || isAuthenticating}
              >
                {isAuthenticating && (
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
                {isAuthenticating ? "Confirming..." : "Confirm Undispatch"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Toast */}
      {showSuccessToast && <Toast message={toastMessage} type="success" />}
      {/* Error Toast */}
      {showErrorToast && <Toast message={toastMessage} type="error" />}
    </div>
  );
}

// ----- TOAST COMPONENT -----
const Toast = ({ message, type }) => (
  <div
    className={`fixed top-5 left-1/2 -translate-x-1/2 z-[60] transform transition-all duration-300 opacity-100 translate-y-0`}
  >
    <div
      className={`flex items-start gap-3 rounded-lg border px-5 py-3 shadow-md w-[520px] max-w-[90vw] ${type === "success" ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-800"}`}
    >
      <div className="mt-0.5">
        <svg
          viewBox="0 0 24 24"
          className={`h-5 w-5 ${type === "success" ? "fill-green-500" : "fill-red-500"}`}
        >
          {type === "success" ? (
            <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
          ) : (
            <path d="M19 6L6 19M6 6l13 13" />
          )}
        </svg>
      </div>
      <div className="text-sm">
        <div className="font-semibold">{message}</div>
      </div>
    </div>
  </div>
);
