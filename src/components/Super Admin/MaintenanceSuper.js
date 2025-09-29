import { useEffect, useState } from "react";
import { db } from "../../firebase";
import { doc, onSnapshot, updateDoc, getDoc, setDoc } from "firebase/firestore";
import { Outlet, useLocation } from "react-router-dom";

export default function MaintenanceSuper() {
  const [status, setStatus] = useState("Operational Mode");
  const [maintenanceMessage, setMaintenanceMessage] = useState("");
  const [operationalMessage, setOperationalMessage] = useState("");
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const { pathname } = useLocation();

  const primaryColor = "#364C6E";

  // Fetch system status and maintenance message from Firestore
  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, "system", "Status"),
      (docSnapshot) => {
        if (docSnapshot.exists()) {
          const data = docSnapshot.data();
          setStatus(data.status); // Operational Mode or Maintenance Mode
          if (data.status === "Maintenance Mode") {
            setMaintenanceMessage(data.message);
          } else {
            setMaintenanceMessage("");
          }
        } else {
          console.error("Document does not exist in Firestore");
        }
      },
      (error) => {
        console.error("Error fetching Firestore data: ", error);
      },
    );
    return () => unsubscribe();
  }, []);

  const handleStatusChange = (newStatus) => {
    setStatus(newStatus);
  };

  const handleMessageChange = (e) => {
    setMaintenanceMessage(e.target.value);
  };

  const handleOperationalMessageChange = (e) => {
    setOperationalMessage(e.target.value);
  };

  const handleSetStatus = async () => {
    try {
      setSaving(true); // Start spinner

      const systemRef = doc(db, "system", "Status");

      // Check if the document exists
      const docSnapshot = await getDoc(systemRef);
      const updatedData = {
        status: status,
        message:
          status === "Maintenance Mode"
            ? maintenanceMessage
            : operationalMessage,
        timestamp: new Date(),
      };

      if (docSnapshot.exists()) {
        // Document exists, update it
        await updateDoc(systemRef, updatedData);
        setToastMessage(`Status updated to: ${status}`);
        setShowSuccessToast(true);
        setTimeout(() => setShowSuccessToast(false), 3000);
      } else {
        // Document does not exist, create it
        await setDoc(systemRef, updatedData);
        setToastMessage("The system status is set as " + status);
        setShowSuccessToast(true);
        setTimeout(() => setShowSuccessToast(false), 3000);
      }
    } catch (error) {
      console.error("Error updating system status in Firestore: ", error);
      alert("Error updating system status in Firestore.");
    } finally {
      setSaving(false); // Stop spinner
    }
  };

  // Check if current page is MaintenanceSuper
  const isMaintenancePage = pathname === "/MaintenanceSuper";

  return (
    <div className="flex bg-gray-100 min-h-screen">
      {/* Sidebar */}

      {/* Main Content */}
      <main className="flex-1 p-10">
        {isMaintenancePage ? (
          /* Maintenance Page Content */
          <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-8 space-y-6">
            {/* Header */}
            <div className="border-b border-gray-200 pb-4 mb-6">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-semibold text-gray-900">
                    Maintenance
                  </h2>
                  <p className="text-sm text-gray-500">Update System Status</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xl text-gray-600">Current Status:</span>
                  <span className="text-xl font-medium text-gray-900">
                    {status}
                  </span>
                  <div
                    className={`w-6 h-6 rounded-full ${status === "Operational Mode" ? "bg-green-500" : "bg-yellow-500"}`}
                  ></div>
                </div>
              </div>
            </div>

            {/* Status Selection */}
            <div className="mb-6">
              <label className="block text-l font-medium text-gray-700 mb-3">
                Set System Status:
              </label>
              <div className="space-y-3">
                {/* Operational Mode */}
                <label className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    name="Status"
                    value="Operational Mode"
                    checked={status === "Operational Mode"}
                    onChange={() => handleStatusChange("Operational Mode")}
                    className="w-5 h-5"
                    style={{
                      appearance: "none",
                      width: "20px",
                      height: "20px",
                      borderRadius: "50%",
                      border: "1px solid #ccc",
                      backgroundColor:
                        status === "Operational Mode" ? "#364C6E" : "#fff",
                      cursor: "pointer",
                      transition: "background-color 0.3s, border-color 0.3s",
                    }}
                  />
                  <span className="ml-2 text-sm text-gray-700">
                    Operational Mode
                  </span>
                </label>

                {/* Maintenance Mode */}
                <label className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    name="Status"
                    value="Maintenance Mode"
                    checked={status === "Maintenance Mode"}
                    onChange={() => handleStatusChange("Maintenance Mode")}
                    className="w-5 h-5"
                    style={{
                      appearance: "none",
                      width: "20px",
                      height: "20px",
                      borderRadius: "50%",
                      border: "1px solid #ccc",
                      backgroundColor:
                        status === "Maintenance Mode" ? "#364C6E" : "#fff",
                      cursor: "pointer",
                      transition: "background-color 0.3s, border-color 0.3s",
                    }}
                  />
                  <span className="ml-2 text-sm text-gray-700">
                    Maintenance Mode
                  </span>
                </label>
              </div>
            </div>

            {status === "Operational Mode" && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Operational Mode Message:
                </label>
                <textarea
                  value={operationalMessage}
                  onChange={handleOperationalMessageChange}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  rows="4"
                  placeholder="Enter a message for operational mode..."
                  disabled={status !== "Operational Mode"} // Keeps it disabled
                  readOnly={status === "Operational Mode"} // Makes the textarea read-only for Operational Mode
                  style={{
                    borderColor:
                      status === "Operational Mode" ? "#d1d5db" : "#e5e7eb", // Gray border when disabled
                    backgroundColor: "#f3f4f6", // Gray background when disabled
                    cursor:
                      status === "Operational Mode" ? "not-allowed" : "text", // Non-editable cursor for Operational Mode
                  }}
                />
              </div>
            )}

            {/* Maintenance Message (only shown when Maintenance Mode is selected) */}
            {status === "Maintenance Mode" && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Maintenance Message:
                </label>
                <textarea
                  value={maintenanceMessage}
                  onChange={handleMessageChange}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  rows="4"
                  placeholder="Enter a message for maintenance..."
                />
              </div>
            )}

            {/* Set Status Button */}
            <div className="flex justify-end">
              <button
                onClick={handleSetStatus}
                className="px-10 py-2 text-white text-l font-medium rounded-md shadow-lg transition-colors duration-200"
                style={{ backgroundColor: primaryColor }}
              >
                <div className="flex items-center gap-2">
                  {saving ? (
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
                  ) : null}
                  <span>Set Status</span>
                </div>
              </button>
            </div>
          </div>
        ) : (
          /* Other Pages Content */
          <Outlet />
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
    </div>
  );
}