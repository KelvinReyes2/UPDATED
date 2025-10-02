import { useEffect, useMemo, useState, useCallback } from "react";
import {
  getAuth,
  createUserWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import { Outlet, useLocation } from "react-router-dom";
import DataTable from "react-data-table-component";
import { FaEdit } from "react-icons/fa";
import { query, where, getDocs } from "firebase/firestore";
import "jspdf-autotable";
import { db } from "../../firebase";
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  addDoc,
  serverTimestamp,
  getDoc,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { exportToCSV, exportToPDF } from "../functions/exportFunctions";

const auth = getAuth();

export default function UserManagement() {
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const location = useLocation();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [userRole, setUserRole] = useState("User");
  const [permissions, setPermissions] = useState([]);

  const toggleDropdown = () => {
    setIsDropdownOpen((prev) => !prev);
  };

  const primaryColor = "#364C6E";
  const [currentUserEmail, setCurrentUserEmail] = useState("Unknown");

  // Get current user info for logging
  const currentUser = auth.currentUser;
  const userName =
    currentUser?.displayName || currentUser?.email || "Unknown User";

  // Role mapping for system logging
  const ROLE_MAPPING = {
    Admin: "System Admin",
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
        setUserRole(userData.role || "User"); // Default to "User" if role not found
      } else {
        setUserRole("User"); // Default role if user document doesn't exist
      }
    } catch (error) {
      console.error("Error fetching user role:", error);
      setUserRole("User"); // Fallback to default role
    }
  }, [currentUser?.uid]);

  // Function to log system activities with mapped role
  const logSystemActivity = async (activity, performedBy, role = null) => {
    try {
      // Use provided role or fall back to userRole from state
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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUserEmail(user.email);
        console.log("Logged in as:", user.email);
      } else {
        setCurrentUserEmail("Unknown");
        console.log("No user logged in");
      }
    });

    return () => unsubscribe();
  }, []);

  // Fetch user role on component mount
  useEffect(() => {
    fetchUserRole();
  }, [fetchUserRole]);

  const isUserPage = location.pathname === "/userManagement";

  const [user, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const [search, setSearch] = useState("");
  const [filterBy, setFilterBy] = useState("");
  const [filterRole, setFilterRole] = useState(""); // Added filter by role

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [edit, setEdit] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const [form, setForm] = useState({
    firstName: "",
    middleName: "",
    lastName: "",
    email: "",
    password: "",
    role: "Driver",
    status: "Active",
    address: "",
    telNo: "",
  });
  const [errors, setErrors] = useState({});

  const toMillis = (v) => {
    if (!v) return 0;
    if (typeof v === "string") {
      const t = Date.parse(v);
      return Number.isNaN(t) ? 0 : t;
    }
    if (v?.seconds)
      return v.seconds * 1000 + Math.floor((v.nanoseconds || 0) / 1e6);
    return 0;
  };

  useEffect(() => {
    if (!isUserPage) return;
    const unsub = onSnapshot(
      collection(db, "users"),
      (snap) => {
        const temp = [];
        snap.forEach((d) => {
          const x = d.data() || {};
          const role = String(x.role || "").trim();

          if (["Driver", "Cashier", "Reliever", "Inspector"].includes(role)) {
            temp.push({
              id: d.id,
              displayName:
                `${x.firstName || ""} ${x.middleName || ""} ${x.lastName || ""}`.trim(),
              email: x.email ?? "",
              role: x.role ?? "Driver",
              status: x.status ?? "Active",
              telNo: x.telNo ?? "",
              createdAt: toMillis(x.createdAt),
              firstName: x.firstName,
              middleName: x.middleName,
              lastName: x.lastName,
              address: x.address,
            });
          }
        });

        temp.sort((a, b) => {
          if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
          return (a.displayName || "").localeCompare(b.displayName || "");
        });

        setUsers(temp);
        setLoading(false);
      },
      (e) => {
        setErr(e.message || "Failed to load users");
        setLoading(false);
      }
    );
    return () => unsub();
  }, [isUserPage]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return user.filter((r) => {
      const text =
        `${r.displayName} ${r.email} ${r.role} ${r.status} ${r.telNo}`.toLowerCase();
      const okSearch = !q || text.includes(q);
      const okFilter = !filterBy || r.status === filterBy;
      const okRoleFilter = !filterRole || r.role === filterRole; // Filter by role
      return okSearch && okFilter && okRoleFilter;
    });
  }, [user, search, filterBy, filterRole]);

  // Add a computed row number for display
  const filteredWithRowNumber = useMemo(
    () => filtered.map((r, i) => ({ ...r, _row: i + 1 })), // Row number starts from 1
    [filtered]
  );

  //Roles and Permissions mapping
  const rolePermissionsMap = {
    Driver: ["Ticket System"],
    Reliever: ["Ticket System"],
    Inspector: ["View/Print Trip Reports"],
    Cashier: ["View Dashboard", "Fuel Logs"],
  };

  const headers = [
    "ID",
    "Username",
    "Email",
    "Role",
    "Status",
    "Tel No",
    "Address",
    "Created At",
  ];
  const rows = user.map((user, index) => [
    index + 1,
    user.displayName,
    user.email,
    user.role,
    user.status,
    user.telNo,
    user.address,
    new Date(user.createdAt).toLocaleString(),
  ]);

  // Enhanced export functions with role mapping and system logging
  const handleExportToCSV = async () => {
    try {
      await exportToCSV(
        headers,
        rows,
        "User-Management-Report.csv",
        currentUserEmail,
        "User Management Report"
      );

      // Log the export activity
      await logSystemActivity("Exported User Report to CSV", userName);

      setIsDropdownOpen(false);
    } catch (error) {
      console.error("Error exporting to CSV:", error);
    }
  };

  const handleExportToPDF = async () => {
    try {
      await exportToPDF(
        headers,
        rows,
        "User-Management-Report",
        "User-Management-Report.pdf",
        currentUserEmail
      );

      // Log the export activity
      await logSystemActivity("Exported User Report to PDF", userName);

      setIsDropdownOpen(false);
    } catch (error) {
      console.error("Error exporting to PDF:", error);
    }
  };

  const StatusBadge = ({ value }) => {
    const on = (value || "").toLowerCase() === "active";
    return (
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
          on
            ? "bg-green-100 text-green-700 border border-green-200"
            : "bg-gray-100 text-gray-700 border border-gray-200"
        }`}
      >
        <span
          className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${
            on ? "bg-green-500" : "bg-gray-400"
          }`}
        />
        {on ? "Active" : value || "Inactive"}
      </span>
    );
  };

  const RoleBadge = ({ role }) => (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700 border border-indigo-200">
      {role}
    </span>
  );

  const columns = [
    {
      name: "ID",
      selector: (r) => r._row,
      sortable: false,
      width: "88px",
      right: true,
    },
    {
      name: "Username",
      selector: (r) => r.displayName,
      sortable: true,
      grow: 1,
      cell: (r) => (
        <div className="truncate" title={r.displayName}>
          {r.displayName}
        </div>
      ),
    },
    {
      name: "Email",
      selector: (r) => r.email,
      sortable: true,
      grow: 1,
      cell: (r) => (
        <div className="truncate" title={r.email}>
          {r.email}
        </div>
      ),
    },
    {
      name: "Role",
      selector: (r) => r.role,
      sortable: true,
      center: true,
      grow: 1,
      cell: (r) => <RoleBadge role={r.role} />,
    },
    {
      name: "Status",
      selector: (r) => r.status,
      sortable: true,
      center: true,
      grow: 1,
      cell: (r) => <StatusBadge value={r.status} />,
    },
    {
      name: "Action",
      button: true,
      center: true,
      width: "120px",
      cell: (row) => (
        <button
          onClick={() => {
            setViewing(row);
            setEdit({
              firstName: row.firstName,
              middleName: row.middleName,
              lastName: row.lastName,
              email: row.email,
              role: row.role,
              status: row.status,
              telNo: row.telNo,
              address: row.address,
              password: "",
            });
          }}
          title="Edit"
          className="inline-flex items-center justify-center h-9 px-3 rounded-full border border-gray-200 bg-white text-gray-700 hover:shadow-md transition text-sm font-semibold"
        >
          <FaEdit size={14} />
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
        padding: "14px 12px",
        fontSize: "14px",
        color: "#0f172a",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      },
    },
  };

  const openAdd = () => {
    setIsAddOpen(true);
    setForm({
      firstName: "",
      middleName: "",
      lastName: "",
      email: "",
      password: "",
      role: "Driver",
      status: "Active",
      address: "",
      telNo: "",
      permissions: rolePermissionsMap["Driver"],
    });
    setErrors({});
  };

  const closeAdd = () => {
    setIsAddOpen(false);
    setErrors({});
  };

  const onForm = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));

    if (name === "role") {
      // Update permissions based on role
      setPermissions(rolePermissionsMap[value] || []);
    }

    if (errors[name]) {
      const n = { ...errors };
      delete n[name];
      setErrors(n);
    }
  };

  const saveUser = async () => {
    const e = {};
    if (!form.firstName.trim()) e.firstName = "Required";
    if (!form.lastName.trim()) e.lastName = "Required";
    if (!form.email.trim()) e.email = "Required";
    if (!form.password.trim()) e.password = "Required";
    if (form.password && form.password.length < 6)
      e.password = "Min 6 characters";
    if (!form.telNo.trim()) e.telNo = "Required"; // ensure phone is not empty

    setErrors(e);
    if (Object.keys(e).length) return;

    setSaving(true);
    try {
      // 🔍 Check if phone number already exists in Firestore
      const usersRef = collection(db, "users");
      const phoneQuery = query(
        usersRef,
        where("telNo", "==", form.telNo.trim())
      );
      const phoneSnapshot = await getDocs(phoneQuery);

      if (!phoneSnapshot.empty) {
        alert("Phone number is already in use.");
        setSaving(false);
        return;
      }

      // ✅ Create Firebase Auth user (will fail if email is duplicate)
      const cred = await createUserWithEmailAndPassword(
        auth,
        form.email.trim(),
        form.password
      );
      const { user } = cred;

      // Update display name
      await updateProfile(user, {
        displayName: `${form.firstName.trim()} ${form.lastName.trim()}`,
      });

      // Save Firestore user profile
      await setDoc(doc(db, "users", user.uid), {
        firstName: form.firstName.trim(),
        middleName: form.middleName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        role: form.role,
        status: form.status,
        telNo: form.telNo.trim(),
        address: form.address.trim(),
        createdAt: new Date().toISOString(),
        permissions: rolePermissionsMap[form.role] || [],
      });

      // Log activity
      const fullName = `${form.firstName.trim()} ${form.lastName.trim()}`;
      await logSystemActivity(`Added new user: ${fullName}`, userName);

      setToastMessage("New user added successfully!");
      setShowSuccessToast(true);
      setTimeout(() => setShowSuccessToast(false), 3000);
      closeAdd();
    } catch (err) {
      console.error("Error saving user:", err);
      if (err.code === "auth/email-already-in-use") {
        alert("Email is already in use.");
      } else {
        alert(err.message || "Failed to save user.");
      }
    } finally {
      setSaving(false);
    }
  };

  // Save edits + DIRECT password update behavior
  const saveEdits = async () => {
    if (!viewing || !edit) return;
    if (!edit.firstName || !edit.lastName || !edit.email) {
      alert("First name, last name, and email are required.");
      return;
    }

    setSavingEdit(true);
    try {
      if (edit.telNo) {
        const usersRef = collection(db, "users");
        const phoneQuery = query(usersRef, where("telNo", "==", edit.telNo));
        const phoneSnapshot = await getDocs(phoneQuery);

        if (
          !phoneSnapshot.empty &&
          phoneSnapshot.docs[0].id !== String(viewing.id)
        ) {
          alert("This phone number is already in use by another user.");
          setSavingEdit(false);
          return;
        }
      }

      // Update Firestore user
      await setDoc(
        doc(db, "users", String(viewing.id)),
        {
          firstName: edit.firstName,
          middleName: edit.middleName,
          lastName: edit.lastName,
          email: edit.email,
          role: edit.role,
          status: edit.status,
          telNo: edit.telNo,
          address: edit.address,
          permissions: rolePermissionsMap[edit.role] || [],
        },
        { merge: true }
      );

      // Update Firebase Auth email if changed
      if (currentUserEmail === viewing.email && edit.email !== viewing.email) {
        try {
          await auth.currentUser.updateEmail(edit.email);
        } catch (e) {
          console.warn("Failed to update Auth email:", e);
        }
      }

      // Track changes for logging
      const changes = [];
      if (
        viewing.firstName !== edit.firstName ||
        viewing.lastName !== edit.lastName
      ) {
        changes.push(
          `Name: ${viewing.firstName} ${viewing.lastName} → ${edit.firstName} ${edit.lastName}`
        );
      }
      if (viewing.role !== edit.role)
        changes.push(`Role: ${viewing.role} → ${edit.role}`);
      if (viewing.status !== edit.status)
        changes.push(`Status: ${viewing.status} → ${edit.status}`);
      if (viewing.telNo !== edit.telNo)
        changes.push(`Tel: ${viewing.telNo} → ${edit.telNo}`);
      if (viewing.address !== edit.address)
        changes.push(`Address: ${viewing.address} → ${edit.address}`);
      const changesText = changes.length > 0 ? ` (${changes.join(", ")})` : "";

      // Log activity
      await logSystemActivity(
        `Updated user: ${viewing.displayName}${changesText}`,
        userName
      );

      setViewing(null);
      setEdit(null);
      setToastMessage("User details updated successfully!");
      setShowSuccessToast(true);
      setTimeout(() => setShowSuccessToast(false), 3000);
    } catch (err) {
      console.error("Error updating user:", err);
      alert(err.message || "Failed to update user.");
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div className="flex bg-gray-100 min-h-screen">
      {/* Sidebar */}

      {/* Main Content */}
      <main className="flex-1 p-8 mx-auto">
        {!isUserPage ? (
          <Outlet />
        ) : (
          <div className="mx-auto w-full max-w-[1900px]">
            <div
              className="bg-white border rounded-xl shadow-sm flex flex-col"
              style={{ minHeight: "calc(100vh - 112px)" }}
            >
              <div className="px-6 pt-6 pb-4 border-b flex items-center justify-between">
                <h1 className="text-2xl font-semibold text-gray-800">
                  User Management
                </h1>
                <div className="flex items-center gap-3">
                  <div className="relative flex items-center gap-2 rounded-lg border border-gray-300 bg-white shadow-lg hover:shadow-xl focus-within:ring-1 focus-within:ring-blue-300 px-3 py-2">
                    <select
                      className="bg-transparent pr-6 text-sm outline-none"
                      value={filterBy}
                      onChange={(e) => setFilterBy(e.target.value)}
                    >
                      <option value="">Filter By</option>
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>

                  {/* Filter by Role */}
                  <div className="relative flex items-center gap-2 rounded-lg border border-gray-300 bg-white shadow-lg hover:shadow-xl focus-within:ring-1 focus-within:ring-blue-300 px-3 py-2">
                    <select
                      className="bg-transparent pr-6 text-sm outline-none"
                      value={filterRole}
                      onChange={(e) => setFilterRole(e.target.value)}
                    >
                      <option value="">Filter by Role</option>
                      <option value="Driver">Driver</option>
                      <option value="Cashier">Cashier</option>
                      <option value="Reliever">Reliever</option>
                      <option value="Inspector">Inspector</option>
                    </select>
                  </div>

                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search driver name"
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
                    {/* Export Button */}
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
                  <button
                    onClick={openAdd}
                    className="flex items-center gap-2 px-9 py-2 rounded-lg text-white shadow-md hover:shadow-lg transition"
                    style={{ backgroundColor: primaryColor }}
                  >
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
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    <span className="font-semibold">Add User</span>
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
        )}
      </main>

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

      {/* Add Admin Modal */}
      {isUserPage && isAddOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm p-4"
          onClick={closeAdd}
        >
          <div
            className="relative bg-white rounded-2xl shadow-2xl w-[720px] max-w-[90%] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative flex items-center justify-between px-6 py-4 border-b bg-white/70 backdrop-blur">
              <div className="flex items-center gap-3">
                <div
                  className="h-9 w-9 rounded-full grid place-items-center text-white shadow"
                  style={{ backgroundColor: primaryColor }}
                >
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
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-800">
                    Add User
                  </h2>
                  <p className="text-xs text-gray-500">
                    Create a new user account.
                  </p>
                </div>
              </div>
              <button
                onClick={closeAdd}
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

            <div className="p-12 grid ml-6 grid-cols-3 gap-x-5 gap-y-4">
              <div className="col-span-4">
                <label className="block text-sm text-gray-600 mb-1">
                  First Name <span className="text-red-500">*</span>
                </label>
                <input
                  name="firstName"
                  className={`w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-300 ${
                    errors.firstName ? "border-red-500" : "border-gray-200"
                  }`}
                  value={form.firstName}
                  onChange={onForm}
                />
                {errors.firstName && (
                  <p className="text-red-500 text-xs mt-1">
                    {errors.firstName}
                  </p>
                )}
              </div>

              <div className="col-span-2">
                <label className="block text-sm text-gray-600 mb-1">
                  Middle Name
                </label>
                <input
                  name="middleName"
                  className={`w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-300 ${
                    errors.middleName ? "border-red-500" : "border-gray-200"
                  }`}
                  value={form.middleName}
                  onChange={onForm}
                />
              </div>

              <div className="col-span-2">
                <label className="block text-sm text-gray-600 mb-1">
                  Last Name <span className="text-red-500">*</span>
                </label>
                <input
                  name="lastName"
                  className={`w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-300 ${
                    errors.lastName ? "border-red-500" : "border-gray-200"
                  }`}
                  value={form.lastName}
                  onChange={onForm}
                />
                {errors.lastName && (
                  <p className="text-red-500 text-xs mt-1">{errors.lastName}</p>
                )}
              </div>

              <div className="col-span-2">
                <label className="block text-sm text-gray-600 mb-1">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  name="email"
                  type="email"
                  className={`w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-300 ${
                    errors.email ? "border-red-500" : "border-gray-200"
                  }`}
                  value={form.email}
                  onChange={onForm}
                />
                {errors.email && (
                  <p className="text-red-500 text-xs mt-1">{errors.email}</p>
                )}
              </div>

              <div className="col-span-2">
                <label className="block text-sm text-gray-600 mb-1">
                  Password <span className="text-red-500">*</span>
                </label>
                <input
                  name="password"
                  type="password"
                  className={`w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-300 ${
                    errors.password ? "border-red-500" : "border-gray-200"
                  }`}
                  value={form.password}
                  onChange={onForm}
                  placeholder="Minimum 6 characters"
                />
                {errors.password && (
                  <p className="text-red-500 text-xs mt-1">{errors.password}</p>
                )}
              </div>

              <div className="col-span-2">
                <label className="block text-sm text-gray-600 mb-1">
                  Address
                </label>
                <input
                  name="address"
                  className={`w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-300 ${
                    errors.address ? "border-red-500" : "border-gray-200"
                  }`}
                  value={form.address}
                  onChange={onForm}
                />
              </div>

              <div className="col-span-2">
                <label className="block text-sm text-gray-600 mb-1">
                  Telephone No. <span className="text-red-500">*</span>
                </label>
                <input
                  name="telNo"
                  className={`w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-300 ${
                    errors.telNo ? "border-red-500" : "border-gray-200"
                  }`}
                  value={form.telNo}
                  onChange={onForm}
                />
                {errors.telNo && (
                  <p className="text-red-500 text-xs mt-1">{errors.telNo}</p>
                )}
              </div>

              <div className="col-span-1">
                <label className="block text-sm text-gray-600 mb-1">
                  Status
                </label>
                <select
                  name="status"
                  value={form.status}
                  onChange={onForm}
                  className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-300"
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>

              <div className="col-span-1">
                <label className="block text-sm text-gray-600 mb-1">Role</label>
                <select
                  className="w-full border rounded-md px-3 py-2 border-gray-200 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-300"
                  value={form.role}
                  onChange={(e) => {
                    const selectedRole = e.target.value;
                    setForm({
                      ...form,
                      role: selectedRole,
                      permissions: rolePermissionsMap[selectedRole] || [],
                    });
                  }}
                >
                  <option value="Driver">Driver</option>
                  <option value="Reliever">Reliever</option>
                  <option value="Inspector">Inspector</option>
                  <option value="Cashier">Cashier</option>
                </select>
              </div>

              <div className="col-span-2">
                <label className="block text-sm text-gray-600 mb-1">
                  Permissions
                </label>
                <select
                  className="w-full border rounded-md px-3 py-2 bg-gray-100 cursor-not-allowed focus:outline-none"
                  value={form.permissions} // 👈 bind to form.permissions
                  disabled
                  multiple
                  style={{
                    height: `${
                      form.permissions.length === 1
                        ? 3 * 14
                        : form.permissions.length * 2.5 * 14
                    }px`,
                  }}
                >
                  {form.permissions.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="px-6 py-4 border-t bg-white/70 backdrop-blur flex justify-end gap-3">
              <button
                className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700"
                onClick={closeAdd}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 rounded-lg text-white hover:opacity-95 disabled:opacity-60 inline-flex items-center gap-2"
                style={{ backgroundColor: primaryColor }}
                onClick={saveUser}
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

      {/* Edit Admin Modal */}
      {isUserPage && viewing && edit && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => {
            setViewing(null);
            setEdit(null);
          }}
        >
          <div
            className="relative bg-white rounded-2xl shadow-2xl w-[720px] max-w-[94%] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative flex items-center justify-between px-6 py-4 border-b bg-white/70 backdrop-blur">
              <div className="flex items-center gap-3">
                <div
                  className="h-9 w-9 rounded-full grid place-items-center text-white shadow"
                  style={{ backgroundColor: primaryColor }}
                >
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
                    <path d="M3 7h18M3 12h18M3 17h18" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-semibold text-gray-800">
                    Edit User
                  </h3>
                  <p className="text-xs text-gray-500">{viewing.email}</p>
                </div>
              </div>
              <StatusBadge value={edit.status} />
            </div>

            <div className="p-10 grid ml-6 grid-cols-3 gap-x-5 gap-y-4">
              <div className="col-span-4">
                <label className="block text-gray-600 mb-1">First Name</label>
                <input
                  className="w-full border rounded-md px-3 py-2 border-gray-200 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-300"
                  value={edit.firstName}
                  onChange={(e) =>
                    setEdit({ ...edit, firstName: e.target.value })
                  }
                />
              </div>
              <div className="col-span-2">
                <label className="block text-gray-600 mb-1">Middle Name</label>
                <input
                  className="w-full border rounded-md px-3 py-2 border-gray-200 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-300"
                  value={edit.middleName}
                  onChange={(e) =>
                    setEdit({ ...edit, middleName: e.target.value })
                  }
                />
              </div>

              <div className="col-span-2">
                <label className="block text-gray-600 mb-1">Last Name</label>
                <input
                  className="w-full border rounded-md px-3 py-2 border-gray-200 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-300"
                  value={edit.lastName}
                  onChange={(e) =>
                    setEdit({ ...edit, lastName: e.target.value })
                  }
                />
              </div>

              <div className="col-span-2">
                <label className="block text-gray-600 mb-1">Email</label>
                <input
                  type="email"
                  className="w-full border rounded-md px-3 py-2 border-gray-200 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-300"
                  value={edit.email}
                  onChange={(e) => setEdit({ ...edit, email: e.target.value })}
                  disabled
                />
              </div>

              <div>
                <label className="block text-gray-600 mb-1">Address</label>
                <input
                  className="w-full border rounded-md px-3 py-2 border-gray-200 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-300"
                  value={edit.address}
                  onChange={(e) =>
                    setEdit({ ...edit, address: e.target.value })
                  }
                />
              </div>

              <div className="col-span-2">
                <label className="block text-gray-600 mb-1">
                  Telephone No.
                </label>
                <input
                  className="w-full border rounded-md px-3 py-2 border-gray-200 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-300"
                  value={edit.telNo}
                  onChange={(e) => setEdit({ ...edit, telNo: e.target.value })}
                />
              </div>

              <div className="col-span-1">
                <label className="block text-gray-600 mb-1">Status</label>
                <select
                  name="status"
                  value={edit.status}
                  onChange={(e) => setEdit({ ...edit, status: e.target.value })}
                  className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-300"
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>

              <div className="col-span-1">
                <label className="block text-gray-600 mb-1">Role</label>
                <select
                  name="role"
                  value={edit.role}
                  onChange={(e) => setEdit({ ...edit, role: e.target.value })}
                  className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-300"
                >
                  <option value="Driver">Driver</option>
                  <option value="Cashier">Cashier</option>
                  <option value="Reliever">Reliever</option>
                  <option value="Inspector">Inspector</option>
                </select>
              </div>
            </div>

            <div className="px-6 py-4 border-t bg-white/70 backdrop-blur flex justify-end gap-3">
              <button
                className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700"
                onClick={() => {
                  setViewing(null);
                  setEdit(null);
                }}
                disabled={savingEdit}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 rounded-lg text-white hover:opacity-95 disabled:opacity-60 inline-flex items-center gap-2"
                style={{ backgroundColor: primaryColor }}
                onClick={saveEdits}
                disabled={savingEdit}
              >
                {savingEdit && (
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
                {savingEdit ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
