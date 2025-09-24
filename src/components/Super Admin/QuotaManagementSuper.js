import React, { useEffect, useState } from "react";
import {
  getAuth,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from "firebase/auth";
import { db } from "../../firebase";
import {
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  addDoc,
} from "firebase/firestore";
import { Wallet, Shield } from "lucide-react"; // ✅ Changed Plus to Shield for authentication

const auth = getAuth();

export default function QuotaManagementSuper() {
  const primaryColor = "#364C6E";

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  const [currentQuota, setCurrentQuota] = useState(0);
  const [newQuota, setNewQuota] = useState("");
  const [confirmQuota, setConfirmQuota] = useState("");
  const [selectedQuarter, setSelectedQuarter] = useState("Q1"); // Quarter selection
  const [quotaPeriod, setQuotaPeriod] = useState("quarterly"); // New state for quarterly or yearly
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false); // Track saving state - now only appears after password confirmation
  const [quotaMatchError, setQuotaMatchError] = useState(false);
  const [password, setPassword] = useState(""); // For storing user password
  const [passwordError, setPasswordError] = useState(""); // For error messages on password verification

  // Fetch latest quota document to display current quota
  useEffect(() => {
    const fetchQuota = async () => {
      try {
        const q = query(
          collection(db, "quotaTarget"),
          orderBy("timestamp", "desc"),
          limit(1),
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          const docSnap = snap.docs[0];
          setCurrentQuota(parseFloat(docSnap.data().target) || 0);
        }
      } catch (e) {
        console.error("Error fetching quota:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchQuota();
  }, []);

  // Get quarter start and end date based on selected quarter
  const getQuarterDates = (quarter) => {
    const currentYear = new Date().getFullYear();
    switch (quarter) {
      case "Q1":
        return {
          start: new Date(`${currentYear}-01-01`),
          end: new Date(`${currentYear}-03-31`),
        };
      case "Q2":
        return {
          start: new Date(`${currentYear}-04-01`),
          end: new Date(`${currentYear}-06-30`),
        };
      case "Q3":
        return {
          start: new Date(`${currentYear}-07-01`),
          end: new Date(`${currentYear}-09-30`),
        };
      case "Q4":
        return {
          start: new Date(`${currentYear}-10-01`),
          end: new Date(`${currentYear}-12-31`),
        };
      default:
        return { start: null, end: null };
    }
  };

  // Handle saving quota
  const handleSaveQuota = async () => {
    if (!newQuota || !confirmQuota) {
      return; // Simply return without saving if fields are empty
    }

    if (newQuota !== confirmQuota) {
      setQuotaMatchError(true); // Set error state to true if the quotas don't match
      return;
    }

    setQuotaMatchError(false); // Reset error state if quotas match

    // Clear password and error before opening modal for fresh authentication
    setPassword("");
    setPasswordError("");

    // Show password prompt modal before saving the quota (no spinner yet)
    setIsModalOpen(true);
  };

  // Handle password verification and saving the quota
  const handlePasswordSubmit = async () => {
    if (!password) {
      setPasswordError("Please enter your password.");
      return;
    }

    setSaving(true); // Start saving spinner only after password is entered

    try {
      const user = auth.currentUser;
      if (user) {
        const credential = EmailAuthProvider.credential(user.email, password);
        // Reauthenticate the user
        await reauthenticateWithCredential(user, credential);

        // Proceed to save the quota after successful reauthentication
        const value = parseFloat(newQuota);
        if (isNaN(value) || value <= 0) {
          setQuotaMatchError(true); // Set error state to true if the value is invalid
          setSaving(false); // Stop saving
          setIsModalOpen(false); // Close modal
          return;
        }

        // Get the date range based on the selected quarter
        const { start, end } =
          quotaPeriod === "quarterly"
            ? getQuarterDates(selectedQuarter)
            : {
                start: new Date(`${new Date().getFullYear()}-01-01`),
                end: new Date(`${new Date().getFullYear()}-12-31`),
              };

        // Add new quota document to the quotaTarget collection with period info
        await addDoc(collection(db, "quotaTarget"), {
          target: value.toString(),
          timestamp: new Date(),
          period: quotaPeriod, // Store whether it's quarterly or yearly
          quarter: quotaPeriod === "quarterly" ? selectedQuarter : null,
          startDate: start, // Store as Date object
          endDate: end, // Store as Date object
        });

        setCurrentQuota(value);
        setNewQuota("");
        setConfirmQuota("");
        setPassword(""); // Clear password
        setPasswordError(""); // Clear password error

        setToastMessage(`Quota updated successfully!`);
        setShowSuccessToast(true);
        setTimeout(() => setShowSuccessToast(false), 3000);

        setIsModalOpen(false); // Close password modal only on success
      }
    } catch (e) {
      console.error("Error reauthenticating or saving quota:", e);
      setPasswordError("Incorrect password. Please try again.");
      // Don't close modal on error - let user try again
    } finally {
      setSaving(false); // Stop saving spinner
    }
  };

  // Handle modal close (cancel button)
  const handleCancelModal = () => {
    setIsModalOpen(false); // Close the modal
    setPassword(""); // Clear password
    setPasswordError(""); // Clear password error
    setSaving(false); // Reset saving state so spinner stops
  };

  return (
    <div className="flex bg-gray-100 min-h-screen">
      {/* Sidebar */}

      {/* Main Content */}
      <main className="flex-1 p-10">
        <div className="mx-auto w-full max-w-[1200px]">
          <div
            className="bg-white border rounded-xl shadow-sm flex flex-col p-9"
            style={{ minHeight: "calc(70vh - 112px)" }}
          >
            <h1 className="text-2xl font-semibold text-gray-800 mb-6">
              Quota Management
            </h1>

            {loading ? (
              <p>Loading...</p>
            ) : (
              <div className="grid grid-cols-2 gap-10 mt-11">
                {/* Current Quota */}
                <div className="flex flex-col items-center justify-center border-r pr-10">
                  <h2 className="text-lg font-semibold text-gray-600 mb-2 flex items-center gap-2 mt-1">
                    <Wallet className="w-8 h-8 text-blue-600" />
                    Current Quota
                  </h2>
                  <div className="text-5xl font-bold text-gray-800 flex items-center gap-2">
                    <span>₱</span>
                    {currentQuota.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </div>
                </div>

                {/* Quota Change */}
                <div className="flex flex-col">
                  <h2 className="text-2xl font-semibold text-gray-600 mb-2">
                    Quota Change
                  </h2>
                  <p className="text-base text-gray-500 mb-4">
                    NOTE: If you want to modify the current quota, input the new
                    quota and retype the quota to confirm that you really want
                    to change it. This is applicable to all active drivers and
                    will add a new quota record.
                  </p>

                  {/* Quota Period Selection */}
                  <select
                    value={quotaPeriod}
                    onChange={(e) => setQuotaPeriod(e.target.value)}
                    className="w-full border rounded-md px-3 py-2 mb-4 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-300"
                  >
                    <option value="quarterly">Quarterly</option>
                    <option value="yearly">Yearly</option>
                  </select>

                  {/* Select Quarter for Quarterly Period */}
                  {quotaPeriod === "quarterly" && (
                    <select
                      value={selectedQuarter}
                      onChange={(e) => setSelectedQuarter(e.target.value)}
                      className="w-full border rounded-md px-3 py-2 mb-4 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-300"
                    >
                      <option value="Q1">Q1 (Jan - Mar)</option>
                      <option value="Q2">Q2 (Apr - Jun)</option>
                      <option value="Q3">Q3 (Jul - Sep)</option>
                      <option value="Q4">Q4 (Oct - Dec)</option>
                    </select>
                  )}

                  <input
                    type="number"
                    placeholder="Enter new quota"
                    className={`w-full border rounded-md px-3 py-2 mb-2 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-300 ${quotaMatchError ? "bg-red-100 border-red-500" : ""}`}
                    value={newQuota}
                    onChange={(e) => setNewQuota(e.target.value)}
                  />
                  <input
                    type="number"
                    placeholder="Confirm new quota"
                    className={`w-full border rounded-md px-3 py-2 mb-2 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-300 ${quotaMatchError ? "bg-red-100 border-red-500" : ""}`}
                    value={confirmQuota}
                    onChange={(e) => setConfirmQuota(e.target.value)}
                  />

                  {quotaMatchError && (
                    <div className="flex items-center space-x-2 mt-3">
                      <p className="text-red-500 text-sm font-semibold">
                        The quota values you entered do not match. Please ensure
                        that both the 'New Quota' and 'Confirm Quota' fields
                        contain the same value before proceeding.
                      </p>
                    </div>
                  )}

                  <button
                    onClick={handleSaveQuota}
                    disabled={false} // Button is never disabled since spinner only shows after password confirmation
                    className="px-5 py-2 rounded-lg text-white shadow-md hover:opacity-95 self-start mt-4"
                    style={{ backgroundColor: primaryColor }}
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Password Modal */}
      {isModalOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50"
          onClick={handleCancelModal} // Close on backdrop click
        >
          <div
            className="bg-white rounded-xl shadow-2xl p-12 px-16 w-full max-w-lg"
            onClick={(e) => e.stopPropagation()} // Prevent closing on modal click
          >
            <div className="flex justify-center mb-6">
              <Shield className="h-12 w-12 text-blue-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-800 text-center mb-4">
              Please enter your password to confirm
            </h2>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border rounded-md px-3 py-2 mb-4 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-300"
            />
            {passwordError && (
              <p className="text-red-500 text-sm font-semibold text-center mb-4">
                {passwordError}
              </p>
            )}
            <div className="flex justify-center gap-4">
              <button
                onClick={handleCancelModal} // Cancel modal
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-gray-200 text-gray-800 hover:bg-gray-300 transition disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={handlePasswordSubmit}
                disabled={saving}
                className="px-4 py-2 rounded-lg text-white disabled:opacity-60"
                style={{ backgroundColor: primaryColor }}
              >
                {saving && (
                  <svg
                    className="h-5 w-5 animate-spin inline-block mr-2"
                    viewBox="0 0 24 24"
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
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

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
