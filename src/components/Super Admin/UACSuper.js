import { useEffect, useMemo, useState } from "react";
import { getAuth } from "firebase/auth";
import { Outlet, useLocation } from "react-router-dom";
import DataTable from "react-data-table-component";
import { FaEye } from "react-icons/fa";
import { db } from "../../firebase";
import { collection, onSnapshot, doc, setDoc, addDoc, serverTimestamp } from "firebase/firestore";

export default function UACSuper() {
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const location = useLocation();

  const primaryColor = "#364C6E";

  const isUACPage = location.pathname === "/UACSuper";

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err] = useState(null);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");

  const [viewing, setViewing] = useState(null);
  const [edit, setEdit] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const auth = getAuth();
  const currentUser = auth.currentUser;
  const userName = currentUser?.displayName || currentUser?.email || "Unknown User";

  // Updated available permissions to match actual admin permissions
  // Permissions grouped by role (copied from App.js)
  const availablePermissions = {
    Admin: [
      "Dashboard Admin",
      "Unit Tracking",
      "User Management",
      "Driver Dispatch",
      "Vehicle Management",
      "Reports",
    ],
    Cashier: ["View Dashboard", "Fuel Logs"],
    Super: [
      "Super Dashboard",
      "View Activity Log",
      "Manage Admins",
      "Manage Routes",
      "Manage Quotas",
      "Manage User Access",
      "Password Reset",
      "Manage Maintenance",
    ],
  };

  // Available roles (aligning with your system)
  const availableRoles = ["Admin", "Cashier", "Super"];

  // Function to log system activities
  const logSystemActivity = async (activity, performedBy, role = "Super Admin") => {
    try {
      await addDoc(collection(db, "systemLogs"), {
        activity,
        performedBy,
        role,
        timestamp: serverTimestamp(),
      });
      console.log("Activity logged successfully");
    } catch (error) {
      console.error("Error logging activity:", error);
    }
  };

  useEffect(() => {
    if (!isUACPage) return;

    const unsub = onSnapshot(
      collection(db, "users"),
      (snap) => {
        try {
          const temp = [];
          snap.forEach((d) => {
            const data = d.data();
            if (data && ["Admin", "Cashier"].includes(data.role)) {
              // Filter for specific roles
              temp.push({
                id: d.id,
                email: data.email || "",
                role: data.role || "User",
                permissions: data.permissions || [],
                createdAt: data.createdAt || new Date(),
                firstName: data.firstName || "",
                lastName: data.lastName || "",
              });
            }
          });
          temp.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
          setUsers(temp);
          setLoading(false);
        } catch (error) {
          console.error("Error processing users:", error);
          setLoading(false);
        }
      },
      (error) => {
        console.error("Error loading users:", error);
        setLoading(false);
      },
    );

    return () => unsub();
  }, [isUACPage]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((user) => {
      const searchText = `${user.email} ${user.role}`.toLowerCase();
      const matchesSearch = !q || searchText.includes(q);
      const matchesRoleFilter = !roleFilter || user.role === roleFilter;

      return matchesSearch && matchesRoleFilter;
    });
  }, [users, search, roleFilter]);

  const filteredWithRowNumber = useMemo(() => {
    return filtered.map((r, i) => ({
      ...r,
      _row: i + 1,
    }));
  }, [filtered]);

  const RoleBadge = ({ value }) => {
    // Mapping for internal role to display name
    const roleDisplayNames = {
      Admin: "System Admin",
      Cashier: "Cashier",
      Super: "Super Admin",
    };

    const getColorClasses = (role) => {
      switch (role) {
        case "Admin":
          return "bg-blue-100 text-blue-700 border-blue-200";
        case "Cashier":
          return "bg-green-100 text-green-700 border-green-200";
        case "Super":
          return "bg-red-100 text-red-700 border-red-200";
        default:
          return "bg-gray-100 text-gray-700 border-gray-200";
      }
    };

    // Display the role using the custom names from roleDisplayNames
    const displayRole = roleDisplayNames[value] || value;

    return (
      <span
        className={`inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-semibold ${getColorClasses(value)}`}
        style={{
          minWidth: "80px",
          maxWidth: "auto",
          whiteSpace: "nowrap",
        }}
      >
        {displayRole}
      </span>
    );
  };

  const PermissionBadges = ({ permissions }) => {
    if (!permissions || permissions.length === 0) {
      return <span className="text-gray-400 text-sm">No permissions</span>;
    }

    return (
      <div className="flex flex-wrap gap-1">
        {permissions.slice(0, 3).map((permission) => (
          <span
            key={permission}
            className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700"
          >
            {permission}
          </span>
        ))}
        {permissions.length > 3 && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
            +{permissions.length - 3} more
          </span>
        )}
      </div>
    );
  };

  const columns = [
    {
      name: "ID",
      selector: (r) => r._row,
      sortable: false,
      width: "60px",
      cell: (r) => <div className="font-medium text-gray-500">{r._row}</div>,
    },
    {
      name: "User",
      selector: (r) => r.email,
      sortable: true,
      grow: 1,
      cell: (r) => (
        <div className="py-1">
          <div className="font-medium text-gray-900">{r.email}</div>
        </div>
      ),
    },
    {
      name: "Permissions",
      selector: (r) => r.permissions?.length || 0,
      sortable: false,
      grow: 2,
      cell: (r) => <PermissionBadges permissions={r.permissions} />,
    },
    {
      name: "Role",
      selector: (r) => r.role,
      sortable: true,
      width: "140px",
      cell: (r) => <RoleBadge value={r.role} />,
    },
    {
      name: "Action",
      button: true,
      center: true,
      width: "120px",
      cell: (row) => (
        <div className="flex gap-2">
          <button
            onClick={() => {
              setViewing(row);
              setEdit({ ...row });
            }}
            title="View"
            className="inline-flex items-center justify-center h-8 w-8 rounded-full border border-gray-200 bg-white text-gray-700 hover:shadow-md transition text-sm"
          >
            <FaEye size={12} />
          </button>
        </div>
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

  const saveEdits = async () => {
    if (!viewing || !edit) return;

    setSavingEdit(true);
    try {
      const roleDisplayNames = {
        Admin: "System Admin",
        Cashier: "Cashier",
        Super: "Super Admin",
      };

      const oldRoleDisplay = roleDisplayNames[viewing.role] || viewing.role;
      const newRoleDisplay = roleDisplayNames[edit.role] || edit.role;

      // Get user full name (firstName + lastName) or fallback to email
      const userFullName = viewing.firstName && viewing.lastName 
        ? `${viewing.firstName} ${viewing.lastName}`.trim()
        : viewing.email || "Unknown User";

      await setDoc(
        doc(db, "users", viewing.id),
        {
          role: edit.role,
          permissions: edit.permissions,
        },
        { merge: true },
      );

      // Create activity log message
      let activityMessage = "";
      
      if (viewing.role !== edit.role) {
        // Role was changed
        activityMessage = `Changed user role for ${userFullName} from ${oldRoleDisplay} to ${newRoleDisplay}`;
      } else {
        // Only permissions were changed
        activityMessage = `Updated permissions for ${userFullName} (${newRoleDisplay})`;
      }

      // Log the activity
      await logSystemActivity(activityMessage, userName, "Super Admin");

      setViewing(null);
      setEdit(null);

      setToastMessage("User permissions updated successfully!");
      setShowSuccessToast(true);
      setTimeout(() => setShowSuccessToast(false), 3000);
    } catch (error) {
      console.error("Error updating user:", error);
      alert(error.message || String(error));
    } finally {
      setSavingEdit(false);
    }
  };

  const togglePermission = (permission) => {
    if (!edit) return;

    const currentPermissions = edit.permissions || [];
    const hasPermission = currentPermissions.includes(permission);

    const newPermissions = hasPermission
      ? currentPermissions.filter((p) => p !== permission)
      : [...currentPermissions, permission];

    setEdit({ ...edit, permissions: newPermissions });
  };

  return (
    <div className="flex bg-gray-100 min-h-screen">
      {/* Sidebar */}

      {/* Main Content */}
      <main className="flex-1 p-10 mx-auto">
        {!isUACPage ? (
          <Outlet />
        ) : (
          <div className="mx-auto w-full max-w-[1900px]">
            <div className="bg-white border rounded-xl shadow-sm flex flex-col">
              <div className="px-6 pt-6 pb-4 border-b flex items-center justify-between">
                <h1 className="text-2xl font-semibold text-gray-800">
                  User Access Control
                </h1>
                <div className="flex items-center gap-3">
                  <div className="relative flex items-center gap-2 rounded-lg border border-gray-300 bg-white shadow-lg hover:shadow-xl focus-within:ring-1 focus-within:ring-blue-300 px-3 py-2">
                    <select
                      className="bg-transparent pr-6 text-sm outline-none"
                      value={roleFilter}
                      onChange={(e) => setRoleFilter(e.target.value)}
                    >
                      <option value="">Filter by Role</option>
                      {availableRoles.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search"
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

      {/* Edit User Permissions Modal */}
      {viewing && edit && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => {
            setViewing(null);
            setEdit(null);
          }}
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
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="m22 2-5 10-5-5 10-5z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-semibold text-gray-800">
                    Manage User Access
                  </h3>
                  <p className="text-xs text-gray-500">{viewing.email}</p>
                </div>
              </div>
              <RoleBadge value={edit.role} />
            </div>

            <div className="p-8">
              <div className="mb-6">
                <label className="block text-gray-700 font-medium mb-2">
                  Role
                </label>
                <select
                  value={edit.role}
                  onChange={(e) => setEdit({ ...edit, role: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-300"
                >
                  {availableRoles.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-gray-700 font-medium mb-3">
                  Permissions
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {(availablePermissions[edit.role] || []).map((permission) => {
                    const hasPermission =
                      edit.permissions?.includes(permission);
                    return (
                      <label
                        key={permission}
                        className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50"
                      >
                        <input
                          type="checkbox"
                          checked={hasPermission}
                          onChange={() => togglePermission(permission)}
                          className="mr-3 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <span className="text-sm font-medium text-gray-700">
                          {permission}
                        </span>
                      </label>
                    );
                  })}
                </div>
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
                      d="M4 12a8 8 0 0 0 8-8v4A4 4 0 0 0 4 12z"
                    />
                  </svg>
                )}
                {savingEdit ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}